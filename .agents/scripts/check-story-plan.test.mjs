import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const script = path.resolve('.agents/scripts/check-story-plan.mjs')
const realRoot = process.cwd()
const real = readFileSync('_bmad-output/implementation-artifacts/story-2-3-plan.md', 'utf8')

function git(root, ...args) {
  const p = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(p.status, 0, p.stderr)
  return p.stdout.trim()
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'story-plan-'))
  mkdirSync(path.join(root, 'docs/product'), { recursive: true })
  mkdirSync(path.join(root, '_bmad-output/implementation-artifacts'), { recursive: true })
  const section = '### Story 9.1: Fixture\n\n**Acceptance Criteria:**\n\nDone.\n\n'
  const digest = createHash('sha256').update(section).digest('hex')
  writeFileSync(path.join(root, 'docs/product/epics.md'), `# Epic\n\n${section}### Story 9.2: Next\n`)
  writeFileSync(path.join(root, '_bmad-output/implementation-artifacts/sprint-status.yaml'), 'development_status:\n  epic-9: in-progress\n  9-1-fixture: in-progress\n')
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture')
  const sha = git(root, 'rev-parse', 'HEAD')
  const plan = `---
schema_version: 1
story_id: "9.1"
source:
  path: docs/product/epics.md
  anchor: "#story-91-fixture"
  section_digest: "sha256:${digest}"
sprint_key: 9-1-fixture
execution_status: in-progress
lifecycle_snapshot: in-progress
current_slice: A
risk:
  level: LOW
slices:
  - id: A
    status: active
    depends_on: []
    checkpoint_commit: ${sha}
    review:
      reviewed_commit: ${sha}
blockers: []
next_action:
  kind: implement_slice
  target: A
---
`
  writeFileSync(path.join(root, '_bmad-output/implementation-artifacts/story-9-1-plan.md'), plan)
  return { root, plan, sha }
}

function check(root, id = '9.1') {
  const p = spawnSync(process.execPath, [script, 'check', id], { cwd: root, encoding: 'utf8' })
  return { code: p.status, json: JSON.parse(p.stdout) }
}

function withFixture(change, expectedStatus, expectedCode, reason) {
  const f = fixture()
  try {
    change(f)
    const result = check(f.root)
    assert.equal(result.code, expectedCode)
    assert.equal(result.json.status, expectedStatus)
    if (reason) assert.ok(result.json.reasons.includes(reason), JSON.stringify(result.json))
  } finally { rmSync(f.root, { recursive: true, force: true }) }
}

function inspectFixture(run) {
  const f = fixture()
  try { run(f) } finally { rmSync(f.root, { recursive: true, force: true }) }
}

function editPlan(f, from, to) {
  assert.ok(f.plan.includes(from))
  const file = path.join(f.root, '_bmad-output/implementation-artifacts/story-9-1-plan.md')
  writeFileSync(file, f.plan.replace(from, to))
}

