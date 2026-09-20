<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  createChallenge,
  generateCommandId,
  getChallenges,
  updateChallengeMetadata,
  ChallengeApiError,
  type Challenge,
  type ChallengeSnapshot,
} from '../api/challenges'
import { useAccountStore } from '../stores/account'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const account = useAccountStore()

// State
const mode = ref<'list' | 'detail' | 'create' | 'edit'>('list')
const selectedId = ref<string | null>(null)

// Command idempotency tracking (Finding 3)
const activeCreateCommandId = ref<string | null>(null)
const lastCreateCanonicalPayload = ref<string | null>(null)

const activeEditCommandId = ref<string | null>(null)
const lastEditCanonicalPayload = ref<string | null>(null)

// Form states
const createForm = ref({
  name: '',
  description: '',
  target_days: 1 as number | null,
})
const createErrors = ref<Record<string, string>>({})
const createGeneralError = ref<string | null>(null)

const editForm = ref({
  name: '',
  description: '',
})
const editErrors = ref<Record<string, string>>({})
const editGeneralError = ref<string | null>(null)
const editConflictSnapshot = ref<ChallengeSnapshot | null>(null)
const editBaseVersion = ref<number>(1)

// Account context readiness & write state (Finding 5)
const isMutationBlocked = computed(() => {
  if (account.status !== 'ready' || !account.context) return true
  if (account.context.write_state !== 'open') return true
  return false
})

const mutationBlockedReason = computed(() => {
  if (account.status !== 'ready' || !account.context) {
    return 'Chưa thể ghi nhận dữ liệu: Ngữ cảnh tài khoản chưa sẵn sàng.'
  }
  if (account.context.write_state !== 'open') {
    return `Tài khoản đang trong trạng thái tạm khóa ghi (${account.context.write_state}). Vui lòng chờ hoàn tất.`
  }
  return null
})

// Queries
const {
  data: challengesData,
  isLoading,
  isError,
  refetch,
} = useQuery({
  queryKey: ['challenges'],
  queryFn: getChallenges,
})

const challenges = computed<Challenge[]>(() => challengesData.value?.challenges ?? [])

const selectedChallenge = computed<Challenge | null>(() => {
  if (!selectedId.value) return null
  return challenges.value.find((c) => c.id === selectedId.value) ?? null
})

// Sync with route param
watch(
  () => route.params.id,
  (newId) => {
    if (typeof newId === 'string' && newId) {
      selectedId.value = newId
      if (mode.value === 'list') {
        mode.value = 'detail'
      }
    }
  },
  { immediate: true },
)

// If challenges load and we have an id in route, ensure detail mode
watch(
  [challenges, selectedId],
  ([list, id]) => {
    if (id && list.some((c) => c.id === id) && mode.value === 'list') {
      mode.value = 'detail'
    }
  },
)

// Mutations
const createMutation = useMutation({
  mutationFn: createChallenge,
  onSuccess: async (result) => {
    await queryClient.invalidateQueries({ queryKey: ['challenges'] })
    activeCreateCommandId.value = null
    lastCreateCanonicalPayload.value = null
    selectedId.value = result.challenge.id
    mode.value = 'detail'
    resetCreateForm()
    router.replace({ path: `/challenges/${result.challenge.id}` }).catch(() => {})
  },
})

const updateMutation = useMutation({
  mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateChallengeMetadata>[1] }) =>
    updateChallengeMetadata(id, payload),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['challenges'] })
    activeEditCommandId.value = null
    lastEditCanonicalPayload.value = null
    mode.value = 'detail'
    editConflictSnapshot.value = null
  },
})

// Handlers
function resetCreateForm() {
  createForm.value = {
    name: '',
    description: '',
    target_days: 1,
  }
  createErrors.value = {}
  createGeneralError.value = null
  activeCreateCommandId.value = null
  lastCreateCanonicalPayload.value = null
}

function startCreate() {
  resetCreateForm()
  mode.value = 'create'
}

function cancelCreate() {
  resetCreateForm()
  mode.value = selectedChallenge.value ? 'detail' : 'list'
}

function selectChallenge(challenge: Challenge) {
  selectedId.value = challenge.id
  mode.value = 'detail'
  editConflictSnapshot.value = null
  router.replace({ path: `/challenges/${challenge.id}` }).catch(() => {})
}

