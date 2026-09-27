import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'
import { frontmatter, validate } from './check-story-plan.mjs'
import { inspectStart, applyStart } from './start-story.mjs'
import { runAction, authorizeAction } from './v4-story-runner.mjs'

const STORY = 'docs/story.md'
const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const EPIC = 'docs/product/epics.md'
const POINTER = '.agent-state/active-run.json'
const digest = value => 'sha256:' + createHash('sha256').update(value).digest('hex')
const git = (root, ...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}
function yaml(value, indent = 0) {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) return value.length ? '\n' + value.map(item => `${pad}- ${yaml(item, indent + 2).trimStart()}`).join('\n') : '[]'
  if (value && typeof value === 'object') return (indent ? '\n' : '') + Object.entries(value).map(([k, v]) => {
    const item = yaml(v, indent + 2)
    return `${pad}${k}:${item.startsWith('\n') ? item : ' ' + item}`
  }).join('\n')
  return JSON.stringify(value)
}
function fixture(t, status = 'backlog') {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-start-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text) }
  const read = file => readFileSync(path.join(root, file), 'utf8')
  git(root, 'init', '-q')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'core.autocrlf', 'false')
  write('.gitignore', '.agent-state/\n')
  write(POINTER, JSON.stringify({ schemaVersion: 1, status: 'IDLE', activeRunId: null, storyId: null }))
  write(STORY, `---\nstory_id: "9.1"\ntitle: Fresh story\nstatus: ${status}\n---\n# Story 9.1\n<!-- v4:story:start -->\nKeep a draft.\n<!-- v4:story:end -->\n<!-- v4:ac:start -->\n- AC-1: Keep the draft on retry.\n<!-- v4:ac:end -->\n<!-- v4:tasks:start -->\n- [ ] T-1 [AC-1]: Implement drafts.\n- [ ] T-2 [AC-1]: Verify retry.\n<!-- v4:tasks:end -->\n<!-- v4:readiness:start -->\n- result: READY\n- dependencies: Story 8.1\n<!-- v4:readiness:end -->\n`)
  write(SPRINT, `development_status:\n  epic-9: backlog\n  8-1-prerequisite: done\n  9-1-fresh: ${status}\n`)
  write(EPIC, '### Story 9.1: Fresh story\n\nKeep the draft.\n\n### Story 9.2: Later\n')
  const storyDigest = normativeDigest(inspectStory(read(STORY)))
  const plan = { schema_version: 2, story_id: '9.1', story: { path: STORY, normative_digest: storyDigest },
    upstream_epic: { path: EPIC, section_digest: digest(read(EPIC).split('### Story 9.2:')[0]) },
    sprint_key: '9-1-fresh', lifecycle_snapshot: status, execution_status: 'ready-for-dev', current_slice: 'A',
    slices: [{ id: 'A', status: 'pending', task_refs: ['T-1'], depends_on: [] }, { id: 'B', status: 'pending', task_refs: ['T-2'], depends_on: ['A'] }],
    blockers: [], unresolved_questions: [],
    planning_approval: { decision: 'APPROVED', scope: 'planning', story_normative_digest: storyDigest, approved_at: '2026-09-26T12:00:00Z' },
    readiness: { status: 'READY', story_normative_digest: storyDigest, dependency_sprint_keys: ['8-1-prerequisite'] },
    next_action: { kind: 'start_story', target: 'story' } }
  const save = () => write(PLAN, '---\n' + yaml(plan) + '\n---\n')
  const commit = () => { git(root, 'add', '.'); git(root, 'commit', '--allow-empty', '-qm', 'fixture'); return git(root, 'rev-parse', 'HEAD') }
  save()
  return { root, plan, write, read, save, commit, head: commit() }
}

test('check is read-only and start commits exactly three lifecycle files without implementation', t => {
  const f = fixture(t)
  const before = [STORY, PLAN, SPRINT, POINTER].map(f.read)
  const preview = inspectStart(f.root, '9.1', f.head)
  assert.equal(preview.status, 'READY', JSON.stringify(preview))
  assert.deepEqual([STORY, PLAN, SPRINT, POINTER].map(f.read), before)
  assert.equal(git(f.root, 'status', '--porcelain'), '')
  const started = applyStart(f.root, '9.1', f.head, preview.fingerprint)
  assert.equal(started.status, 'STARTED', JSON.stringify(started))
  assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', started.commit).split('\n').sort(), [STORY, PLAN, SPRINT].sort())
  const plan = frontmatter(f.read(PLAN))
  assert.equal(inspectStory(f.read(STORY)).status, 'in-progress')
  assert.equal(normativeDigest(inspectStory(f.read(STORY))), f.plan.story.normative_digest)
  assert.equal(plan.lifecycle_snapshot, 'in-progress')
  assert.equal(plan.execution_status, 'in-progress')
  assert.deepEqual(plan.next_action, { kind: 'implement_slice', target: 'A' })
  assert.ok(plan.slices.every(s => s.status === 'pending' && !s.checkpoint_commit))
  assert.match(f.read(SPRINT), /epic-9: in-progress/)
  assert.equal(f.read(POINTER), before[3])
  assert.equal(validate(f.root, '9.1').status, 'READY')
  assert.notEqual(applyStart(f.root, '9.1', started.commit, preview.fingerprint).status, 'STARTED')
})

