// Overnight queue runner (MVP): see .agents/docs/v4-overnight-runner-design.md.
// `prepare` runs while the owner is present; `run` advances each prepared Story
// unattended until its next human stop and writes a morning report. The driver
// never runs owner operations, never integrates and never pushes.
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { frontmatter } from './check-story-plan.mjs'

const STORY_ID = /^\d+\.\d+$/
const SHA = /^[0-9a-f]{40}$/
const STATE_DIR = '.agent-state/overnight'
const SETTINGS = '.agents/config/overnight-settings.json'
const CHILD_TOOLS = 'Bash,Read,Edit,Write,Glob,Grep'
const HUMAN_STOP = new Set(['HUMAN_GATE', 'HUMAN_REVIEW_REQUIRED', 'HUMAN_REQUIRED', 'NEEDS_HUMAN', 'REVOKED', 'NO_AUTHORIZATION'])
const HEARTBEAT_STATE = { implement_slice: 'IMPLEMENTING', verify_slice: 'REVIEWING', finalize_story: 'REVIEWING' }

// ---------- shared helpers ----------

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function planRelative(storyId) {
  return `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`
}

export function storyToken(storyId) {
  return `story-${storyId.replace('.', '-')}`
}

function defaultExec(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd, input: options.input, encoding: 'utf8', windowsHide: true,
    timeout: options.timeoutMs ?? 120000, maxBuffer: 64 * 1024 * 1024,
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.code ?? null }
}

function json(result) {
  try { return JSON.parse(result.stdout.trim().split(/\r?\n/).pop()) } catch { return null }
}

function git(ctx, cwd, args) {
  const result = ctx.exec('git', ['--no-optional-locks', ...args], { cwd })
  if (result.status !== 0) throw new Error(`GIT_FAILED:${args[0]}`)
  return result.stdout.trim()
}

