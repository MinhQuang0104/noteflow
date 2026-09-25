<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'

import {
  ChallengeApiError,
  generateCommandId,
  getChallengeJournal,
  saveChallengeJournal,
  type JournalProblemDetails,
  type JournalReadResult,
  type JournalSnapshot,
} from '../api/challenges'
import { useAccountStore } from '../stores/account'
import { useAuthStore } from '../stores/auth'
import { useSyncStore } from '../stores/sync'

const props = defineProps<{
  challengeId: string
  localDate: string
}>()

const account = useAccountStore()
const auth = useAuthStore()
const sync = useSyncStore()
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

const draft = ref('')
const savedText = ref('')
const journalVersion = ref(0)
const loadedResourceKey = ref<string | null>(null)
const conflictSnapshot = ref<JournalSnapshot | null>(null)
const validationError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saveStatus = ref<string | null>(null)
const epochChangeBlocked = ref(false)

const activeCommandId = ref<string | null>(null)
const lastCanonicalPayload = ref<string | null>(null)
const activeAuthGeneration = ref<number | undefined>(undefined)

const isDirty = computed(() => draft.value !== savedText.value)
const isMutationBlocked = computed(() => {
  if (account.status !== 'ready' || !account.context) return true
  return account.context.write_state !== 'open'
})
const isSaving = computed(() => saveMutation.isPending.value)

watch(
  journalData,
  (result) => {
    if (!result) return

    const snapshot = result.journal
    const firstLoad = loadedResourceKey.value !== journalResourceKey.value
    const shouldReplaceDraft = firstLoad || !isDirty.value

    if (shouldReplaceDraft) {
      draft.value = snapshot.journal ?? ''
    }
    savedText.value = snapshot.journal ?? ''
    journalVersion.value = snapshot.journal_version
    loadedResourceKey.value = journalResourceKey.value

    if (firstLoad) {
      conflictSnapshot.value = null
      validationError.value = null
      saveError.value = null
      saveStatus.value = null
    }
  },
  { immediate: true },
)

watch(journalResourceKey, () => {
  loadedResourceKey.value = null
  draft.value = ''
  savedText.value = ''
  journalVersion.value = 0
  conflictSnapshot.value = null
  validationError.value = null
  saveError.value = null
  saveStatus.value = null
  epochChangeBlocked.value = false
  activeCommandId.value = null
  lastCanonicalPayload.value = null
})

watch(
  () => account.context?.data_epoch,
  (newEpoch, oldEpoch) => {
    if (oldEpoch === undefined || newEpoch === oldEpoch) return

    activeCommandId.value = null
    lastCanonicalPayload.value = null
    conflictSnapshot.value = null

    if (isDirty.value) {
      epochChangeBlocked.value = true
    }
  },
)

async function rebaseOnEpochChange(): Promise<void> {
  const draftWasDirty = isDirty.value
  const result = await refetch()

  if (result.data) {
    const snapshot = result.data.journal
    savedText.value = snapshot.journal ?? ''
    journalVersion.value = snapshot.journal_version
    if (!draftWasDirty) {
      draft.value = snapshot.journal ?? ''
    }
    epochChangeBlocked.value = false
    conflictSnapshot.value = null
    validationError.value = null
    saveError.value = null
    saveStatus.value = null
    return
  }

  saveError.value = 'Không thể tải dữ liệu nhật ký mới nhất. Vui lòng thử lại.'
}

async function retryJournalLoad(): Promise<void> {
  await refetch()
}

function useServerSnapshot(): void {
  const snapshot = conflictSnapshot.value
  if (!snapshot) return

  draft.value = snapshot.journal ?? ''
  savedText.value = snapshot.journal ?? ''
  journalVersion.value = snapshot.journal_version
  queryClient.setQueryData<JournalReadResult>(journalQueryKey.value, { journal: snapshot })
  conflictSnapshot.value = null
  validationError.value = null
  saveError.value = null
  saveStatus.value = 'Đã tải bản nhật ký đang lưu trên máy chủ.'
  activeCommandId.value = null
  lastCanonicalPayload.value = null
}

const saveMutation = useMutation({
  mutationFn: (payload: Parameters<typeof saveChallengeJournal>[2]) =>
    saveChallengeJournal(props.challengeId, props.localDate, payload),
})

