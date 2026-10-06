// Audit-only. Reads tracked sources and Git objects; stdout is its sole output.
// No runtime-state, Runner, product-check executor, clone, or write API is used.
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { verifyChangedPaths } from '../../../../.agents/scripts/check-verification.mjs'
import { frontmatter } from '../../../../.agents/scripts/check-story-plan.mjs'
import { reviewReceiptDialect, reviewEvidenceFreshness, legacyReviewFreshness } from '../../../../.agents/scripts/v4-finalization-contract.mjs'
import { measureInstructionContext, measureInstructionPair, digestText, digestBytes } from '../../../../.agents/scripts/measure-v4-instruction-context.mjs'

const root = process.cwd()
const code = '98def5358983072216a28754e87b1cd5f884d258'
const commands = []
const git = args => {
  const result = spawnSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 32 * 1024 * 1024 })
  commands.push({ argv: ['git', '--no-optional-locks', ...args], exit_code: result.status, error: result.error?.message ?? null })
  return result
}
const read = relative => readFileSync(path.join(root, relative), 'utf8')
const json = relative => JSON.parse(read(relative))
const sha = content => createHash('sha256').update(content).digest('hex')
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const all = git(['ls-files', '-z']).stdout.split('\0').filter(Boolean).sort()
const head = git(['rev-parse', 'HEAD']).stdout.trim()
const registry = json('.agents/verification/registry.json')
const features = registry.recipes.filter(entry => entry.enabled).map(entry => {
  const recipe = json(entry.path)
  const map = json(recipe.featureMap)
  const covered = map.schema_version === 2 ? map.covered_paths : Object.keys(map.anchor_blobs)
  return { id: entry.featureId, recipe: entry.path, feature_map: recipe.featureMap, schema_version: map.schema_version ?? 1,
    covered_paths: covered.sort(), dependency_only_paths: Object.keys(map.anchor_blobs).filter(item => !covered.includes(item)).sort(),
    checks: recipe.checks, anchors: Object.entries(map.anchor_blobs).map(([relative, expected]) => {
      const observed = git(['rev-parse', `${code}:${relative}`])
      return { path: relative, expected, observed: observed.stdout.trim(), available: observed.status === 0, matches: expected === observed.stdout.trim() }
    }) }
})
const covered = [...new Set(features.flatMap(feature => feature.covered_paths))].sort()
const anchored = [...new Set(features.flatMap(feature => feature.anchors.map(anchor => anchor.path)))].sort()
const universePrefixes = ['frontend/', 'backend/', 'contracts/', 'tests/e2e/', 'deploy/', 'scripts/', '.github/']
const product = all.filter(relative => universePrefixes.some(prefix => relative.startsWith(prefix)) || ['compose.local.yaml', '.env.example'].includes(relative))
const notCovered = product.filter(relative => !covered.includes(relative))
const coverage = { definition: { prefixes: universePrefixes, root_paths: ['compose.local.yaml', '.env.example'], tracked_only: true, docs_and_control_plane_excluded: true },
  product_path_count: product.length, covered_path_count: covered.length, uncovered_path_count: notCovered.length,
  covered_paths: covered, uncovered_paths: notCovered, dependency_only_uncovered_paths: notCovered.filter(relative => anchored.includes(relative)),
  completely_unmapped_paths: notCovered.filter(relative => !anchored.includes(relative)),
  counts_by_prefix: Object.fromEntries(universePrefixes.map(prefix => [prefix, { total: product.filter(item => item.startsWith(prefix)).length, uncovered: notCovered.filter(item => item.startsWith(prefix)).length }])) }

