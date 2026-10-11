import { PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT, verificationTemplate, fixture, withSliceRisk, prepareVerification, makeReviewEvidence, scopeDigest, legacyMetadataFailure } from './v4-verification-fixture.mjs'
import { git, write, digest } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { receiptDigest, validateReceipt } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { actionFingerprint, prepareAction, recordSliceReview, verifySlice } from './v4-action-kernel.mjs'
import { digestValue, reviewEvidenceFreshness } from './v4-finalization-contract.mjs'
import { inspectActionTransaction, transactionIdentity } from './v4-slice-transaction.mjs'
import { runV4Story } from './v4-story-runner.mjs'


test('LOW PASS runs canonical and focused checks then persists only verification metadata', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false)
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.deepEqual(result.policy, { decision: 'PROGRESS', reasons: ['LOW_CANONICAL_PASS_NO_FLAGS'] })
    assert.equal(result.next_action.kind, 'finalize_story')
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, VERIFICATION_RECEIPT].sort())
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    const receipt = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    assert.equal(plan.slices[0].status, 'verified')
    assert.equal(plan.slices[0].receipt_refs.verification.digest, receiptDigest(receipt))
    assert.equal(Object.hasOwn(receipt, 'policy'), false)
    assert.equal(Object.hasOwn(plan.slices[0], 'policy'), false)
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'verification'), [])
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

test('LOW slice within HIGH Story takes the NO_REVIEW path and requests can raise risk', () => {
  const f = fixture('HIGH', { sliceRisk: 'LOW' })
  try {
    const prepared = prepareVerification(f)
    assert.equal(prepared.preview.risk, 'LOW')
    const raised = prepareAction(f.root, { ...f.verifyRequest, risk: 'HIGH' })
    assert.equal(raised.preview.risk, 'HIGH', JSON.stringify(raised))
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: withSliceRisk(verificationTemplate(f, false), 'LOW'),
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    const receipt = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    assert.equal(receipt.escalation.decision, 'NO_REVIEW')
    assert.equal(existsSync(path.join(f.root, REVIEW_RECEIPT)), false)
    assert.equal(frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8')).slices[0].risk.level, 'LOW')
  } finally { f.cleanup() }
})

test('verification metadata cannot add, remove or change committed slice risk', () => {
  for (const [original, changed] of [['LOW', undefined], ['LOW', 'MEDIUM']]) {
    const f = fixture('HIGH', { sliceRisk: original })
    try {
      const prepared = prepareVerification(f)
      const result = verifySlice(f.root, {
        ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
        plan_template: withSliceRisk(verificationTemplate(f, false), changed),
      })
      assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
    } finally { f.cleanup() }
  }
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: withSliceRisk(verificationTemplate(f, false), 'LOW') })
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

test('verification metadata cannot change another slice risk', () => {
  const f = fixture('LOW')
  try {
    const other = '  - id: B\n    status: pending\n    task_refs: [T-1]\n    depends_on: [A]\n'
    const before = readFileSync(path.join(f.root, PLAN), 'utf8')
    write(f.root, PLAN, before.replace('next_action:', `${other}next_action:`))
    git(f.root, 'add', '--', PLAN)
    git(f.root, 'commit', '-qm', 'fixture another pending slice')
    f.verifyRequest.expected_head = git(f.root, 'rev-parse', 'HEAD')
    const prepared = prepareVerification(f)
    const template = verificationTemplate(f, false).replace('next_action:', `${other}    risk: \n      level: LOW\n      flags: []\nnext_action:`)
    const result = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview, plan_template: template })
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

test('HIGH PASS stops at REVIEW_REQUIRED with immutable pending evidence and no commit', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    assert.equal(result.status, 'REVIEW_REQUIRED', JSON.stringify(result))
    assert.equal(result.pending.verification_status, 'PASS')
    assert.equal(result.pending.review_questions.length > 0, true)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    assert.equal(result.pending.fingerprint, actionFingerprint(Object.fromEntries(Object.entries(result.pending).filter(([key]) => key !== 'fingerprint'))))
  } finally { f.cleanup() }
})