function node(ctx, cwd, script, args, timeoutMs) {
  return json(ctx.exec(process.execPath, [`.agents/scripts/${script}`, ...args], { cwd, timeoutMs })) ?? { status: 'ERROR', reasons: ['UNPARSEABLE_OUTPUT'] }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function resolveClaude(env = process.env) {
  if (env.OVERNIGHT_CLAUDE) return env.OVERNIGHT_CLAUDE
  const shimTarget = env.APPDATA && path.join(env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  return shimTarget && existsSync(shimTarget) ? shimTarget : 'claude'
}

// ---------- queue and recipe coverage ----------

export function validateQueue(queue) {
  const reasons = []
  if (!queue || queue.schemaVersion !== 1 || !Array.isArray(queue.stories) || !queue.stories.length) return ['QUEUE_INVALID']
  const ids = new Set()
  for (const entry of queue.stories) {
    const keys = Object.keys(entry ?? {})
    if (!STORY_ID.test(entry?.id ?? '') || keys.some(key => !['id', 'budgets', 'checks'].includes(key))) { reasons.push(`QUEUE_ENTRY_INVALID:${entry?.id ?? '?'}`); continue }
    if (ids.has(entry.id)) reasons.push(`QUEUE_DUPLICATE:${entry.id}`)
    ids.add(entry.id)
    const budgets = entry.budgets ?? {}
    if (Object.keys(budgets).some(key => !['max_slices', 'max_rework_per_slice', 'max_minutes_per_slice'].includes(key))) reasons.push(`QUEUE_BUDGETS_INVALID:${entry.id}`)
    if (entry.checks !== undefined && (!Array.isArray(entry.checks) || entry.checks.some(check => typeof check !== 'string' || !check.trim()))) reasons.push(`QUEUE_CHECKS_INVALID:${entry.id}`)
  }
  return reasons
}

export function coveredPaths(root) {
  const registry = readJson(path.join(root, '.agents/verification/registry.json'))
  const covered = new Set()
  for (const entry of registry.recipes ?? []) {
    if (entry?.enabled === false) continue
    const recipe = readJson(path.join(root, entry.path))
    const map = readJson(path.join(root, recipe.featureMap))
    const paths = map.schema_version === 2 ? map.covered_paths : Object.keys(map.anchor_blobs ?? {})
    for (const item of paths ?? []) covered.add(item)
  }
  return covered
}

export function uncoveredSlicePaths(plan, covered) {
  return (plan.slices ?? []).flatMap(slice => (slice?.scope?.paths ?? []).filter(item => !covered.has(item)).map(item => `${slice.id}:${item}`))
}

// ---------- prepare (owner present) ----------

export function authorizeCommand(storyId, head, budgets) {
  const payload = JSON.stringify({ action: 'authorize_autopilot', story_id: storyId, budgets: budgets ?? {}, lead_vendor: 'claude' })
  return `node .agents/scripts/v4-story-runner.mjs run ${storyId} --expected-head ${head} --authorize-autopilot '${payload}'`
}

function findStoryWorktree(ctx, root, storyId) {
  const owner = new RegExp(`(^|[/_-])${storyToken(storyId)}($|[/_-])`)
  const listing = git(ctx, root, ['worktree', 'list', '--porcelain']).split(/\r?\n\r?\n/)
  for (const block of listing) {
    const worktree = /^worktree (.+)$/m.exec(block)?.[1]
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]
    if (worktree && branch && owner.test(branch)) return { worktree: path.resolve(worktree), branch }
  }
  return null
}

export function prepareStory(ctx, entry, session) {
  const root = ctx.root
  const planFile = path.join(root, planRelative(entry.id))
  if (!existsSync(planFile)) return { id: entry.id, status: 'REFUSED', reasons: ['PLAN_MISSING'] }
  const plan = frontmatter(readFileSync(planFile, 'utf8'))
  const uncovered = uncoveredSlicePaths(plan, coveredPaths(root))
  if (uncovered.length) return { id: entry.id, status: 'REFUSED', reasons: ['RECIPE_COVERAGE_MISSING'], uncovered }
  if (findStoryWorktree(ctx, root, entry.id)) return { id: entry.id, status: 'REFUSED', reasons: ['STORY_WORKTREE_EXISTS'] }

  const created = ctx.exec(ctx.orca, ['worktree', 'create', '--name', storyToken(entry.id), '--repo', `path:${root}`, '--base-branch', 'main', '--setup', 'skip', '--json'], { cwd: root, timeoutMs: 300000 })
  if (created.status !== 0) return { id: entry.id, status: 'REFUSED', reasons: ['ORCA_WORKTREE_CREATE_FAILED'], detail: created.stderr.trim().slice(0, 400) }
  const located = findStoryWorktree(ctx, root, entry.id)
  if (!located) return { id: entry.id, status: 'REFUSED', reasons: ['STORY_WORKTREE_NOT_FOUND'] }
  const { worktree } = located

  const claim = node(ctx, worktree, 'story-registry.mjs', ['claim', entry.id, '--worktree', worktree, '--lead-vendor', 'claude', '--session', session])
  const generation = claim.record?.generation
  if (!Number.isInteger(generation)) return { id: entry.id, status: 'REFUSED', reasons: ['CLAIM_FAILED', ...(claim.reasons ?? [])], worktree }

  const baseHead = git(ctx, worktree, ['rev-parse', 'HEAD'])
  const check = node(ctx, worktree, 'start-story.mjs', ['check', entry.id, '--expected-head', baseHead])
  if (check.status !== 'READY') return { id: entry.id, status: 'REFUSED', reasons: ['START_NOT_READY', ...(check.reasons ?? [])], worktree, generation }
  const apply = node(ctx, worktree, 'start-story.mjs', ['apply', entry.id, '--expected-head', baseHead, '--fingerprint', check.fingerprint])
  if (!['STARTED', 'APPLIED'].includes(apply.status)) return { id: entry.id, status: 'REFUSED', reasons: ['START_APPLY_FAILED', ...(apply.reasons ?? [])], worktree, generation }

  for (const dir of ['frontend', 'tests/e2e']) {
    const touches = (plan.slices ?? []).some(slice => (slice?.scope?.paths ?? []).some(item => item.startsWith(`${dir}/`)))
    if (touches && existsSync(path.join(worktree, dir, 'package-lock.json'))) {
      const install = ctx.exec(ctx.npm[0], [...ctx.npm.slice(1), 'ci'], { cwd: path.join(worktree, dir), timeoutMs: 600000 })
      if (install.status !== 0) return { id: entry.id, status: 'REFUSED', reasons: [`NPM_CI_FAILED:${dir}`], worktree, generation }
    }
  }
  const head = git(ctx, worktree, ['rev-parse', 'HEAD'])
  return { id: entry.id, status: 'PREPARED', worktree, generation, session, checks: entry.checks ?? [],
    authorize: authorizeCommand(entry.id, head, entry.budgets) }
}

export function prepare(ctx, queuePath) {
  const queue = readJson(queuePath)
  const reasons = validateQueue(queue)
  if (reasons.length) return { status: 'INVALID', reasons }
  const statePath = path.join(ctx.root, STATE_DIR, 'state.json')
  const previous = existsSync(statePath) ? readJson(statePath).stories ?? [] : []
  const session = `overnight-${randomUUID()}`
  const stories = queue.stories.map(entry => previous.some(story => story.id === entry.id)
    ? { id: entry.id, status: 'ALREADY_PREPARED', reasons: [] } : prepareStory(ctx, entry, session))
  // Earlier prepared Stories keep their claim and generation, so later nights resume them.
  const kept = [...previous, ...stories.filter(story => story.status === 'PREPARED')]
  writeJson(statePath, { schemaVersion: 1, preparedAt: ctx.now().toISOString(), stories: kept })
  return { status: 'READY', session, stories, prepared: kept.map(story => story.id) }
}

// ---------- night baseline ----------

function walkFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walkFiles(full) : entry.isFile() ? [full] : []
  }).sort()
}

