import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { frontmatter } from './check-story-plan.mjs'
import { inspectFinalization, stableDigest } from './check-story-finalization.mjs'
import { projectFinalization, parseGitPaths, gitFailure, runFinalizationGit } from './finalize-story.mjs'

const EXECUTOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const AUTH = 'V4_LITE_FINALIZATION_RECOVERY'
const SHA = /^[a-f0-9]{40,64}$/
const TX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const normalize = text => text.replace(/\r\n/g, '\n')
const equal = (a, b) => stableDigest(a) === stableDigest(b)
const fail = code => { throw new Error(code) }

function git(root, args, input) {
  const result = spawnSync('git', ['--no-optional-locks', ...args], {
    cwd: root, input, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 16 * 1024 * 1024
  })
  if (result.error || result.status !== 0) {
    const error = new Error('GIT_READ_FAILED')
    error.git_failure = gitFailure({ ...result, command: ['git', ...args], timeout_ms: 10000 }, 'guard')
    throw error
  }
  return result.stdout
}

function relativeFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes('\\') ||
      path.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.split('/').some(p => !p || p === '.' || p === '..')) fail('INVALID_PATH')
  const file = path.resolve(root, relative)
  if (!file.startsWith(root + path.sep)) fail('INVALID_PATH')
  return file
}

function safeFile(root, relative) {
  const file = relativeFile(root, relative)
  if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() ||
      !realpathSync(file).startsWith(realpathSync(root) + path.sep)) fail('UNSAFE_CANDIDATE')
  return file
}

function identity(root, request) {
  if (!/^\d+\.\d+$/.test(request.story_id ?? '') || !SHA.test(request.expected_head ?? '') ||
      !SHA.test(request.executor_commit ?? '') || !TX.test(request.transaction_id ?? '') ||
      request.maintenance_authorization !== AUTH) fail('INVALID_RECOVERY_AUTHORIZATION')
  root = path.resolve(root)
  if (path.resolve(git(root, ['rev-parse', '--show-toplevel']).trim()) !== root) fail('ROOT_NOT_TOPLEVEL')
  const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim())
  const repository = path.resolve(root, git(root, ['rev-parse', '--git-dir']).trim())
  const canonical = path.join(path.dirname(common), '.agent-state/active-run.json')
  const index = path.resolve(root, git(root, ['rev-parse', '--git-path', 'index']).trim())
  return { root, common, repository, canonical, index,
    lock: path.join(common, 'v4-finalize-story.lock'),
    journal: path.join(repository, 'noteflow-v4-finalization-recovery', request.transaction_id + '.json') }
}

function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')) }

function environment(id, request) {
  const pointerBytes = readFileSync(id.canonical)
  const pointer = JSON.parse(pointerBytes)
  if (pointer.status !== 'IDLE' || pointer.activeRunId != null || pointer.storyId != null) fail('CANONICAL_NOT_IDLE')
  if (git(EXECUTOR, ['rev-parse', 'HEAD']).trim() !== request.executor_commit) fail('EXECUTOR_COMMIT_MISMATCH')
  // Bind all executable control-plane sources, not just the entry point.
  const sourceFiles = readdirSync(path.join(EXECUTOR, '.agents/scripts')).filter(f => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).sort()
  const committedFiles = paths(EXECUTOR, ['ls-tree', '--name-only', '-z', request.executor_commit, '.agents/scripts/'])
    .filter(f => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).map(f => f.slice('.agents/scripts/'.length))
  if (!equal(sourceFiles, committedFiles)) fail('EXECUTOR_SOURCE_MANIFEST_MISMATCH')
  const committed = Buffer.from(git(EXECUTOR, ['cat-file', '--batch'],
    sourceFiles.map(file => request.executor_commit + ':.agents/scripts/' + file).join('\n') + '\n'))
  let offset = 0
  for (const file of sourceFiles) {
    const newline = committed.indexOf(10, offset)
    const header = /^([a-f0-9]+) blob (\d+)$/.exec(committed.subarray(offset, newline).toString('utf8'))
    if (!header) fail('EXECUTOR_SOURCE_BLOB_MISSING')
    const end = newline + 1 + Number(header[2])
    const blob = committed.subarray(newline + 1, end).toString('utf8')
    if (normalize(blob) !== normalize(readFileSync(path.join(EXECUTOR, '.agents/scripts', file), 'utf8'))) fail('EXECUTOR_SOURCE_NOT_COMMITTED')
    offset = end + 1
  }
  if (offset !== committed.length) fail('EXECUTOR_SOURCE_BATCH_INVALID')
  const sources = sourceFiles.map(f => [f, hash(readFileSync(path.join(EXECUTOR, '.agents/scripts', f)))])
  if (existsSync(id.index + '.lock')) fail('INDEX_LOCK_PRESENT')
  const transactions = path.join(id.common, 'noteflow-v4-transactions')
  if (existsSync(transactions)) for (const file of readdirSync(transactions).filter(f => f.endsWith('.lock'))) {
    let lock
    try { lock = readJson(path.join(transactions, file)) } catch { fail('FOREIGN_TRANSACTION_LOCK') }
    if (path.resolve(lock.worktree ?? lock.repository ?? '') === id.root || lock.repository === id.repository) fail('FOREIGN_TRANSACTION_LOCK')
  }
  return { canonical_pointer_digest: hash(pointerBytes), executor_source_digest: stableDigest(sources) }
}

