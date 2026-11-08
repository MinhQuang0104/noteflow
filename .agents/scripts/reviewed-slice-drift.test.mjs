import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { priorChangedPathsForVerification, reviewedSliceChangedPaths } from './v4-action-kernel.mjs'

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'reviewed-drift-'))
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr)
    return result.stdout.trim()
  }
  git('init', '-q')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Fixture')
  git('config', 'core.autocrlf', 'false')
  const commit = (files, message) => {
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, name), text)
    git('add', '--', ...Object.keys(files))
    git('commit', '-q', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  return { root, commit, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('anchors changed by an earlier reviewed slice of the Story are explained drift (Story 2.2 F-22-1)', () => {
  const r = repo()
  try {
    const base = r.commit({ 'client.ts': 'v1\n', 'view.vue': 'v1\n', 'other.ts': 'v1\n' }, 'base')
    const checkpointB = r.commit({ 'client.ts': 'v2\n' }, 'slice B')
    const checkpointC = r.commit({ 'view.vue': 'v2\n' }, 'slice C')
    const sliceB = { id: 'B', status: 'reviewed', baseline_commit: base, checkpoint_commit: checkpointB }
    const sliceC = { id: 'C', status: 'checkpointed', baseline_commit: checkpointB, checkpoint_commit: checkpointC }
    const plan = { slices: [sliceB, sliceC] }

    assert.deepEqual(reviewedSliceChangedPaths(r.root, plan, sliceC, checkpointC), ['client.ts'])
    assert.deepEqual(priorChangedPathsForVerification(r.root, plan, sliceC, checkpointC), ['client.ts'])
    assert.deepEqual(reviewedSliceChangedPaths(r.root, { slices: [{ ...sliceB, status: 'verified' }, sliceC] }, sliceC, checkpointC), ['client.ts'])
    for (const status of ['pending', 'checkpointed', 'in-progress']) {
      assert.deepEqual(reviewedSliceChangedPaths(r.root, { slices: [{ ...sliceB, status }, sliceC] }, sliceC, checkpointC), [], status)
    }
    assert.deepEqual(reviewedSliceChangedPaths(r.root, { slices: [sliceC] }, sliceC, checkpointC), [])
  } finally { r.cleanup() }
})

test('a reviewed slice path changed again after its review stays unexplained drift', () => {
  const r = repo()
  try {
    const base = r.commit({ 'client.ts': 'v1\n', 'view.vue': 'v1\n' }, 'base')
    const checkpointB = r.commit({ 'client.ts': 'v2\n' }, 'slice B')
    const outside = r.commit({ 'client.ts': 'v3 outside any slice\n' }, 'unreviewed change')
    const checkpointC = r.commit({ 'view.vue': 'v2\n' }, 'slice C')
    const plan = { slices: [
      { id: 'B', status: 'reviewed', baseline_commit: base, checkpoint_commit: checkpointB },
      { id: 'C', status: 'checkpointed', baseline_commit: outside, checkpoint_commit: checkpointC },
    ] }

    assert.deepEqual(reviewedSliceChangedPaths(r.root, plan, plan.slices[1], checkpointC), [])
    assert.throws(() => reviewedSliceChangedPaths(r.root, { slices: [{ id: 'B', status: 'reviewed', baseline_commit: 'HEAD~2', checkpoint_commit: checkpointB }, plan.slices[1]] }, plan.slices[1], checkpointC), /REVIEWED_SLICE_HISTORY_INVALID/)
  } finally { r.cleanup() }
})
