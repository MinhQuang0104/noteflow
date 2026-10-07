<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, watch } from 'vue'

import {
  getChallengeJournal,
  type JournalReadResult,
} from '../api/challenges'
import ContentConflictDialog from './ContentConflictDialog.vue'
import { useAccountStore } from '../stores/account'
import { useAuthStore } from '../stores/auth'
import { useJournalDraftsStore } from '../stores/journalDrafts'

const props = defineProps<{
  challengeId: string
  localDate: string
}>()

const account = useAccountStore()
const auth = useAuthStore()
const journalDrafts = useJournalDraftsStore()
const queryClient = useQueryClient()

const journalQueryKey = computed(() => ['challenge-journal', props.challengeId, props.localDate] as const)
const journalResourceKey = computed(() => `${props.challengeId}:${props.localDate}`)

const {
  data: journalData,
  isLoading,
  isError,
  refetch,
} = useQuery({
  queryKey: journalQueryKey,
  queryFn: () => getChallengeJournal(props.challengeId, props.localDate),
  enabled: computed(() => auth.status === 'authenticated' && Boolean(props.challengeId && props.localDate)),
  retry: false,
})

const record = computed(() => journalDrafts.getDraft(props.challengeId, props.localDate))
const draft = computed({
  get: () => record.value?.text ?? '',
  set: (text: string) => {
    localValidationError.value = null
    journalDrafts.setDraftText(props.challengeId, props.localDate, text)
  },
})
const savedText = computed(() => record.value?.acknowledgedText ?? '')
const conflictSnapshot = computed(() => record.value?.conflictSnapshot ?? null)
const isDirty = computed(() => journalDrafts.isDirty(props.challengeId, props.localDate))
const isSaving = computed(() => record.value?.status === 'saving')
const localValidationError = ref<string | null>(null)
const localActionError = ref<string | null>(null)
const showSaveStatus = ref(false)
const epochChangeBlocked = ref(false)
const isConflictDialogOpen = ref(false)
const journalEditor = ref<HTMLTextAreaElement | null>(null)
const isMutationBlocked = computed(() => {
  if (account.status !== 'ready' || !account.context) return true
  return account.context.write_state !== 'open'
})
const validationError = computed(
  () => localValidationError.value ?? (record.value?.error?.kind === 'validation' ? record.value.error.message : null),
)
const saveError = computed(() => localActionError.value ?? (
  record.value?.error && record.value.error.kind !== 'validation' && record.value.error.kind !== 'conflict'
    ? record.value.error.message
    : null
))
const isRetryable = computed(() =>
  record.value?.error?.kind === 'network' || record.value?.error?.kind === 'preflight',
)
const saveStatus = computed(() => {
  if (!showSaveStatus.value || !record.value) return null
  if (record.value.status === 'saving') return 'Đang lưu…'
  if (record.value.status === 'saved') return 'Đã lưu nhật ký.'
  if (record.value.status === 'dirty') return 'Chưa lưu thay đổi.'
  return null
})
const conflictResourceLabel = computed(() => `Challenge ${props.challengeId} · ngày ${props.localDate}`)
const conflictClientRevision = computed(() => record.value?.clientRevision ?? 0)
const conflictDialogError = computed(() => localActionError.value ?? record.value?.error?.message ?? null)

function isCurrentJournalWrite(authGeneration: number, dataEpoch: number | undefined): boolean {
  return auth.status === 'authenticated' &&
    auth.generation === authGeneration &&
    account.context?.data_epoch === dataEpoch
}

watch(journalData, (result) => {
  if (result) journalDrafts.hydrate(result.journal)
}, { immediate: true })

watch([journalResourceKey, () => auth.generation, () => auth.status, () => auth.owner?.id], () => {
  localValidationError.value = null
  localActionError.value = null
  showSaveStatus.value = false
  epochChangeBlocked.value = false
  isConflictDialogOpen.value = false
})

watch(
  () => account.context?.data_epoch,
  (newEpoch, oldEpoch) => {
    if (oldEpoch === undefined || newEpoch === oldEpoch) return

    isConflictDialogOpen.value = false
    if (isDirty.value) {
      epochChangeBlocked.value = true
    }
  },
)

watch(conflictSnapshot, (snapshot) => {
  if (!snapshot) isConflictDialogOpen.value = false
})

