import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  captureWorktreeSubject,
  executeCheck,
  validateCheckEvidence,
} from './v4-check-executor.mjs'

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'v4-check-executor-'))
  mkdirSync(path.join(root, 'fixtures'), { recursive: true })
  writeFileSync(path.join(root, 'fixtures', 'é space.txt'), 'fixture content\n')
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function spec(argv, overrides = {}) {
  return {
    id: 'fixture-check',
    cwd: './fixtures/..',
    argv,
    purpose: 'bounded fixture check',
    classification: 'behavioral',
    required: true,
    referenced_paths: ['fixtures/é space.txt'],
    source: { kind: 'recipe', path: '.agents/verification/fixture.json' },
    environment_identity: { kind: 'fixture', id: 'node' },
    ...overrides,
  }
}

test('executes argv directly, handles spaces/Unicode, and records redacted provenance', () => {
  const f = fixture()
  try {
    const subject = captureWorktreeSubject(f.root, ['fixtures/é space.txt'])
    const evidence = executeCheck(f.root, spec([
      'node', '-e',
      'const fs=require("node:fs"); fs.accessSync(process.argv[1]); process.stdout.write("secret=do-not-leak\\n")',
      'fixtures/é space.txt',
    ]), subject)
    assert.equal(evidence.status, 'PASS')
    assert.equal(evidence.exit_code, 0)
    assert.match(evidence.command_digest, /^sha256:[0-9a-f]{64}$/)
    assert.match(evidence.output_digest, /^sha256:[0-9a-f]{64}$/)
    assert.match(evidence.diagnostic_excerpt, /secret=<redacted>/)
    assert.equal(evidence.diagnostic_excerpt.includes('do-not-leak'), false)
    assert.equal(evidence.subject.manifest_digest, subject.manifest_digest)
    assert.equal(evidence.environment.status, 'KNOWN')
    assert.equal(validateCheckEvidence(f.root, evidence).status, 'VALID')

    const noisy = executeCheck(f.root, spec(['node', '-e', 'process.stdout.write("x".repeat(10000))']), subject)
    assert.equal(noisy.status, 'PASS')
    assert.ok(Buffer.byteLength(noisy.diagnostic_excerpt, 'utf8') <= 2048)
  } finally {
    f.cleanup()
  }
})

test('nonzero checks are FAIL, fabricated summaries are not reusable, and learned commands never run', () => {
  const f = fixture()
  try {
    const subject = captureWorktreeSubject(f.root, ['fixtures/é space.txt'])
    const failed = executeCheck(f.root, spec(['node', '-e', 'process.exit(3)']), subject)
    assert.equal(failed.status, 'FAIL')
    assert.equal(failed.exit_code, 3)
    assert.equal(validateCheckEvidence(f.root, failed).status, 'VALID')

    const fabricated = validateCheckEvidence(f.root, { status: 'PASS', summary: 'all good' })
    assert.equal(fabricated.status, 'INVALID')
    assert.ok(fabricated.reasons.includes('PROVENANCE_MISSING'))

    const marker = path.join(f.root, 'learned-ran.txt')
    const learned = executeCheck(f.root, spec([
      'node', '-e', 'require("node:fs").writeFileSync(process.argv[1], "ran")', marker,
    ], { source: { kind: 'learned', path: 'runtime/candidate.json' } }), subject)
    assert.equal(learned.status, 'ERROR')
    assert.ok(learned.reasons.includes('UNTRUSTED_CHECK_SOURCE'))
    assert.equal(existsSync(marker), false)
  } finally {
    f.cleanup()
  }
})

test('rejects traversal, unavailable executables, and timeouts without PASS', () => {
  const f = fixture()
  try {
    const subject = captureWorktreeSubject(f.root, ['fixtures/é space.txt'])
    const traversal = executeCheck(f.root, spec(['node', '-e', 'process.stdout.write("x")'], { cwd: '../outside' }), subject)
    assert.equal(traversal.status, 'ERROR')
    assert.ok(traversal.reasons.includes('UNSAFE_CWD'))

    const unavailable = executeCheck(f.root, spec(['v4-command-that-does-not-exist']), subject)
    assert.equal(unavailable.status, 'ERROR')
    assert.ok(unavailable.reasons.includes('PROCESS_LAUNCH_FAILED'))

    const timeout = executeCheck(f.root, spec(['node', '-e', 'setTimeout(() => {}, 500)'], { timeout_ms: 25 }), subject)
    assert.equal(timeout.status, 'ERROR')
    assert.ok(timeout.reasons.includes('TIMEOUT'))
  } finally {
    f.cleanup()
  }
})

test('rejects symlinked cwd or referenced paths', t => {
  const f = fixture()
  const outside = mkdtempSync(path.join(os.tmpdir(), 'v4-check-outside-'))
  try {
    const outsideFile = path.join(outside, 'outside.txt')
    writeFileSync(outsideFile, 'outside\n')
    const link = path.join(f.root, 'outside-link.txt')
    try {
      symlinkSync(outsideFile, link, 'file')
    } catch (error) {
      if (['EPERM', 'EACCES'].includes(error?.code)) {
        t.skip('symlink creation is unavailable in this Windows test environment')
        return
      }
      throw error
    }
    const subject = captureWorktreeSubject(f.root, ['fixtures/é space.txt'])
    const result = executeCheck(f.root, spec(['node', '-e', 'process.stdout.write("x")'], {
      referenced_paths: ['outside-link.txt'],
    }), subject)
    assert.equal(result.status, 'ERROR')
    assert.ok(result.reasons.includes('SYMLINK_PATH'))
  } finally {
    f.cleanup()
    rmSync(outside, { recursive: true, force: true })
  }
})

test('subject drift and unsupported Node range make evidence non-reusable', () => {
  const f = fixture()
  try {
    const subject = captureWorktreeSubject(f.root, ['fixtures/é space.txt'])
    const evidence = executeCheck(f.root, spec(['node', '-e', 'process.stdout.write("ok")']), subject)
    writeFileSync(path.join(f.root, 'fixtures', 'é space.txt'), 'changed\n')
    const stale = validateCheckEvidence(f.root, evidence)
    assert.equal(stale.status, 'STALE')
    assert.ok(stale.reasons.includes('SUBJECT_DRIFT'))

    const unsupported = executeCheck(f.root, spec(['node', '-e', 'process.stdout.write("ok")'], {
      supported_node_range: '>=999.0.0 <1000.0.0',
    }), captureWorktreeSubject(f.root, ['fixtures/é space.txt']))
    assert.equal(unsupported.status, 'ERROR')
    assert.ok(unsupported.reasons.includes('UNSUPPORTED_NODE_VERSION'))

    const unsupportedNpm = executeCheck(f.root, spec(['node', '-e', 'process.stdout.write("ok")'], {
      supported_npm_range: '>=999.0.0 <1000.0.0',
    }), captureWorktreeSubject(f.root, ['fixtures/é space.txt']))
    assert.equal(unsupportedNpm.status, 'ERROR')
    assert.ok(unsupportedNpm.reasons.includes('UNSUPPORTED_NPM_VERSION'))
  } finally {
    f.cleanup()
  }
})