for (const operation of ['record-review', 'record_review']) test(`Runner ${operation} rejects human review authority without mutation`, () => {
  const f = fixture('HIGH')
  try {
    const result = runV4Story(f.root, '9.1', {
      expectedHead: f.head, operation,
      input: { ...f.verifyRequest, review: { reviewer: { type: 'human', vendor: null, independent: false } } }
    })
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['OWNER_REVIEW_OPERATION_REQUIRED'])
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
    assert.equal(existsSync(path.join(f.root, REVIEW_RECEIPT)), false)
  } finally { f.cleanup() }
})

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

for (const plannedRisk of ['MEDIUM', 'HIGH']) test(`caller cannot lower a ${plannedRisk} Plan risk before verification preview`, () => {
  const f = fixture(plannedRisk)
  try {
    const result = prepareAction(f.root, { ...f.verifyRequest, risk: 'LOW' })
    assert.notEqual(result.status, 'READY', JSON.stringify(result))
    assert.ok(result.reasons.includes('RISK_DOWNGRADE_FORBIDDEN'), JSON.stringify(result))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('same-Lead APPROVE requires exact bounded evidence and persists verification plus review receipts', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const review = {
      judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pendingResult.pending.fingerprint,
      scope_paths: ['src/feature.txt'], scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    const result = recordSliceReview(f.root, {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true), review
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT].sort())
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.slices[0].status, 'reviewed')
    const reviewReceipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
    assert.equal(reviewReceipt.judgment, 'APPROVE')
    assert.equal(reviewReceipt.reviewer, 'same-lead')
    assert.equal(Object.hasOwn(reviewReceipt, 'findings'), false)
    assert.equal(reviewReceipt.verdict, undefined)
    assert.equal(reviewReceipt.freshness, undefined)
    assert.equal(reviewEvidenceFreshness(reviewReceipt, ['src/feature.txt'], plan.slices[0].checkpoint_commit, digestValue(plan.risk)).status, 'FRESH_REUSED')
    assert.ok(plan.slices[0].receipt_refs.review.digest)
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'verification'), [])
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'review'), [])
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
  } finally { f.cleanup() }
})

test('same-Lead APPROVE accepts one ordered evidence set covering five changed paths', () => {
  const changedPaths = [
    'src/feature.txt', 'src/feature-a.txt', 'src/feature-b.txt', 'src/feature-c.txt', 'src/feature-d.txt'
  ].sort()
  const f = fixture('HIGH', { changedPaths })
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    assert.equal(pendingResult.status, 'REVIEW_REQUIRED', JSON.stringify(pendingResult))
    const evidence = makeReviewEvidence(f, prepared.preview)
    assert.ok(evidence.evidenceSet)
    assert.deepEqual(evidence.evidenceSet.paths.map(item => item.path), changedPaths)
    assert.deepEqual(evidence.evidenceSet.requestedPaths, changedPaths)
    const review = {
      judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pendingResult.pending.fingerprint,
      scope_paths: changedPaths, scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      commands: [{ command: 'same-lead five-path review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    const result = recordSliceReview(f.root, {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true), review
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    const receipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
    assert.deepEqual(receipt.evidence_refs.map(item => item.path), evidence.evidenceSet.units.map(item => item.path))
    assert.deepEqual(receipt.evidence_refs.map(item => item.unit_index), evidence.evidenceSet.units.map(item => item.unitIndex))
    assert.equal(receipt.scope_digest, scopeDigest(evidence))
    assert.equal(frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8')).slices[0].status, 'reviewed')
  } finally { f.cleanup() }
})

test('CHANGES_REQUIRED blocks and stale policy rejects continuation without mutation', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const common = {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      review: {
        judgment: 'CHANGES_REQUIRED', pending_fingerprint: pendingResult.pending.fingerprint, scope_paths: ['src/feature.txt'],
        scope_digest: scopeDigest(evidence), change_evidence: evidence,
        answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'not approved' })),
        commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
      }
    }
    const blockedResult = recordSliceReview(f.root, common)
    assert.equal(blockedResult.status, 'BLOCKED', JSON.stringify(blockedResult))
    assert.equal(blockedResult.reasons[0], 'CHANGES_REQUIRED')
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    const reworkResult = recordSliceReview(f.root, { ...common, review: { ...common.review,
      findings: [{ id: 'F1', class: 'VALID', summary: 'Correction needed', paths: ['src/feature.txt'] }] } })
    assert.equal(reworkResult.status, blockedResult.status)
    assert.deepEqual(reworkResult.reasons, blockedResult.reasons)
    assert.equal(reworkResult.stop_condition, blockedResult.stop_condition)
    assert.deepEqual(reworkResult.policy, { decision: 'REWORK', reasons: ['VALID_FINDINGS_CORRECTION_ALLOWED'] })
    assert.equal(existsSync(path.join(f.root, REVIEW_RECEIPT)), false)
    write(f.root, 'AGENTS.md', '# changed policy\n')
    const staleResult = recordSliceReview(f.root, common)
    assert.equal(staleResult.status, 'STALE', JSON.stringify(staleResult))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('NEED_MORE_EVIDENCE permits one bounded round and rejects a second round', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const review = {
      judgment: 'NEED_MORE_EVIDENCE', pending_fingerprint: pendingResult.pending.fingerprint, scope_paths: ['src/feature.txt'],
      scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'need one more bounded check' })),
      commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    const next = recordSliceReview(f.root, { ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending, review })
    assert.equal(next.status, 'REVIEW_REQUIRED', JSON.stringify(next))
    assert.equal(next.pending.evidence_round, 1)
    const second = recordSliceReview(f.root, { ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: next.pending, review: { ...review, pending_fingerprint: next.pending.fingerprint } })
    assert.equal(second.status, 'BLOCKED', JSON.stringify(second))
    assert.equal(second.reasons[0], 'EVIDENCE_BUDGET_EXHAUSTED')
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('verification metadata recovery resumes an interrupted commit without replay', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const first = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false), fail_at: 'after-commit-hook'
    })
    assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '4')
    const recovered = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false), recovery_authorized: true,
      recovery_checkpoint: first.checkpoint_commit
    })
    assert.equal(recovered.status, 'NOOP', JSON.stringify(recovered))
    assert.equal(recovered.policy.decision, 'PROGRESS')
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '4')
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