function indexState(id) {
  const entries = git(id.root, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean).map(line => {
    const match = /^(\d+) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(line)
    if (!match || match[3] !== '0') fail('UNMERGED_INDEX')
    return { mode: match[1], oid: match[2], path: match[4] }
  })
  const flags = git(id.root, ['ls-files', '-v', '-z']).split('\0').filter(Boolean)
  return { raw_digest: hash(readFileSync(id.index)), entries_digest: stableDigest(entries), entries, flags }
}

function paths(root, args) { return parseGitPaths(git(root, args)) }
function staged(root) { return paths(root, ['diff', '--cached', '--name-only', '-z', 'HEAD', '--']) }
function dirty(root) {
  return [...new Set([...paths(root, ['diff', '--name-only', '-z', 'HEAD', '--']),
    ...paths(root, ['ls-files', '--others', '--exclude-standard', '-z', '--'])])].sort()
}

function candidates(id, expected) {
  return expected.map(relative => {
    const bytes = readFileSync(safeFile(id.root, relative))
    const oid = git(id.root, ['hash-object', '--path', relative, '--stdin'], bytes).trim()
    return { path: relative, raw_digest: hash(bytes), canonical_blob: oid }
  })
}

function implementationState(id, scope) {
  return scope.map(item => {
    const file = relativeFile(id.root, item.path)
    if (item.blob === 'DELETED') {
      try { lstatSync(file); fail('DELETED_SCOPE_PATH_PRESENT') } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      return { path: item.path, blob: 'DELETED', raw_digest: null }
    }
    const bytes = readFileSync(safeFile(id.root, item.path))
    const blob = git(id.root, ['hash-object', '--path', item.path, '--stdin'], bytes).trim()
    if (blob !== item.blob) fail('IMPLEMENTATION_WORKTREE_DRIFT:' + item.path)
    return { path: item.path, blob, raw_digest: hash(bytes) }
  })
}