function fileDigest(file) {
  return existsSync(file) && statSync(file).isFile() ? sha256(readFileSync(file)) : null
}

function humanNodes(value, trail = '') {
  if (!value || typeof value !== 'object') return []
  const found = []
  for (const [key, child] of Object.entries(value)) {
    const where = `${trail}/${key}`
    if (/human|approval|autopilot|owner/i.test(key)) found.push([where, child])
    else if (child && typeof child === 'object' && child.type === 'human') found.push([where, child])
    else found.push(...humanNodes(child, where))
  }
  return found
}

export function humanEvidence(worktree, storyId) {
  const planFile = path.join(worktree, planRelative(storyId))
  const plan = existsSync(planFile) ? frontmatter(readFileSync(planFile, 'utf8')) : null
  const receiptsDir = path.join(worktree, '_bmad-output/implementation-artifacts/receipts', storyToken(storyId))
  // Structural, like the Plan: a receipt counts only through human/approval/
  // autopilot/owner keys or a {type: "human"} node. Matching the raw text flagged
  // every implementation receipt naming a test such as ProvisionOwnerCommandTest
  // (M3 pilot, 2026-11-08). An unparseable receipt is hashed whole.
  const receipts = walkFiles(receiptsDir).map(file => {
    const name = path.relative(worktree, file).replaceAll('\\', '/')
    const text = readFileSync(file, 'utf8')
    let parsed
    try { parsed = JSON.parse(text) } catch { return [name, sha256(text)] }
    const nodes = humanNodes(parsed)
    return nodes.length ? [name, sha256(JSON.stringify(nodes))] : null
  }).filter(Boolean)
  return sha256(JSON.stringify({ plan: humanNodes(plan), receipts }))
}

