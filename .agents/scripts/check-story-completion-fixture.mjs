import assert from 'node:assert/strict'
import { approvalRecordForSnapshot, doneGateSummaryDigest, inspectCompletion } from './check-story-completion.mjs'
import { createCompletionFixture, PLAN } from './completion-fixture.mjs'

export const digest = letter => `sha256:${letter.repeat(64)}`
export const TWO_PATHS = ['src/a.txt', 'src/b.txt']

export function snapshot() {
  const value = {
    story_id: '9.1',
    story_title: 'Fixture completion story',
    lifecycle: 'review',
    story_normative_digest: digest('a'),
    finalization_receipt_digest: digest('b'),
    done_gate_disposition: 'SATISFIED_WITH_DISCLOSURES',
    ac_coverage: [{ id: 'AC-1', covered: true, evidence: [] }],
    canonical_disclosures: [{ slice_id: 'A', applicability: 'APPLICABLE', status: 'INCOMPLETE', complete: false }],
    implementation_path_count: 2,
    scope_paths_digest: digest('c'),
    implementation_commit_set_digest: digest('d'),
    final_scoped_tree_digest: digest('e'),
    pending_action: { kind: 'complete_story', target: 'story' },
    approved_review_head: 'f'.repeat(40)
  }
  return { ...value, done_gate_summary_digest: doneGateSummaryDigest(value) }
}

export function approvalYaml(record) {
  return [
    'human_approval:',
    ...Object.entries(record).map(([key, value]) => `  ${key}: ${typeof value === 'string' ? JSON.stringify(value) : value}`),
    ''
  ].join('\n')
}

export function persistApproval(f, mutate = {}, commit = true) {
  const gate = inspectCompletion(f.root, '9.1', f.head)
  const approval = { ...approvalRecordForSnapshot(gate.preview, f.head, '2026-09-26T12:00:00.000Z'), ...mutate }
  f.write(PLAN, f.readPlan().replace('human_approval: null\n', approvalYaml(approval)))
  if (commit) {
    f.git('add', '.')
    f.git('commit', '-qm', 'fixture Human approval')
    f.refreshHead()
  }
  return approval
}

export async function completedFixture() {
  const { runAction } = await import('./v4-story-runner.mjs')
  const f = createCompletionFixture()
  const approval = runAction(f.root, '9.1', f.head, {
    approval: { action: 'approve_exact_scope', disclosures_acknowledged: true, approved_at: '2026-09-26T12:00:00.000Z' }
  })
  assert.equal(approval.status, 'APPROVAL_DURABLE_PENDING_COMPLETION', JSON.stringify(approval))
  const completed = runAction(f.root, '9.1', approval.commit)
  assert.equal(completed.status, 'DONE', JSON.stringify(completed))
  f.completion = f.refreshHead()
  return f
}

export function integrateUnrelatedWork(f) {
  f.git('checkout', '-q', '-b', 'integration', f.completion + '~3')
  f.write('docs/unrelated.md', 'work integrated alongside the Story\n')
  f.git('add', 'docs/unrelated.md')
  f.git('commit', '-qm', 'unrelated work')
  f.git('merge', '-q', '--no-ff', '-m', 'merge Story into integration', f.completion)
  return f.refreshHead()
}