function proveCandidate(id, request) {
  const { root } = id
  const planPath = '_bmad-output/implementation-artifacts/story-' + request.story_id.replace('.', '-') + '-plan.md'
  const receiptPath = '_bmad-output/implementation-artifacts/receipts/story-' + request.story_id.replace('.', '-') + '/finalization.json'
  const planText = readFileSync(safeFile(root, planPath), 'utf8')
  const plan = frontmatter(planText)
  if (plan.story_id !== request.story_id || plan.human_approval != null) fail('CROSS_STORY_OR_APPROVAL')
  const expectedPaths = [plan.story.path, planPath, SPRINT, receiptPath].sort()
  if (new Set(expectedPaths).size !== 4 || !equal(dirty(root), expectedPaths)) fail('EXACT_FOUR_PATHS_REQUIRED')
  const helper = inspectFinalization(root, request.story_id, request.expected_head)
  if (!helper.valid || helper.status !== 'RECONCILIATION_REQUIRED' ||
      !helper.reasons.includes('UNCOMMITTED_FINALIZATION') || !helper.reasons.includes('HUMAN_GATE_PENDING') ||
      helper.reasons.some(r => !['UNCOMMITTED_FINALIZATION', 'HUMAN_GATE_PENDING'].includes(r))) {
    const error = new Error('CANDIDATE_GATE_REJECTED')
    error.gate = helper
    throw error
  }
  const sources = {
    plan: git(root, ['show', request.expected_head + ':' + planPath]),
    story: git(root, ['show', request.expected_head + ':' + plan.story.path]),
    sprint: git(root, ['show', request.expected_head + ':' + SPRINT])
  }
  const baseline = frontmatter(sources.plan)
  if (baseline.story_id !== request.story_id || baseline.story.path !== plan.story.path ||
      baseline.lifecycle_snapshot !== 'in-progress' || baseline.execution_status !== 'in-progress' ||
      baseline.next_action?.kind !== 'finalize_story' || baseline.next_action?.target !== 'story' || baseline.human_approval != null) fail('BASELINE_NOT_FINALIZABLE')
  // Only lifecycle/durability reasons are waived here. Every substantive gate
  // obligation was validated above, including historical implementation attempts.
  const proven = { ...helper, done_gate_disposition: helper.canonical_disclosures.some(d => d.status !== 'PASS' || d.complete !== true)
    ? 'READY_WITH_DISCLOSURES' : 'READY' }
  const implementation_paths = helper.scope.paths.map(({ path, blob }) => ({ path, blob }))
  const implementation_worktree_digest = stableDigest(implementationState(id, implementation_paths))
  const projection = projectFinalization(root, request.story_id, request.expected_head, proven, sources)
  const expected = new Map([
    [plan.story.path, projection.nextStoryBytes], [planPath, projection.nextPlanBytes],
    [SPRINT, projection.nextSprintBytes], [receiptPath, JSON.stringify(projection.receipt, null, 2) + '\n']
  ])
  for (const [relative, bytes] of expected) {
    if (normalize(readFileSync(safeFile(root, relative), 'utf8')) !== normalize(bytes)) fail('PROJECTION_MISMATCH:' + relative)
  }
  return { paths: expectedPaths, candidates: candidates(id, expectedPaths),
    baseline_sources_digest: stableDigest(Object.entries(sources).map(([p, bytes]) => [p, hash(bytes)])),
    story_normative_digest: helper.story_normative_digest,
    slice_set_digest: helper.slice_set_digest, receipt_set_digest: helper.receipt_set_digest,
    scope_paths_digest: helper.scope_paths_digest,
    implementation_commit_set_digest: helper.implementation_commit_set_digest,
    final_scoped_tree_digest: helper.final_scoped_tree_digest,
    implementation_paths, implementation_worktree_digest,
    canonical_disclosures: helper.canonical_disclosures }
}

