import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { measureInstructionContext } from './measure-v4-instruction-context.mjs'

const INPUT_DIGEST = `sha256:${'9'.repeat(64)}`

function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
}

function fixtureRepo() {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  fixture.git(['config', 'core.autocrlf', 'false'])
  write(fixture.root, 'AGENTS.md', 'đ\r\n')
  write(fixture.root, '.agents/skills/story-development/SKILL.md', 'story\n')
  fixture.git(['add', '--', 'AGENTS.md', '.agents/skills/story-development/SKILL.md'])
  fixture.git(['commit', '-m', 'test(v4): baseline instruction basis'])
  const baseline = fixture.git(['rev-parse', 'HEAD'])
  write(fixture.root, 'AGENTS.md', 'đ\nx')
  fixture.git(['add', '--', 'AGENTS.md'])
  fixture.git(['commit', '-m', 'test(v4): candidate instruction basis'])
  const candidate = fixture.git(['rev-parse', 'HEAD'])
  return { fixture, baseline, candidate }
}

const basis = {
  schema_version: 1,
  method: 'test-instruction-basis-v1',
  basis_id: 'test-basis',
  actions: ['implement_slice', 'verify_slice'],
  sources: [
    { id: 'policy', required: true, paths: ['AGENTS.md'] },
    { id: 'duplicate-policy', required: true, paths: ['AGENTS.md'] },
    { id: 'action-guidance', required: true, actions: { implement_slice: ['.agents/skills/story-development/SKILL.md'], verify_slice: ['.agents/skills/story-development/SKILL.md'] } },
    { id: 'lazy-untriggered', required: false, paths: ['.agents/skills/story-development/references/lazy.md'] },
  ],
}

test('R04 reads raw Git blobs, counts duplicate paths once, and preserves UTF-8/CRLF byte counts', () => {
  const f = fixtureRepo()
  try {
    const result = measureInstructionContext({ gitRoot: f.fixture.root, revision: f.baseline, basis, profile: 'fixture-profile', action: 'implement_slice', inputDigest: INPUT_DIGEST })
    assert.equal(result.status, 'MEASURED', JSON.stringify(result))
    assert.equal(result.required_instruction_bytes, Buffer.byteLength('đ\r\n') + Buffer.byteLength('story\n'))
    assert.deepEqual(result.source_bindings.map(item => item.path), ['.agents/skills/story-development/SKILL.md', 'AGENTS.md'])
    assert.equal(result.coverage, 'COMPLETE')

    const candidate = measureInstructionContext({ gitRoot: f.fixture.root, revision: f.candidate, basis, profile: 'fixture-profile', action: 'implement_slice', inputDigest: INPUT_DIGEST })
    assert.equal(candidate.status, 'MEASURED', JSON.stringify(candidate))
    assert.equal(candidate.required_instruction_bytes, Buffer.byteLength('đ\nx') + Buffer.byteLength('story\n'))
    assert.notEqual(candidate.source_bindings.find(item => item.path === 'AGENTS.md').blob, result.source_bindings.find(item => item.path === 'AGENTS.md').blob)
  } finally {
    f.fixture.cleanup()
  }
})

test('R04 missing required sources are INCONCLUSIVE instead of zero bytes', () => {
  const f = fixtureRepo()
  try {
    const missing = measureInstructionContext({
      gitRoot: f.fixture.root,
      revision: f.baseline,
      basis: { ...basis, sources: [...basis.sources, { id: 'required-missing', required: true, paths: ['missing.md'] }] },
      profile: 'fixture-profile',
      action: 'verify_slice',
      inputDigest: INPUT_DIGEST,
    })
    assert.equal(missing.status, 'INCONCLUSIVE')
    assert.ok(missing.reasons.includes('REQUIRED_SOURCE_MISSING:required-missing'))
    assert.equal(missing.required_instruction_bytes, null)
  } finally {
    f.fixture.cleanup()
  }
})

test('R04 rejects unresolved revisions and invalid input identity', () => {
  const f = fixtureRepo()
  try {
    const badRevision = measureInstructionContext({ gitRoot: f.fixture.root, revision: '0'.repeat(40), basis, profile: 'fixture-profile', action: 'implement_slice', inputDigest: INPUT_DIGEST })
    assert.equal(badRevision.status, 'INCONCLUSIVE')
    assert.ok(badRevision.reasons.includes('REVISION_UNAVAILABLE'))
    const badInput = measureInstructionContext({ gitRoot: f.fixture.root, revision: f.baseline, basis, profile: 'fixture-profile', action: 'implement_slice', inputDigest: 'not-a-digest' })
    assert.equal(badInput.status, 'INVALID')
    assert.ok(badInput.reasons.includes('INPUT_DIGEST_REQUIRED'))
  } finally {
    f.fixture.cleanup()
  }
})

test('R04 distinguishes a triggered lazy source from an untriggered optional source', () => {
  const f = fixtureRepo()
  try {
    const untriggered = measureInstructionContext({ gitRoot: f.fixture.root, revision: f.baseline, basis, profile: 'fixture-profile', action: 'implement_slice', inputDigest: INPUT_DIGEST })
    assert.equal(untriggered.status, 'MEASURED', JSON.stringify(untriggered))
    assert.ok(!untriggered.source_bindings.some(item => item.path.includes('lazy.md')))
    const triggered = measureInstructionContext({
      gitRoot: f.fixture.root,
      revision: f.baseline,
      basis: { ...basis, sources: [...basis.sources, { id: 'lazy-triggered', required: true, paths: ['.agents/skills/story-development/references/lazy.md'] }] },
      profile: 'fixture-profile',
      action: 'implement_slice',
      inputDigest: INPUT_DIGEST,
    })
    assert.equal(triggered.status, 'INCONCLUSIVE')
    assert.ok(triggered.reasons.includes('REQUIRED_SOURCE_MISSING:lazy-triggered'))
    assert.equal(triggered.required_instruction_bytes, null)
  } finally {
    f.fixture.cleanup()
  }
})

test('R04 preserves a real zero-byte measurement instead of treating it as missing', () => {
  const f = fixtureRepo()
  try {
    const empty = measureInstructionContext({
      gitRoot: f.fixture.root,
      revision: f.baseline,
      basis: { ...basis, sources: [] },
      profile: 'fixture-profile',
      action: 'implement_slice',
      inputDigest: INPUT_DIGEST,
    })
    assert.equal(empty.status, 'MEASURED')
    assert.equal(empty.required_instruction_bytes, 0)
    assert.equal(empty.coverage, 'COMPLETE')
  } finally {
    f.fixture.cleanup()
  }
})
