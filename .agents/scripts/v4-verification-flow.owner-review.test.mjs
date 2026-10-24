import { PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT, verificationTemplate, fixture, prepareVerification, makeReviewEvidence, scopeDigest } from './v4-verification-fixture.mjs'
import { git } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { validateReceipt } from './check-artifact-contract.mjs'
import { frontmatter } from './check-story-plan.mjs'
import { verifySlice } from './v4-action-kernel.mjs'

for (const reviewer of [undefined, 'same-lead', { type: 'lead', vendor: 'codex', independent: false }]) test(`Runner owner review forces human identity from ${JSON.stringify(reviewer)}`, () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const input = {
      ...f.verifyRequest, preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true),
      review: { judgment: 'APPROVE', reviewer, pending_fingerprint: pendingResult.pending.fingerprint,
        scope_paths: f.changedPaths, scope_digest: scopeDigest(evidence), change_evidence: evidence,
        answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'owner confirmed' })),
        commands: [{ command: 'owner exact scope review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }] }
    }
    const inputFile = path.join(f.root, '.agent-state', 'owner-review-input.json')
    writeFileSync(inputFile, JSON.stringify(input))
    const cli = spawnSync(process.execPath, [path.resolve(process.cwd(), '.agents/scripts/v4-story-runner.mjs'),
      'run', '9.1', '--expected-head', f.head, '--operation', 'record-owner-review', '--input', inputFile],
    { cwd: f.root, encoding: 'utf8', windowsHide: true })
    const result = JSON.parse(cli.stdout)
    assert.equal(result.status, 'APPLIED', cli.stdout)
    assert.equal(cli.status, 0, cli.stderr)
    const receipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
    assert.deepEqual(receipt.reviewer, { type: 'human', vendor: reviewer?.vendor ?? null, independent: false })
    assert.deepEqual(result.policy.decision, 'APPROVE_ALLOWED')
    assert.deepEqual(validateReceipt(f.root, frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8')), 'A', 'review'), [])
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT].sort())
    assert.equal(input.review.reviewer, reviewer)
  } finally { f.cleanup() }
})
