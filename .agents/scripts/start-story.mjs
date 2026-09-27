import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { frontmatter, validate } from './check-story-plan.mjs'
import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'

const SHA = /^[0-9a-f]{40,64}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const EPIC = 'docs/product/epics.md'
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const result = (status, reasons = [], extra = {}) => ({ status, ready: status === 'READY', valid: !['INVALID', 'ERROR'].includes(status), reasons, ...extra })
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (r.error || r.status !== 0) throw new Error('GIT_FAILED:' + args[0])
  return r
}
function inventory(root, args) {
  const r = git(root, args)
  if (r.stderr.trim()) throw new Error('GIT_INVENTORY_INCOMPLETE')
  return r.stdout.split('\0').filter(Boolean).sort()
}
function safeFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') ||
      path.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('INVALID_PATH')
  let file = root
  for (const part of relative.split('/')) {
    file = path.join(file, part)
    if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error('SYMLINK_PATH')
  }
  return file
}
function identity(root) {
  const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']).stdout.trim())
  const canonical = /^worktree (.+)$/m.exec(git(root, ['worktree', 'list', '--porcelain']).stdout)?.[1]?.trim()
  if (!canonical) throw new Error('CANONICAL_WORKTREE_UNAVAILABLE')
  return { lock: path.join(common, 'v4-start-story.lock'), pointer: path.join(canonical, '.agent-state/active-run.json') }
}
function inspect(root, id, expectedHead, options, ownedToken) {
  try {
    if (!/^\d+\.\d+$/.test(id ?? '') || !SHA.test(expectedHead ?? '')) return result('INVALID', ['INVALID_INPUT'])
    root = path.resolve(root)
    if (path.resolve(git(root, ['rev-parse', '--show-toplevel']).stdout.trim()) !== root) return result('INVALID', ['ROOT_NOT_TOPLEVEL'])
    const locations = identity(root)
    if (existsSync(locations.lock) && (!ownedToken || JSON.parse(readFileSync(locations.lock, 'utf8')).token !== ownedToken)) return result('BLOCKED', ['START_TRANSACTION_PENDING'])
    const pointerBytes = readFileSync(locations.pointer, 'utf8')
    const pointer = JSON.parse(pointerBytes)
    if (pointer.schemaVersion !== 1 || pointer.status !== 'IDLE' || pointer.activeRunId !== null || pointer.storyId !== null) return result('BLOCKED', ['V3_POINTER_NOT_IDLE'])
    const head = git(root, ['rev-parse', 'HEAD']).stdout.trim()
    if (head !== expectedHead) return result('STALE', ['EXPECTED_HEAD_MISMATCH'], { head })
    if (!git(root, ['branch', '--show-current']).stdout.trim()) return result('BLOCKED', ['DETACHED_HEAD'])
    const planPath = `_bmad-output/implementation-artifacts/story-${id.replace('.', '-')}-plan.md`
    const planText = readFileSync(safeFile(root, planPath), 'utf8')
    const plan = frontmatter(planText)
    if (plan.schema_version !== 2) return result('INVALID', ['START_REQUIRES_SCHEMA_V2'])
    const storyPath = plan.story?.path
    if (storyPath === planPath || storyPath === SPRINT || !storyPath?.endsWith('.md') || !/^(docs|_bmad-output\/implementation-artifacts)\//.test(storyPath)) return result('INVALID', ['INVALID_STORY_PATH'])
    const storyText = readFileSync(safeFile(root, storyPath), 'utf8')
    const checked = validate(root, id)
    if (checked.status !== 'READY') return result(checked.status, checked.reasons)
    const story = inspectStory(storyText)
    const reasons = []
    const lifecycle = plan.lifecycle_snapshot
    if (!['backlog', 'ready-for-dev'].includes(lifecycle) || story.status !== lifecycle || checked.actualLifecycle !== lifecycle || plan.execution_status !== 'ready-for-dev') reasons.push('FRESH_LIFECYCLE_REQUIRED')
    if (plan.next_action?.kind !== 'start_story' || plan.next_action.target !== 'story') reasons.push('START_ACTION_REQUIRED')
    if (!Array.isArray(plan.blockers) || plan.blockers.length || !Array.isArray(plan.unresolved_questions) || plan.unresolved_questions.length) reasons.push('BLOCKERS_OR_QUESTIONS_PRESENT')
    if (plan.human_approval != null || plan.finalization != null || plan.checkpoints != null) reasons.push('EXISTING_EXECUTION_EVIDENCE')
    const evidenceFields = ['baseline_commit', 'checkpoint_commit', 'subject_digest', 'changed_paths_sha256', 'receipt_refs', 'verification', 'review', 'implementation']
    if (plan.slices.some(s => s.status !== 'pending' || evidenceFields.some(key => Object.hasOwn(s, key)))) reasons.push('SLICES_NOT_FRESH')
    if (plan.slices.find(s => s.id === plan.current_slice)?.depends_on.length !== 0) reasons.push('CURRENT_SLICE_HAS_DEPENDENCIES')
    const tasksBlock = storyText.split('<!-- v4:tasks:start -->')[1]?.split('<!-- v4:tasks:end -->')[0] ?? ''
    if (/^- \[[xX]\]/m.test(tasksBlock) || storyText.includes('<!-- v4:completion:start -->')) reasons.push('EXISTING_STORY_EVIDENCE')
    if (existsSync(safeFile(root, `_bmad-output/implementation-artifacts/receipts/story-${id.replace('.', '-')}`))) reasons.push('EXISTING_RECEIPT_DIRECTORY')
    const approval = plan.planning_approval
    if (approval?.decision !== 'APPROVED' || approval.scope !== 'planning' || approval.story_normative_digest !== plan.story.normative_digest ||
        typeof approval.approved_at !== 'string' || !Number.isFinite(Date.parse(approval.approved_at))) reasons.push('PLANNING_APPROVAL_REQUIRED')
    const readiness = plan.readiness
    if (readiness?.status !== 'READY' || readiness.story_normative_digest !== plan.story.normative_digest || !Array.isArray(readiness.dependency_sprint_keys)) reasons.push('READINESS_REQUIRED')
    const sprintText = readFileSync(safeFile(root, SPRINT), 'utf8')
    const sprintSection = sprintText.replaceAll('\r\n', '\n').split(/^development_status:\s*$/m)
    if (sprintSection.length !== 2) return result('INVALID', ['INVALID_SPRINT_SECTION'])
    const entries = [...sprintSection[1].matchAll(/^  ([^\s:#]+):\s*([^\s#]+)\s*$/gm)]
    const state = key => { const matches = entries.filter(e => e[1] === key); return matches.length === 1 ? matches[0][2] : null }
    const dependencies = readiness?.dependency_sprint_keys ?? []
    if (Array.isArray(dependencies)) {
      if (new Set(dependencies).size !== dependencies.length || dependencies.some(key => typeof key !== 'string' || !/^\d+-\d+-\S+$/.test(key) || key === plan.sprint_key || state(key) !== 'done')) reasons.push('DEPENDENCIES_NOT_DONE')
    }
    const epicKey = 'epic-' + id.split('.')[0]
    if (!['backlog', 'in-progress'].includes(state(epicKey))) reasons.push('PARENT_EPIC_NOT_STARTABLE')
    const epicText = readFileSync(safeFile(root, EPIC), 'utf8')
    const sections = [...epicText.matchAll(/^### Story (\d+\.\d+):[^\r\n]*/gm)]
    const index = sections.findIndex(s => s[1] === id)
    if (sections.filter(s => s[1] === id).length !== 1 || plan.upstream_epic?.path !== EPIC || hash(epicText.slice(sections[index]?.index, sections[index + 1]?.index)) !== plan.upstream_epic.section_digest) reasons.push('UPSTREAM_EPIC_STALE')
    const paths = [storyPath, planPath, SPRINT].sort()
    const staged = inventory(root, ['diff', '--cached', '--name-only', '-z', 'HEAD', '--'])
    const dirty = inventory(root, ['diff', '--name-only', '-z', 'HEAD', '--'])
    const untracked = inventory(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    const tracked = inventory(root, ['ls-files', '-z'])
    const excludes = options.excludeUnrelated ?? []
    if (!Array.isArray(excludes) || new Set(excludes).size !== excludes.length || excludes.some(p => typeof p !== 'string' || !untracked.includes(p) || p.startsWith('_bmad-output/implementation-artifacts/') || p.startsWith('.agent-state/') || paths.includes(p) || p === EPIC)) reasons.push('INVALID_EXCLUSION')
    if (staged.length) reasons.push('DIRTY_INDEX')
    if (dirty.length || untracked.some(p => !excludes.includes(p))) reasons.push('DIRTY_WORKTREE')
    const artifacts = [[storyPath, storyText], [planPath, planText], [SPRINT, sprintText], [EPIC, epicText]]
    if (artifacts.some(([p]) => !tracked.includes(p))) reasons.push('ARTIFACTS_NOT_COMMITTED')
    else {
      for (const [file, text] of artifacts) {
        if (git(root, ['show', `${head}:${file}`]).stdout.replaceAll('\r\n', '\n') !== text.replaceAll('\r\n', '\n')) reasons.push('ARTIFACT_NOT_AT_HEAD')
      }
    }
    if (reasons.length) return result('BLOCKED', [...new Set(reasons)], { head, paths, dirty, untracked })
    const fingerprint = hash(JSON.stringify({ head, paths, story: hash(storyText), plan: hash(planText), sprint: hash(sprintText), epic: hash(epicText), pointer: hash(pointerBytes), excludes: [...excludes].sort() }))
    return result('READY', [], { head, fingerprint, paths, lifecycle, current_slice: plan.current_slice,
      next_action: { kind: 'implement_slice', target: plan.current_slice },
      preview: { storyPath, planPath, sprintKey: plan.sprint_key, epicKey, epicState: state(epicKey), storyText, planText, sprintText, pointerBytes, storyDigest: plan.story.normative_digest } })
  } catch (error) { return result('ERROR', [error.message]) }
}

export function inspectStart(root, id, expectedHead, options = {}) {
  const checked = inspect(root, id, expectedHead, options)
  const { preview, ...publicResult } = checked
  return publicResult
}
function replaceOne(text, pattern, replacement) {
  let count = 0
  const output = text.replace(pattern, (...args) => { count++; return typeof replacement === 'function' ? replacement(...args) : replacement })
  if (count !== 1) throw new Error('PROJECTION_REPLACE_FAILED')
  return output
}
function atomicWrite(root, relative, text) {
  const file = safeFile(root, relative)
  const temp = file + '.' + randomUUID() + '.tmp'
  try { writeFileSync(temp, text, { flag: 'wx' }); renameSync(temp, file) }
  finally { if (existsSync(temp)) unlinkSync(temp) }
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function applyStart(root, id, expectedHead, fingerprint, options = {}) {
  if (!DIGEST.test(fingerprint ?? '')) return result('BLOCKED', ['START_PREVIEW_FINGERPRINT_REQUIRED'])
  const prepared = inspect(root, id, expectedHead, options)
  if (prepared.status !== 'READY') return prepared
  if (prepared.fingerprint !== fingerprint) return result('STALE', ['START_PREVIEW_CHANGED'])
  let lock, token, acquired = false, mutated = false
  try {
    lock = identity(root).lock
    token = randomUUID()
    writeFileSync(lock, JSON.stringify({ token, story_id: id, expected_head: expectedHead, fingerprint, paths: prepared.paths }) + '\n', { flag: 'wx' })
    acquired = true
    const fresh = inspect(root, id, expectedHead, options, token)
    if (fresh.status !== 'READY' || fresh.fingerprint !== fingerprint) return result(fresh.status === 'READY' ? 'STALE' : fresh.status, ['START_GUARD_CHANGED', ...fresh.reasons])
    const p = fresh.preview
    const storyText = replaceOne(p.storyText, /^status: [^\r\n]+$/gm, 'status: in-progress')
    let planText = replaceOne(p.planText, /^lifecycle_snapshot: [^\r\n]+$/gm, 'lifecycle_snapshot: in-progress')
    planText = replaceOne(planText, /^execution_status: [^\r\n]+$/gm, 'execution_status: in-progress')
    planText = replaceOne(planText, /^next_action:\r?\n(?:  [^\r\n]*(?:\r?\n|$))*/gm, `next_action:\n  kind: implement_slice\n  target: ${fresh.current_slice}\n`)
    let sprintText = replaceOne(p.sprintText, new RegExp('^  ' + escape(p.sprintKey) + ': ' + fresh.lifecycle + '\\r?$', 'gm'), '  ' + p.sprintKey + ': in-progress')
    if (p.epicState === 'backlog') sprintText = replaceOne(sprintText, new RegExp('^  ' + escape(p.epicKey) + ': backlog\\r?$', 'gm'), '  ' + p.epicKey + ': in-progress')
    if (normativeDigest(inspectStory(storyText)) !== p.storyDigest) throw new Error('NORMATIVE_CONTENT_CHANGED')
    // From this point failures retain the lock and partial files for explicit recovery.
    mutated = true
    atomicWrite(root, p.storyPath, storyText)
    atomicWrite(root, p.planPath, planText)
    atomicWrite(root, SPRINT, sprintText)
    if (validate(root, id).status !== 'READY') throw new Error('POST_WRITE_VALIDATION_FAILED')
    if (readFileSync(identity(root).pointer, 'utf8') !== p.pointerBytes) throw new Error('V3_POINTER_CHANGED_DURING_START')
    if (git(root, ['rev-parse', 'HEAD']).stdout.trim() !== expectedHead) throw new Error('HEAD_CHANGED_DURING_START')
    if (inventory(root, ['diff', '--cached', '--name-only', '-z', 'HEAD', '--']).length) throw new Error('INDEX_CHANGED_DURING_START')
    git(root, ['add', '--', ...fresh.paths])
    if (JSON.stringify(inventory(root, ['diff', '--cached', '--name-only', '-z', 'HEAD', '--'])) !== JSON.stringify(fresh.paths)) throw new Error('STAGED_SCOPE_MISMATCH')
    git(root, ['commit', '-m', `chore(story-${id}): start V4 Lite story`, '--only', '--', ...fresh.paths])
    const commit = git(root, ['rev-parse', 'HEAD']).stdout.trim()
    if (git(root, ['rev-parse', 'HEAD^']).stdout.trim() !== expectedHead ||
        JSON.stringify(inventory(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit])) !== JSON.stringify(fresh.paths)) throw new Error('COMMIT_SCOPE_MISMATCH')
    for (const [file, expected] of [[p.storyPath, storyText], [p.planPath, planText], [SPRINT, sprintText]]) {
      // Compare Git-normalized text so core.autocrlf does not invalidate the transaction.
      const actual = git(root, ['show', `${commit}:${file}`]).stdout
      if (actual.replaceAll('\r\n', '\n') !== expected.replaceAll('\r\n', '\n') ||
          readFileSync(safeFile(root, file), 'utf8').replaceAll('\r\n', '\n') !== expected.replaceAll('\r\n', '\n')) throw new Error('COMMITTED_CONTENT_MISMATCH')
    }
    const postStaged = inventory(root, ['diff', '--cached', '--name-only', '-z', 'HEAD', '--'])
    const postDirty = inventory(root, ['diff', '--name-only', '-z', 'HEAD', '--'])
    const postUntracked = inventory(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    if (postStaged.length || postDirty.length || postUntracked.some(file => !options.excludeUnrelated?.includes(file))) throw new Error('WORKTREE_SCOPE_MISMATCH')
    if (readFileSync(identity(root).pointer, 'utf8') !== p.pointerBytes) throw new Error('V3_POINTER_CHANGED_DURING_START')
    if (validate(root, id).status !== 'READY') throw new Error('POST_COMMIT_VALIDATION_FAILED')
    mutated = false
    return result('STARTED', [], { commit, paths: fresh.paths, lifecycle: 'in-progress', execution_status: 'in-progress', next_action: fresh.next_action, stopCondition: 'STORY_STARTED', durableActionCount: 1 })
  } catch (error) {
    return result(mutated ? 'RECOVERY_REQUIRED' : 'BLOCKED', [error.code === 'EEXIST' ? 'START_TRANSACTION_PENDING' : error.message], { expectedHead, recovery: mutated ? 'Preserve files/index and lock; inspect the transaction and Git before explicit recovery. No automatic retry or reset.' : null })
  } finally {
    if (acquired && !mutated && existsSync(lock) && JSON.parse(readFileSync(lock, 'utf8')).token === token) unlinkSync(lock)
  }
}

function main() {
  const [verb, id, ...tail] = process.argv.slice(2)
  let expectedHead, fingerprint
  const excludeUnrelated = []
  if (!['check', 'apply'].includes(verb) || tail.length % 2) return result('INVALID', ['USAGE: check|apply <id> --expected-head <sha> [--fingerprint <digest>] [--exclude-unrelated <exact-path>]'])
  for (let i = 0; i < tail.length; i += 2) {
    if (tail[i] === '--expected-head' && expectedHead === undefined) expectedHead = tail[i + 1]
    else if (tail[i] === '--fingerprint' && fingerprint === undefined) fingerprint = tail[i + 1]
    else if (tail[i] === '--exclude-unrelated') excludeUnrelated.push(tail[i + 1])
    else return result('INVALID', ['INVALID_ARGUMENT'])
  }
  const root = path.resolve(git(process.cwd(), ['rev-parse', '--show-toplevel']).stdout.trim())
  return verb === 'check' ? inspectStart(root, id, expectedHead, { excludeUnrelated }) : applyStart(root, id, expectedHead, fingerprint, { excludeUnrelated })
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let output
  try { output = main() } catch (error) { output = result('ERROR', [error.message]) }
  process.stdout.write(JSON.stringify(output) + '\n')
  process.exitCode = { READY: 0, STARTED: 0, STALE: 2, BLOCKED: 3, INVALID: 4, ERROR: 5, RECOVERY_REQUIRED: 6 }[output.status] ?? 5
}
