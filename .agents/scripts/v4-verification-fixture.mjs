import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { types } from 'node:util'
import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'
import { frontmatter } from './check-story-plan.mjs'
import { actionFingerprint, checkpointImplementation, prepareAction } from './v4-action-kernel.mjs'
import { transactionIdentity } from './v4-slice-transaction.mjs'
import { runV4Story } from './v4-story-runner.mjs'

import { git, write, digest } from './v4-test-helpers.mjs'
import { createPortableSeedCache } from './v4-test-seed-cache.mjs'

export const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
export const STORY = 'docs/story.md'
export const IMPLEMENTATION_RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-implementation.json'
export const VERIFICATION_RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-verification.json'
export const REVIEW_RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-review.json'

export function storySource(risk) {
  return [
    '---', 'story_id: "9.1"', 'title: Fixture story', 'status: in-progress', '---',
    '# Fixture story', '',
    '<!-- v4:story:start -->', 'A bounded fixture story.', '<!-- v4:story:end -->',
    '<!-- v4:ac:start -->', '- AC-1: The fixture implementation is checkpointed.', '<!-- v4:ac:end -->',
    '<!-- v4:tasks:start -->', '- [ ] T-1 [AC-1]: Implement the fixture.', '<!-- v4:tasks:end -->',
    '<!-- v4:readiness:start -->', '- result: READY', '- dependencies: none', '<!-- v4:readiness:end -->',
    '<!-- v4:references:start -->', '- architecture: .agents/docs/v4-action-kernel.md#kernel', '<!-- v4:references:end -->',
    '<!-- v4:risk:start -->', `- level: ${risk}`, '- invariants: exact checkpoint and review scope', '<!-- v4:risk:end -->',
    ''
  ].join('\n')
}

export function v2Plan(storyDigest, risk, status = 'pending') {
  const checkpointed = status === 'checkpointed'
  return [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: ' + storyDigest, 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', 'current_slice: A',
    'risk:', `  level: ${risk}`, 'slices:', '  - id: A', '    status: ' + status,
    '    task_refs: [T-1]', '    depends_on: []', '    blockers: []', '    unresolved_questions: []',
    'next_action:', '  kind: ' + (checkpointed ? 'verify_slice' : 'implement_slice'), '  target: A', '---', ''
  ].join('\n')
}

export function implementationTemplate(risk) {
  return [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: {{STORY_NORMATIVE_DIGEST}}', 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', 'current_slice: A',
    'risk:', `  level: ${risk}`, 'slices:', '  - id: A', '    status: checkpointed',
    '    task_refs: [T-1]', '    depends_on: []', '    baseline_commit: {{BASELINE_COMMIT}}',
    '    checkpoint_commit: {{CHECKPOINT_COMMIT}}', '    subject_digest: {{SUBJECT_DIGEST}}',
    '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}', '    receipt_refs:',
    '      implementation:', '        path: ' + IMPLEMENTATION_RECEIPT, '        digest: {{RECEIPT_DIGEST}}',
    '    blockers: []', '    unresolved_questions: []', 'next_action:', '  kind: verify_slice', '  target: A', '---', ''
  ].join('\n')
}

export function verificationTemplate(fixture, includeReview) {
  const implementationDigest = fixture.implementationDigest
  const lines = [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: ' + fixture.storyDigest, 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', 'current_slice: {{CURRENT_SLICE}}',
    'risk:', `  level: ${fixture.risk}`, 'slices:', '  - id: A', '    status: {{TARGET_STATUS}}',
    '    task_refs: [T-1]', '    depends_on: []', '    baseline_commit: {{BASELINE_COMMIT}}',
    '    checkpoint_commit: {{CHECKPOINT_COMMIT}}', '    subject_digest: {{SUBJECT_DIGEST}}',
    '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}', '    receipt_refs:',
    '      implementation:', '        path: ' + IMPLEMENTATION_RECEIPT, '        digest: ' + implementationDigest,
    '      verification:', '        path: {{VERIFICATION_RECEIPT_PATH}}', '        digest: {{VERIFICATION_RECEIPT_DIGEST}}',
    '    verification:', '      status: {{VERIFICATION_STATUS}}', '      canonical:', '        status: {{CANONICAL_STATUS}}',
    '      escalation:', '        decision: {{ESCALATION_DECISION}}', '      progression_eligible: {{PROGRESSION_ELIGIBLE}}'
  ]
  if (includeReview) {
    const verificationIndex = lines.indexOf('    verification:')
    lines.splice(verificationIndex, 0,
      '      review:', '        path: {{REVIEW_RECEIPT_PATH}}', '        digest: {{REVIEW_RECEIPT_DIGEST}}')
    lines.push(
      '      review_disclosure: same-lead bounded review',
      '    review:', '      freshness: FRESH_CANDIDATE', '      judgment: {{REVIEW_JUDGMENT}}',
      '      reviewed_commit: {{REVIEWED_COMMIT}}', '      risk_context_digest: {{RISK_CONTEXT_DIGEST}}',
      '      reviewer: {{REVIEWER}}'
    )
  }
  lines.push('    blockers: []', '    unresolved_questions: []', 'next_action:',
    '  kind: {{NEXT_ACTION_KIND}}', '  target: {{NEXT_ACTION_TARGET}}', '---', '')
  return lines.join('\n')
}