async function rebaseOnEpochChange(): Promise<void> {
  const challengeId = props.challengeId
  const localDate = props.localDate
  const draftWasDirty = isDirty.value
  const result = await refetch()

  if (
    result.data?.journal.challenge_id === challengeId &&
    result.data.journal.local_date === localDate &&
    props.challengeId === challengeId &&
    props.localDate === localDate
  ) {
    const snapshot = result.data.journal
    journalDrafts.rebaseAfterEpochChange(challengeId, localDate, snapshot)
    queryClient.setQueryData<JournalReadResult>(['challenge-journal', challengeId, localDate], { journal: snapshot })
    epochChangeBlocked.value = false
    localValidationError.value = null
    localActionError.value = null
    showSaveStatus.value = !draftWasDirty
    return
  }

  localActionError.value = 'Không thể tải dữ liệu nhật ký mới nhất. Vui lòng thử lại.'
}

async function retryJournalLoad(): Promise<void> {
  await refetch()
}

function openConflictDialog(): void {
  if (conflictSnapshot.value && !epochChangeBlocked.value) isConflictDialogOpen.value = true
}

async function confirmConflict(payload: {
  choice: 'local' | 'server'
  expectedServerVersion: number
  expectedClientRevision: number
}): Promise<void> {
  const challengeId = props.challengeId
  const localDate = props.localDate
  const targetQueryKey = ['challenge-journal', challengeId, localDate] as const
  const authGeneration = auth.generation
  const dataEpoch = account.context?.data_epoch
  const beforeSnapshot = journalDrafts.getDraft(challengeId, localDate)?.acknowledgedSnapshot
  localActionError.value = null
  await journalDrafts.resolveConflict(
    challengeId,
    localDate,
    payload.choice,
    payload.expectedServerVersion,
    payload.expectedClientRevision,
  )

  const updated = journalDrafts.getDraft(challengeId, localDate)
  if (!updated || updated.acknowledgedSnapshot === beforeSnapshot) return

  if (!isCurrentJournalWrite(authGeneration, dataEpoch)) return

  queryClient.setQueryData<JournalReadResult>(targetQueryKey, { journal: updated.acknowledgedSnapshot })
  if (!updated.conflictSnapshot && props.challengeId === challengeId && props.localDate === localDate) {
    isConflictDialogOpen.value = false
    showSaveStatus.value = true
    await nextTick()
    journalEditor.value?.focus()
  }
}

async function saveJournal(): Promise<void> {
  localValidationError.value = null
  localActionError.value = null
  showSaveStatus.value = true

  if (epochChangeBlocked.value) {
    localActionError.value = 'Dữ liệu máy chủ đã chuyển chu kỳ mới (epoch). Vui lòng bấm Tải lại dữ liệu mới nhất trước khi tiếp tục.'
    return
  }

  if (!draft.value.trim()) {
    localValidationError.value = 'Nhật ký không được để trống.'
    return
  }

  const challengeId = props.challengeId
  const localDate = props.localDate
  const targetQueryKey = ['challenge-journal', challengeId, localDate] as const
  const authGeneration = auth.generation
  const dataEpoch = account.context?.data_epoch
  const beforeSnapshot = journalDrafts.getDraft(challengeId, localDate)?.acknowledgedSnapshot
  await journalDrafts.save(challengeId, localDate)

  const updated = journalDrafts.getDraft(challengeId, localDate)
  if (updated && updated.acknowledgedSnapshot !== beforeSnapshot && isCurrentJournalWrite(authGeneration, dataEpoch)) {
    queryClient.setQueryData<JournalReadResult>(targetQueryKey, {
      journal: updated.acknowledgedSnapshot,
    })
  }
}
</script>

