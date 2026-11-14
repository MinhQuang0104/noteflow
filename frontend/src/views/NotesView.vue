<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  createNotebook,
  deleteNotebook,
  generateCommandId,
  getNotebooks,
  NotebookApiError,
  renameNotebook,
  type Notebook,
  type NotebookListResult,
} from '../api/notebooks'
import { useAccountStore } from '../stores/account'
import { useAuthStore } from '../stores/auth'
import { useSyncStore } from '../stores/sync'

defineProps<{ title?: string }>()

const account = useAccountStore()
const auth = useAuthStore()
const sync = useSyncStore()
const queryClient = useQueryClient()

const {
  data: notebooksData,
  isLoading,
  isError,
  refetch,
} = useQuery({
  queryKey: ['notebooks'],
  queryFn: getNotebooks,
})

const orderedNotebooks = computed<Notebook[]>(() => {
  const list = notebooksData.value?.notebooks ?? []
  if (list.length <= 1) return list
  return [...list].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return 0
  })
})

const selectedId = ref<string | null>(null)

watch(
  orderedNotebooks,
  (list) => {
    if (list.length > 0) {
      if (!selectedId.value || !list.some((nb) => nb.id === selectedId.value)) {
        selectedId.value = list[0]?.id ?? null
      }
    } else {
      selectedId.value = null
    }
  },
  { immediate: true },
)

const selectedNotebook = computed<Notebook | null>(() => {
  if (!selectedId.value) return null
  return orderedNotebooks.value.find((nb) => nb.id === selectedId.value) ?? null
})

const notebookRefs = new Map<string, HTMLElement>()
function setNotebookRef(id: string, el: unknown) {
  if (el instanceof HTMLElement) {
    notebookRefs.set(id, el)
  } else {
    notebookRefs.delete(id)
  }
}

function selectNotebook(notebook: Notebook) {
  selectedId.value = notebook.id
}

// Create notebook state
const showCreateForm = ref(false)
const createName = ref('')
const createError = ref<string | null>(null)
const isCreateSubmitting = ref(false)
const createInputRef = ref<HTMLInputElement | null>(null)

function openCreateForm() {
  showCreateForm.value = true
  createName.value = ''
  createError.value = null
  void nextTick(() => {
    createInputRef.value?.focus()
  })
}

function closeCreateForm() {
  showCreateForm.value = false
  createName.value = ''
  createError.value = null
}

async function handleCreateSubmit() {
  if (isCreateSubmitting.value) return
  const trimmed = createName.value.trim()
  if (!trimmed) {
    createError.value = 'Tên cuốn vở không được để trống.'
    return
  }
  if (trimmed.length > 255) {
    createError.value = 'Tên cuốn vở không được vượt quá 255 ký tự.'
    return
  }
  createError.value = null
  isCreateSubmitting.value = true

  try {
    const result = await createNotebook({
      command_id: generateCommandId(),
      data_epoch: account.context?.data_epoch ?? 1,
      name: trimmed,
    })
    await sync.recordMutationAck(result.account_revision, result.data_epoch, auth.generation)

    queryClient.setQueryData<NotebookListResult>(['notebooks'], (old) => {
      if (!old) return { notebooks: [result.notebook] }
      return {
        notebooks: [...old.notebooks, result.notebook],
      }
    })

    selectedId.value = result.notebook.id
    createName.value = ''
    showCreateForm.value = false
  } catch (error) {
    if (error instanceof NotebookApiError && error.validation?.errors?.name?.[0]) {
      createError.value = error.validation.errors.name[0]
    } else if (error instanceof Error) {
      createError.value = error.message
    } else {
      createError.value = 'Tạo cuốn vở thất bại.'
    }
    // "a field error keeps the typed name" - createName is retained
  } finally {
    isCreateSubmitting.value = false
  }
}

// Rename notebook state
const renamingId = ref<string | null>(null)
const renameName = ref('')
const renameError = ref<string | null>(null)
const isRenameSubmitting = ref(false)
const renameInputEl = ref<HTMLInputElement | null>(null)

function setRenameInputRef(el: unknown) {
  if (el instanceof HTMLInputElement) {
    renameInputEl.value = el
  } else {
    renameInputEl.value = null
  }
}

function startRename(notebook: Notebook) {
  renamingId.value = notebook.id
  renameName.value = notebook.name
  renameError.value = null
  void nextTick(() => {
    renameInputEl.value?.focus()
  })
}

function cancelRename() {
  renamingId.value = null
  renameName.value = ''
  renameError.value = null
}