export function verificationRegistry(changedPaths = ['src/feature.txt']) {
  const coveredPaths = [...changedPaths].sort()
  const map = {
    schema_version: 2, id: 'fixture-feature', covered_paths: coveredPaths,
    anchor_blobs: Object.fromEntries(coveredPaths.map(item => [item, '0'.repeat(40)]))
  }
  const recipe = {
    schema_version: 1,
    featureId: 'fixture-feature',
    featureMap: '.agents/features/fixture-feature.json',
    checks: [
      { id: 'map', argv: ['node', '-e', "process.stdout.write('VALID\\n')"], cwd: '.', environment: {} },
      { id: 'behavior', argv: ['node', '-e', 'process.exit(0)'], cwd: '.', environment: {} }
    ]
  }
  const registry = { schema_version: 1, recipes: [{ featureId: 'fixture-feature', path: '.agents/verification/fixture-feature.json', enabled: true }] }
  return { map, recipe, registry }
}

function buildVerificationSeed(risk, options) {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-verification-'))
  const cleanup = () => rmSync(root, { recursive: true, force: true })
  const changedPaths = [...(options.changedPaths ?? ['src/feature.txt'])].sort()
  const story = storySource(risk)
  const storyDigest = normativeDigest(inspectStory(story))
  const verification = verificationRegistry(changedPaths)
  const files = {
    '.gitignore': '.agent-state/\n',
    'AGENTS.md': '# fixture policy\n', 'CLAUDE.md': '# provider policy\n',
    '.agents/routing/task-router.md': '# routing\n', '.agents/context/control-plane.md': '# control\n',
    '.agents/context/context-routing.md': '# context\n', '.agents/skills/v4-story-runner/SKILL.md': '# runner\n',
    '.agents/skills/v4-story-runner/actions/implement-slice.md': '# implementation\n',
    '.agents/skills/v4-story-runner/actions/verify-slice.md': '# verification\n',
    '.agents/skills/v4-story-runner/references/implementation-techniques.md': '# techniques\n',
    '.agents/scripts/check-escalation.mjs': readFileSync(path.resolve(process.cwd(), '.agents/scripts/check-escalation.mjs'), 'utf8'),
    '.agents/scripts/prepare-change-evidence.mjs': readFileSync(path.resolve(process.cwd(), '.agents/scripts/prepare-change-evidence.mjs'), 'utf8'),
    '.agent-state/active-run.json': JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }) + '\n',
    'src/base.txt': 'base\n', [STORY]: story, [PLAN]: withSliceRisk(v2Plan(storyDigest, risk), options.sliceRisk),
    '.agents/verification/registry.json': JSON.stringify(verification.registry, null, 2) + '\n',
    '.agents/verification/fixture-feature.json': JSON.stringify(verification.recipe, null, 2) + '\n',
    '.agents/features/fixture-feature.json': JSON.stringify(verification.map, null, 2) + '\n',
    '_bmad-output/implementation-artifacts/sprint-status.yaml': 'development_status:\n  9-1-fixture: in-progress\n'
  }
  for (const [file, value] of Object.entries(files)) write(root, file, value)
  git(root, 'init', '-q')
  git(root, 'checkout', '-qb', 'main')
  git(root, 'config', 'user.name', 'V4 Fixture')
  git(root, 'config', 'user.email', 'v4-fixture@example.com')
  git(root, 'config', 'core.autocrlf', 'false')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture baseline')
  const initialHead = git(root, 'rev-parse', 'HEAD')
  for (const file of changedPaths) write(root, file, `implemented ${file}\n`)
  const implementationRequest = {
    action: 'implement_slice', operation: 'prepare', story_id: '9.1', slice_id: 'A', expected_head: initialHead,
    transaction_id: `implementation-${risk.toLowerCase()}`, owned_paths: changedPaths,
    plan_template: withSliceRisk(implementationTemplate(risk), options.sliceRisk),
    policy_paths: ['AGENTS.md', 'CLAUDE.md', '.agents/routing/task-router.md', '.agents/context/control-plane.md',
      '.agents/context/context-routing.md', '.agents/skills/v4-story-runner/SKILL.md'],
    recipe_paths: ['.agents/skills/v4-story-runner/actions/implement-slice.md', '.agents/skills/v4-story-runner/references/implementation-techniques.md'],
    commands: [{ command: 'node --check src/feature.txt', exit_code: 0, tool: 'Node.js', environment: 'fixture' }],
    semantic_coverage: { status: 'MEASURED', task_refs: ['T-1'], note: 'fixture exact scope' },
    selected_tasks: ['T-1'], selected_acceptance_criteria: ['AC-1'], red_green: { applicable: false, reason: 'fixture' }
  }
  return { root, cleanup, risk, storyDigest, initialHead, implementationRequest, changedPaths }
}