<template>
  <section
    id="challenge-journal"
    aria-labelledby="challenge-journal-heading"
    class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
  >
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
      <div>
        <h4 id="challenge-journal-heading" class="text-base font-semibold text-slate-900">
          Nhật ký (tùy chọn)
        </h4>
        <p class="mt-1 text-xs text-slate-500">Ngày tài khoản: {{ localDate }}</p>
      </div>
      <span class="text-xs text-slate-500">Độc lập với Done và tiến độ</span>
    </div>

    <p v-if="auth.status !== 'authenticated'" class="mt-4 text-sm text-rose-800" role="alert">
      Phiên làm việc chưa được xác thực. Vui lòng đăng nhập lại.
    </p>

    <p v-else-if="isLoading && !record" class="mt-4 text-sm text-slate-500" role="status">
      Đang tải nhật ký…
    </p>

    <div v-else-if="isError && !journalData && !record" class="mt-4 space-y-2 text-sm text-rose-800" role="alert">
      <p>Không thể tải nhật ký cho ngày này.</p>
      <button
        id="journal-load-retry"
        type="button"
        class="font-semibold text-indigo-700 underline hover:text-indigo-900"
        @click="retryJournalLoad"
      >
        Thử lại
      </button>
    </div>

    <form v-else-if="journalData || record" id="journal-form" class="mt-4 space-y-4" novalidate @submit.prevent="saveJournal">
      <div
        v-if="isError"
        role="alert"
        class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
      >
        Không thể tải bản nhật ký mới nhất. Bản đang nhập vẫn được giữ nguyên.
      </div>

      <div
        v-if="epochChangeBlocked"
        id="journal-epoch-alert"
        role="alert"
        class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
      >
        <p class="font-semibold">Chu kỳ dữ liệu đã được cập nhật từ máy chủ.</p>
        <p class="mt-1">Bản đang nhập vẫn được giữ nguyên. Tải lại dữ liệu mới nhất trước khi lưu tiếp.</p>
        <button
          id="journal-epoch-rebase-btn"
          type="button"
          class="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 font-semibold hover:bg-amber-100"
          @click="rebaseOnEpochChange"
        >
          Tải lại dữ liệu mới nhất
        </button>
      </div>

      <div
        v-if="conflictSnapshot"
        id="journal-conflict-alert"
        role="alert"
        aria-live="polite"
        class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      >
        <p class="font-semibold">Nhật ký đã được cập nhật từ thiết bị khác.</p>
        <p class="mt-1 text-xs leading-relaxed">
          Bản đang nhập vẫn được giữ nguyên để bạn quyết định.
        </p>
        <button
          id="journal-conflict-open"
          type="button"
          aria-haspopup="dialog"
          aria-controls="content-conflict-dialog"
          :aria-expanded="isConflictDialogOpen ? 'true' : 'false'"
          class="mt-3 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100"
          :disabled="epochChangeBlocked"
          @click="openConflictDialog"
        >
          Xem và giải quyết
        </button>
      </div>

      <ContentConflictDialog
        :open="isConflictDialogOpen"
        :resource-label="conflictResourceLabel"
        :local-text="draft"
        :server-text="conflictSnapshot?.journal ?? ''"
        :server-version="conflictSnapshot?.journal_version ?? 0"
        :client-revision="conflictClientRevision"
        :busy="isSaving"
        :error="conflictDialogError"
        @close="isConflictDialogOpen = false"
        @confirm="confirmConflict"
      />

      <div>
        <label for="journal-editor" class="block text-sm font-medium text-slate-700">
          Nhật ký ngày {{ localDate }}
          <span class="text-xs font-normal text-slate-400">(tùy chọn)</span>
        </label>
        <textarea
          id="journal-editor"
          ref="journalEditor"
          v-model="draft"
          :aria-describedby="validationError ? 'journal-error' : undefined"
          :aria-invalid="validationError ? 'true' : 'false'"
          :aria-label="`Nhật ký ngày ${localDate}`"
          rows="6"
          class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50"
          :class="{ 'border-rose-500 focus:border-rose-500 focus:ring-rose-500': validationError }"
        ></textarea>
        <p id="journal-empty-state" v-if="!savedText" class="mt-1 text-xs text-slate-500">
          Chưa có nhật ký cho ngày này.
        </p>
        <p v-if="validationError" id="journal-error" role="alert" class="mt-1 text-xs font-medium text-rose-700">
          {{ validationError }}
        </p>
      </div>

      <p v-if="saveError" id="journal-save-error" role="alert" aria-live="polite" class="text-sm text-rose-800">
        {{ saveError }}
      </p>
      <p v-if="saveStatus" id="journal-save-status" role="status" aria-live="polite" class="text-sm text-emerald-800">
        {{ saveStatus }}
      </p>

      <div class="flex items-center justify-end">
        <button
          id="journal-save-btn"
          type="submit"
          :disabled="isSaving || isMutationBlocked || epochChangeBlocked || !!conflictSnapshot"
          :aria-busy="isSaving ? 'true' : 'false'"
          class="inline-flex items-center rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-indigo-600"
        >
          {{ isSaving ? 'Đang lưu…' : isRetryable ? 'Thử lại' : 'Lưu nhật ký' }}
        </button>
      </div>
    </form>
  </section>
</template>