const receiptFiles = all.filter(relative => relative.startsWith('_bmad-output/implementation-artifacts/receipts/story-') && relative.endsWith('.json'))
const shaRefs = new Map()
function walk(value, field, file) {
  if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${field}[${index}]`, file))
  if (value && typeof value === 'object') return Object.entries(value).forEach(([key, item]) => walk(item, field ? `${field}.${key}` : key, file))
  if (typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value)) {
    if (!shaRefs.has(value)) shaRefs.set(value, [])
    shaRefs.get(value).push({ file, field })
  }
}
const receipts = receiptFiles.map(file => {
  const value = json(file)
  walk(value, '', file)
  return { file, schema_version: value.schema_version ?? null, kind: value.kind ?? null, story_id: value.story_id ?? null,
    slice_id: value.slice_id ?? null, executor_commit: value.executor_commit ?? null, dialect: value.kind === 'review' ? reviewReceiptDialect(value) : null }
})
const availability = [...shaRefs].map(([value, refs]) => {
  const object = git(['cat-file', '-e', value])
  const commit = git(['cat-file', '-e', `${value}^{commit}`])
  const type = object.status === 0 ? git(['cat-file', '-t', value]).stdout.trim() : null
  return { sha: value, object_available: object.status === 0, commit_available: commit.status === 0, type, refs }
})
const freshness = receipts.filter(item => item.kind === 'review').map(item => {
  const review = json(item.file)
  const planPath = `_bmad-output/implementation-artifacts/story-${item.story_id.replace('.', '-')}-plan.md`
  const plan = frontmatter(read(planPath))
  const slice = plan.slices.find(candidate => candidate.id === item.slice_id)
  const riskDigest = digestText(JSON.stringify(stable(plan.risk ?? null)))
  const paths = slice?.changed_paths ?? review.changeEvidence?.evidenceSet?.requestedPaths ?? [...new Set((review.evidence_refs ?? []).map(ref => ref.path))].sort()
  const observed = item.dialect === 'legacy' ? legacyReviewFreshness(review, review.checkpoint_commit, riskDigest) : reviewEvidenceFreshness(review, paths, review.checkpoint_commit, riskDigest)
  return { file: item.file, dialect: item.dialect, isolated_review_freshness: observed, note: 'Contract-only result; does not assert full finalization/completion or legacy cutoff ancestry.' }
})

const lock = json('skills-lock.json')
const lockInspection = Object.entries(lock.skills).map(([id, item]) => {
  const skill = `.agents/skills/${id}/SKILL.md`
  const present = existsSync(path.join(root, skill))
  const content = present ? read(skill) : null
  return { id, source: item.source, upstream_skill_path: item.skillPath, upstream_hash: item.computedHash, local_skill_path: skill, exists: present,
    local_raw_sha256: present ? sha(content) : null, local_lf_sha256: present ? sha(content.replaceAll('\r\n', '\n')) : null,
    local_raw_equals_lock_hash: present && sha(content) === item.computedHash, module_manifest: existsSync(path.join(root, `.agents/skills/${id}/module-manifest.toml`)),
    note: 'computedHash algorithm/upstream source snapshot is not supplied by this repository; raw equality alone is not a validity verdict.' }
})
const duplicates = ['orca-cli', 'orchestration'].map(id => {
  const agentsPrefix = `.agents/skills/${id}/`
  const claudePrefix = `.claude/skills/${id}/`
  const relative = [...new Set(all.filter(item => item.startsWith(agentsPrefix)).map(item => item.slice(agentsPrefix.length)).concat(all.filter(item => item.startsWith(claudePrefix)).map(item => item.slice(claudePrefix.length))))].sort()
  return { id, files: relative.map(file => {
    const left = path.join(root, agentsPrefix + file); const right = path.join(root, claudePrefix + file)
    return { file, agents_exists: existsSync(left), claude_exists: existsSync(right), byte_equal: existsSync(left) && existsSync(right) && readFileSync(left).equals(readFileSync(right)) }
  }) }
})
const skillRefs = all.filter(item => item.startsWith('.agents/skills/bmad') && item.endsWith('customize.toml')).flatMap(file => {
  const text = read(file)
  return [...text.matchAll(/^skill\s*=\s*"([^"]+)"/gm)].map(match => ({ file, skill: match[1], exists: existsSync(path.join(root, `.agents/skills/${match[1]}/SKILL.md`)) }))
})

const basis = json('.agents/scripts/fixtures/v4-architecture/instruction-basis.json')
const corpus = readFileSync(path.join(root, '.agents/scripts/fixtures/v4-architecture/corpus.json'))
const inputDigest = digestText(JSON.stringify(stable({ corpus_digest: digestBytes(corpus), basis_id: basis.basis_id })))
const baseline = 'd8e813660e44c54785466836e5c0eda658529b74'
const accepted = '0e4c6b939f2a186399b483718601e86b44a694b5'
const pair = measureInstructionPair({ gitRoot: root, baselineRef: baseline, candidateRef: code, basis, inputDigest, evidenceRoot: null, runId: 'H-read-only-audit-2026-10-06' })
const acceptedPair = measureInstructionPair({ gitRoot: root, baselineRef: baseline, candidateRef: accepted, basis, inputDigest, evidenceRoot: null, runId: 'H-read-only-historical-replay' })
const current = basis.actions.map(action => measureInstructionContext({ gitRoot: root, revision: code, basis, profile: basis.profile, action, inputDigest }))
const instruction = { pair, accepted_pair: acceptedPair, current, reductions: basis.actions.map(action => {
  const b = pair.baseline.actions[action].required_instruction_bytes; const c = pair.candidate.actions[action].required_instruction_bytes
  return { action, baseline_bytes: b, candidate_bytes: c, reduction_percent: b !== null && c !== null ? (b - c) / b * 100 : null, meets_30_percent: b !== null && c !== null && (b - c) / b >= 0.3 }
}), note: 'Exported pure measurement APIs only. evidenceRoot:null. No CLI, no projection compiler, no provider-token or actual Story-context claim.' }

const safeVerificationCases = [
  { label: 'no paths', selector: 'auto', paths: [] },
  { label: 'invalid traversal', selector: 'auto', paths: ['../outside'] },
  { label: 'unknown feature', selector: 'not-a-feature', paths: ['backend/routes/api.php'] },
  { label: 'unmapped backend/auth', selector: 'auto', paths: ['backend/routes/api.php'] },
  { label: 'unmapped conflict dialog', selector: 'auto', paths: ['frontend/src/components/ContentConflictDialog.vue'] },
  { label: 'unmapped migrations', selector: 'auto', paths: all.filter(item => item.startsWith('backend/database/migrations/')) }
].map(item => {
  if (item.paths.some(relative => anchored.includes(relative))) throw new Error('AUDIT_REFUSES_APPLICABLE_RECIPE_EXECUTION')
  const output = verifyChangedPaths(root, item.selector, item.paths)
  return { ...item, output, expected_cli_exit_code: { PASS: 0, FAIL: 1, INCOMPLETE: 2, ERROR: 3 }[output.status], executor_invoked: false }
})
const mergeHistory = ['51ee479', 'c6afbc7', '0221bfc', 'c63ee0c', 'f58969a', '70424b9', '64ca94d', 'e2cc695', 'dabaf16', '7b4842b', 'f583066', '98def53'].map(commit => ({ commit, full: git(['rev-parse', commit]).stdout.trim(), ancestor_exit: git(['merge-base', '--is-ancestor', commit, head]).status }))
console.log(JSON.stringify({ audit_head: head, code_head: code, recorded_at: new Date().toISOString(), features, coverage, receipts,
  receipt_summary: { files: receipts.length, by_kind_version: Object.fromEntries([...new Set(receipts.map(item => `${item.kind}:v${item.schema_version}`))].sort().map(key => [key, receipts.filter(item => `${item.kind}:v${item.schema_version}` === key).length])), unique_sha_count: availability.length,
    unavailable_objects: availability.filter(item => !item.object_available), non_commit_objects: availability.filter(item => item.object_available && !item.commit_available) },
  sha_availability: availability, isolated_review_freshness: freshness, lock_inspection: lockInspection, duplicate_skill_trees: duplicates,
  bmad_menu_skill_references: skillRefs, instruction, safe_verification_cases: safeVerificationCases, merge_history: mergeHistory, child_command_log: commands }, null, 2))
