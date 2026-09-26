import test from 'node:test'
import assert from 'node:assert/strict'

import {
  finalizationDisposition,
  renderCompletionBlock,
  stableFinalizationDigest,
  validateFinalizationReceipt
} from './finalization-contract.mjs'

function storyFixture() {
  return {
    story_id: '9.1',
    title: 'Fixture finalization story',
    ac: [
      { id: 'AC-1', text: 'the first behavior is evidenced.' },
      { id: 'AC-2', text: 'the second behavior is evidenced.' }
    ]
  }
}

function previewWithFallbackDisclosure() {
  return {
    storyId: '9.1',
    finalizationPath: '_bmad-output/implementation-artifacts/receipts/story-9-1/finalization.json',
    receipt: {
      story_id: '9.1',
      story_normative_digest: 'sha256:' + 'a'.repeat(64),
      done_gate_disposition: 'SATISFIED_WITH_DISCLOSURES',
      lifecycle_from: 'in-progress',
      lifecycle_target: 'review'
    },
    helper: {
      done_gate_disposition: 'READY_WITH_DISCLOSURES',
      scope: { paths: [{ path: 'src/a.txt' }, { path: 'src/b.txt' }] },
      ac_coverage: [
        {
          id: 'AC-1',
          covered: true,
          contributor_slices: ['A'],
          evidence: [{
            slice_id: 'A',
            mode: 'fallback',
            evidence_id: 'focused-check',
            receipt_digest: 'sha256:' + 'b'.repeat(64),
            receipt_ref: '_bmad-output/implementation-artifacts/receipts/story-9-1/A-verification.json',
            summary: 'focused behavior checks passed'
          }],
          canonical_disclosure_relevant: ['A']
        },
        {
          id: 'AC-2',
          covered: true,
          contributor_slices: ['B'],
          evidence: [{
            slice_id: 'B',
            mode: 'structured',
            evidence_id: 'ac-2',
            receipt_digest: 'sha256:' + 'c'.repeat(64),
            receipt_ref: '_bmad-output/implementation-artifacts/receipts/story-9-1/B-verification.json',
            summary: 'structured evidence'
          }],
          canonical_disclosure_relevant: []
        }
      ],
      canonical_disclosures: [
        {
          slice_id: 'A',
          applicability: 'APPLICABLE',
          status: 'INCOMPLETE',
          complete: false,
          reasons: ['NO_APPLICABLE_RECIPE'],
          done_gate_disclosure_required: true
        },
        {
          slice_id: 'B',
          applicability: 'APPLICABLE',
          status: 'PASS',
          complete: true,
          reasons: [],
          done_gate_disclosure_required: false
        }
      ]
    }
  }
}

test('receipt digest is stable and excludes approval', () => {
  const receipt = { kind: 'story_finalization', story_id: '9.1', values: [2, 1] }
  assert.equal(stableFinalizationDigest(receipt), stableFinalizationDigest({ ...receipt, ignored: undefined }))
  assert.equal('human_approval' in receipt, false)
  assert.match(stableFinalizationDigest(receipt), /^sha256:[0-9a-f]{64}$/)
})

test('finalization disposition preserves disclosure semantics', () => {
  assert.equal(finalizationDisposition('READY'), 'SATISFIED')
  assert.equal(finalizationDisposition('READY_WITH_DISCLOSURES'), 'SATISFIED_WITH_DISCLOSURES')
  assert.equal(finalizationDisposition('BLOCKED'), null)
})

test('completion renderer labels fallback evidence and canonical disclosure separately', () => {
  const block = renderCompletionBlock(previewWithFallbackDisclosure(), storyFixture())
  assert.match(block, /AC Evidence \/ Results/)
  assert.match(block, /AC-1/)
  assert.match(block, /fallback/i)
  assert.match(block, /INCOMPLETE/)
  assert.match(block, /File List/)
  assert.match(block, /src\/a\.txt/)
  assert.doesNotMatch(block, /php artisan|npm\.cmd|node \.agents/)
})

test('receipt validator rejects approval and mismatched bindings', () => {
  const plan = {
    story_id: '9.1',
    story: { normative_digest: 'sha256:' + 'a'.repeat(64) },
    upstream_epic: { section_digest: 'sha256:' + 'b'.repeat(64) },
    finalization: {
      receipt_ref: 'receipt.json',
      receipt_digest: 'sha256:' + 'c'.repeat(64)
    }
  }
  const result = validateFinalizationReceipt('C:\\fixture', plan, 'receipt.json', {
    schema_version: 1,
    kind: 'story_finalization',
    story_id: '9.1',
    story_normative_digest: plan.story.normative_digest,
    upstream_epic_digest: plan.upstream_epic.section_digest,
    prepared_from_head: 'a'.repeat(40),
    slice_set_digest: 'sha256:' + 'd'.repeat(64),
    receipt_set_digest: 'sha256:' + 'e'.repeat(64),
    ac_coverage_digest: 'sha256:' + 'f'.repeat(64),
    canonical_disclosures_digest: 'sha256:' + '0'.repeat(64),
    scope_paths_digest: 'sha256:' + '1'.repeat(64),
    implementation_commit_set_digest: 'sha256:' + '2'.repeat(64),
    final_scoped_tree_digest: 'sha256:' + '3'.repeat(64),
    done_gate_disposition: 'SATISFIED',
    lifecycle_from: 'in-progress',
    lifecycle_target: 'review',
    human_approval: { approved: true }
  })
  assert.ok(result.errors.includes('HUMAN_APPROVAL_FORBIDDEN'))
})