test('valid READY fixture', () => withFixture(() => {}, 'READY', 0))
test('canonical schema-v2 Story 2.3 remains readable before finalization', () => {
  const result = check(realRoot, '2.3')
  assert.equal(result.code, 0)
  assert.equal(result.json.valid, true)
  assert.equal(result.json.status, 'READY')
  assert.equal(result.json.lifecycleSnapshot, 'in-progress')
  assert.equal(result.json.actualLifecycle, 'in-progress')
  assert.deepEqual(result.json.nextAction, {kind:'finalize_story', target:'story'})
})
test('unsupported schema', () => withFixture(f => editPlan(f, 'schema_version: 1', 'schema_version: 3'), 'INVALID', 3, 'UNSUPPORTED_SCHEMA'))
test('story ID mismatch', () => withFixture(f => editPlan(f, 'story_id: "9.1"', 'story_id: "9.2"'), 'INVALID', 3, 'STORY_ID_MISMATCH'))
test('missing Plan', () => { const f = fixture(); try { assert.equal(check(f.root, '9.2').json.status, 'INVALID') } finally { rmSync(f.root, { recursive: true, force: true }) } })
test('missing source', () => withFixture(f => rmSync(path.join(f.root, 'docs/product/epics.md')), 'INVALID', 3, 'SOURCE_MISSING'))
test('changed source digest', () => withFixture(f => {
  const file = path.join(f.root, 'docs/product/epics.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace('Done.', 'Changed.'))
}, 'STALE', 2, 'SOURCE_DIGEST_MISMATCH'))
test('malformed source digest', () => withFixture(f => editPlan(f, 'sha256:', 'sha256:0000'), 'INVALID', 3, 'INVALID_SOURCE_REF'))
test('missing sprint key', () => withFixture(f => editPlan(f, 'sprint_key: 9-1-fixture', 'sprint_key: 9-1-missing'), 'INVALID', 3, 'SPRINT_KEY_MISSING'))
test('snapshot mismatch', () => withFixture(f => editPlan(f, 'lifecycle_snapshot: in-progress', 'lifecycle_snapshot: backlog'), 'STALE', 2, 'SNAPSHOT_MISMATCH'))
test('invalid current slice', () => withFixture(f => editPlan(f, 'current_slice: A', 'current_slice: Z'), 'INVALID', 3, 'INVALID_CURRENT_SLICE'))
test('missing dependency', () => withFixture(f => editPlan(f, 'depends_on: []', 'depends_on: [Z]'), 'INVALID', 3, 'INVALID_DEPENDENCY'))
test('cyclic dependencies', () => withFixture(f => editPlan(f, 'depends_on: []', 'depends_on: [A]'), 'INVALID', 3, 'CYCLIC_DEPENDENCY'))
test('missing checkpoint', () => withFixture(f => editPlan(f, `checkpoint_commit: ${f.sha}`, `checkpoint_commit: ${'0'.repeat(40)}`), 'STALE', 2, 'CHECKPOINT_MISSING'))
test('missing reviewed commit', () => withFixture(f => editPlan(f, `reviewed_commit: ${f.sha}`, `reviewed_commit: ${'0'.repeat(40)}`), 'STALE', 2, 'REVIEW_COMMIT_MISSING'))
test('checkpoint not ancestor of HEAD', () => withFixture(f => {
  const other = mkdtempSync(path.join(tmpdir(), 'story-sha-'))
  try {
    git(other, 'init', '-q')
    git(other, 'config', 'user.email', 'test@example.com')
    git(other, 'config', 'user.name', 'Test')
    writeFileSync(path.join(other, 'other.txt'), 'other')
    git(other, 'add', '.')
    git(other, 'commit', '-qm', 'other')
    const sha = git(other, 'rev-parse', 'HEAD')
    // Import a valid commit object without making it an ancestor.
    git(f.root, 'fetch', '-q', other, 'HEAD')
    editPlan(f, `checkpoint_commit: ${f.sha}`, `checkpoint_commit: ${sha}`)
  } finally { rmSync(other, { recursive: true, force: true }) }
}, 'STALE', 2, 'CHECKPOINT_NOT_ANCESTOR'))
test('complete with pending slice', () => withFixture(f => editPlan(f, 'execution_status: in-progress', 'execution_status: complete'), 'INVALID', 3, 'INCOMPLETE_CLAIM'))
test('complete execution may await review lifecycle reconciliation', () => withFixture(f => {
  editPlan(f, 'execution_status: in-progress', 'execution_status: complete')
  const file = path.join(f.root, '_bmad-output/implementation-artifacts/story-9-1-plan.md')
  let text = readFileSync(file, 'utf8').replace('status: active\n    depends_on:', 'status: reviewed\n    depends_on:')
    .replace('lifecycle_snapshot: in-progress', 'lifecycle_snapshot: review')
    .replace('kind: implement_slice\n  target: A', 'kind: reconcile_lifecycle\n  target: story')
  writeFileSync(file, text)
  const sprint = path.join(f.root, '_bmad-output/implementation-artifacts/sprint-status.yaml')
  writeFileSync(sprint, readFileSync(sprint, 'utf8').replace('9-1-fixture: in-progress', '9-1-fixture: review'))
}, 'READY', 0))
test('forbidden V3 runtime state', () => withFixture(f => editPlan(f, 'risk:\n', 'run_id: forbidden\nrisk:\n'), 'INVALID', 3, 'FORBIDDEN_V3_STATE'))
for (const kind of ['plan_slice','implement_slice','verify_slice','review_slice','resolve_blocker','reconcile_lifecycle','request_gate','finalize_story']) {
  test(`supported action ${kind}`, () => withFixture(f => {
    editPlan(f, 'kind: implement_slice', `kind: ${kind}`)
    if (['request_gate','finalize_story'].includes(kind)) {
      const file = path.join(f.root, '_bmad-output/implementation-artifacts/story-9-1-plan.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('target: A', 'target: story'))
    }
  }, kind === 'reconcile_lifecycle' ? 'INVALID' : 'READY', kind === 'reconcile_lifecycle' ? 3 : 0))
}
test('unknown action', () => withFixture(f => editPlan(f, 'kind: implement_slice', 'kind: unknown'), 'INVALID', 3, 'UNKNOWN_ACTION'))

test('canonical slice statuses are accepted', () => {
  for (const status of ['pending', 'active', 'checkpointed', 'verified', 'reviewed', 'blocked']) {
    withFixture(f => editPlan(f, 'status: active', `status: ${status}`), 'READY', 0)
  }
})

test('legacy in-progress slice status is accepted only by the schema-v1 verification bridge', () => inspectFixture(f => {
  const file = path.join(f.root, '_bmad-output/implementation-artifacts/story-9-1-plan.md')
  let text = readFileSync(file, 'utf8').replace('status: active', 'status: in-progress')
    .replace('kind: implement_slice', 'kind: verify_slice')
  writeFileSync(file, text)
  const result = check(f.root)
  assert.equal(result.code, 0)
  assert.equal(result.json.valid, true)
  assert.equal(result.json.legacy.sliceStatusDrift, true)
  assert.ok(result.json.warnings.includes('LEGACY_SLICE_STATUS_IN_PROGRESS'))
}))

test('legacy in-progress slice status is rejected outside the exact bridge', () => withFixture(f => {
  editPlan(f, 'status: active', 'status: in-progress')
}, 'INVALID', 3, 'INVALID_SLICE_STATUS'))

test('unknown slice status is rejected', () => withFixture(f => editPlan(f, 'status: active', 'status: invented'), 'INVALID', 3, 'INVALID_SLICE_STATUS'))

test('structured verification fields remain schema-v1 compatible', () => inspectFixture(f => {
  const digest = 'sha256:' + 'a'.repeat(64)
  const file = path.join(f.root, '_bmad-output/implementation-artifacts/story-9-1-plan.md')
  let text = readFileSync(file, 'utf8').replace('    review:', `    verification:\n      subject:\n        commit: ${f.sha}\n      changed_paths: [src/a.php]\n      changed_paths_sha256: ${digest}\n      focused_checks: []\n      canonical:\n        status: INCOMPLETE\n      escalation:\n        decision: REVIEW_REQUIRED\n      progression_eligible: false\n    verification_obligations: []\n    review:`)
    .replace(`reviewed_commit: ${f.sha}`, `reviewed_commit: ${f.sha}\n      freshness:\n        status: PENDING`)
  writeFileSync(file, text)
  const result = check(f.root)
  assert.equal(result.code, 0)
  assert.equal(result.json.status, 'READY')
}))

test('malformed structured verification fields are rejected', () => withFixture(f => {
  const file = path.join(f.root, '_bmad-output/implementation-artifacts/story-9-1-plan.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace('    review:', '    verification:\n      changed_paths: invalid\n      progression_eligible: maybe\n    review:'))
}, 'INVALID', 3, 'INVALID_VERIFICATION_SCHEMA'))