test('ready-for-dev projection also starts through Runner with explicit fingerprint', t => {
  const f = fixture(t, 'ready-for-dev')
  assert.equal(authorizeAction(f.root, '9.1', 'start_story', f.head).authorized, true)
  const preview = inspectStart(f.root, '9.1', f.head)
  assert.equal(runAction(f.root, '9.1', f.head).status, 'BLOCKED')
  const result = runAction(f.root, '9.1', f.head, { startFingerprint: preview.fingerprint })
  assert.equal(result.status, 'STARTED', JSON.stringify(result))
  assert.deepEqual(result.next_action, { kind: 'implement_slice', target: 'A' })
  assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '2')
})

for (const [label, mutate] of [
  ['active runtime', f => f.write(POINTER, JSON.stringify({ schemaVersion: 1, status: 'RUNNING', activeRunId: 'other', storyId: '8.1' }))],
  ['unapproved planning', f => { delete f.plan.planning_approval }],
  ['wrong approval digest', f => { f.plan.planning_approval.story_normative_digest = digest('other') }],
  ['readiness absent', f => { delete f.plan.readiness }],
  ['unfinished dependency', f => f.write(SPRINT, f.read(SPRINT).replace('8-1-prerequisite: done', '8-1-prerequisite: review'))],
  ['unknown dependency', f => { f.plan.readiness.dependency_sprint_keys = ['8-2-missing'] }],
  ['duplicate dependency', f => { f.plan.readiness.dependency_sprint_keys.push('8-1-prerequisite') }],
  ['product blocker', f => { f.plan.blockers = [{ id: 'B', reason: 'missing requirement' }] }],
  ['unresolved question', f => { f.plan.unresolved_questions = [{ id: 'Q', question: 'which behavior?' }] }],
  ['started slice', f => { f.plan.slices[0].status = 'active' }],
  ['checkpoint field', f => { f.plan.slices[0].checkpoint_commit = f.head }],
  ['review metadata', f => { f.plan.slices[0].review = { verdict: 'APPROVE' } }],
  ['orphan receipt', f => f.write('_bmad-output/implementation-artifacts/receipts/story-9-1/A-implementation.json', '{}')],
  ['current slice has prerequisites', f => { f.plan.current_slice = 'B' }],
  ['completion approval', f => { f.plan.human_approval = { decision: 'APPROVED' } }],
  ['story lifecycle differs', f => f.write(STORY, f.read(STORY).replace('status: backlog', 'status: ready-for-dev'))],
  ['epic changed', f => f.write(EPIC, f.read(EPIC).replace('Keep the draft.', 'Changed intent.'))],
  ['task already checked', f => f.write(STORY, f.read(STORY).replace('- [ ] T-1', '- [x] T-1'))]
]) {
  test('start rejects ' + label + ' without writing', t => {
    const f = fixture(t)
    mutate(f); f.save(); const head = f.commit()
    const before = [STORY, PLAN, SPRINT].map(f.read)
    const preview = inspectStart(f.root, '9.1', head)
    assert.notEqual(preview.status, 'READY', JSON.stringify(preview))
    assert.notEqual(applyStart(f.root, '9.1', head, digest('wrong')).status, 'STARTED')
    assert.deepEqual([STORY, PLAN, SPRINT].map(f.read), before)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), head)
  })
}

test('stale HEAD, digest, index, and dirty artifacts cannot be excluded', t => {
  const f = fixture(t)
  const preview = inspectStart(f.root, '9.1', f.head)
  assert.equal(applyStart(f.root, '9.1', f.head, digest('wrong')).status, 'STALE')
  f.write(STORY, f.read(STORY) + '\n')
  assert.notEqual(inspectStart(f.root, '9.1', f.head, { excludeUnrelated: [STORY] }).status, 'READY')
  git(f.root, 'add', STORY)
  assert.notEqual(inspectStart(f.root, '9.1', f.head).status, 'READY')
  const head = f.commit()
  assert.equal(inspectStart(f.root, '9.1', f.head).status, 'STALE')
  assert.equal(applyStart(f.root, '9.1', head, preview.fingerprint).status, 'STALE')
})

test('only exact unrelated untracked noise can be excluded and it stays uncommitted', t => {
  const f = fixture(t)
  f.write('noise.tmp', 'user work')
  assert.equal(inspectStart(f.root, '9.1', f.head).status, 'BLOCKED')
  const options = { excludeUnrelated: ['noise.tmp'] }
  const preview = inspectStart(f.root, '9.1', f.head, options)
  assert.equal(preview.status, 'READY', JSON.stringify(preview))
  assert.equal(applyStart(f.root, '9.1', f.head, preview.fingerprint, options).status, 'STARTED')
  assert.equal(f.read('noise.tmp'), 'user work')
  assert.match(git(f.root, 'status', '--porcelain'), /\?\? noise.tmp/)
})

