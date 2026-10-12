import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'
import { pathListDigest, stableDigest } from './check-story-finalization.mjs'
import * as finalizer from './finalize-story.mjs'
import { buildFinalizationPreview } from './finalize-story.mjs'

import { git, write, digest } from './v4-test-helpers.mjs'
import { createPortableSeedCache } from './v4-test-seed-cache.mjs'

export const STORY = 'docs/story-9-1.md'
export const EPIC = 'docs/product/epics.md'
export const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
export const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
export const FINALIZATION = '_bmad-output/implementation-artifacts/receipts/story-9-1/finalization.json'
export const storyText = [
  '---',
  'story_id: "9.1"',
  'title: Fixture finalization story',
  'status: in-progress',
  '---',
  '',
  '# Story 9.1: Fixture finalization story',
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
  '- AC-2: the second behavior is evidenced.',
  '<!-- v4:ac:end -->',
  '',
  '## Tasks',
  '',
  '<!-- v4:tasks:start -->',
  '- [x] T-1 [AC-1, AC-2]: implement the fixture behavior.',
  '<!-- v4:tasks:end -->',
  '',
  '## References',
  '',
  '<!-- v4:references:start -->',
  '- product: docs/product/epics.md#story-91-fixture-finalization-story',
  '- architecture: docs/architecture/fixture.md#ad-1',
  '<!-- v4:references:end -->',
  '',
  '## Risk',
  '',
  '<!-- v4:risk:start -->',
  '- classification: MEDIUM',
  '- invariant: fixture scope remains bounded.',
  '<!-- v4:risk:end -->',
  ''
].join('\n')

function buildReviewedSeed() {
  const root = mkdtempSync(path.join(tmpdir(), 'finalize-story-'))
  const storyDigest = normativeDigest(inspectStory(storyText))
  const epicSection = '### Story 9.1: Fixture finalization story\n\nDone.\n\n'
  write(root, STORY, storyText)
  write(root, EPIC, '# Epic\n\n' + epicSection + '### Story 9.2: Next\n')
  write(root, 'docs/architecture/fixture.md', '# AD-1\n')
  write(root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }))
  write(root, SPRINT, 'development_status:\n  9-1-fixture: in-progress\n')
  write(root, 'seed.txt', 'seed\n')
  write(root, '.gitattributes', '* text=auto\n')
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
  const changedPathsSha256 = pathListDigest(['src/implementation.txt'])
  const subjectDigest = digest('fixture-subject')
  const refs = {}
  for (const kind of ['implementation', 'verification', 'review']) {
    const receipt = {
      schema_version: 1,
      story_id: '9.1',
      slice_id: 'A',
      kind,
      checkpoint_commit: checkpoint,
      baseline_commit: baseline,
      subject_digest: subjectDigest,
      created_from_head: checkpoint,
      changed_paths_sha256: changedPathsSha256,
      commands: [{ command: 'fixture check', exit_code: 0, tool: 'fixture', environment: 'node-test' }]
    }
    if (kind === 'implementation') receipt.changed_paths = ['src/implementation.txt']
    if (kind === 'verification') {
      receipt.changed_paths = ['src/implementation.txt']
      receipt.focused_checks = [{ id: 'focused', result: 'PASS', exit_code: 0, summary: 'fixture checks passed' }]
      receipt.canonical = { applicability: 'APPLICABLE', status: 'PASS', complete: true }
      receipt.progression_eligible = true
      receipt.ac_evidence = [
        { id: 'ac-1', ac: 'AC-1', result: 'PASS', summary: 'first behavior evidenced' },
        { id: 'ac-2', ac: 'AC-2', result: 'PASS', summary: 'second behavior evidenced' }
      ]
      receipt.done_gate_disclosure = { required: false, coverage_authority: 'focused checks' }
    }
    if (kind === 'review') {
      receipt.required = true
      receipt.verdict = 'APPROVE'
      receipt.findings_total = 0
      receipt.findings_blocking = 0
      receipt.reviewed_commit = checkpoint
      receipt.freshness = { status: 'FRESH_CANDIDATE', reasons: [] }
      receipt.evidence_refs = [{ path: 'src/implementation.txt', hunk_index: 0, body_digest: digest('implementation hunk') }]
      receipt.scope_digest = stableDigest({ paths: ['src/implementation.txt'], refs: receipt.evidence_refs })
      receipt.risk_context_digest = stableDigest({ level: 'MEDIUM' })
    }
    const relative = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-' + kind + '.json'
    write(root, relative, JSON.stringify(receipt, null, 2) + '\n')
    refs[kind] = { path: relative, digest: receiptDigest(receipt) }
  }
  const plan = [
    '---',
    'schema_version: 2',
    'story_id: "9.1"',
    'story:',
    '  path: ' + STORY,
    '  normative_digest: ' + storyDigest,
    'upstream_epic:',
    '  path: ' + EPIC,
    '  section_digest: ' + digest(epicSection),
    'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress',
    'execution_status: in-progress',
    'current_slice: A',
    'risk:',
    '  level: MEDIUM',
    'slices:',
    '  - id: A',
    '    status: reviewed',
    '    depends_on: []',
    '    task_refs: [T-1]',
    '    baseline_commit: ' + baseline,
    '    checkpoint_commit: ' + checkpoint,
    '    subject_digest: ' + subjectDigest,
    '    changed_paths_sha256: ' + changedPathsSha256,
    '    receipt_refs:',
    '      implementation:',
    '        path: ' + refs.implementation.path,
    '        digest: ' + refs.implementation.digest,
    '      verification:',
    '        path: ' + refs.verification.path,
    '        digest: ' + refs.verification.digest,
    '      review:',
    '        path: ' + refs.review.path,
    '        digest: ' + refs.review.digest,
    '    verification:',
    '      canonical_applicability: APPLICABLE',
    '      canonical_status: PASS',
    '      progression_eligible: true',
    '      done_gate_disclosure_required: false',
    '    review:',
    '      required: true',
    '      verdict: APPROVE',
    '      reviewed_commit: ' + checkpoint,
    '      freshness: FRESH_CANDIDATE',
    'blockers: []',
    'unresolved_questions: []',
    'next_action:',
    '  kind: finalize_story',
    '  target: story',
    '---',
    ''
  ].join('\n')
  write(root, PLAN, plan)
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'reviewed fixture')
  return {
    root,
    head: git(root, 'rev-parse', 'HEAD'),
    storyDigest,
    expectedPaths: [FINALIZATION, PLAN, SPRINT, STORY],
    cleanup: () => rmSync(root, { recursive: true, force: true })
  }
}