function preview(id, request) {
  const env = environment(id, request)
  if (git(id.root, ['rev-parse', 'HEAD']).trim() !== request.expected_head) fail('EXPECTED_HEAD_MISMATCH')
  if (existsSync(id.lock)) fail('FOREIGN_FINALIZATION_LOCK')
  if (existsSync(id.journal)) fail('TRANSACTION_ALREADY_RECORDED')
  if (staged(id.root).length) fail('DIRTY_INDEX')
  const before = indexState(id)
  if (before.flags.some(line => !line.startsWith('H '))) fail('MASKED_INDEX_UNSUPPORTED')
  const proof = proveCandidate(id, request)
  const after = indexState(id)
  if (!equal(before, after)) fail('INDEX_CHANGED_DURING_PREPARE')
  return { schema: 'v4-finalization-recovery-preview-v1', story_id: request.story_id,
    transaction_id: request.transaction_id, maintenance_authorization: AUTH,
    expected_head: request.expected_head, executor_commit: request.executor_commit,
    root: id.root, repository: id.repository, common: id.common,
    branch: git(id.root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
    ...env, ...proof, index: before }
}

function rejection(error, mutated = false) {
  return { status: mutated ? 'RECOVERY_REQUIRED' : 'REJECTED', ready: false, valid: false,
    reasons: [error.message], ...(error.git_failure ? { git_failure: error.git_failure } : {}),
    ...(error.gate ? { gate: error.gate } : {}) }
}

export function prepareFinalizationRecovery(root, request) {
  try {
    const id = identity(root, request)
    const recovery_preview = preview(id, request)
    // Freshness also covers canonical state, candidates and executor during the read.
    if (!equal(recovery_preview, preview(id, request))) fail('PREPARE_GUARD_CHANGED')
    return { status: 'READY', ready: true, valid: true, reasons: [], recovery_preview, fingerprint: stableDigest(recovery_preview) }
  } catch (error) { return rejection(error) }
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = file + '.' + randomUUID() + '.tmp'
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
  renameSync(temp, file)
}

function ownership(id, request) {
  return { schema: 'v4-finalization-recovery-lock-v1', root: id.root, repository: id.repository,
    transaction_id: request.transaction_id, fingerprint: request.fingerprint }
}

function requireBound(id, request, p) {
  if (p.schema !== 'v4-finalization-recovery-preview-v1' || p.root !== id.root || p.repository !== id.repository ||
      p.common !== id.common || p.story_id !== request.story_id || p.transaction_id !== request.transaction_id ||
      p.expected_head !== request.expected_head || p.executor_commit !== request.executor_commit || p.maintenance_authorization !== AUTH ||
      stableDigest(p) !== request.fingerprint) fail('PREVIEW_BINDING_MISMATCH')
  const env = environment(id, request)
  if (env.canonical_pointer_digest !== p.canonical_pointer_digest || env.executor_source_digest !== p.executor_source_digest ||
      git(id.root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim() !== p.branch) fail('ENVIRONMENT_STALE')
  if (!equal(candidates(id, p.paths), p.candidates)) fail('CANDIDATE_BYTES_CHANGED')
  if (stableDigest(p.implementation_paths) !== p.final_scoped_tree_digest ||
      stableDigest(implementationState(id, p.implementation_paths)) !== p.implementation_worktree_digest) fail('IMPLEMENTATION_SCOPE_CHANGED')
}

function stageProof(id, p) {
  if (!equal(staged(id.root), p.paths)) fail('STAGED_SCOPE_MISMATCH')
  const state = indexState(id), outside = entries => entries.filter(e => !p.paths.includes(e.path))
  if (!equal(outside(state.entries), outside(p.index.entries))) fail('OUTSIDE_INDEX_CHANGED')
  const flagsOutside = flags => flags.filter(line => !p.paths.includes(line.slice(2)))
  if (!equal(flagsOutside(state.flags), flagsOutside(p.index.flags))) fail('OUTSIDE_INDEX_FLAGS_CHANGED')
  for (const item of p.candidates) {
    const entry = state.entries.find(e => e.path === item.path)
    const old = p.index.entries.find(e => e.path === item.path)
    if (!entry || entry.oid !== item.canonical_blob || entry.mode !== (old?.mode ?? '100644')) fail('STAGED_BLOB_MISMATCH:' + item.path)
  }
  return state
}

function requireProof(id, request, p) {
  const proof = proveCandidate(id, request)
  if (!equal(proof, Object.fromEntries(Object.keys(proof).map(k => [k, p[k]])))) fail('CANDIDATE_PROVENANCE_CHANGED')
}

function proveCommit(id, request, p) {
  const head = git(id.root, ['rev-parse', 'HEAD']).trim()
  if (git(id.root, ['rev-parse', 'HEAD^']).trim() !== p.expected_head) fail('RECOVERY_COMMIT_PARENT_MISMATCH')
  const message = git(id.root, ['show', '-s', '--format=%B', 'HEAD'])
  if (!message.split(/\r?\n/).includes('V4-Finalization-Recovery: ' + request.transaction_id) ||
      !message.split(/\r?\n/).includes('V4-Recovery-Fingerprint: ' + request.fingerprint)) fail('RECOVERY_COMMIT_OWNERSHIP_MISMATCH')
  if (!equal(paths(id.root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD']), p.paths) ||
      staged(id.root).length || dirty(id.root).length) fail('RECOVERY_COMMIT_SCOPE_MISMATCH')
  const state = indexState(id)
  if (!equal(state.entries.filter(e => !p.paths.includes(e.path)), p.index.entries.filter(e => !p.paths.includes(e.path)))) fail('OUTSIDE_INDEX_CHANGED')
  if (!equal(state.flags.filter(e => !p.paths.includes(e.slice(2))), p.index.flags.filter(e => !p.paths.includes(e.slice(2))))) fail('OUTSIDE_INDEX_FLAGS_CHANGED')
  for (const item of p.candidates) {
    if (git(id.root, ['rev-parse', 'HEAD:' + item.path]).trim() !== item.canonical_blob ||
        state.entries.find(e => e.path === item.path)?.oid !== item.canonical_blob) fail('RECOVERY_COMMIT_BLOB_MISMATCH')
  }
  return { head, index: state }
}

function success(commit, p, journal) {
  return { status: 'HUMAN_GATE_REQUIRED', valid: true, ready: false, reasons: [], commit,
    lifecycle: 'review', execution_status: 'complete', next_action: { kind: 'complete_story', target: 'story' },
    paths: p.paths, canonical_disclosures: p.canonical_disclosures, journal }
}

export function applyFinalizationRecovery(root, request, observer = {}) {
  let mutated = false
  try {
    const id = identity(root, request), p = request.recovery_preview
    if (!p) fail('RECOVERY_PREVIEW_REQUIRED')
    requireBound(id, request, p)
    const owned = ownership(id, request)
    let journal = existsSync(id.journal) ? readJson(id.journal) : null
    if (journal && (journal.schema !== 'v4-finalization-recovery-journal-v1' ||
        !['LOCKED', 'STAGING', 'STAGED', 'COMMITTING', 'COMMITTED', 'COMPLETE'].includes(journal.phase) ||
        Object.keys(journal).some(k => !['schema', 'owner', 'fingerprint', 'preview', 'phase', 'staged_index', 'commit', 'committed_index'].includes(k)) ||
        !equal(journal.preview, p) || journal.fingerprint !== request.fingerprint || !equal(journal.owner, owned) ||
        (['COMMITTED', 'COMPLETE'].includes(journal.phase) && (!SHA.test(journal.commit ?? '') || !journal.committed_index)))) fail('JOURNAL_BINDING_MISMATCH')
    if (existsSync(id.lock) && !equal(readJson(id.lock), owned)) fail('FOREIGN_FINALIZATION_LOCK')
    if (!journal && existsSync(id.lock)) fail('ORPHAN_RECOVERY_LOCK')
    if (journal && !['COMPLETE'].includes(journal.phase) && !existsSync(id.lock)) fail('OWNED_LOCK_MISSING')

    const head = git(id.root, ['rev-parse', 'HEAD']).trim()
    if (journal && ['COMMITTING', 'COMMITTED', 'COMPLETE'].includes(journal.phase) && head !== p.expected_head) {
      const committed = proveCommit(id, request, p)
      if (journal.commit && journal.commit !== committed.head) fail('JOURNAL_COMMIT_MISMATCH')
      if (journal.committed_index && !equal(journal.committed_index, committed.index)) fail('COMMITTED_INDEX_DRIFT')
      if (journal.phase === 'COMPLETE' && !existsSync(id.lock)) return success(committed.head, p, id.journal)
      mutated = true
      atomicJson(id.journal, { ...journal, phase: 'COMPLETE', commit: committed.head, committed_index: committed.index })
      if (existsSync(id.lock)) { if (!equal(readJson(id.lock), owned)) fail('FOREIGN_FINALIZATION_LOCK'); unlinkSync(id.lock) }
      return success(committed.head, p, id.journal)
    }
    if (head !== p.expected_head) fail('EXPECTED_HEAD_MISMATCH')
    if (journal?.phase === 'COMPLETE' || journal?.phase === 'COMMITTED') fail('COMMITTED_HEAD_MISSING')

    if (!journal) {
      const current = preview(id, request)
      if (!equal(current, p)) fail('RECOVERY_PREVIEW_STALE')
      // Recheck immediately before acquiring ownership; nothing has been written.
      if (!equal(preview(id, request), p)) fail('RECOVERY_GUARD_CHANGED')
      writeFileSync(id.lock, JSON.stringify(owned) + '\n', { flag: 'wx' })
      mutated = true
      journal = { schema: 'v4-finalization-recovery-journal-v1', owner: owned, fingerprint: request.fingerprint, preview: p, phase: 'LOCKED' }
      atomicJson(id.journal, journal)
      observer.onPhase?.('LOCKED')
    } else requireProof(id, request, p)
    requireBound(id, request, p)
    if (journal.phase === 'LOCKED') {
      if (!equal(indexState(id), p.index) || staged(id.root).length) fail('INDEX_DRIFT')
      requireProof(id, request, p)
      mutated = true
      journal = { ...journal, phase: 'STAGING' }
      atomicJson(id.journal, journal)
      observer.onPhase?.('STAGING')
      const add = runFinalizationGit(id.root, ['add', '--', ...p.paths])
      if (add.status !== 0 || add.error) {
        const error = new Error('GIT_ADD_FAILED'); error.git_failure = gitFailure(add, 'stage'); throw error
      }
      journal = { ...journal, phase: 'STAGED', staged_index: stageProof(id, p) }
      atomicJson(id.journal, journal)
      observer.onPhase?.('STAGED')
    }
    // An interruption inside Git add without a durable snapshot is intentionally
    // not auto-adopted. A separate diagnostic/rebinding decision is required.
    if (!['STAGED', 'COMMITTING'].includes(journal.phase)) fail('UNBOUND_STAGING_INTERRUPTION')
    if (!equal(stageProof(id, p), journal.staged_index)) fail('STAGED_INDEX_DRIFT')
    requireBound(id, request, p)
    requireProof(id, request, p)
    if (!equal(stageProof(id, p), journal.staged_index)) fail('STAGED_INDEX_DRIFT')
    if (!equal(readJson(id.lock), owned)) fail('FOREIGN_FINALIZATION_LOCK')
    mutated = true
    journal = { ...journal, phase: 'COMMITTING' }
    atomicJson(id.journal, journal)
    observer.onPhase?.('COMMITTING')
    const result = runFinalizationGit(id.root, ['commit', '-m', 'docs(story-' + request.story_id + '): recover finalization for Human Gate',
      '-m', 'V4-Finalization-Recovery: ' + request.transaction_id + '\nV4-Recovery-Fingerprint: ' + request.fingerprint])
    if (result.error || result.status !== 0) {
      const error = new Error('GIT_COMMIT_FAILED'); error.git_failure = gitFailure(result, 'commit'); throw error
    }
    observer.onPhase?.('COMMIT_RETURNED')
    const committed = proveCommit(id, request, p)
    journal = { ...journal, phase: 'COMMITTED', commit: committed.head, committed_index: committed.index }
    atomicJson(id.journal, journal)
    observer.onPhase?.('COMMITTED')
    journal = { ...journal, phase: 'COMPLETE' }
    atomicJson(id.journal, journal)
    if (!equal(readJson(id.lock), owned)) fail('FOREIGN_FINALIZATION_LOCK')
    unlinkSync(id.lock)
    return success(committed.head, p, id.journal)
  } catch (error) { return rejection(error, mutated) }
}

function main() {
  const [operation, flag, file, ...rest] = process.argv.slice(2)
  if (!['prepare-finalization-recovery', 'apply-finalization-recovery'].includes(operation) || flag !== '--input' || !file || rest.length) fail('USAGE: <prepare-finalization-recovery|apply-finalization-recovery> --input <json>')
  const request = readJson(path.resolve(file))
  const root = path.resolve(git(process.cwd(), ['rev-parse', '--show-toplevel']).trim())
  return operation === 'prepare-finalization-recovery' ? prepareFinalizationRecovery(root, request) : applyFinalizationRecovery(root, request)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let result
  try { result = main() } catch (error) { result = rejection(error) }
  process.stdout.write(JSON.stringify(result) + '\n')
  process.exitCode = ['READY', 'HUMAN_GATE_REQUIRED'].includes(result.status) ? 0 : 2
}
