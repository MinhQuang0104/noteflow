import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'
import { stableFinalizationDigest } from './finalization-contract.mjs'
import { pathListDigest } from './check-slice-verification.mjs'
import { inspectFinalization } from './check-story-finalization.mjs'

export const STORY = 'docs/story.md'
export const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
export const EPIC = 'docs/product/epics.md'
export const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
export const FINALIZATION = '_bmad-output/implementation-artifacts/receipts/story-9-1/finalization.json'

const storyText = status => [
  '---',
  'story_id: "9.1"',
  'title: Fixture completion story',
  'status: ' + status,
  '---',
  '',
  '# Story 9.1: Fixture completion story',
  '',
  '## Story',
  '',
  '<!-- v4:story:start -->',
  'As a user, I want a bounded fixture story.',
  '<!-- v4:story:end -->',
  '',
  '## Readiness',
  '',
  '<!-- v4:readiness:start -->',
  '- result: READY',
  '- dependencies: none',
  '<!-- v4:readiness:end -->',
  '',
  '## Acceptance Criteria',
  '',
  '<!-- v4:ac:start -->',
  '- AC-1: the first behavior is evidenced.',
  '<!-- v4:ac:end -->',
  '',
  '## Tasks',
  '',
  '<!-- v4:tasks:start -->',
  '- [x] T-1 [AC-1]: implement the fixture behavior.',
  '<!-- v4:tasks:end -->',
  '',
  '## References',
  '',
  '<!-- v4:references:start -->',
  '- product: docs/product/epics.md#story-91-fixture-completion-story',
  '<!-- v4:references:end -->',
  '',
  '## Risk',
  '',
  '<!-- v4:risk:start -->',
  '- classification: LOW',
  '- invariant: fixture scope remains bounded.',
  '<!-- v4:risk:end -->',
  '',
  '## Dev Agent Record',
  '',
  '<!-- v4:completion:start -->',
  '### AC Evidence / Results',
  '',
  '### Completion Notes',
  '',
  '### File List',
  '',
  '### Change Log',
  '<!-- v4:completion:end -->',
  ''
].join('\n')

