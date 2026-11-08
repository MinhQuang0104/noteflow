// Moves a delivered AGY worker contract out of the worker scope into its attempt evidence.
// Replaces the inline `node -e` move in agy-executor.md step 6 (overnight runner K7).
import { existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = 'USAGE: move <worktree> <task-id> <attempt>'
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const ATTEMPT = /^[1-9][0-9]{0,3}$/

export function moveWorkerContract(worktree, taskId, attempt) {
  if (typeof worktree !== 'string' || !worktree || !path.isAbsolute(worktree)) return failure('WORKTREE_INVALID')
  if (!TASK_ID.test(taskId ?? '')) return failure('TASK_ID_INVALID')
  if (!ATTEMPT.test(String(attempt ?? ''))) return failure('ATTEMPT_INVALID')
  let root
  try {
    root = realpathSync(worktree)
    if (!statSync(root).isDirectory()) return failure('WORKTREE_INVALID')
  } catch {
    return failure('WORKTREE_INVALID')
  }
  const sourceDirectory = path.join(root, '.orca-contract')
  const source = path.join(sourceDirectory, 'contract.md')
  const target = path.join(root, '.agent-state', 'v4-auto', 'workers', taskId, `contract-attempt-${attempt}.md`)
  try {
    if (!statSync(source).isFile()) return failure('CONTRACT_MISSING')
  } catch {
    return failure('CONTRACT_MISSING')
  }
  if (existsSync(target)) return failure('ATTEMPT_EVIDENCE_EXISTS')
  mkdirSync(path.dirname(target), { recursive: true })
  renameSync(source, target)
  if (!readdirSync(sourceDirectory).length) rmdirSync(sourceDirectory)
  return { status: 'MOVED', reasons: [], source: rel(root, source), target: rel(root, target) }
}

function failure(reason) {
  return { status: 'BLOCKED', reasons: [reason] }
}

function rel(root, file) {
  return path.relative(root, file).replaceAll('\\', '/')
}

function main(argv) {
  if (argv.length !== 4 || argv[0] !== 'move') return { code: 2, result: { status: 'INVALID', reasons: [USAGE] } }
  const result = moveWorkerContract(argv[1], argv[2], argv[3])
  return { code: result.status === 'MOVED' ? 0 : 1, result }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { code, result } = main(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(code)
}