async function saveJournal(): Promise<void> {
  validationError.value = null
  saveError.value = null
  saveStatus.value = null

  if (epochChangeBlocked.value) {
    saveError.value = 'Dữ liệu máy chủ đã chuyển chu kỳ mới (epoch). Vui lòng bấm Tải lại dữ liệu mới nhất trước khi tiếp tục.'
    return
  }

  if (!draft.value.trim()) {
    validationError.value = 'Nhật ký không được để trống.'
    return
  }

  const writeCheck = await sync.reconcileBeforeWrite()
  if (!writeCheck.allowed) {
    saveError.value = writeCheck.reason ?? 'Chưa thể lưu nhật ký. Vui lòng thử lại sau.'
    return
  }

  if (account.status !== 'ready' || !account.context || account.context.write_state !== 'open') {
    saveError.value = 'Chưa thể lưu nhật ký: ngữ cảnh tài khoản chưa sẵn sàng.'
    return
  }

  const canonicalPayload = JSON.stringify({
    challenge_id: props.challengeId,
    local_date: props.localDate,
    base_version: journalVersion.value,
    data_epoch: account.context.data_epoch,
    journal: draft.value,
  })

  let commandId = activeCommandId.value
  if (!commandId || lastCanonicalPayload.value !== canonicalPayload) {
    commandId = generateCommandId()
    activeCommandId.value = commandId
    lastCanonicalPayload.value = canonicalPayload
  }

  activeAuthGeneration.value = auth.generation

  try {
    const result = await saveMutation.mutateAsync({
      command_id: commandId,
      data_epoch: account.context.data_epoch,
      base_version: journalVersion.value,
      journal: draft.value,
    })

    const accepted = await sync.recordMutationAck(
      result.account_revision,
      result.data_epoch,
      activeAuthGeneration.value,
    )
    if (!accepted) return

    if (
      auth.status !== 'authenticated' ||
      (activeAuthGeneration.value !== undefined && auth.generation !== activeAuthGeneration.value)
    ) {
      return
    }

    const snapshot = result.journal
    queryClient.setQueryData<JournalReadResult>(journalQueryKey.value, { journal: snapshot })
    draft.value = snapshot.journal ?? ''
    savedText.value = snapshot.journal ?? ''
    journalVersion.value = snapshot.journal_version
    conflictSnapshot.value = null
    activeCommandId.value = null
    lastCanonicalPayload.value = null
    saveStatus.value = 'Đã lưu nhật ký.'
  } catch (error) {
    if (error instanceof ChallengeApiError) {
      const problem = error.problem as JournalProblemDetails | undefined

      if (error.status === 409 && problem?.code === 'version_conflict') {
        conflictSnapshot.value = problem.current_snapshot ?? null
        saveError.value = conflictSnapshot.value
          ? null
          : 'Nhật ký đã được cập nhật trên thiết bị khác. Bản nháp của bạn vẫn được giữ nguyên.'
        return
      }

      if (error.status === 422) {
        validationError.value = error.validation?.errors?.journal?.[0] ?? 'Nhật ký không hợp lệ.'
        return
      }

      if (error.status === 401 || error.status === 403) {
        saveError.value = 'Phiên làm việc không còn hợp lệ. Vui lòng đăng nhập lại.'
        return
      }
    }

    saveError.value = 'Không thể lưu nhật ký. Vui lòng thử lại.'
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

    <p v-else-if="isLoading" class="mt-4 text-sm text-slate-500" role="status">
      Đang tải nhật ký…
    </p>

    <div v-else-if="isError && !journalData" class="mt-4 space-y-2 text-sm text-rose-800" role="alert">
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

    <form v-else-if="journalData" id="journal-form" class="mt-4 space-y-4" novalidate @submit.prevent="saveJournal">
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
        aria-live="assertive"
        class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      >
        <p class="font-semibold">Nhật ký đã được cập nhật từ thiết bị khác.</p>
        <p class="mt-1 text-xs leading-relaxed">
          Bản đang lưu trên máy chủ (phiên bản {{ conflictSnapshot.journal_version }}):
          <span v-if="conflictSnapshot.journal" class="whitespace-pre-wrap">{{ conflictSnapshot.journal }}</span>
          <em v-else>chưa có nội dung</em>.
          Bản đang nhập vẫn được giữ nguyên để bạn quyết định.
        </p>
        <button
          id="journal-use-server-btn"
          type="button"
          class="mt-3 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100"
          @click="useServerSnapshot"
        >
          Dùng bản lưu trên máy chủ
        </button>
      </div>

      <div>
        <label for="journal-editor" class="block text-sm font-medium text-slate-700">
          Nhật ký ngày {{ localDate }}
          <span class="text-xs font-normal text-slate-400">(tùy chọn)</span>
        </label>
        <textarea
          id="journal-editor"
          v-model="draft"
          :aria-describedby="validationError ? 'journal-error' : undefined"
          :aria-invalid="validationError ? 'true' : 'false'"
          :disabled="isSaving"
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
          {{ isSaving ? 'Đang lưu…' : 'Lưu nhật ký' }}
        </button>
      </div>
    </form>
  </section>
</template>