// Only the contracts exercised by verification-flow and the equivalence probe
// are admitted. New options, accessors and unproven combinations use the builder.
const provenSeedVariants = new Set([
  ...['LOW', 'MEDIUM', 'HIGH'].map(risk => JSON.stringify([risk, null, ['src/feature.txt']])),
  ...['LOW', 'MEDIUM'].map(sliceRisk => JSON.stringify(['HIGH', sliceRisk, ['src/feature.txt']])),
  JSON.stringify(['HIGH', null, ['src/feature.txt', 'src/feature-a.txt', 'src/feature-b.txt', 'src/feature-c.txt', 'src/feature-d.txt'].sort()])
])
const builderSourceDigest = digest(readFileSync(new URL(import.meta.url), 'utf8'))
const cachedVerificationSeed = createPortableSeedCache({
  prefix: 'v4-verification-copy-',
  build: ({ risk, options }) => buildVerificationSeed(risk, options),
  key: ({ risk, options }) => {
    if (typeof risk !== 'string' || !options || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype) return null
    const descriptors = Object.getOwnPropertyDescriptors(options)
    if (Reflect.ownKeys(descriptors).some(key => !['sliceRisk', 'changedPaths'].includes(key) || !Object.hasOwn(descriptors[key], 'value'))) return null
    const sliceRisk = descriptors.sliceRisk?.value
    const paths = descriptors.changedPaths?.value
    if (sliceRisk !== undefined && !['LOW', 'MEDIUM'].includes(sliceRisk)) return null
    if (paths !== undefined && (types.isProxy(paths) || !Array.isArray(paths) || Object.getPrototypeOf(paths) !== Array.prototype ||
      Reflect.ownKeys(paths).some(key => key !== 'length' && (!/^\d+$/.test(String(key)) ||
        typeof Object.getOwnPropertyDescriptor(paths, key)?.value !== 'string')))) return null
    const changedPaths = [...(paths ?? ['src/feature.txt'])].sort()
    const variant = JSON.stringify([risk, sliceRisk ?? null, changedPaths])
    if (!provenSeedVariants.has(variant)) return null
    const sources = ['check-escalation.mjs', 'prepare-change-evidence.mjs'].map(name =>
      digest(readFileSync(path.resolve(process.cwd(), '.agents/scripts', name), 'utf8')))
    const gitEnvironment = Object.entries(process.env).filter(([key]) => /^GIT_/i.test(key) ||
      ['PATH', 'HOME', 'USERPROFILE', 'XDG_CONFIG_HOME'].includes(key.toUpperCase())).sort(([a], [b]) => a.localeCompare(b))
    return digest(JSON.stringify({ variant, builderSourceDigest, sources, cwd: process.cwd(), gitEnvironment }))
  }
})

export function verificationSeed(risk, options = {}) {
  return cachedVerificationSeed({ risk, options })
}