async function handleRenameSubmit(notebook: Notebook) {
  if (isRenameSubmitting.value) return
  const trimmed = renameName.value.trim()
  if (!trimmed) {
    renameError.value = 'Tên cuốn vở không được để trống.'
    return
  }
  if (trimmed.length > 255) {
    renameError.value = 'Tên cuốn vở không được vượt quá 255 ký tự.'
    return
  }
  renameError.value = null
  isRenameSubmitting.value = true

  try {
    const result = await renameNotebook(notebook.id, {
      command_id: generateCommandId(),
      data_epoch: account.context?.data_epoch ?? 1,
      base_version: notebook.row_version,
      name: trimmed,
    })
    await sync.recordMutationAck(result.account_revision, result.data_epoch, auth.generation)

    queryClient.setQueryData<NotebookListResult>(['notebooks'], (old) => {
      if (!old) return old
      return {
        notebooks: old.notebooks.map((nb) => (nb.id === result.notebook.id ? result.notebook : nb)),
      }
    })

    renamingId.value = null
    renameName.value = ''
  } catch (error) {
    if (error instanceof NotebookApiError && error.validation?.errors?.name?.[0]) {
      renameError.value = error.validation.errors.name[0]
    } else if (error instanceof Error) {
      renameError.value = error.message
    } else {
      renameError.value = 'Đổi tên cuốn vở thất bại.'
    }
    // "a field error keeps the typed name" - renameName is retained
  } finally {
    isRenameSubmitting.value = false
  }
}

// Delete notebook & confirmation dialog state
const actionErrors = ref<Record<string, string>>({})
const isConfirmDialogOpen = ref(false)
const notebookToDelete = ref<Notebook | null>(null)
const isDeleting = ref(false)
const cancelButtonRef = ref<HTMLButtonElement | null>(null)
const confirmDialogRef = ref<HTMLDialogElement | null>(null)

function syncDialog(open: boolean): void {
  const dialog = confirmDialogRef.value
  if (!dialog) return
  if (open) {
    if (dialog.open) return
    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal()
      } catch {
        dialog.setAttribute('open', '')
      }
    } else {
      dialog.setAttribute('open', '')
    }
    void nextTick(() => {
      cancelButtonRef.value?.focus()
    })
  } else {
    if (dialog.open || dialog.hasAttribute('open')) {
      if (typeof dialog.close === 'function') {
        try {
          dialog.close()
        } catch {
          dialog.removeAttribute('open')
        }
      } else {
        dialog.removeAttribute('open')
      }
    }
  }
}

watch(isConfirmDialogOpen, syncDialog, { flush: 'post' })

onMounted(() => {
  if (isConfirmDialogOpen.value) syncDialog(true)
})

onBeforeUnmount(() => {
  const dialog = confirmDialogRef.value
  if (dialog?.open) {
    if (typeof dialog.close === 'function') dialog.close()
    else dialog.removeAttribute('open')
  }
})

function handleDeleteClick(notebook: Notebook) {
  delete actionErrors.value[notebook.id]

  if (notebook.is_default) {
    actionErrors.value[notebook.id] = 'Không thể xóa cuốn vở mặc định.'
    return
  }
  if (notebook.note_count > 0) {
    actionErrors.value[notebook.id] = 'Không thể xóa cuốn vở còn chứa ghi chú.'
    return
  }

  notebookToDelete.value = notebook
  isConfirmDialogOpen.value = true
  void nextTick(() => {
    cancelButtonRef.value?.focus()
  })
}

function handleCancelDelete() {
  isConfirmDialogOpen.value = false
  notebookToDelete.value = null
}

async function handleConfirmDelete() {
  if (!notebookToDelete.value || isDeleting.value) return
  const target = notebookToDelete.value
  const currentList = orderedNotebooks.value
  const targetIndex = currentList.findIndex((nb) => nb.id === target.id)
  const notebookAbove = targetIndex > 0 ? currentList[targetIndex - 1] : null

  try {
    isDeleting.value = true
    const result = await deleteNotebook(target.id, {
      command_id: generateCommandId(),
      data_epoch: account.context?.data_epoch ?? 1,
      base_version: target.row_version,
    })
    await sync.recordMutationAck(result.account_revision, result.data_epoch, auth.generation)

    queryClient.setQueryData<NotebookListResult>(['notebooks'], (old) => {
      if (!old) return old
      return {
        notebooks: old.notebooks.filter((nb) => nb.id !== target.id),
      }
    })

    if (notebookAbove) {
      selectedId.value = notebookAbove.id
    } else if (orderedNotebooks.value.length > 0) {
      selectedId.value = orderedNotebooks.value[0]?.id ?? null
    }

    isConfirmDialogOpen.value = false
    notebookToDelete.value = null

    if (notebookAbove) {
      await nextTick()
      const el = notebookRefs.get(notebookAbove.id)
      el?.focus()
    }
  } catch (error) {
    if (error instanceof NotebookApiError) {
      actionErrors.value[target.id] = error.problem?.message ?? error.message
    } else if (error instanceof Error) {
      actionErrors.value[target.id] = error.message
    } else {
      actionErrors.value[target.id] = 'Xóa cuốn vở thất bại.'
    }
    isConfirmDialogOpen.value = false
    notebookToDelete.value = null
  } finally {
    isDeleting.value = false
  }
}