test('wrong verification successor is rejected before creating a transaction or lock', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false).replace('{{NEXT_ACTION_KIND}}', 'verify_slice').replace('{{NEXT_ACTION_TARGET}}', 'A')
    })
    assert.ok(result.reasons.includes('SUCCESSOR_PROJECTION_MISMATCH'), JSON.stringify(result))
    assert.equal(inspectActionTransaction(f.root, f.verifyRequest.transaction_id).status, 'NOT_FOUND')
    assert.equal(existsSync(transactionIdentity(f.root, f.verifyRequest).lockPath), false)
    assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

for (const failure of ['after-write', 'after-metadata-stage']) {
  test(`verification recovery resumes ${failure} without regenerating evidence`, () => {
    const f = fixture('LOW')
    try {
      const prepared = prepareVerification(f)
      const input = { ...f.verifyRequest, operation: 'verify', preview: prepared.preview, plan_template: verificationTemplate(f, false) }
      const first = verifySlice(f.root, { ...input, fail_at: failure })
      assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
      const receiptBytes = readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8')
      const recovered = verifySlice(f.root, { ...input, recovery_authorized: true, recovery_checkpoint: first.checkpoint_commit })
      assert.equal(recovered.status, 'APPLIED', JSON.stringify(recovered))
      assert.equal(recovered.policy.decision, 'PROGRESS')
      assert.equal(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'), receiptBytes)
      assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '4')
      assert.equal(git(f.root, 'status', '--porcelain'), '')
      assert.equal(verifySlice(f.root, { ...input, recovery_authorized: true, recovery_checkpoint: first.checkpoint_commit }).status, 'NOOP')
    } finally { f.cleanup() }
  })
}

test('interrupted metadata recovery rejects a changed receipt and preserves partial state', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const input = { ...f.verifyRequest, operation: 'verify', preview: prepared.preview, plan_template: verificationTemplate(f, false) }
    const first = verifySlice(f.root, { ...input, fail_at: 'after-write' })
    const receipt = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    receipt.commands[0].environment = 'tampered'
    write(f.root, VERIFICATION_RECEIPT, JSON.stringify(receipt) + '\n')
    const before = readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8')
    const recovered = verifySlice(f.root, { ...input, recovery_authorized: true, recovery_checkpoint: first.checkpoint_commit })
    assert.equal(recovered.status, 'RECOVERY_REQUIRED', JSON.stringify(recovered))
    assert.ok(recovered.reasons.includes('RECOVERY_METADATA_CONTENT_MISMATCH'), JSON.stringify(recovered))
    assert.equal(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'), before)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.ok(existsSync(first.lock_path))
  } finally { f.cleanup() }
})