function startEdit() {
  if (!selectedChallenge.value) return
  editForm.value = {
    name: selectedChallenge.value.name,
    description: selectedChallenge.value.description ?? '',
  }
  editBaseVersion.value = selectedChallenge.value.row_version
  editErrors.value = {}
  editGeneralError.value = null
  editConflictSnapshot.value = null
  activeEditCommandId.value = null
  lastEditCanonicalPayload.value = null
  mode.value = 'edit'
}

function cancelEdit() {
  mode.value = 'detail'
  editErrors.value = {}
  editGeneralError.value = null
  editConflictSnapshot.value = null
  activeEditCommandId.value = null
  lastEditCanonicalPayload.value = null
}

async function submitCreate() {
  createErrors.value = {}
  createGeneralError.value = null

  // Finding 5: Fail closed if account context is not ready or write_state not open
  if (account.status !== 'ready' || !account.context) {
    createGeneralError.value = 'Chưa thể tạo challenge: Ngữ cảnh tài khoản chưa sẵn sàng. Vui lòng thử lại sau.'
    return
  }
  if (account.context.write_state !== 'open') {
    createGeneralError.value = `Chưa thể tạo challenge: Tài khoản đang tạm khóa ghi (${account.context.write_state}).`
    return
  }

  const trimmedName = createForm.value.name.trim()
  if (!trimmedName) {
    createErrors.value.name = 'Tên challenge không được để trống.'
  }

  const target = Number(createForm.value.target_days)
  if (!Number.isInteger(target) || target < 1 || target > 7) {
    createErrors.value.target_days = 'Mục tiêu số ngày phải là số nguyên từ 1 đến 7.'
  }

  if (Object.keys(createErrors.value).length > 0) {
    return
  }

  const normalizedDescription = createForm.value.description.trim() || null

  // Canonical payload representation for idempotency tracking (Finding 3)
  const canonicalPayload = JSON.stringify({
    data_epoch: account.context.data_epoch,
    name: trimmedName,
    description: normalizedDescription,
    target_days: target,
  })

  let commandId = activeCreateCommandId.value
  if (!commandId || lastCreateCanonicalPayload.value !== canonicalPayload) {
    commandId = generateCommandId()
    activeCreateCommandId.value = commandId
    lastCreateCanonicalPayload.value = canonicalPayload
  }

  try {
    await createMutation.mutateAsync({
      command_id: commandId,
      data_epoch: account.context.data_epoch,
      name: trimmedName,
      description: normalizedDescription,
      target_days: target,
    })
  } catch (error) {
    if (error instanceof ChallengeApiError) {
      if (error.status === 422 && error.validation?.errors) {
        for (const [key, msgs] of Object.entries(error.validation.errors)) {
          createErrors.value[key] = msgs[0] ?? 'Dữ liệu không hợp lệ.'
        }
      } else {
        createGeneralError.value = error.message
      }
    } else {
      createGeneralError.value = 'Không thể tạo challenge. Vui lòng thử lại.'
    }
  }
}

