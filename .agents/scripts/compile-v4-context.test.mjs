import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { compileActionContext } from './compile-v4-context.mjs'

function head(fixture) {
  return fixture.git(['rev-parse', 'HEAD'])
}

function snapshot(fixture) {
  return {
    head: head(fixture),
    status: fixture.git(['status', '--short', '--untracked-files=all']),
    pointer: readFileSync(fixture.paths.activeRun, 'utf8'),
    story: readFileSync(fixture.paths.story, 'utf8'),
    plan: readFileSync(fixture.paths.plan, 'utf8'),
  }
}

function seedInstructionSources(fixture) {
  const paths = [
    'AGENTS.md',
    'CLAUDE.md',
    '.agents/routing/task-router.md',
    '.agents/context/context-routing.md',
    '.agents/context/control-plane.md',
    '.agents/skills/v4-story-runner/SKILL.md',
    '.agents/docs/v4-artifact-contract.md',
    '.agents/skills/v4-story-runner/actions/implement-slice.md',
    '.agents/skills/v4-story-runner/references/implementation-techniques.md',
    '.agents/skills/v4-story-runner/references/agy-executor.md',
    '.agents/skills/v4-story-runner/references/recovery.md',
  ]
  for (const relative of paths) {
    const file = path.join(fixture.root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `fixture instruction: ${relative}\n`)
  }
}

function runWithFixture(options, callback) {
  const fixture = createV4Fixture(options)
  try {
    return callback(fixture)
  } finally {
    fixture.cleanup()
  }
}

test('projects only the selected slice with provenance and explicit unknown scope', () => {
  runWithFixture({ schemaVersion: 2, state: 'pending', worktree: 'linked' }, fixture => {
    seedInstructionSources(fixture)
    const before = snapshot(fixture)
    const result = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', {
      expectedHead: before.head,
    })

    assert.equal(result.status, 'READY')
    assert.equal(result.ready, true)
    assert.equal(result.projection.identity.story_id, fixture.storyId)
    assert.equal(result.projection.identity.action, 'implement_slice')
    assert.equal(result.projection.identity.slice_id, 'A')
    assert.deepEqual(result.projection.identity.validated_next_action, {
      kind: 'implement_slice',
      target: 'A',
    })
    assert.equal(result.projection.identity.expected_head, before.head)
    assert.deepEqual(result.projection.requirements.tasks.map(item => item.id), ['T-1'])
    assert.deepEqual(result.projection.requirements.acceptance_criteria.map(item => item.id), ['AC-1'])
    assert.match(result.projection.requirements.story_risk.raw, /Human Gate authority/)
    assert.equal(Object.hasOwn(result.projection.requirements, 'slice_risk'), false)
    assert.deepEqual(result.projection.dependency_dispositions, [])
    assert.deepEqual(result.projection.blockers, [])
    assert.deepEqual(result.projection.questions, [])
    assert.deepEqual(result.projection.experience_advice, [])
    assert.equal(result.projection.known_scope.file_scope.status, 'UNKNOWN')
    assert.equal(result.projection.known_scope.file_scope.paths, null)
    assert.equal(result.projection.known_scope.consumers.status, 'UNKNOWN')
    assert.equal(result.projection.known_scope.checks.status, 'UNKNOWN')
    assert.match(result.projection.output_contract_ref.path, /v4-artifact-contract\.md$/)
    assert.ok(result.projection.stop_conditions.length >= 2)
    assert.match(result.projection.projection_fingerprint, /^sha256:[0-9a-f]{64}$/)
    assert.ok(result.projection.byte_counters.projection_bytes > 0)
    assert.ok(result.projection.byte_counters.instruction_dependency_bytes > 0)
    assert.ok(result.projection.source_bindings.some(item => item.path === fixture.paths.story.replace(`${fixture.root}\\`, '').replaceAll('\\', '/')))
    assert.equal(Object.hasOwn(result.projection, 'historical_receipts'), false)

    assert.deepEqual(snapshot(fixture), before)
  })
})

test('explicit slice risk is projected with Plan provenance', () => {
  runWithFixture({ schemaVersion: 2, state: 'pending' }, fixture => {
    seedInstructionSources(fixture)
    writeFileSync(fixture.paths.plan, readFileSync(fixture.paths.plan, 'utf8').replace('slices:', 'risk:\n  level: LOW\nslices:').replace('    depends_on: []', '    depends_on: []\n    risk:\n      level: LOW\n      flags: []'))
    const result = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', { expectedHead: head(fixture) })
    assert.equal(result.status, 'READY', JSON.stringify(result))
    assert.deepEqual(result.projection.requirements.slice_risk, {
      raw: { level: 'LOW', flags: [] },
      source: { path: '_bmad-output/implementation-artifacts/story-9-1-plan.md', sections: ['slices.A.risk'] },
    })
  })
})

