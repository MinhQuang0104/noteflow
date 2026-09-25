import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inspectStory, normativeDigest, receiptDigest, validateTaskSlices, validateReceipt } from './check-artifact-contract.mjs'

const fixture = path.resolve('.agents/scripts/fixtures/artifact-contract')
const source = readFileSync(path.join(fixture, 'story-9-1.md'), 'utf8')
const basePlan = JSON.parse(readFileSync(path.join(fixture, 'plan.json'), 'utf8'))
const baseReceipt = JSON.parse(readFileSync(path.join(fixture, 'receipt.json'), 'utf8'))
const story = () => inspectStory(source)
const plan = () => structuredClone(basePlan)
const replace = (a, b) => source.replace(a, b)

test('ready canonical Story is valid and completion-only sections are optional', () => {
  assert.deepEqual(story().errors, [])
  assert.equal(plan().story.normative_digest, normativeDigest(story()))
  assert.deepEqual(validateReceipt(fixture, plan(), 'A', 'implementation'), [])
  assert.equal(inspectStory(source.slice(0, source.indexOf('## Dev Agent Record'))).errors.length, 0)
  assert.equal(inspectStory(replace('Pending.', 'Completed.')).errors.length, 0)
})

test('unmarked requirement prose is rejected instead of silently omitted from digest', () => {
  assert.ok(inspectStory(source.replace('## Dev Agent Record', 'A second journal must be encrypted.\n\n## Dev Agent Record')).errors.includes('UNMARKED_CONTENT'))
})

for (const [name, text, reason] of [
  ['missing Story', source.replace(/<!-- v4:story:start -->[\s\S]*?<!-- v4:story:end -->/, ''), 'MISSING_STORY'],
  ['missing AC', replace('- AC-1: An authenticated reader can save one entry.\n- AC-2: The saved entry can be read back.', ''), 'MISSING_AC'],
  ['duplicate AC', replace('AC-2:', 'AC-1:'), 'DUPLICATE_AC_ID'],
  ['missing Tasks', source.replace(/<!-- v4:tasks:start -->[\s\S]*?<!-- v4:tasks:end -->/, ''), 'MISSING_TASKS'],
  ['duplicate Task', replace('T-2 [AC-2]', 'T-1 [AC-2]'), 'DUPLICATE_TASK_ID'],
  ['unknown Task AC', replace('T-2 [AC-2]', 'T-2 [AC-9]'), 'UNKNOWN_AC_REF'],
]) test(name, () => assert.ok(inspectStory(text).errors.includes(reason)))

for (const [name, changed] of [
  ['AC text', replace('one entry.', 'two entries.')],
  ['Task text', replace('Add the save operation.', 'Add the encrypted save operation.')],
  ['Task AC mapping', replace('T-2 [AC-2]', 'T-2 [AC-1]')],
  ['readiness dependency', replace('dependencies: none', 'dependencies: Story 9.0')],
  ['normative architecture reference', replace('fixture.md#ad-1', 'fixture.md#ad-2')],
]) test(`${name} changes normative digest`, () => assert.notEqual(normativeDigest(story()), normativeDigest(inspectStory(changed))))

for (const [name, changed] of [
  ['Status', replace('status: ready-for-dev', 'status: in-progress')],
  ['Task checkbox', replace('- [ ] T-1', '- [x] T-1')],
  ['Completion Notes', replace('### Completion Notes\n\nPending.', '### Completion Notes\n\nComplete.')],
  ['File List', replace('### File List\n\nPending.', '### File List\n\nfile.php')],
  ['Change Log', replace('### Change Log\n\nPending.', '### Change Log\n\nToday')],
  ['AC evidence/results', replace('### AC evidence/results\n\nPending.', '### AC evidence/results\n\nPASS')],
]) test(`${name} does not change normative digest`, () => assert.equal(normativeDigest(story()), normativeDigest(inspectStory(changed))))

test('safe line endings and trailing whitespace do not change digest', () => {
  assert.equal(normativeDigest(story()), normativeDigest(inspectStory(source.replaceAll('\n', '\r\n').replace('one entry.', 'one entry.  '))))
})

test('Markdown indentation inside narrative remains normative', () => {
  assert.notEqual(normativeDigest(story()), normativeDigest(inspectStory(replace('As a reader,', '    As a reader,'))))
})

