// G5 prep helper (g5-runbook.md). Seeds both disposable G5 Stories (99.4 Codex Lead, 99.5 Claude Lead) into the
// sandbox clone's main checkout in one base commit, so the two Story branches share no seeded file and merge cleanly.
// Usage: node g5-seed.mjs <sandbox-main-checkout>
// Writes files only; the caller reviews and commits them on the sandbox main.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const [rootArg] = process.argv.slice(2)
if (!rootArg) {
  console.error('usage: node g5-seed.mjs <sandbox-main-checkout>')
  process.exit(2)
}
const root = path.resolve(rootArg)
const { inspectStory, normativeDigest } = await import(pathToFileURL(path.join(root, '.agents/scripts/check-artifact-contract.mjs')).href)

const sprintRel = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const registryRel = '.agents/verification/registry.json'
const write = (relative, text) => {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}
const blob = relative => {
  const result = spawnSync('git', ['hash-object', '--', relative], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`hash-object failed: ${relative}`)
  return result.stdout.trim()
}

const registry = JSON.parse(readFileSync(path.join(root, registryRel), 'utf8'))
let sprint = readFileSync(path.join(root, sprintRel), 'utf8')
const eol = sprint.includes('\r\n') ? '\r\n' : '\n'
const seeded = []

// 99.4's sprint key goes at the top and 99.5's at the end: each complete_story
// edits only its own line, and the two lines are never adjacent, so the second
// integration merges without a lifecycle conflict.
for (const [number, vendor, placement] of [['4', 'codex', 'top'], ['5', 'claude', 'end']]) {
  const id = `99.${number}`
  const key = `99-${number}-g5-${vendor}`
  const dir = `tools/g5-smoke/s99${number}`
  const files = {
    a: `${dir}/slugify.mjs`, aTest: `${dir}/slugify.test.mjs`,
    b: `${dir}/truncate-words.mjs`, bTest: `${dir}/truncate-words.test.mjs`
  }
  const storyRel = `_bmad-output/implementation-artifacts/${key}.md`
  const planRel = `_bmad-output/implementation-artifacts/story-99-${number}-plan.md`
  const epicRel = `docs/g5-smoke/epic-99-${number}.md`
  const title = `G5 parallel smoke (${vendor} Lead)`

  // Stubs exist at base so each feature map can anchor them; the slices replace them.
  write(files.a, '// G5 smoke stub: slice A implements slugify (AC-1).\nexport function slugify(text) {\n  throw new Error(\'not implemented\')\n}\n')
  write(files.aTest, '// G5 smoke stub: slice A adds node:test coverage for AC-1.\n')
  write(files.b, '// G5 smoke stub: slice B implements truncateWords (AC-2).\nexport function truncateWords(text, max) {\n  throw new Error(\'not implemented\')\n}\n')
  write(files.bTest, '// G5 smoke stub: slice B adds node:test coverage for AC-2.\n')

  // One feature map + recipe per slice: a shared map would report slice A's
  // committed change as unexplained drift when slice B is verified.
  for (const [slice, covered, test] of [['a', [files.a, files.aTest], files.aTest], ['b', [files.b, files.bTest], files.bTest]]) {
    const featureId = `g5-99${number}-${slice}`
    const mapRel = `.agents/features/${featureId}.json`
    const recipeRel = `.agents/verification/${featureId}.json`
    write(mapRel, JSON.stringify({
      schema_version: 2, id: featureId,
      purpose: `Disposable G5 smoke Story ${id}, slice ${slice.toUpperCase()}.`,
      scope_boundary: 'Smoke helper only; proves nothing about product behavior.',
      covered_paths: [...covered].sort(),
      anchor_blobs: Object.fromEntries([...covered].sort().map(item => [item, blob(item)]))
    }, null, 2) + '\n')
    write(recipeRel, JSON.stringify({
      schema_version: 1, featureId, featureMap: mapRel,
      checks: [
        { id: 'map', cwd: '.', argv: ['node', '.agents/scripts/check-feature-map.mjs', 'check', mapRel] },
        { id: 'tests', cwd: '.', argv: ['node', '--test', test] }
      ]
    }, null, 2) + '\n')
    if (!registry.recipes.some(entry => entry.featureId === featureId)) registry.recipes.push({ featureId, path: recipeRel, enabled: true })
  }

  // One epic file per Story keeps each upstream section independent.
  const epic = `# Epic 99: V4 Auto G5 smoke Story ${id} (disposable)\n\n### Story ${id}: ${title}\n\nDisposable G5 smoke Story; merged only into the G5 sandbox clone.\n`
  write(epicRel, epic)
  const section = epic.slice(epic.indexOf(`### Story ${id}:`))
  const sectionDigest = 'sha256:' + createHash('sha256').update(section, 'utf8').digest('hex')

  const story = `---
story_id: "${id}"
title: ${title}
status: in-progress
---

# Story ${id}: ${title}

## Story

<!-- v4:story:start -->
As the architecture owner, I can see a ${vendor} Lead drive one LOW and one MEDIUM AGY slice to the Human Gate while another Story runs in parallel, then integrate through the tested merge queue.
<!-- v4:story:end -->

## Acceptance Criteria

<!-- v4:ac:start -->
- AC-1: \`${files.a}\` exports \`slugify(text)\` that lowercases, trims, replaces each run of characters outside \`a-z0-9\` with a single \`-\`, and strips leading/trailing \`-\` (\`"  Hello, World!  "\` -> \`"hello-world"\`); it throws \`TypeError\` when \`text\` is not a string.
- AC-2: \`${files.b}\` exports \`truncateWords(text, max)\` that returns the first \`max\` whitespace-separated words of \`text\` joined by single spaces (\`truncateWords("  a  b c ", 2)\` -> \`"a b"\`); it throws \`TypeError\` when \`text\` is not a string and \`RangeError\` when \`max\` is not a positive integer.
<!-- v4:ac:end -->

## Tasks

<!-- v4:tasks:start -->
- [ ] T-1 [AC-1]: Implement \`${files.a}\` and its node:test file \`${files.aTest}\`.
- [ ] T-2 [AC-2]: Implement \`${files.b}\` and its node:test file \`${files.bTest}\`.
<!-- v4:tasks:end -->

## Readiness

<!-- v4:readiness:start -->
- result: ready
- dependencies: none
<!-- v4:readiness:end -->

## Risk

<!-- v4:risk:start -->
- level: MEDIUM
- invariant: Disposable G5 smoke Story; merged only into the G5 sandbox clone.
- invariant: Only the four files under ${dir}/ change; no dependency, config or product module changes.
<!-- v4:risk:end -->
`
  const storyDigest = normativeDigest(inspectStory(story))
  const plan = `---
schema_version: 2
story_id: "${id}"
story:
  path: ${storyRel}
  normative_digest: ${storyDigest}
upstream_epic:
  path: ${epicRel}
  section_digest: ${sectionDigest}
sprint_key: ${key}
lifecycle_snapshot: in-progress
execution_status: in-progress
current_slice: A
risk:
  level: MEDIUM
slices:
  - id: A
    status: pending
    task_refs: [T-1]
    depends_on: []
    executor: lead
    risk:
      level: LOW
    scope:
      paths: [${files.a}, ${files.aTest}]
    verification_obligations: [node --test ${files.aTest}]
  - id: B
    status: pending
    task_refs: [T-2]
    depends_on: [A]
    executor: agy
    risk:
      level: MEDIUM
    scope:
      paths: [${files.b}, ${files.bTest}]
    verification_obligations: [node --test ${files.bTest}]
blockers: []
unresolved_questions: []
next_action:
  kind: implement_slice
  target: A
---
`
  write(storyRel, story)
  write(planRel, plan)
  if (!sprint.includes(`  ${key}:`)) {
    const line = `  ${key}: in-progress${eol}`
    sprint = placement === 'top'
      ? sprint.replace(`development_status:${eol}`, `development_status:${eol}${line}`)
      : sprint.replace(/(\r?\n)?$/, `${eol}${line}`)
  }
  seeded.push({ id, key, storyRel, planRel, epicRel, storyDigest, sectionDigest })
}

write(registryRel, JSON.stringify(registry, null, 2) + '\n')
write(sprintRel, sprint)
console.log(JSON.stringify(seeded))