test('Runner retires only the unwritten legacy transaction and preserves its journal and lock evidence', () => {
  const f = fixture('HIGH')
  try {
    const legacy = legacyMetadataFailure(f)
    const prepared = legacy.run('prepare-recovery-abort')
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.equal(legacy.run('abort-unwritten-metadata', { preview: prepared.preview }).status, 'BLOCKED')
    const result = legacy.run('abort-unwritten-metadata', { preview: prepared.preview, recovery_authorized: true })
    assert.equal(result.status, 'ABORTED', JSON.stringify(result))
    assert.equal(readFileSync(result.archive_journal_path, 'utf8'), legacy.journalBytes)
    assert.equal(readFileSync(result.archive_lock_path, 'utf8'), legacy.lockBytes)
    assert.equal(existsSync(legacy.identity.lockPath), false)
    assert.equal(inspectActionTransaction(f.root, legacy.request.transaction_id).status, 'ABORTED')
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
    assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    assert.equal(legacy.run('abort-unwritten-metadata', { preview: prepared.preview, recovery_authorized: true }).status, 'NOOP')
  } finally { f.cleanup() }
})

for (const fault of ['wrong-checkpoint', 'foreign-lock', 'dirty-product', 'dirty-metadata', 'staged-work', 'non-idle']) {
  test(`unwritten retirement rejects ${fault} without changing recovery evidence`, () => {
    const f = fixture('HIGH')
    try {
      const legacy = legacyMetadataFailure(f)
      if (fault === 'wrong-checkpoint') legacy.request.recovery_checkpoint = 'f'.repeat(40)
      if (fault === 'foreign-lock') writeFileSync(legacy.identity.lockPath, legacy.lockBytes.replace('legacy-prewrite', 'foreign-owner'))
      if (fault === 'dirty-product') write(f.root, 'src/base.txt', 'user work\n')
      if (fault === 'dirty-metadata') write(f.root, VERIFICATION_RECEIPT, '{}\n')
      if (fault === 'staged-work') { write(f.root, 'user.txt', 'staged\n'); git(f.root, 'add', 'user.txt') }
      if (fault === 'non-idle') write(f.root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, status: 'RUNNING', activeRunId: 'other', storyId: '9.2' }))
      const lockBefore = readFileSync(legacy.identity.lockPath, 'utf8')
      const statusBefore = git(f.root, 'status', '--porcelain')
      const result = legacy.run('prepare-recovery-abort')
      assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
      assert.equal(readFileSync(legacy.identity.journalPath, 'utf8'), legacy.journalBytes)
      assert.equal(readFileSync(legacy.identity.lockPath, 'utf8'), lockBefore)
      assert.equal(git(f.root, 'status', '--porcelain'), statusBefore)
    } finally { f.cleanup() }
  })
}

test('retirement binds maintenance changes and rejects a stale preview', () => {
  const f = fixture('HIGH')
  try {
    const legacy = legacyMetadataFailure(f)
    const maintenance = '.agents/scripts/v4-repair.mjs'
    write(f.root, maintenance, '// authorized tooling repair\n')
    legacy.request.maintenance_paths = [maintenance]
    const prepared = legacy.run('prepare-recovery-abort')
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    write(f.root, maintenance, '// changed after preview\n')
    const result = legacy.run('abort-unwritten-metadata', { preview: prepared.preview, recovery_authorized: true })
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.equal(readFileSync(legacy.identity.journalPath, 'utf8'), legacy.journalBytes)
    assert.equal(readFileSync(legacy.identity.lockPath, 'utf8'), legacy.lockBytes)
  } finally { f.cleanup() }
})

