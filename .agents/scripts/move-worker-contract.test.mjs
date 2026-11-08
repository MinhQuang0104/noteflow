import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { moveWorkerContract } from './move-worker-contract.mjs'

const script = fileURLToPath(new URL('./move-worker-contract.mjs', import.meta.url))

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'move-contract-'))
  mkdirSync(path.join(root, '.orca-contract'))
  writeFileSync(path.join(root, '.orca-contract', 'contract.md'), 'contract body\n')
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('worker contract move relocates the contract into attempt evidence and removes the empty delivery directory', () => {
  const f = fixture()
  try {
    const result = moveWorkerContract(f.root, 'task-7', '2')
    assert.deepEqual(result, { status: 'MOVED', reasons: [],
      source: '.orca-contract/contract.md', target: '.agent-state/v4-auto/workers/task-7/contract-attempt-2.md' })
    assert.equal(readFileSync(path.join(f.root, result.target), 'utf8'), 'contract body\n')
    assert.equal(existsSync(path.join(f.root, '.orca-contract')), false)
  } finally { f.cleanup() }
})

test('worker contract move refuses invalid input, a missing contract and existing attempt evidence', () => {
  const f = fixture()
  try {
    assert.deepEqual(moveWorkerContract('relative/path', 'task-7', '1').reasons, ['WORKTREE_INVALID'])
    assert.deepEqual(moveWorkerContract(path.join(f.root, 'absent'), 'task-7', '1').reasons, ['WORKTREE_INVALID'])
    for (const taskId of ['', '../escape', 'a/b', '.hidden']) {
      assert.deepEqual(moveWorkerContract(f.root, taskId, '1').reasons, ['TASK_ID_INVALID'], taskId)
    }
    for (const attempt of ['0', '-1', '1.5', 'x', '']) {
      assert.deepEqual(moveWorkerContract(f.root, 'task-7', attempt).reasons, ['ATTEMPT_INVALID'], attempt)
    }
    const evidence = path.join(f.root, '.agent-state', 'v4-auto', 'workers', 'task-7')
    mkdirSync(evidence, { recursive: true })
    writeFileSync(path.join(evidence, 'contract-attempt-1.md'), 'earlier\n')
    assert.deepEqual(moveWorkerContract(f.root, 'task-7', '1').reasons, ['ATTEMPT_EVIDENCE_EXISTS'])
    assert.equal(readFileSync(path.join(f.root, '.orca-contract', 'contract.md'), 'utf8'), 'contract body\n')
    rmSync(path.join(f.root, '.orca-contract'), { recursive: true })
    assert.deepEqual(moveWorkerContract(f.root, 'task-7', '2').reasons, ['CONTRACT_MISSING'])
  } finally { f.cleanup() }
})

test('worker contract move CLI reports JSON and exit codes', () => {
  const f = fixture()
  try {
    const usage = spawnSync(process.execPath, [script, 'move', f.root], { encoding: 'utf8' })
    assert.equal(usage.status, 2)
    assert.equal(JSON.parse(usage.stdout).status, 'INVALID')
    const moved = spawnSync(process.execPath, [script, 'move', f.root, 'task-7', '1'], { encoding: 'utf8' })
    assert.equal(moved.status, 0)
    assert.equal(JSON.parse(moved.stdout).status, 'MOVED')
    const again = spawnSync(process.execPath, [script, 'move', f.root, 'task-7', '1'], { encoding: 'utf8' })
    assert.equal(again.status, 1)
    assert.deepEqual(JSON.parse(again.stdout).reasons, ['CONTRACT_MISSING'])
  } finally { f.cleanup() }
})
