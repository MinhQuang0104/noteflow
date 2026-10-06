import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import assert from 'node:assert/strict'

// Audit-only probes: exact source functions, stubbed reactive state/transports.
// This is not a Vue/browser/PostgreSQL integration test.
const ref = value => ({ value })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((ok, no) => { resolve = ok; reject = no })
  return { promise, resolve, reject }
}
const source = path => readFileSync(path, 'utf8')
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)))
const evaluate = (text, context) => vm.runInNewContext(stripTypeScriptTypes(text), context)
const observed = []

// E-04: use the real selectChallenge and submitEdit handlers.
{
  const text = source('frontend/src/views/ChallengesView.vue')
  const gate = deferred()
  const selectedId = ref('A')
  const challenges = { A: { id: 'A', row_version: 1 }, B: { id: 'B', row_version: 1 } }
  const sent = []
  const context = {
    selectedId, selectedChallenge: { get value() { return challenges[selectedId.value] } },
    mode: ref('edit'), editForm: ref({ name: 'edited A', description: 'A description' }),
    editErrors: ref({}), editGeneralError: ref(null), epochChangeBlocked: ref(false),
    editConflictSnapshot: ref(null), editBaseVersion: ref(1), activeEditCommandId: ref(null),
    lastEditCanonicalPayload: ref(null), activeEditAuthGen: ref(null), auth: { generation: 1 },
    account: { status: 'ready', context: { write_state: 'open', data_epoch: 1 } },
    sync: { reconcileBeforeWrite: () => gate.promise },
    router: { replace: () => Promise.resolve() },
    generateCommandId: () => '00000000-0000-4000-8000-000000000001',
    updateMutation: { mutateAsync: async input => { sent.push(input) } },
  }
  evaluate(between(text, 'function selectChallenge(', 'function startEdit(') +
    between(text, 'async function submitEdit()', '</script>'), context)
  const operation = context.submitEdit()
  context.selectChallenge(challenges.B)
  gate.resolve({ allowed: true })
  await operation
  assert.equal(sent[0].id, 'B')
  assert.equal(sent[0].payload.name, 'edited A')
  observed.push({ id: 'E-04', input: 'edit A, select B during awaited preflight, equal row_version=1', sent: sent[0], outcome: 'A content sent to B' })
}

// E-01: use real conflict ACK handler while the same instance changes props.
{
  const text = source('frontend/src/components/ChallengeJournalEditor.vue')
  const ack = deferred()
  const props = { challengeId: 'A', localDate: '2026-10-06' }
  const record = { acknowledgedSnapshot: { challenge_id: 'A', journal: 'before' }, conflictSnapshot: {} }
  const writes = []
  const context = {
    props, journalDrafts: { getDraft: () => record, resolveConflict: () => ack.promise },
    localActionError: ref(null), isConflictDialogOpen: ref(true), showSaveStatus: ref(false),
    journalQueryKey: { get value() { return ['challenge-journal', props.challengeId, props.localDate] } },
    queryClient: { setQueryData: (key, value) => writes.push({ key: [...key], value }) },
    nextTick: async () => {}, journalEditor: ref(null),
  }
  evaluate(between(text, 'async function confirmConflict(', 'async function saveJournal('), context)
  const operation = context.confirmConflict({ choice: 'local', expectedServerVersion: 2, expectedClientRevision: 1 })
  props.challengeId = 'B'
  record.acknowledgedSnapshot = { challenge_id: 'A', journal: 'after' }
  record.conflictSnapshot = null
  ack.resolve()
  await operation
  assert.equal(writes[0].key[1], 'B')
  assert.equal(writes[0].value.journal.challenge_id, 'A')
  observed.push({ id: 'E-01', writes, outcome: 'A snapshot stored under B query key' })
}