export function captureBaseline(ctx, stories) {
  const common = path.resolve(ctx.root, git(ctx, ctx.root, ['rev-parse', '--git-common-dir']))
  const registry = node(ctx, ctx.root, 'story-registry.mjs', ['status', '--json'])
  const holders = Object.fromEntries((registry.records ?? []).map(record => [record.storyId,
    { generation: record.generation, session: record.lead?.sessionId ?? null, worktree: record.worktree ?? null }]))
  return {
    main: git(ctx, ctx.root, ['rev-parse', 'refs/heads/main']),
    canonicalStatus: git(ctx, ctx.root, ['status', '--porcelain']),
    settings: fileDigest(path.join(ctx.root, SETTINGS)),
    hooks: walkFiles(path.join(common, 'hooks')).map(file => [path.basename(file), fileDigest(file)]),
    gitConfig: fileDigest(path.join(common, 'config')),
    stories: Object.fromEntries(stories.map(story => [story.id, {
      human: humanEvidence(story.worktree, story.id),
      registry: holders[story.id] ?? null,
      claudeSettings: ['.claude/settings.json', '.claude/settings.local.json'].map(name => fileDigest(path.join(story.worktree, name))),
    }])),
  }
}

export function baselineViolations(before, after) {
  const violations = []
  for (const key of ['main', 'canonicalStatus', 'settings', 'gitConfig']) if (before[key] !== after[key]) violations.push(key.toUpperCase())
  if (JSON.stringify(before.hooks) !== JSON.stringify(after.hooks)) violations.push('GIT_HOOKS')
  for (const [id, story] of Object.entries(before.stories)) {
    const now = after.stories[id]
    if (story.human !== now?.human) violations.push(`HUMAN_EVIDENCE:${id}`)
    if (JSON.stringify(story.registry) !== JSON.stringify(now?.registry)) violations.push(`REGISTRY:${id}`)
    if (JSON.stringify(story.claudeSettings) !== JSON.stringify(now?.claudeSettings)) violations.push(`STORY_SETTINGS:${id}`)
  }
  return violations
}

// ---------- run (unattended) ----------

export function childPrompt(story, status, head) {
  return [
    `Overnight runner child. You are the V4 Lead for Story ${story.id} in this worktree (${story.worktree}), registry generation ${story.generation}.`,
    'This is an explicit Story request for exactly one V4 Runner action. Read AGENTS.md and the router as usual.',
    'Before building any Runner payload, read .agents/skills/v4-story-runner/references/runner-payloads.md in this worktree if it exists; it lists the prepare-then-act sequence, payload fields, plan_template tokens and Windows pitfalls.',
    `Run: node .agents/scripts/v4-story-runner.mjs autopilot-status ${story.id} --expected-head ${head} --lead-generation ${story.generation}`,
    `If it returns CONTINUE, load only the action contract for next_action (${status.next_action?.kind}) and run that one action to its next durable state, passing --lead-generation ${story.generation} to Lead writes. Then stop.`,
    'Never run owner operations, never integrate, push, commit by hand, or edit control-plane or BMAD files. If the action reaches a human or blocked stop, report it and stop.',
    'Permissions are a fixed allowlist with no prompts. Run exactly one command per Bash call: no ;, &&, || or pipes, and no echo $? (the exit code is reported to you). Use Read, Glob and Grep instead of cat, ls, find or head.',
    'Stay inside this worktree. Do not read the canonical checkout: the driver already checked its .agent-state pointer, and this worktree has none.',
    'Checks, spelled exactly: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 test (or e2e); focused backend runs as MSYS_NO_PATHCONV=1 docker exec -w /workspace/backend <container> php artisan test --filter=<Name>, and the same prefix with vendor/bin/pint --test or composer analyse, where <container> is the noteflow-test-*-backend-test-1 name from docker ps; frontend and e2e scripts as npm --prefix frontend run <script> and npm --prefix tests/e2e run <script>.',
    'For an executor: agy slice, follow references/agy-executor.md and references/agy-transport.md: Orca is allowed only as orca orchestration <subcommand> and orca terminal <subcommand>, spelled as those files spell them. Do not probe with orca --help or any other orca command; a denied probe is not a blocker.',
    `A slice whose current_attempt.attempt_id is above 1 is a correction: its VALID findings are the findings array of the Lead's prepare-rework payload at .agent-state/v4-scratch/rework-${String(story.id).replace('.', '-')}-<slice>.json in this worktree. For an AGY slice, build the contract with --correction-of <the prior attempt's report-attempt-<n>.json under .agent-state/v4-auto/workers/<task-id>/> and one --finding "<id>: <summary>" per finding, and reopen the same Orca Task as agy-executor.md says. If that file is missing, stop with BLOCKED.`,
    'For verify_slice, run every Plan verification obligation that no check spec holds, such as powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 e2e, after verify and before stopping. If any fails, stop with FAILED and name the failing obligation and tests; never report HUMAN_REVIEW_REQUIRED while an obligation fails or was not run.',
    'If a needed command is still denied, stop with BLOCKED and quote the exact denied command; do not try variants.',
    'End your reply with exactly one line: OVERNIGHT_RESULT <DONE|HUMAN_REVIEW_REQUIRED|HUMAN_REQUIRED|NEEDS_HUMAN|BLOCKED|FAILED> <short reason>',
  ].join('\n')
}