async function retryLoad() {
  await refetch()
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex items-center justify-between">
      <h2 class="text-2xl font-semibold text-slate-900">{{ title ?? 'Ghi chú' }}</h2>
    </header>

    <div class="flex flex-col gap-6 md:flex-row">
      <!-- Notebook column of the Notes workspace -->
      <aside class="w-full shrink-0 md:w-80" aria-label="Danh sách cuốn vở">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 class="text-base font-semibold text-slate-800">Cuốn vở</h3>
            <button
              v-if="!showCreateForm"
              type="button"
              data-testid="create-notebook-button"
              class="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-indigo-600"
              @click="openCreateForm"
            >
              + Vở mới
            </button>
          </div>

          <!-- Create Notebook Form -->
          <form
            v-if="showCreateForm"
            data-testid="create-notebook-form"
            class="my-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-2"
            @submit.prevent="handleCreateSubmit"
          >
            <label for="create-notebook-name" class="block text-xs font-medium text-slate-700">Tên cuốn vở mới</label>
            <input
              id="create-notebook-name"
              ref="createInputRef"
              v-model="createName"
              type="text"
              placeholder="Nhập tên cuốn vở"
              :disabled="isCreateSubmitting"
              data-testid="create-notebook-name-input"
              class="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
            />
            <p
              v-if="createError"
              role="alert"
              data-testid="create-notebook-error"
              class="text-xs text-rose-600"
            >
              {{ createError }}
            </p>
            <div class="flex justify-end gap-2 pt-1">
              <button
                type="button"
                :disabled="isCreateSubmitting"
                data-testid="create-notebook-cancel"
                class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-500"
                @click="closeCreateForm"
              >
                Hủy
              </button>
              <button
                type="submit"
                :disabled="isCreateSubmitting"
                data-testid="create-notebook-submit"
                class="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60"
              >
                {{ isCreateSubmitting ? 'Đang lưu…' : 'Lưu' }}
              </button>
            </div>
          </form>

          <!-- Notebook List States -->
          <div class="mt-3">
            <p v-if="isLoading" role="status" class="py-4 text-center text-sm text-slate-500">
              Đang tải danh sách vở…
            </p>

            <div
              v-else-if="isError"
              role="alert"
              data-testid="notebooks-load-error"
              class="py-4 text-center text-sm text-rose-800"
            >
              <p>Không thể tải danh sách cuốn vở.</p>
              <button
                type="button"
                data-testid="retry-load-button"
                class="mt-2 font-semibold text-indigo-700 underline hover:text-indigo-900"
                @click="retryLoad"
              >
                Thử lại
              </button>
            </div>

            <p
              v-else-if="orderedNotebooks.length === 0"
              data-testid="notebooks-empty"
              class="py-4 text-center text-sm text-slate-500"
            >
              Chưa có cuốn vở nào.
            </p>

            <!-- One-level notebook list -->
            <ul
              v-else
              role="list"
              data-testid="notebook-list"
              class="space-y-1"
            >
              <li
                v-for="notebook in orderedNotebooks"
                :key="notebook.id"
                :data-testid="'notebook-row-' + notebook.id"
                class="rounded-lg p-2 transition"
                :class="selectedId === notebook.id ? 'bg-indigo-50/70 border border-indigo-200/60' : 'hover:bg-slate-50'"
              >
                <div class="flex items-center justify-between gap-2">
                  <button
                    :ref="(el) => setNotebookRef(notebook.id, el)"
                    type="button"
                    tabindex="0"
                    :data-notebook-id="notebook.id"
                    :data-testid="'notebook-item-' + notebook.id"
                    class="flex flex-1 items-center gap-2 truncate text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded px-1"
                    :class="selectedId === notebook.id ? 'font-semibold text-indigo-950' : 'font-medium text-slate-700'"
                    @click="selectNotebook(notebook)"
                  >
                    <span class="truncate" :data-testid="'notebook-name-' + notebook.id">{{ notebook.name }}</span>
                    <span
                      v-if="notebook.is_default"
                      data-testid="default-badge"
                      class="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                    >
                      Mặc định
                    </span>
                  </button>

                  <div class="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      :data-testid="'rename-notebook-button-' + notebook.id"
                      class="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-indigo-500"
                      @click="startRename(notebook)"
                    >
                      Đổi tên
                    </button>
                    <button
                      type="button"
                      :data-testid="'delete-notebook-button-' + notebook.id"
                      class="rounded px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-rose-500"
                      @click="handleDeleteClick(notebook)"
                    >
                      Xóa
                    </button>
                  </div>
                </div>

                <!-- Inline Rename Form -->
                <form
                  v-if="renamingId === notebook.id"
                  :data-testid="'rename-notebook-form-' + notebook.id"
                  class="mt-2 rounded-md border border-slate-200 bg-white p-2.5 space-y-2 shadow-xs"
                  @submit.prevent="handleRenameSubmit(notebook)"
                >
                  <label :for="'rename-input-' + notebook.id" class="block text-xs font-medium text-slate-700">Đổi tên cuốn vở</label>
                  <input
                    :id="'rename-input-' + notebook.id"
                    :ref="setRenameInputRef"
                    v-model="renameName"
                    type="text"
                    :disabled="isRenameSubmitting"
                    :data-testid="'rename-notebook-name-input-' + notebook.id"
                    class="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                  />
                  <p
                    v-if="renameError"
                    role="alert"
                    :data-testid="'rename-notebook-error-' + notebook.id"
                    class="text-xs text-rose-600"
                  >
                    {{ renameError }}
                  </p>
                  <div class="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      :disabled="isRenameSubmitting"
                      :data-testid="'rename-notebook-cancel-' + notebook.id"
                      class="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-500"
                      @click="cancelRename"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      :disabled="isRenameSubmitting"
                      :data-testid="'rename-notebook-submit-' + notebook.id"
                      class="rounded-md bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60"
                    >
                      {{ isRenameSubmitting ? 'Đang lưu…' : 'Lưu' }}
                    </button>
                  </div>
                </form>

                <!-- Action Error / Delete Explanation -->
                <p
                  v-if="actionErrors[notebook.id]"
                  role="alert"
                  :data-testid="'delete-error-' + notebook.id"
                  class="mt-1 text-xs text-rose-600"
                >
                  {{ actionErrors[notebook.id] }}
                </p>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      <!-- Notes workspace main area / note list & editor placeholder -->
      <section class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Nội dung ghi chú">
        <div v-if="selectedNotebook">
          <div class="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 class="text-lg font-semibold text-slate-900" data-testid="selected-notebook-title">
              {{ selectedNotebook.name }}
            </h3>
            <span
              v-if="selectedNotebook.is_default"
              class="text-xs font-medium text-slate-500"
            >
              Vở mặc định
            </span>
          </div>

          <div class="py-16 text-center text-slate-500" data-testid="notebook-notes-empty">
            <p>{{ selectedNotebook.is_default ? 'Ghi lại ý tưởng đầu tiên của bạn.' : 'Cuốn vở này chưa có ghi chú.' }}</p>
          </div>
        </div>
        <div v-else-if="!isLoading && !isError" class="py-16 text-center text-slate-400">
          <p>Chọn hoặc tạo một cuốn vở để bắt đầu.</p>
        </div>
      </section>
    </div>

    <!-- Confirm Delete Dialog -->
    <dialog
      ref="confirmDialogRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      class="w-[min(28rem,calc(100vw-2rem))] max-w-md rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/40"
      @cancel.prevent="handleCancelDelete"
    >
      <h3 id="confirm-delete-title" class="text-lg font-semibold text-slate-900">
        Xác nhận xóa cuốn vở
      </h3>
      <p class="mt-2 text-sm text-slate-600">
        Bạn có chắc chắn muốn xóa cuốn vở <strong class="font-semibold text-slate-900">{{ notebookToDelete?.name }}</strong> không? Thao tác này không thể hoàn tác.
      </p>
      <div class="mt-6 flex justify-end gap-3">
        <button
          ref="cancelButtonRef"
          type="button"
          data-testid="confirm-dialog-cancel"
          autofocus
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          @click="handleCancelDelete"
        >
          Hủy
        </button>
        <button
          type="button"
          data-testid="confirm-dialog-confirm"
          :disabled="isDeleting"
          class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
          @click="handleConfirmDelete"
        >
          {{ isDeleting ? 'Đang xóa…' : 'Xóa' }}
        </button>
      </div>
    </dialog>
  </div>
</template>