test('AGY executor guidance is lazy and trigger-bound', () => {
  runWithFixture({ schemaVersion: 2, state: 'pending' }, fixture => {
    seedInstructionSources(fixture)
    const expectedHead = head(fixture)
    const result = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', { expectedHead })
    assert.equal(result.status, 'READY', JSON.stringify(result))
    const reference = '.agents/skills/v4-story-runner/references/agy-executor.md'
    assert.ok(result.projection.lazy_reference_paths.some(item => item.path === reference && item.trigger === 'Load only when the current slice declares executor: agy.'))
    const binding = result.projection.source_bindings.find(item => item.path === reference)
    assert.equal(binding.loaded, false)
    assert.equal(result.projection.byte_counters.lazy_reference_bytes, 0)
    assert.match(readFileSync('.agents/skills/v4-story-runner/actions/implement-slice.md', 'utf8'), /executor: agy[\s\S]{0,100}agy-executor\.md/)
  })
})

test('dependency dispositions are projected without loading historical receipt detail', () => {
  runWithFixture({ schemaVersion: 2, state: 'pending' }, fixture => {
    seedInstructionSources(fixture)
    const original = readFileSync(fixture.paths.plan, 'utf8')
    const withDependency = original.replace(
      '  - id: A\n    status: pending\n    task_refs: [T-1]\n    depends_on: []',
      '  - id: A\n    status: pending\n    task_refs: [T-1]\n    depends_on: [B]\n  - id: B\n    status: pending\n    task_refs: [T-1]\n    depends_on: []',
    )
    assert.notEqual(withDependency, original)
    writeFileSync(fixture.paths.plan, withDependency)

    const result = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', {
      expectedHead: head(fixture),
    })

    assert.equal(result.status, 'READY')
    assert.deepEqual(result.projection.dependency_dispositions, [{
      id: 'B',
      status: 'pending',
      eligible: false,
      reason: 'STATUS_NOT_REVIEWED_OR_VERIFIED',
    }])
    assert.equal(Object.hasOwn(result.projection, 'historical_receipts'), false)
    assert.equal(Object.hasOwn(result.projection, 'receipt_details'), false)
  })
})

test('fail-closed cases never return a READY projection', () => {
  runWithFixture({ schemaVersion: 2, state: 'pending' }, fixture => {
    seedInstructionSources(fixture)
    const expectedHead = head(fixture)
    const cases = [
      {
        name: 'wrong action',
        action: 'verify_slice',
        slice: 'A',
        expected: ['ACTION_MISMATCH'],
      },
      {
        name: 'expected head drift',
        action: 'implement_slice',
        slice: 'A',
        options: { expectedHead: '0'.repeat(40) },
        expected: ['EXPECTED_HEAD_MISMATCH'],
      },
    ]

    for (const item of cases) {
      const result = compileActionContext(fixture.root, fixture.storyId, item.action, item.slice, {
        expectedHead,
        ...item.options,
      })
      assert.notEqual(result.status, 'READY', item.name)
      assert.equal(result.projection, null, item.name)
      assert.ok(item.expected.some(reason => result.reasons.includes(reason)), item.name)
    }

    writeFileSync(fixture.paths.story, readFileSync(fixture.paths.story, 'utf8').replace(
      'synthetic reader',
      'changed reader',
    ))
    const stale = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', {
      expectedHead,
    })
    assert.equal(stale.status, 'STALE')
    assert.equal(stale.projection, null)
    assert.ok(stale.reasons.includes('STORY_NORMATIVE_DIGEST_MISMATCH'))

    writeFileSync(fixture.paths.story, readFileSync(fixture.paths.story, 'utf8').replace(
      'changed reader',
      'synthetic reader',
    ))
    writeFileSync(fixture.paths.plan, readFileSync(fixture.paths.plan, 'utf8').replace(
      'task_refs: [T-1]',
      'task_refs: [T-404]',
    ))
    const missingTask = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', {
      expectedHead,
    })
    assert.notEqual(missingTask.status, 'READY')
    assert.equal(missingTask.projection, null)
    assert.ok(missingTask.reasons.includes('UNKNOWN_TASK_REF'))

    writeFileSync(fixture.paths.activeRun, JSON.stringify({
      schemaVersion: 1,
      activeRunId: 'run-1',
      storyId: fixture.storyId,
      status: 'ACTIVE',
    }))
    const active = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', {
      expectedHead,
    })
    assert.equal(active.status, 'BLOCKED')
    assert.equal(active.projection, null)
    assert.ok(active.reasons.includes('V3_POINTER_NOT_IDLE'))
  })
})
