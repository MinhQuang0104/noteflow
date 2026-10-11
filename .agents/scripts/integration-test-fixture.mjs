import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createCompletionFixture } from './completion-fixture.mjs'
import { recordHumanApproval, applyCompletion } from './complete-story.mjs'
import { claimStory, registryPaths } from './story-registry.mjs'

export function assertTemporary(root) {
  const relative = path.relative(realpathSync(tmpdir()), realpathSync(root))
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `temporary repository required: ${root}`)
}

export function createIntegrationFixture() {
  const f = createCompletionFixture(), base = mkdtempSync(path.join(tmpdir(), 'p6-integration-fixture-'))
  assertTemporary(f.root); assertTemporary(base)
  const canonical = path.join(base, 'canonical')
  f.git('branch', '-M', 'main')
  f.git('checkout', '-b', 'story-9-1')
  f.git('branch', '-f', 'main', f.git('rev-list', '--max-parents=0', 'HEAD'))
  f.git('worktree', 'add', canonical, 'main')
  assertTemporary(canonical)
  const git = (...args) => {
    assertTemporary(canonical)
    const result = spawnSync('git', args, { cwd: canonical, encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const write = (relative, value) => {
    assertTemporary(canonical)
    const file = path.join(canonical, relative)
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, value)
  }
  const setChecks = checks => {
    write('.agents/config/integration-checks.json', JSON.stringify({ schema: 'integration-checks-v1', checks }))
    git('add', '.agents/config/integration-checks.json'); git('commit', '-qm', 'fixture integration checks')
  }
  setChecks([{ id: 'completion', argv: [process.execPath,
    fileURLToPath(new URL('./check-story-completion.mjs', import.meta.url)), 'check', '<story-id>', '--expected-head', '<merge-head>'] }])
  assert.equal(recordHumanApproval(f.root, '9.1', f.head,
    { action: 'approve_exact_scope', disclosures_acknowledged: true }).status, 'APPROVAL_DURABLE_PENDING_COMPLETION')
  f.refreshHead()
  assert.equal(applyCompletion(f.root, '9.1', f.head).status, 'DONE')
  f.refreshHead()
  const claim = claimStory(f.root, '9.1', { worktree: f.root, leadVendor: 'codex', session: 'integration-fixture' })
  assert.equal(claim.status, 'APPLIED', JSON.stringify(claim))
  return { f, canonical, git, write, setChecks, locations: registryPaths(f.root, '9.1'),
    cleanup() {
      assertTemporary(f.root); assertTemporary(base)
      f.git('worktree', 'remove', '--force', canonical)
      f.cleanup(); rmSync(base, { recursive: true, force: true })
    } }
}