export function childResult(text) {
  const line = String(text ?? '').split(/\r?\n/).reverse().find(item => item.trim().startsWith('OVERNIGHT_RESULT '))
  const [, status = 'UNKNOWN', ...reason] = (line ?? 'OVERNIGHT_RESULT UNKNOWN no result line').trim().split(/\s+/)
  return { status, reason: reason.join(' ') }
}

function spawnChild(ctx, runDir, story, status, head, index) {
  const args = ['-p', '--restricted', '--tools', CHILD_TOOLS, '--settings', path.join(ctx.root, SETTINGS),
    '--strict-mcp-config', '--permission-prompts', 'none', '--output-format', 'json']
  if (story.checks?.length) args.push('--allowedTools', ...story.checks.map(check => `Bash(${check})`))
  const result = ctx.exec(ctx.claude, args, { cwd: story.worktree, input: childPrompt(story, status, head), timeoutMs: ctx.childTimeoutMs })
  writeFileSync(path.join(runDir, `child-${index}-${story.id}.json`), result.stdout || result.stderr || '')
  let parsed = null
  try { parsed = JSON.parse(result.stdout) } catch {}
  return { exit: result.status, error: result.error, ...childResult(parsed?.result ?? result.stdout),
    denials: (parsed?.permission_denials ?? []).map(item => item.tool_input?.command ?? item.tool_input?.file_path ?? item.tool_name) }
}

export function preflight(ctx) {
  const reasons = []
  const pointer = path.join(ctx.root, '.agent-state/active-run.json')
  try { if (readJson(pointer).status !== 'IDLE') reasons.push('POINTER_NOT_IDLE') } catch { reasons.push('POINTER_UNREADABLE') }
  if (git(ctx, ctx.root, ['branch', '--show-current']) !== 'main') reasons.push('CANONICAL_NOT_ON_MAIN')
  if (git(ctx, ctx.root, ['status', '--porcelain']) !== '') reasons.push('CANONICAL_NOT_CLEAN')
  if (!existsSync(path.join(ctx.root, SETTINGS))) reasons.push('SETTINGS_MISSING')
  if (ctx.exec('docker', ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 30000 }).status !== 0) reasons.push('DOCKER_UNAVAILABLE')
  return reasons
}