test('failed commit preserves partial transaction and lock; retry cannot overwrite it', t => {
  const f = fixture(t)
  f.write('.git/hooks/pre-commit', '#!/bin/sh\nexit 1\n')
  const preview = inspectStart(f.root, '9.1', f.head)
  const result = applyStart(f.root, '9.1', f.head, preview.fingerprint)
  assert.equal(result.status, 'RECOVERY_REQUIRED', JSON.stringify(result))
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  assert.equal(inspectStory(f.read(STORY)).status, 'in-progress')
  assert.ok(existsSync(path.join(f.root, '.git/v4-start-story.lock')))
  assert.ok(inspectStart(f.root, '9.1', f.head).reasons.includes('START_TRANSACTION_PENDING'))
  assert.equal(applyStart(f.root, '9.1', f.head, preview.fingerprint).status, 'BLOCKED')
})

test('an existing lock from another invocation is never removed', t => {
  const f = fixture(t)
  f.write('.git/v4-start-story.lock', 'another invocation')
  assert.equal(inspectStart(f.root, '9.1', f.head).status, 'BLOCKED')
  assert.equal(f.read('.git/v4-start-story.lock'), 'another invocation')
})

test('commit hook cannot silently change a dependency in the approved lifecycle transaction', t => {
  const f = fixture(t)
  f.write('.git/hooks/pre-commit', `#!/bin/sh\nnode -e "const f=require('fs');const p='${SPRINT}';f.writeFileSync(p,f.readFileSync(p,'utf8').replace('8-1-prerequisite: done','8-1-prerequisite: review'))"\ngit add -- '${SPRINT}'\n`)
  const preview = inspectStart(f.root, '9.1', f.head)
  const result = applyStart(f.root, '9.1', f.head, preview.fingerprint)
  assert.equal(result.status, 'RECOVERY_REQUIRED', JSON.stringify(result))
  assert.ok(result.reasons.includes('COMMITTED_CONTENT_MISMATCH'))
})

test('commit hook changes outside the preview remain recoverable instead of reporting STARTED', t => {
  const f = fixture(t)
  f.write('outside.txt', 'before\n')
  const head = f.commit()
  f.write('.git/hooks/pre-commit', '#!/bin/sh\nprintf hook >> outside.txt\n')
  const preview = inspectStart(f.root, '9.1', head)
  const result = applyStart(f.root, '9.1', head, preview.fingerprint)
  assert.equal(result.status, 'RECOVERY_REQUIRED', JSON.stringify(result))
  assert.ok(result.reasons.includes('WORKTREE_SCOPE_MISMATCH'), JSON.stringify(result))
  assert.ok(existsSync(path.join(f.root, '.git/v4-start-story.lock')))
})

test('partial Story write with a retained transaction lock blocks automatic recovery', t => {
  const f = fixture(t)
  f.write('.git/v4-start-story.lock', JSON.stringify({ story_id: '9.1', expected_head: f.head, token: 'interrupted' }))
  f.write(STORY, f.read(STORY).replace('status: backlog', 'status: in-progress'))
  const planBefore = f.read(PLAN)
  const result = applyStart(f.root, '9.1', f.head, digest('interrupted'))
  assert.equal(result.status, 'BLOCKED')
  assert.ok(result.reasons.includes('START_TRANSACTION_PENDING'))
  assert.equal(f.read(PLAN), planBefore)
  assert.match(f.read(STORY), /status: in-progress/)
})

test('Runner in linked worktree uses canonical pointer and rejects a stale local IDLE copy', t => {
  const f = fixture(t)
  f.write('.gitignore', f.read('.gitignore') + 'linked/\n')
  const head = f.commit()
  const linked = path.join(f.root, 'linked')
  git(f.root, 'worktree', 'add', '-qb', 'linked', linked, head)
  assert.equal(inspectStart(linked, '9.1', head).status, 'READY')
  assert.equal(authorizeAction(linked, '9.1', 'start_story', head).authorized, true)
  mkdirSync(path.join(linked, '.agent-state'))
  writeFileSync(path.join(linked, POINTER), f.read(POINTER))
  f.write(POINTER, JSON.stringify({ schemaVersion: 1, status: 'RUNNING', activeRunId: 'active', storyId: '8.1' }))
  assert.equal(inspectStart(linked, '9.1', head).status, 'BLOCKED')
  assert.equal(authorizeAction(linked, '9.1', 'start_story', head).authorized, false)
  assert.equal(runAction(linked, '9.1', head).status, 'BLOCKED')
})

test('upstream Epic must be committed even when an ignored local copy matches its digest', t => {
  const f = fixture(t)
  git(f.root, 'rm', '--cached', EPIC)
  f.write('.gitignore', f.read('.gitignore') + EPIC + '\n')
  const head = f.commit()
  const preview = inspectStart(f.root, '9.1', head)
  assert.equal(preview.status, 'BLOCKED', JSON.stringify(preview))
  assert.ok(preview.reasons.includes('ARTIFACTS_NOT_COMMITTED'))
})