test('multiple architecture references remain valid and normative', () => {
  const changed = replace('- architecture: docs/architecture/fixture.md#ad-1',
    '- architecture: docs/architecture/fixture.md#ad-1\n- architecture: docs/architecture/fixture.md#ad-2')
  assert.deepEqual(inspectStory(changed).errors, [])
  assert.notEqual(normativeDigest(story()), normativeDigest(inspectStory(changed)))
})

test('one Task to one slice, one Task to many slices, and many Tasks to one slice', () => {
  const s = story()
  const p = plan()
  assert.deepEqual(validateTaskSlices(s, p), [])
  p.slices[1].task_refs.push('T-1')
  assert.deepEqual(validateTaskSlices(s, p), [])
  p.slices[0].task_refs.push('T-2')
  p.slices.pop()
  assert.deepEqual(validateTaskSlices(s, p), [])
})

for (const [name, mutate, reason] of [
  ['unknown task ref', p => p.slices[0].task_refs.push('T-9'), 'UNKNOWN_TASK_REF'],
  ['uncovered Task', p => p.slices[1].task_refs = [], 'UNCOVERED_TASK'],
  ['cyclic dependency', p => p.slices[0].depends_on = ['B'], 'CYCLIC_SLICE_DEPENDENCY'],
]) test(name, () => { const p = plan(); mutate(p); assert.ok(validateTaskSlices(story(), p).includes(reason)) })

test('valid dependency chain passes', () => assert.deepEqual(validateTaskSlices(story(), plan()), []))

function receiptCase(mutateReceipt = () => {}, mutatePlan = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-receipt-'))
  const p = plan(), r = structuredClone(baseReceipt)
  mutateReceipt(r); mutatePlan(p)
  const bytes = JSON.stringify(r, null, 2) + '\n'
  writeFileSync(path.join(root, 'receipt.json'), bytes)
  p.slices[0].receipt_refs.implementation.digest = receiptDigest(r)
  return { root, p, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('valid receipt binds to checkpoint and referenced content', () => {
  const { root, p, cleanup } = receiptCase()
  try { assert.deepEqual(validateReceipt(root, p, 'A', 'implementation'), []) } finally { cleanup() }
})

for (const [name, mutate, reason] of [
  ['wrong story ID', r => r.story_id = '9.2', 'STORY_ID_MISMATCH'],
  ['wrong slice ID', r => r.slice_id = 'B', 'SLICE_ID_MISMATCH'],
  ['wrong checkpoint SHA', r => r.checkpoint_commit = 'c'.repeat(40), 'CHECKPOINT_MISMATCH'],
  ['wrong changed path digest', r => r.changed_paths_sha256 = `sha256:${'3'.repeat(64)}`, 'CHANGED_PATHS_MISMATCH'],
  ['missing required identity', r => delete r.created_from_head, 'INVALID_RECEIPT_IDENTITY'],
]) test(name, () => { const { root, p, cleanup } = receiptCase(mutate); try { assert.ok(validateReceipt(root, p, 'A', 'implementation').includes(reason)) } finally { cleanup() } })

test('tampered referenced receipt digest fails', () => {
  const { root, p, cleanup } = receiptCase()
  try { p.slices[0].receipt_refs.implementation.digest = `sha256:${'f'.repeat(64)}`; assert.ok(validateReceipt(root, p, 'A', 'implementation').includes('RECEIPT_DIGEST_MISMATCH')) } finally { cleanup() }
})

test('receipt binding survives Git line-ending conversion', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-receipt-eol-'))
  try {
    writeFileSync(path.join(root, 'receipt.json'), readFileSync(path.join(fixture, 'receipt.json'), 'utf8').replaceAll('\n', '\r\n'))
    assert.deepEqual(validateReceipt(root, plan(), 'A', 'implementation'), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('receipt detail changes never alter Story normative digest', () => {
  const before = normativeDigest(story())
  const { root, p, cleanup } = receiptCase(r => r.commands[0].environment = 'another fixture')
  try { assert.deepEqual(validateReceipt(root, p, 'A', 'implementation'), []); assert.equal(normativeDigest(story()), before) } finally { cleanup() }
})