export function runStory(ctx, story, runDir, baseline, counter) {
  const log = { id: story.id, actions: [], stop: null }
  let previous = null
  for (let step = 0; step < ctx.maxActions; step++) {
    if (ctx.now() >= ctx.deadline) { log.stop = { kind: 'DEADLINE', reasons: ['DEADLINE_REACHED'] }; return log }
    const head = git(ctx, story.worktree, ['rev-parse', 'HEAD'])
    const status = node(ctx, story.worktree, 'v4-story-runner.mjs', ['autopilot-status', story.id, '--expected-head', head, '--lead-generation', String(story.generation)])
    if (status.status !== 'CONTINUE') {
      const human = (status.reasons ?? []).some(reason => HUMAN_STOP.has(reason))
      node(ctx, story.worktree, 'story-registry.mjs', ['heartbeat', story.id, '--generation', String(story.generation), '--state', human ? 'WAITING_HUMAN' : 'BLOCKED'])
      log.stop = { kind: human ? 'HUMAN_STOP' : 'BLOCKED', reasons: status.reasons ?? [], next_action: status.next_action ?? null, budgets: status.budgets_remaining ?? null }
      return log
    }
    const kind = status.next_action?.kind
    const marker = `${head}:${kind}:${status.next_action?.slice_id ?? ''}`
    if (marker === previous) { log.stop = { kind: 'BLOCKED', reasons: ['NO_PROGRESS'], next_action: status.next_action }; return log }
    previous = marker
    node(ctx, story.worktree, 'story-registry.mjs', ['heartbeat', story.id, '--generation', String(story.generation), '--state', HEARTBEAT_STATE[kind] ?? 'IMPLEMENTING'])
    counter.value += 1
    const child = spawnChild(ctx, runDir, story, status, head, counter.value)
    log.actions.push({ kind, slice: status.next_action?.slice_id ?? null, head, ...child })
    const violations = baselineViolations(baseline, captureBaseline(ctx, ctx.stories))
    if (violations.length) { log.stop = { kind: 'RUN_STOP', reasons: violations }; return log }
    if (['HUMAN_REVIEW_REQUIRED', 'HUMAN_REQUIRED', 'NEEDS_HUMAN', 'BLOCKED', 'FAILED'].includes(child.status)) {
      const human = child.status !== 'BLOCKED' && child.status !== 'FAILED'
      node(ctx, story.worktree, 'story-registry.mjs', ['heartbeat', story.id, '--generation', String(story.generation), '--state', human ? 'WAITING_HUMAN' : 'BLOCKED'])
      log.stop = { kind: human ? 'HUMAN_STOP' : 'BLOCKED', reasons: [child.status], detail: child.reason, next_action: status.next_action }
      return log
    }
  }
  log.stop = { kind: 'BLOCKED', reasons: ['MAX_ACTIONS'] }
  return log
}