export function fixture(risk, options = {}) {
  const { root, cleanup, storyDigest, initialHead, implementationRequest, changedPaths } = verificationSeed(risk, options)
  const preparedImplementation = prepareAction(root, implementationRequest)
  assert.equal(preparedImplementation.status, 'READY', JSON.stringify(preparedImplementation))
  const checkpointed = checkpointImplementation(root, { ...implementationRequest, operation: 'checkpoint', preview: preparedImplementation.preview })
  assert.equal(checkpointed.status, 'CHECKPOINTED', JSON.stringify(checkpointed))
  const plan = frontmatter(readFileSync(path.join(root, PLAN), 'utf8'))
  const implementationDigest = plan.slices[0].receipt_refs.implementation.digest
  const head = git(root, 'rev-parse', 'HEAD')
  const checkSpecs = [{
    id: 'focused-fixture', classification: 'behavioral', required: true,
    argv: ['node', '-e', 'process.exit(0)'], cwd: '.', environment_identity: { name: 'fixture' },
    source: { kind: 'focused-manifest', path: '.agents/skills/v4-story-runner/actions/verify-slice.md' },
    referenced_paths: changedPaths
  }]
  const verifyRequest = {
    action: 'verify_slice', operation: 'prepare', story_id: '9.1', slice_id: 'A', expected_head: head,
    transaction_id: `verification-${risk.toLowerCase()}`, canonical_selector: 'fixture-feature', check_specs: checkSpecs,
    policy_paths: implementationRequest.policy_paths,
    recipe_paths: ['.agents/skills/v4-story-runner/actions/verify-slice.md', '.agents/skills/v4-story-runner/references/implementation-techniques.md', '.agents/verification/registry.json'],
  }
  return { root, cleanup, risk, sliceRisk: options.sliceRisk, storyDigest, implementationDigest, head, verifyRequest, checkSpecs, changedPaths }
}

export function withSliceRisk(text, risk) {
  return risk === undefined ? text : text.replace('    depends_on: []', `    depends_on: []\n    risk: \n      level: ${risk}\n      flags: []`)
}

export function prepareVerification(f) {
  const result = prepareAction(f.root, f.verifyRequest)
  assert.equal(result.status, 'READY', JSON.stringify(result))
  return result
}

export function makeReviewEvidence(f, preview) {
  const script = path.resolve(process.cwd(), '.agents/scripts/prepare-change-evidence.mjs')
  const result = spawnSync(process.execPath, [script, '--comparison', 'explicit-pair', '--base', preview.baseline_commit,
    '--head', preview.checkpoint_commit, ...preview.changed_paths.flatMap(relative => ['--path', relative])], {
    cwd: f.root, encoding: 'utf8', windowsHide: true
  })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout.trim()).changeEvidence
}

export function scopeDigest(changeEvidence) {
  if (changeEvidence.evidenceSet) {
    const paths = changeEvidence.evidenceSet.paths.map(item => item.path)
    return actionFingerprint({ paths, source: changeEvidence.evidenceSet.sourceDigest })
  }
  const refs = changeEvidence.paths[0].hunks.map((hunk, hunkIndex) => {
    const body = typeof hunk.diffText === 'string' ? hunk.diffText : hunk.diffText.join('\n')
    return { path: 'src/feature.txt', hunk_index: hunkIndex, body_digest: actionFingerprint(body) }
  })
  return actionFingerprint({ paths: ['src/feature.txt'], refs })
}

export function legacyMetadataFailure(f) {
  const request = { action: 'verify_slice', story_id: '9.1', slice_id: 'A', transaction_id: 'legacy-prewrite', recovery_checkpoint: f.head, maintenance_paths: [] }
  const identity = transactionIdentity(f.root, request)
  const lock = { schema_version: 1, repository: identity.repository, worktree: identity.worktree, action: 'verify_slice', story_id: '9.1', slice_id: 'A', transaction_id: request.transaction_id, scope_key: identity.scopeKey, created_at: '2026-10-01T00:00:00.000Z' }
  const journal = { ...lock, expected_head: f.head, checkpoint_commit: f.head, implementation_paths: [], metadata_paths: [PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT].sort(), preview_fingerprint: digest('legacy-preview'), lock_identity: lock, phase: 'RECOVERY_REQUIRED', error: 'SUCCESSOR_PROJECTION_MISMATCH', recovery_required: true, initial_inventory: { staged: [], unstaged: [], untracked: [] }, lock_path: identity.lockPath, journal_path: identity.journalPath, _path: identity.journalPath }
  mkdirSync(identity.transactionRoot, { recursive: true })
  const journalBytes = JSON.stringify(journal, null, 2) + '\n'
  const lockBytes = JSON.stringify(lock, null, 2) + '\n'
  writeFileSync(identity.journalPath, journalBytes)
  writeFileSync(identity.lockPath, lockBytes)
  const run = (operation, extra = {}) => runV4Story(f.root, '9.1', { expectedHead: f.head, operation, input: { ...request, ...extra } })
  return { request, identity, journalBytes, lockBytes, run }
}