// Only the no-argument reviewed seed proved portable by T0 is admitted. The
// original builder ignores arguments; keep that behavior for unproven callers.
const cachedReviewedSeed = createPortableSeedCache({
  prefix: 'finalize-story-copy-',
  build: buildReviewedSeed,
  key: argumentCount => {
    if (argumentCount !== 0) return null
    if (Object.keys(process.env).some(key => /^(GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_INDEX_FILE|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_TEMPLATE_DIR)$/i.test(key))) return null
    // Query outside a repository: local checkout config is not inherited by
    // git init in a temp repo. Custom hooks/templates/conditional config need
    // their own portability proof and therefore retain the original builder.
    const config = spawnSync('git', ['config', '--list', '--show-origin'], {
      cwd: tmpdir(), encoding: 'utf8', windowsHide: true
    })
    if (config.status !== 0 || /\t(?:init\.templatedir|core\.(?:hookspath|fsmonitor|worktree|bare)|include(?:if\.[^\t=]+)?\.path)=/i.test(config.stdout)) return null
    // Include all local module bytes, conservatively covering the transitive
    // digest/parser sources as well as this builder and the shared copy helper.
    const sourceRoot = new URL('./', import.meta.url)
    const sources = readdirSync(sourceRoot).filter(name => name.endsWith('.mjs')).sort()
      .map(name => [name, digest(readFileSync(new URL(name, sourceRoot)))])
    return digest(JSON.stringify({
      variant: 'reviewed/default-no-arguments', sources, gitConfig: config.stdout,
      cwd: process.cwd(), temp: tmpdir(), node: [process.execPath, process.version, process.platform, process.arch],
      environment: Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b))
    }))
  }
})

export function fixture() {
  return cachedReviewedSeed(arguments.length)
}

export function candidate(f, crlf = false) {
  const preview = buildFinalizationPreview(f.root, '9.1', f.head)
  for (const [relative, bytes] of [
    [STORY, preview.nextStoryBytes], [PLAN, preview.nextPlanBytes],
    [SPRINT, preview.nextSprintBytes], [FINALIZATION, JSON.stringify(preview.receipt, null, 2) + '\n']
  ]) write(f.root, relative, crlf ? bytes.replace(/\r?\n/g, '\r\n') : bytes)
  return preview
}

export function preserved(f) {
  const journals = path.join(f.root, '.git/noteflow-v4-finalization-recovery')
  return {
    head: git(f.root, 'rev-parse', 'HEAD'),
    index: digest(readFileSync(path.join(f.root, '.git/index'))),
    status: git(f.root, '--no-optional-locks', 'status', '--porcelain=v1', '-uall'),
    files: f.expectedPaths.map(p => digest(readFileSync(path.join(f.root, p)))),
    worktree: git(f.root, 'ls-files', '-z').split('\0').filter(Boolean).sort().map(p => [p, digest(readFileSync(path.join(f.root, p)))]),
    journals: existsSync(journals) ? readdirSync(journals).sort().map(p => [p, digest(readFileSync(path.join(journals, p)))]) : [],
    index_lock: existsSync(path.join(f.root, '.git/index.lock')) ? digest(readFileSync(path.join(f.root, '.git/index.lock'))) : null,
    lock: existsSync(path.join(f.root, '.git/v4-finalize-story.lock'))
      ? readFileSync(path.join(f.root, '.git/v4-finalize-story.lock'), 'utf8') : null
  }
}