// E-02: exact pending-resolution comparison and handler early-return branch.
{
  const text = source('frontend/src/stores/journalDrafts.ts')
  let saves = 0
  const record = { pendingCommand: { resolution: { choice: 'local', expectedServerVersion: 2, expectedClientRevision: 1 } }, clientRevision: 2 }
  const context = { getCurrentKey: () => 'A', drafts: ref({ A: record }), inFlight: new Map(), save: async () => { saves++ } }
  evaluate(between(text, 'function sameResolution(', 'export const useJournalDraftsStore') +
    between(text, '  function resolveConflict(', '  function reset('), context)
  await context.resolveConflict('A', '2026-10-06', 'local', 2, 2)
  assert.equal(saves, 0)
  await context.resolveConflict('A', '2026-10-06', 'local', 2, 1)
  assert.equal(saves, 1)
  observed.push({ id: 'E-02', current_revision_request_saves: 0, pending_revision_request_saves: 1, outcome: 'current UI revision cannot replay pending resolution' })
}

// E-03: actual poll/reconcile internals with delayed refetch and equal revision.
{
  const text = source('frontend/src/stores/sync.ts')
  const refetch = deferred()
  let reads = 0, refetches = 0
  const next = { account_revision: 2, data_epoch: 1, write_state: 'open' }
  const context = {
    auth: { generation: 1, status: 'authenticated' }, isStarted: true,
    isOnline: ref(true), isVisible: ref(true), inFlight: ref(false), syncStatus: ref('synced'),
    syncError: ref(null), requestGeneration: ref(0), latestCompletedRequestGeneration: ref(0),
    lastRevision: ref(1), lastEpoch: ref(1), lastWriteState: ref('open'), lastSyncedAt: ref(null),
    pendingConvergence: ref(false), ackConvergenceGeneration: 0, consecutiveFailures: ref(0),
    account: { context: { account_revision: 1, data_epoch: 1 }, status: 'ready' },
    accountApi: { getAccountContext: async () => { reads++; return { ...next } } },
    currentQueryClient: { refetchQueries: () => { refetches++; return refetch.promise }, resetQueries: () => refetch.promise },
    activeReconcileInfo: null, clearTimer: () => {}, scheduleNextPoll: () => {},
    BASE_POLL_INTERVAL_MS: 5000, getBackoffDelay: () => 5000,
  }
  evaluate(between(text, '  async function reconcileInternal()', '  async function recordMutationAck('), context)
  const polling = context.poll()
  for (let i = 0; i < 10 && refetches === 0; i++) await Promise.resolve()
  assert.equal(refetches, 2)
  const foreground = await context.reconcile()
  assert.equal(foreground, true)
  assert.equal(reads, 2)
  refetch.reject(new Error('refetch unavailable'))
  await polling
  assert.equal(context.syncStatus.value, 'synced')
  assert.equal(context.pendingConvergence.value, false)
  observed.push({ id: 'E-03', account_reads: reads, foreground_allowed: foreground, failed_refetch_sync_status: context.syncStatus.value, pending: context.pendingConvergence.value, outcome: 'failed refetch obligation lost' })
}

// E-05: real session expiry handler plus independently inspected render gates.
{
  const text = source('frontend/src/stores/auth.ts')
  const shell = source('frontend/src/components/AppShell.vue')
  const app = source('frontend/src/App.vue')
  const view = source('frontend/src/views/ChallengesView.vue')
  const privateDraft = { name: 'private draft', description: 'retained input' }
  const context = {
    explicitLogoutPending: false, generation: ref(1), status: ref('authenticated'),
    owner: ref({ id: 'owner-A' }), privateStateResets: [], queryClient: { clear: () => {} },
    authApi: { getSession: async () => null }, createForm: ref(privateDraft), mode: ref('create'),
  }
  evaluate(between(text, '  function clearPrivateState(', '  async function logIn('), context)
  assert.equal(await context.refreshSession(), false)
  assert.equal(context.status.value, 'guest')
  assert.equal(context.owner.value, null)
  assert.equal(context.createForm.value.name, 'private draft')
  assert.match(shell, /<RouterView\s*\/>/)
  assert.match(app, /<AppShell\s*\/>/)
  assert.match(view, /<div v-if="mode === 'create'"/)
  assert.doesNotMatch(view, /registerPrivateStateReset/)
  observed.push({ id: 'E-05', auth_after_expiry: context.status.value, form_retained: true, shell_router_view: 'unconditional', create_pane_condition: 'mode only', outcome: 'private input remains reachable by unchanged rendering conditions', browser_rendered: false })
}

console.log(JSON.stringify({ mode: 'SOURCE_EXTRACTED_WITH_STUBS', integration_test: false, findings: observed }, null, 2))