test('retirement resumes interrupted owned-lock archival without replacing evidence', () => {
  const f = fixture('HIGH')
  try {
    const legacy = legacyMetadataFailure(f)
    const prepared = legacy.run('prepare-recovery-abort')
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const input = { preview: prepared.preview, recovery_authorized: true }
    const first = legacy.run('abort-unwritten-metadata', { ...input, fail_at: 'AFTER_ABORT_JOURNAL' })
    assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
    assert.ok(existsSync(legacy.identity.lockPath))
    const recovered = legacy.run('abort-unwritten-metadata', input)
    assert.equal(recovered.status, 'ABORTED', JSON.stringify(recovered))
    assert.equal(readFileSync(recovered.archive_journal_path, 'utf8'), legacy.journalBytes)
    assert.equal(readFileSync(recovered.archive_lock_path, 'utf8'), legacy.lockBytes)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

test('kernel-written review receipts round-trip through the finalization gate', async () => {
  const { inspectFinalization } = await import('./check-story-finalization.mjs')
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const pendingBefore = JSON.stringify(pendingResult.pending)
    const evidence = makeReviewEvidence(f, prepared.preview)
    const result = recordSliceReview(f.root, {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true),
      review: {
        judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pendingResult.pending.fingerprint,
        scope_paths: ['src/feature.txt'], scope_digest: scopeDigest(evidence), change_evidence: evidence,
        answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
        commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
      }
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.equal(result.next_action.kind, 'finalize_story')
    assert.deepEqual(result.policy, { decision: 'HUMAN_REQUIRED', reasons: ['LEGACY_REVIEWER_UNCLASSIFIED'] })
    const { policy, ...legacyResult } = result
    assert.equal(legacyResult.status, 'APPLIED')
    assert.equal(Object.hasOwn(legacyResult, 'policy'), false)
    const identity = transactionIdentity(f.root, f.verifyRequest)
    assert.deepEqual(legacyResult, {
      status: 'APPLIED', ready: false, valid: true, reasons: [],
      transaction_id: f.verifyRequest.transaction_id, checkpoint_commit: f.head,
      metadata_commit: git(f.root, 'rev-parse', 'HEAD'), changed_paths: prepared.preview.changed_paths,
      changed_paths_sha256: prepared.preview.changed_paths_sha256,
      next_action: { kind: 'finalize_story', target: 'story' },
      journal_path: identity.journalPath, lock_path: identity.lockPath, durable_action_count: 1,
      stop_condition: 'NEXT_ACTION_EXPLICIT_AFTER_REVIEW', action: 'verify_slice', operation: 'record-review'
    })
    assert.equal(JSON.stringify(pendingResult.pending), pendingBefore)

    const receipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
    assert.equal(receipt.schema_version, 2)
    assert.deepEqual(Object.keys(receipt).sort(), ['schema_version', 'story_id', 'slice_id', 'kind',
      'checkpoint_commit', 'baseline_commit', 'subject_digest', 'created_from_head', 'changed_paths_sha256',
      'commands', 'judgment', 'questions', 'answers', 'evidence_refs', 'scope_digest',
      'risk_context_digest', 'reviewed_commit', 'reviewer'].sort())

    // The pre-policy receipt contract, with only fixture-bound identities/evidence substituted.
    const legacyReceipt = {
      schema_version: 2, story_id: '9.1', slice_id: 'A', kind: 'review',
      checkpoint_commit: prepared.preview.checkpoint_commit, baseline_commit: prepared.preview.baseline_commit,
      subject_digest: prepared.preview.subject_digest, created_from_head: prepared.preview.checkpoint_commit,
      changed_paths_sha256: prepared.preview.changed_paths_sha256,
      commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }],
      judgment: 'APPROVE', questions: pendingResult.pending.review_questions,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      evidence_refs: pendingResult.pending.requested_evidence.refs, scope_digest: scopeDigest(evidence),
      risk_context_digest: digestValue(prepared.preview.original_plan.risk),
      reviewed_commit: prepared.preview.checkpoint_commit, reviewer: 'same-lead'
    }
    assert.equal(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'), `${JSON.stringify(legacyReceipt, null, 2)}\n`)
    assert.equal(receiptDigest(receipt), receiptDigest(legacyReceipt))
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.slices[0].receipt_refs.review.digest, receiptDigest(receipt))
    assert.notEqual(receiptDigest({ ...receipt, policy }), receiptDigest(receipt))
    const verification = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    assert.equal(Object.hasOwn(verification, 'policy'), false)
    assert.equal(plan.slices[0].receipt_refs.verification.digest, receiptDigest(verification))
    const gate = inspectFinalization(f.root, '9.1', git(f.root, 'rev-parse', 'HEAD'))
    const reviewReasons = gate.reasons.filter(reason => /REVIEW|RECEIPT|PROGRESSION/.test(reason))
    assert.deepEqual(reviewReasons, [], JSON.stringify(gate.reasons))
    assert.ok(['FRESH_CANDIDATE', 'FRESH_REUSED', 'FRESH'].includes(gate.slices[0].review_freshness), JSON.stringify(gate.slices))
  } finally { f.cleanup() }
})

for (const [name, reviewer, findings, reason] of [
  ['structured lead', { type: 'lead', vendor: 'codex', independent: false }, [], null],
  ['structured human', { type: 'human', vendor: null, independent: false }, [{ id: 'F1', class: 'FALSE_POSITIVE', summary: 'Disproved by evidence', paths: ['src/feature.txt'] }], null],
  ['false independence', { type: 'lead', vendor: 'claude', independent: true }, [], 'REVIEWER_INDEPENDENCE_MISMATCH'],
  ['malformed reviewer', { type: 'lead', vendor: 'other', independent: false }, [], 'REVIEWER_INVALID'],
  ...['VALID', 'SPEC_AMBIGUITY', 'NEEDS_HUMAN_DECISION'].map(className => [className, { type: 'lead', vendor: 'codex', independent: false }, [{ id: 'F1', class: className, summary: 'Open finding', paths: ['src/feature.txt'] }], 'REVIEW_FINDINGS_OPEN']),
  ['malformed findings', 'same-lead', [{ id: 'F1', class: 'FALSE_POSITIVE', summary: '', paths: ['../outside'] }], 'REVIEW_FINDINGS_INVALID'],
  ['conflicting decisions', 'same-lead', [], 'REVIEW_DECISION_CONFLICT']
]) test(`structured review ${name} validates before persisting`, () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    assert.equal(pendingResult.status, 'REVIEW_REQUIRED')
    assert.equal(Object.hasOwn(pendingResult.pending, 'policy'), false)
    assert.equal(pendingResult.pending.fingerprint, digestValue(Object.fromEntries(
      Object.entries(pendingResult.pending).filter(([key]) => key !== 'fingerprint'))))
    const evidence = makeReviewEvidence(f, prepared.preview)
    const review = {
      judgment: 'APPROVE', reviewer, findings, pending_fingerprint: pendingResult.pending.fingerprint,
      scope_paths: ['src/feature.txt'], scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      commands: [{ command: 'bounded review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    if (name === 'conflicting decisions') review.verdict = 'CHANGES_REQUIRED'
    const result = recordSliceReview(f.root, {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true), review
    })
    if (reason) {
      assert.equal(result.status, reason === 'REVIEW_FINDINGS_OPEN' ? 'BLOCKED' : 'INVALID', JSON.stringify(result))
      assert.ok(result.reasons.includes(reason), JSON.stringify(result))
      assert.notEqual(result.policy.decision, 'APPROVE_ALLOWED')
      assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
      assert.equal(existsSync(path.join(f.root, REVIEW_RECEIPT)), false)
    } else {
      assert.equal(result.status, 'APPLIED', JSON.stringify(result))
      const receipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
      assert.equal(receipt.schema_version, 2)
      assert.deepEqual(receipt.reviewer, reviewer)
      assert.deepEqual(receipt.findings, findings)
      const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
      assert.deepEqual(plan.slices[0].review.reviewer, reviewer)
      assert.deepEqual(validateReceipt(f.root, plan, 'A', 'review'), [])
      assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    }
  } finally { f.cleanup() }
})

test('structured alternate verification recovery rejects open findings before transaction mutation', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const identity = transactionIdentity(f.root, f.verifyRequest)
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      recovery_authorized: true, recovery_checkpoint: f.head,
      review: { judgment: 'APPROVE', reviewer: { type: 'lead', vendor: 'codex', independent: false },
        findings: [{ id: 'F1', class: 'VALID', summary: 'Open', paths: ['src/feature.txt'] }] }
    })
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['REVIEW_FINDINGS_OPEN'])
    assert.equal(inspectActionTransaction(f.root, f.verifyRequest.transaction_id).status, 'NOT_FOUND')
    assert.equal(existsSync(identity.lockPath), false)
    assert.equal(existsSync(identity.journalPath), false)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})
