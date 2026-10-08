// G3 prep helper (g3-runbook.md). Seeds one disposable G3 smoke Story (99.2 Codex Lead / 99.3 Claude Lead) into
// the smoke worktree. Usage: node g3-seed.mjs <worktree> <2|3> <codex|claude>
// Writes files only; the caller reviews and commits them on the smoke branch.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const [rootArg, number, vendor] = process.argv.slice(2)
if (!rootArg || !['2', '3'].includes(number) || !['codex', 'claude'].includes(vendor)) {
  console.error('usage: node g3-seed.mjs <worktree> <2|3> <codex|claude>')
  process.exit(2)
}
const root = path.resolve(rootArg)
const { inspectStory, normativeDigest } = await import(pathToFileURL(path.join(root, '.agents/scripts/check-artifact-contract.mjs')).href)

const id = `99.${number}`
const key = `99-${number}-g3-${vendor}`
const dir = `tools/g3-smoke/s99${number}`
const files = {
  a: `${dir}/slugify.mjs`, aTest: `${dir}/slugify.test.mjs`,
  b: `${dir}/truncate-words.mjs`, bTest: `${dir}/truncate-words.test.mjs`
}
const storyRel = `_bmad-output/implementation-artifacts/${key}.md`
const planRel = `_bmad-output/implementation-artifacts/story-99-${number}-plan.md`
const sprintRel = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const epicRel = 'docs/g3-smoke/epic-99.md'
const title = `G3 autopilot smoke (${vendor} Lead)`

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

// Stubs exist at base so each feature map can anchor them; the slices replace them.
write(files.a, '// G3 smoke stub: slice A implements slugify (AC-1).\nexport function slugify(text) {\n  throw new Error(\'not implemented\')\n}\n')
write(files.aTest, '// G3 smoke stub: slice A adds node:test coverage for AC-1.\n')
write(files.b, '// G3 smoke stub: slice B implements truncateWords (AC-2).\nexport function truncateWords(text, max) {\n  throw new Error(\'not implemented\')\n}\n')
write(files.bTest, '// G3 smoke stub: slice B adds node:test coverage for AC-2.\n')

// One feature map + recipe per slice: a shared map would report slice A's
// committed change as unexplained drift when slice B is verified.
const registryRel = '.agents/verification/registry.json'
const registry = JSON.parse(readFileSync(path.join(root, registryRel), 'utf8'))
for (const [slice, covered, test] of [['a', [files.a, files.aTest], files.aTest], ['b', [files.b, files.bTest], files.bTest]]) {
  const featureId = `g3-99${number}-${slice}`
  const mapRel = `.agents/features/${featureId}.json`
  const recipeRel = `.agents/verification/${featureId}.json`
  write(mapRel, JSON.stringify({
    schema_version: 2, id: featureId,
    purpose: `Disposable G3 smoke Story ${id}, slice ${slice.toUpperCase()}.`,
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
write(registryRel, JSON.stringify(registry, null, 2) + '\n')

const epic = `# Epic 99: V4 Auto smoke Stories (disposable)\n\n### Story ${id}: ${title}\n\nDisposable G3 smoke Story; never merge.\n`
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
As the architecture owner, I can see a ${vendor} Lead drive one LOW and one MEDIUM AGY slice to the Human Gate under V4 autopilot.
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
- invariant: Disposable G3 smoke Story; never merge.
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
const sprint = readFileSync(path.join(root, sprintRel), 'utf8')
if (!sprint.includes(`  ${key}:`)) {
  const eol = sprint.includes('\r\n') ? '\r\n' : '\n'
  write(sprintRel, sprint.replace(`development_status:${eol}`, `development_status:${eol}  ${key}: in-progress${eol}`))
}
console.log(JSON.stringify({ id, key, storyRel, planRel, epicRel, storyDigest, sectionDigest }))