async function submitEdit() {
  if (!selectedChallenge.value) return
  editErrors.value = {}
  editGeneralError.value = null

  // Finding 4: If a conflict was already detected, do not blindly resubmit
  if (editConflictSnapshot.value) {
    editGeneralError.value = 'Dữ liệu đã có xung đột phiên bản. Vui lòng làm mới trang hoặc tải lại dữ liệu mới nhất.'
    return
  }

  // Finding 5: Fail closed if account context is not ready or write_state not open
  if (account.status !== 'ready' || !account.context) {
    editGeneralError.value = 'Chưa thể lưu thay đổi: Ngữ cảnh tài khoản chưa sẵn sàng. Vui lòng thử lại sau.'
    return
  }
  if (account.context.write_state !== 'open') {
    editGeneralError.value = `Chưa thể lưu thay đổi: Tài khoản đang tạm khóa ghi (${account.context.write_state}).`
    return
  }

  const trimmedName = editForm.value.name.trim()
  if (!trimmedName) {
    editErrors.value.name = 'Tên challenge không được để trống.'
    return
  }

  const normalizedDescription = editForm.value.description.trim() || null

  // Canonical payload representation for idempotency tracking (Finding 3)
  const canonicalPayload = JSON.stringify({
    id: selectedChallenge.value.id,
    base_version: editBaseVersion.value,
    data_epoch: account.context.data_epoch,
    name: trimmedName,
    description: normalizedDescription,
  })

  let commandId = activeEditCommandId.value
  if (!commandId || lastEditCanonicalPayload.value !== canonicalPayload) {
    commandId = generateCommandId()
    activeEditCommandId.value = commandId
    lastEditCanonicalPayload.value = canonicalPayload
  }

  try {
    await updateMutation.mutateAsync({
      id: selectedChallenge.value.id,
      payload: {
        command_id: commandId,
        data_epoch: account.context.data_epoch,
        base_version: editBaseVersion.value,
        name: trimmedName,
        description: normalizedDescription,
      },
    })
  } catch (error) {
    if (error instanceof ChallengeApiError) {
      if (error.status === 409 && error.problem?.code === 'version_conflict') {
        // Finding 4: Preserve dirty inputs, do NOT advance editBaseVersion automatically!
        editConflictSnapshot.value = error.problem.current_snapshot ?? null
        // Invalidate in background so challenge list reflects latest server data
        queryClient.invalidateQueries({ queryKey: ['challenges'] })
      } else if (error.status === 422 && error.validation?.errors) {
        for (const [key, msgs] of Object.entries(error.validation.errors)) {
          editErrors.value[key] = msgs[0] ?? 'Dữ liệu không hợp lệ.'
        }
      } else {
        editGeneralError.value = error.message
      }
    } else {
      editGeneralError.value = 'Không thể lưu thay đổi. Vui lòng thử lại.'
    }
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-900">Quản lý Challenge</h2>
        <p class="text-sm text-slate-600">Theo dõi mục tiêu thói quen linh hoạt N ngày mỗi tuần.</p>
      </div>
      <button
        type="button"
        id="create-challenge-btn"
        class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
        @click="startCreate"
      >
        <span>+ Tạo challenge</span>
      </button>
    </div>

    <!-- Global mutation blocked alert if context is not ready or write_state is not open -->
    <div
      v-if="mutationBlockedReason"
      role="alert"
      id="account-status-alert"
      class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <div class="font-semibold">⚠️ Cảnh báo ngữ cảnh tài khoản</div>
      <p class="mt-1 text-xs leading-relaxed text-amber-800">
        {{ mutationBlockedReason }}
      </p>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <!-- Challenge List Section -->
      <section
        aria-label="Danh sách Challenge"
        class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1"
      >
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="font-semibold text-slate-900">Danh sách Challenge</h3>
          <span class="text-xs font-medium text-slate-500">{{ challenges.length }} challenge</span>
        </div>

        <div v-if="isLoading" class="py-8 text-center text-sm text-slate-500" role="status">
          Đang tải danh sách challenge…
        </div>

        <div v-else-if="isError" class="py-8 text-center text-sm text-rose-700" role="alert">
          <p>Không thể tải danh sách challenge.</p>
          <button
            type="button"
            class="mt-2 text-xs font-semibold text-indigo-700 underline hover:text-indigo-900"
            @click="() => refetch()"
          >
            Thử lại
          </button>
        </div>

        <div v-else-if="challenges.length === 0" class="py-8 text-center text-sm text-slate-500">
          Chưa có challenge nào. Hãy tạo challenge đầu tiên!
        </div>

        <ul v-else class="mt-3 divide-y divide-slate-100" role="list">
          <li
            v-for="challenge in challenges"
            :key="challenge.id"
            class="group cursor-pointer rounded-xl p-3 transition hover:bg-slate-50"
            :class="{
              'bg-indigo-50/80 ring-1 ring-indigo-200': selectedId === challenge.id && mode !== 'create',
            }"
            @click="selectChallenge(challenge)"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="font-medium text-slate-900 group-hover:text-indigo-700">
                {{ challenge.name }}
              </span>
              <span
                class="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
              >
                Đang theo dõi
              </span>
            </div>
            <div class="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>Mục tiêu: {{ challenge.target_days }} ngày/tuần</span>
              <span>Từ {{ challenge.start_date }}</span>
            </div>
          </li>
        </ul>
      </section>

      <!-- Detail / Form Pane -->
      <section
        aria-label="Chi tiết hoặc chỉnh sửa Challenge"
        class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"
      >
        <!-- CREATE FORM -->
        <div v-if="mode === 'create'" class="space-y-5">
          <div class="border-b border-slate-100 pb-3">
            <h3 class="text-lg font-semibold text-slate-900">Tạo challenge mới</h3>
            <p class="text-sm text-slate-500">
              Thiết lập mục tiêu thực hiện N ngày mỗi tuần. Ngày bắt đầu là ngày tài khoản hôm nay.
            </p>
          </div>

          <div
            v-if="createGeneralError"
            role="alert"
            class="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            {{ createGeneralError }}
          </div>

          <form novalidate class="space-y-4" @submit.prevent="submitCreate">
            <div>
              <label for="create-name" class="block text-sm font-medium text-slate-700">
                Tên challenge <span class="text-rose-600">*</span>
              </label>
              <input
                id="create-name"
                v-model="createForm.name"
                type="text"
                name="name"
                required
                class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                :class="{ 'border-rose-500 focus:border-rose-500 focus:ring-rose-500': createErrors.name }"
                placeholder="Ví dụ: Chạy bộ, Học tiếng Anh, Đọc sách..."
              />
              <p
                v-if="createErrors.name"
                id="create-name-error"
                role="alert"
                class="mt-1 text-xs font-medium text-rose-600"
              >
                {{ createErrors.name }}
              </p>
            </div>

            <div>
              <label for="create-description" class="block text-sm font-medium text-slate-700">
                Mô tả <span class="text-xs text-slate-400">(tùy chọn)</span>
              </label>
              <textarea
                id="create-description"
                v-model="createForm.description"
                name="description"
                rows="3"
                class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Ghi chú thêm về mục tiêu, thời gian hoặc lưu ý..."
              ></textarea>
            </div>

            <div>
              <label for="create-target" class="block text-sm font-medium text-slate-700">
                Mục tiêu số ngày mỗi tuần <span class="text-rose-600">*</span>
              </label>
              <input
                id="create-target"
                v-model.number="createForm.target_days"
                type="number"
                name="target_days"
                min="1"
                max="7"
                step="1"
                required
                class="mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                :class="{ 'border-rose-500 focus:border-rose-500 focus:ring-rose-500': createErrors.target_days }"
              />
              <p class="mt-1 text-xs text-slate-500">Chọn số ngày nguyên từ 1 đến 7 ngày/tuần.</p>
              <p
                v-if="createErrors.target_days"
                id="create-target-error"
                role="alert"
                class="mt-1 text-xs font-medium text-rose-600"
              >
                {{ createErrors.target_days }}
              </p>
            </div>

            <div class="rounded-lg bg-slate-50 p-3">
              <span class="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Ngày bắt đầu
              </span>
              <p class="mt-0.5 text-sm font-medium text-slate-900" id="create-start-date-display">
                {{ account.context?.account_date || 'Hôm nay theo tài khoản' }}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                Ngày bắt đầu được cố định theo ngày hôm nay của tài khoản. Bạn không cần chọn thứ cố định trong tuần.
              </p>
            </div>

            <div class="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                id="create-cancel-btn"
                class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
                @click="cancelCreate"
              >
                Hủy
              </button>
              <button
                type="submit"
                id="create-submit-btn"
                :disabled="createMutation.isPending.value || isMutationBlocked"
                class="inline-flex items-center rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                {{ createMutation.isPending.value ? 'Đang tạo…' : 'Tạo challenge' }}
              </button>
            </div>
          </form>
        </div>

        <!-- EDIT FORM -->
        <div v-else-if="mode === 'edit' && selectedChallenge" class="space-y-5">
          <div class="border-b border-slate-100 pb-3">
            <h3 class="text-lg font-semibold text-slate-900">Chỉnh sửa thông tin challenge</h3>
            <p class="text-sm text-slate-500">
              Bạn có thể sửa tên và mô tả. Ngày bắt đầu và mục tiêu không thể thay đổi sau khi tạo.
            </p>
          </div>

          <!-- Conflict Warning Banner (Finding 4: Preserves dirty inputs, does not invite blind resubmit) -->
          <div
            v-if="editConflictSnapshot"
            role="alert"
            id="conflict-alert"
            class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <div class="font-semibold">⚠️ Dữ liệu đã được cập nhật từ thiết bị khác</div>
            <p class="mt-1 text-xs leading-relaxed text-amber-800">
              Bản lưu mới nhất trên máy chủ: Tên: “<strong>{{ editConflictSnapshot.name }}</strong
              >”{{ editConflictSnapshot.description ? `, Mô tả: “${editConflictSnapshot.description}”` : '' }} (Phiên bản {{ editConflictSnapshot.row_version }}).
              Dữ liệu bạn vừa nhập vẫn được giữ nguyên để bạn tham khảo. Để tránh ghi đè dữ liệu mới hơn, vui lòng hủy để xem và chỉnh sửa từ bản mới nhất.
            </p>
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                id="conflict-cancel-btn"
                class="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                @click="cancelEdit"
              >
                Hủy và xem bản mới nhất
              </button>
            </div>
          </div>

          <div
            v-if="editGeneralError"
            role="alert"
            class="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            {{ editGeneralError }}
          </div>

          <form novalidate class="space-y-4" @submit.prevent="submitEdit">
            <div>
              <label for="edit-name" class="block text-sm font-medium text-slate-700">
                Tên challenge <span class="text-rose-600">*</span>
              </label>
              <input
                id="edit-name"
                v-model="editForm.name"
                type="text"
                name="name"
                required
                class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                :class="{ 'border-rose-500 focus:border-rose-500 focus:ring-rose-500': editErrors.name }"
              />
              <p
                v-if="editErrors.name"
                id="edit-name-error"
                role="alert"
                class="mt-1 text-xs font-medium text-rose-600"
              >
                {{ editErrors.name }}
              </p>
            </div>

            <div>
              <label for="edit-description" class="block text-sm font-medium text-slate-700">
                Mô tả <span class="text-xs text-slate-400">(tùy chọn)</span>
              </label>
              <textarea
                id="edit-description"
                v-model="editForm.description"
                name="description"
                rows="3"
                class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              ></textarea>
            </div>

            <!-- Read-only invariant attributes -->
            <div class="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3">
              <div>
                <span class="block text-xs font-medium text-slate-500">Mục tiêu hiện tại</span>
                <p class="mt-0.5 text-sm font-semibold text-slate-800">
                  {{ selectedChallenge.target_days }} ngày/tuần
                </p>
              </div>
              <div>
                <span class="block text-xs font-medium text-slate-500">Ngày bắt đầu</span>
                <p class="mt-0.5 text-sm font-semibold text-slate-800">
                  {{ selectedChallenge.start_date }}
                </p>
              </div>
              <p class="col-span-2 text-xs text-slate-500">
                Ngày bắt đầu và mục tiêu tuần được bảo toàn và không thể chỉnh sửa tại đây.
              </p>
            </div>

            <div class="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                id="edit-cancel-btn"
                class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
                @click="cancelEdit"
              >
                Hủy
              </button>
              <button
                type="submit"
                id="edit-submit-btn"
                :disabled="updateMutation.isPending.value || isMutationBlocked || !!editConflictSnapshot"
                class="inline-flex items-center rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                {{ updateMutation.isPending.value ? 'Đang lưu…' : 'Lưu thay đổi' }}
              </button>
            </div>
          </form>
        </div>

        <!-- DETAIL VIEW -->
        <div v-else-if="mode === 'detail' && selectedChallenge" class="space-y-6">
          <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div class="flex items-center gap-2.5">
                <h3 class="text-xl font-bold text-slate-900" id="challenge-detail-name">
                  {{ selectedChallenge.name }}
                </h3>
                <span
                  class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                >
                  Đang theo dõi
                </span>
              </div>
              <p class="mt-1 text-sm text-slate-500">Mã định danh: {{ selectedChallenge.id }}</p>
            </div>
            <button
              type="button"
              id="edit-challenge-btn"
              class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
              @click="startEdit"
            >
              Chỉnh sửa
            </button>
          </div>

          <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <dt class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mục tiêu số ngày</dt>
              <dd class="mt-1 text-lg font-bold text-indigo-700" id="challenge-detail-target">
                {{ selectedChallenge.target_days }} ngày / tuần
              </dd>
            </div>

            <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <dt class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ngày bắt đầu</dt>
              <dd class="mt-1 text-lg font-bold text-slate-900" id="challenge-detail-start-date">
                {{ selectedChallenge.start_date }}
              </dd>
            </div>

            <div class="col-span-full rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <dt class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mô tả</dt>
              <dd class="mt-1 text-sm text-slate-700 whitespace-pre-line" id="challenge-detail-description">
                {{ selectedChallenge.description || 'Không có mô tả.' }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- EMPTY STATE (Nothing selected) -->
        <div v-else class="flex flex-col items-center justify-center py-16 text-center">
          <div class="rounded-full bg-slate-100 p-3 text-slate-400">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h4 class="mt-3 text-sm font-semibold text-slate-900">Chưa chọn challenge</h4>
          <p class="mt-1 text-xs text-slate-500">
            Chọn một challenge từ danh sách bên trái hoặc tạo challenge mới.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