function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`)
  return result.stdout.trim()
}

function rawDigest(value) {
  return 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex')
}

function yaml(value, indent = 0) {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) return value.length ? '\n' + value.map(item => `${pad}- ${yaml(item, indent + 2).trimStart()}`).join('\n') : '[]'
  if (value && typeof value === 'object') return (indent ? '\n' : '') + Object.entries(value).map(([key, item]) => `${pad}${key}:${yaml(item, indent + 2).startsWith('\n') ? yaml(item, indent + 2) : ` ${yaml(item, indent + 2)}`}`).join('\n')
  if (value === null) return 'null'
  return JSON.stringify(value)
}

function replacePlan(text, replacements) {
  let next = text
  for (const [key, value] of Object.entries(replacements)) {
    next = next.replace(new RegExp(`^  ${key}: .*\\r?$`, 'm'), `  ${key}: ${value}`)
  }
  return next
}

function buildPlan({ storyDigest, epicDigest, baseline, checkpoint, refs, changedPathsDigest, finalization }) {
  return `---\n${yaml({
    schema_version: 2,
    story_id: '9.1',
    story: { path: STORY, normative_digest: storyDigest },
    upstream_epic: { path: EPIC, section_digest: epicDigest },
    sprint_key: '9-1-fixture',
    lifecycle_snapshot: 'review',
    execution_status: 'complete',
    current_slice: 'A',
    risk: { level: 'LOW' },
    slices: [{
      id: 'A', status: 'reviewed', depends_on: [], task_refs: ['T-1'],
      baseline_commit: baseline, checkpoint_commit: checkpoint,
      subject_digest: storyDigest, changed_paths_sha256: changedPathsDigest,
      receipt_refs: refs,
      verification: { canonical_applicability: 'APPLICABLE', canonical_status: 'PASS', progression_eligible: true },
      review: { required: true, verdict: 'APPROVE', reviewed_commit: checkpoint, freshness: 'FRESH' }
    }],
    blockers: [],
    unresolved_questions: [],
    finalization: {
      receipt_ref: FINALIZATION,
      receipt_digest: stableFinalizationDigest(finalization),
      done_gate_disposition: finalization.done_gate_disposition,
      scope_paths_digest: finalization.scope_paths_digest,
      implementation_commit_set_digest: finalization.implementation_commit_set_digest,
      final_scoped_tree_digest: finalization.final_scoped_tree_digest,
      prepared_from_head: finalization.prepared_from_head
    },
    next_action: { kind: 'complete_story', target: 'story' },
    human_approval: null
  })}\n---\n`
}

export function createCompletionFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-completion-'))
  write(root, STORY, storyText('in-progress'))
  const epicSection = '### Story 9.1: Fixture completion story\n\nDone.\n\n'
  write(root, EPIC, '# Epic\n\n' + epicSection + '### Story 9.2: Next\n')
  write(root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }))
  write(root, SPRINT, 'development_status:\n  9-1-fixture: in-progress\n')
  write(root, 'seed.txt', 'seed\n')
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'baseline')
  const baseline = git(root, 'rev-parse', 'HEAD')
  write(root, 'src/implementation.txt', 'implementation\n')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'checkpoint')
  const checkpoint = git(root, 'rev-parse', 'HEAD')
  const storyDigest = normativeDigest(inspectStory(storyText('review')))
  const epicDigest = rawDigest(epicSection)
  const changedPathsDigest = pathListDigest(['src/implementation.txt'])
  const receiptBase = kind => ({
    schema_version: 1, story_id: '9.1', slice_id: 'A', kind,
    checkpoint_commit: checkpoint, baseline_commit: baseline,
    subject_digest: storyDigest, created_from_head: checkpoint,
    changed_paths_sha256: changedPathsDigest,
    changed_paths: ['src/implementation.txt'],
    commands: [{ command: 'fixture check', exit_code: 0, tool: 'fixture', environment: 'node-test' }]
  })
  const implementation = receiptBase('implementation')
  const verification = {
    ...receiptBase('verification'),
    focused_checks: [{ id: 'focused', result: 'PASS', exit_code: 0, command: 'fixture check' }],
    progression_eligible: true,
    canonical: { applicability: 'APPLICABLE', status: 'PASS', complete: true },
    ac_evidence: [{ id: 'ac-1', ac: 'AC-1', status: 'PASS', contribution: 'fixture behavior checked' }]
  }
  const review = { ...receiptBase('review'), verdict: 'APPROVE', findings_blocking: 0, reviewed_commit: checkpoint, freshness: 'FRESH' }
  const refs = {
    implementation: { path: 'receipts/implementation.json', digest: receiptDigest(implementation) },
    verification: { path: 'receipts/verification.json', digest: receiptDigest(verification) },
    review: { path: 'receipts/review.json', digest: receiptDigest(review) }
  }
  write(root, 'receipts/implementation.json', JSON.stringify(implementation))
  write(root, 'receipts/verification.json', JSON.stringify(verification))
  write(root, 'receipts/review.json', JSON.stringify(review))
  const placeholder = {
    schema_version: 1, kind: 'story_finalization', story_id: '9.1',
    story_normative_digest: storyDigest, upstream_epic_digest: epicDigest,
    prepared_from_head: checkpoint,
    slice_set_digest: stableFinalizationDigest([{ id: 'A' }]),
    receipt_set_digest: stableFinalizationDigest(Object.values(refs)),
    ac_coverage_digest: stableFinalizationDigest([]),
    canonical_disclosures_digest: stableFinalizationDigest([]),
    scope_path_count: 1,
    scope_paths_digest: stableFinalizationDigest(['src/implementation.txt']),
    implementation_commit_set_digest: stableFinalizationDigest([{ slice_id: 'A', checkpoint_commit: checkpoint }]),
    final_scoped_tree_digest: stableFinalizationDigest([{ path: 'src/implementation.txt', blob: git(root, 'rev-parse', checkpoint + ':src/implementation.txt') }]),
    done_gate_disposition: 'SATISFIED', lifecycle_from: 'in-progress', lifecycle_target: 'review'
  }
  write(root, FINALIZATION, JSON.stringify(placeholder))
  write(root, STORY, storyText('review'))
  write(root, SPRINT, 'development_status:\n  9-1-fixture: review\n')
  write(root, PLAN, buildPlan({ storyDigest, epicDigest, baseline, checkpoint, refs, changedPathsDigest, finalization: placeholder }))
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'review fixture draft')
  let head = git(root, 'rev-parse', 'HEAD')
  const inspected = inspectFinalization(root, '9.1', head)
  const finalization = {
    ...placeholder,
    slice_set_digest: inspected.slice_set_digest,
    receipt_set_digest: inspected.receipt_set_digest,
    ac_coverage_digest: stableFinalizationDigest(inspected.ac_coverage),
    canonical_disclosures_digest: stableFinalizationDigest(inspected.canonical_disclosures),
    scope_path_count: inspected.scope.path_count,
    scope_paths_digest: inspected.scope_paths_digest,
    implementation_commit_set_digest: inspected.implementation_commit_set_digest,
    final_scoped_tree_digest: inspected.final_scoped_tree_digest
  }
  write(root, FINALIZATION, JSON.stringify(finalization))
  write(root, PLAN, buildPlan({ storyDigest, epicDigest, baseline, checkpoint, refs, changedPathsDigest, finalization }))
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'review fixture')
  head = git(root, 'rev-parse', 'HEAD')
  return {
    root, head, storyDigest, finalization,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    refreshHead() { this.head = git(root, 'rev-parse', 'HEAD'); return this.head },
    readPlan() { return readFileSync(path.join(root, PLAN), 'utf8') },
    read(relative) { return readFileSync(path.join(root, relative), 'utf8') },
    write(relative, value) { write(root, relative, value) },
    git(...args) { return git(root, ...args) }
  }
}