export function renderReport(report) {
  const lines = [`# Overnight run ${report.runId}`, '', `Started ${report.startedAt}, finished ${report.finishedAt}. ${report.summary}`, '']
  if (report.runStop) lines.push('## Run stopped', '', `- ${report.runStop.join(', ')}`, '')
  lines.push('## Needs you', '')
  for (const story of report.stories) {
    const stop = story.stop ?? { kind: 'NOT_RUN', reasons: [] }
    lines.push(`### Story ${story.id}: ${stop.kind}`, '', `- Reasons: ${stop.reasons.join(', ') || 'none'}`)
    if (stop.next_action) lines.push(`- Next action: ${stop.next_action.kind}${stop.next_action.slice_id ? ` (slice ${stop.next_action.slice_id})` : ''}`)
    if (stop.detail) lines.push(`- Child said: ${stop.detail}`)
    lines.push(`- Actions run: ${story.actions.length}${story.actions.length ? ` (${story.actions.map(action => `${action.kind}${action.slice ? `/${action.slice}` : ''}→${action.status}`).join(', ')})` : ''}`)
    const denials = story.actions.flatMap(action => action.denials ?? [])
    if (denials.length) lines.push(`- Permission denials: ${denials.join(' | ')}`)
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

export function run(ctx) {
  const runId = ctx.now().toISOString().replace(/[:.]/g, '-')
  const runDir = path.join(ctx.root, STATE_DIR, runId)
  mkdirSync(runDir, { recursive: true })
  const report = { runId, startedAt: ctx.now().toISOString(), finishedAt: null, summary: '', runStop: null, stories: [] }
  const finish = () => {
    report.finishedAt = ctx.now().toISOString()
    const stopped = report.stories.filter(story => story.stop?.kind === 'HUMAN_STOP').length
    report.summary = `${report.stories.length} Stories run, ${stopped} waiting for you${report.runStop ? ', run stopped early' : ''}.`
    writeJson(path.join(runDir, 'report.json'), report)
    writeFileSync(path.join(runDir, 'report.md'), renderReport(report))
    return { status: report.runStop ? 'RUN_STOPPED' : 'DONE', report: path.join(runDir, 'report.md') }
  }
  const statePath = path.join(ctx.root, STATE_DIR, 'state.json')
  if (!existsSync(statePath)) { report.runStop = ['NOT_PREPARED']; return finish() }
  const preflightReasons = preflight(ctx)
  if (preflightReasons.length) { report.runStop = preflightReasons; return finish() }
  const prepared = readJson(statePath).stories ?? []
  ctx.stories = prepared
  let baseline = captureBaseline(ctx, ctx.stories)
  // A Story whose registry claim is gone was integrated or aborted: drop it from the state.
  const released = prepared.filter(story => !baseline.stories[story.id]?.registry)
  if (released.length) {
    ctx.stories = prepared.filter(story => !released.includes(story))
    writeJson(statePath, { ...readJson(statePath), stories: ctx.stories })
    for (const story of released) report.stories.push({ id: story.id, actions: [], stop: { kind: 'RELEASED', reasons: ['REGISTRY_CLAIM_GONE'] } })
    baseline = captureBaseline(ctx, ctx.stories)
  }
  const counter = { value: 0 }
  for (const story of ctx.stories) {
    const log = runStory(ctx, story, runDir, baseline, counter)
    report.stories.push(log)
    if (log.stop?.kind === 'RUN_STOP') { report.runStop = log.stop.reasons; break }
    if (log.stop?.kind === 'DEADLINE') break
  }
  return finish()
}

// ---------- CLI ----------

function context(root, options = {}) {
  return {
    root, exec: defaultExec, now: () => new Date(), claude: resolveClaude(), orca: 'orca',
    npm: process.platform === 'win32' ? ['cmd.exe', '/d', '/s', '/c', 'npm'] : ['npm'],
    deadline: options.deadline ?? new Date(Date.now() + 8 * 3600 * 1000),
    maxActions: options.maxActions ?? 20, childTimeoutMs: options.childTimeoutMs ?? 2 * 3600 * 1000,
  }
}

function main(argv) {
  const [verb, ...tail] = argv
  const options = {}
  for (let index = 0; index < tail.length; index += 2) {
    const [flag, value] = [tail[index], tail[index + 1]]
    if (flag === '--queue' && value) options.queue = value
    else if (flag === '--deadline' && value && !Number.isNaN(Date.parse(value))) options.deadline = new Date(value)
    else if (flag === '--max-actions' && /^[1-9]\d{0,2}$/.test(value ?? '')) options.maxActions = Number(value)
    else return { status: 'INVALID', reasons: ['USAGE: prepare [--queue <file>] | run [--deadline <iso>] [--max-actions <n>]'] }
  }
  const root = path.resolve(spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim())
  const ctx = context(root, options)
  if (verb === 'prepare') return prepare(ctx, path.resolve(root, options.queue ?? `${STATE_DIR}/queue.json`))
  if (verb === 'run') return run(ctx)
  return { status: 'INVALID', reasons: ['USAGE: prepare [--queue <file>] | run [--deadline <iso>] [--max-actions <n>]'] }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result
  try { result = main(process.argv.slice(2)) } catch (error) { result = { status: 'ERROR', reasons: [error.message] } }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = ['READY', 'DONE'].includes(result.status) ? 0 : 1
}
