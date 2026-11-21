<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

import {
  createNote,
  generateCommandId,
  updateNote,
  type Note,
  type NoteMutationResult,
} from '../api/notes'
import { useAccountStore } from '../stores/account'
import { useAuthStore } from '../stores/auth'
import { useSyncStore } from '../stores/sync'

const props = withDefaults(
  defineProps<{
    notebookId: string
    notebookName?: string
    initialNote?: Note | null
    autoFocus?: boolean
    saveDelay?: number
  }>(),
  {
    notebookName: 'Ghi chú',
    initialNote: null,
    autoFocus: true,
    saveDelay: 500,
  },
)

const emit = defineEmits<{
  (e: 'saved', note: Note, isCreate: boolean): void
  (e: 'discarded'): void
  (e: 'dirtyChange', isDirty: boolean): void
}>()

const account = useAccountStore()
const auth = useAuthStore()
const sync = useSyncStore()

const currentNote = ref<Note | null>(props.initialNote)
const title = ref(props.initialNote?.title ?? '')
const body = ref(props.initialNote?.body ?? '')
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>(props.initialNote ? 'saved' : 'idle')
const saveError = ref<string | null>(null)
const isDirty = ref(false)
const hasEverHadText = ref(Boolean(props.initialNote?.title || props.initialNote?.body))

const bodyInputRef = ref<HTMLTextAreaElement | null>(null)
const titleInputRef = ref<HTMLInputElement | null>(null)

let saveTimer: ReturnType<typeof setTimeout> | null = null
let inFlightExecution: Promise<boolean> | null = null
let pendingSaveAfterInFlight = false

watch(
  () => props.initialNote,
  (newNote) => {
    if (newNote?.id !== currentNote.value?.id) {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      pendingSaveAfterInFlight = false
      currentNote.value = newNote ?? null
      title.value = newNote?.title ?? ''
      body.value = newNote?.body ?? ''
      saveStatus.value = newNote ? 'saved' : 'idle'
      saveError.value = null
      isDirty.value = false
      hasEverHadText.value = Boolean(newNote?.title || newNote?.body)
      if (!newNote && props.autoFocus) {
        void nextTick(() => {
          bodyInputRef.value?.focus()
        })
      }
    }
  },
)

watch(isDirty, (dirty) => {
  emit('dirtyChange', dirty)
})

function onContentInput() {
  saveError.value = null

  if (currentNote.value) {
    // Existing note
    if (title.value !== currentNote.value.title || body.value !== currentNote.value.body) {
      isDirty.value = true
      saveStatus.value = 'idle'
      scheduleSave()
    } else {
      isDirty.value = false
      saveStatus.value = 'saved'
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
    }
  } else {
    // Brand new note
    if (title.value.length > 0 || body.value.length > 0) {
      hasEverHadText.value = true
    }
    const hasContent = title.value.trim() !== '' || body.value.trim() !== ''
    if (hasContent) {
      isDirty.value = true
      saveStatus.value = 'idle'
      scheduleSave()
    } else {
      isDirty.value = false
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
    }
  }
}

function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saveTimer = setTimeout(() => {
    saveTimer = null
    void executeSave()
  }, props.saveDelay)
}

async function executeSave(): Promise<boolean> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }

  if (inFlightExecution) {
    pendingSaveAfterInFlight = true
    return await inFlightExecution
  }

  const execution = doSave().finally(() => {
    if (inFlightExecution === execution) {
      inFlightExecution = null
    }
  })
  inFlightExecution = execution

  return await inFlightExecution
}

async function doSave(): Promise<boolean> {
  const existingNote = currentNote.value
  const isCreating = !existingNote
  const targetTitle = title.value
  const targetBody = body.value

  if (isCreating) {
    // The server never creates an empty note; client never sends create for blank note
    if (targetTitle.trim() === '' && targetBody.trim() === '') {
      isDirty.value = false
      return true
    }
  } else {
    // Existing note: only update if changed from current snapshot
    if (targetTitle === existingNote.title && targetBody === existingNote.body) {
      isDirty.value = false
      saveStatus.value = 'saved'
      return true
    }
  }

  saveStatus.value = 'saving'
  saveError.value = null

  try {
    const epoch = account.context?.data_epoch ?? 1
    const commandId = generateCommandId()

    let result: NoteMutationResult
    if (isCreating) {
      result = await createNote({
        command_id: commandId,
        data_epoch: epoch,
        notebook_id: props.notebookId,
        title: targetTitle,
        body: targetBody,
      })
    } else {
      result = await updateNote(existingNote.id, {
        command_id: commandId,
        data_epoch: epoch,
        base_version: existingNote.row_version,
        title: targetTitle,
        body: targetBody,
      })
    }

    await sync.recordMutationAck(result.account_revision, result.data_epoch, auth.generation)

    currentNote.value = result.note
    emit('saved', result.note, isCreating)

    if (title.value === targetTitle && body.value === targetBody) {
      isDirty.value = false
      saveStatus.value = 'saved'
    } else {
      // User typed more while save was in flight
      isDirty.value = true
      scheduleSave()
    }

    if (pendingSaveAfterInFlight) {
      pendingSaveAfterInFlight = false
      scheduleSave()
    }

    return true
  } catch (err: unknown) {
    pendingSaveAfterInFlight = false
    saveStatus.value = 'error'
    const msg = err instanceof Error ? err.message : 'Lưu ghi chú thất bại.'
    saveError.value = msg
    // Invariant: keeps the text and shows an error on failure
    return false
  }
}

async function flush(): Promise<boolean> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }

  if (inFlightExecution) {
    const success = await inFlightExecution
    if (!success) {
      return false
    }
  }

  // If brand-new editor that never had text, discard without request
  if (!currentNote.value && !hasEverHadText.value) {
    emit('discarded')
    return true
  }

  // If brand-new editor that currently has blank text
  if (!currentNote.value && title.value.trim() === '' && body.value.trim() === '') {
    emit('discarded')
    return true
  }

  if (isDirty.value) {
    return await executeSave()
  }

  return true
}

onMounted(() => {
  if (props.autoFocus) {
    void nextTick(() => {
      bodyInputRef.value?.focus()
    })
  }
})

defineExpose({
  flush,
  isDirty,
  saveStatus,
  saveError,
  title,
  body,
  currentNote,
  focusBody: () => bodyInputRef.value?.focus(),
})
</script>

<template>
  <div class="flex h-full flex-col space-y-4">
    <!-- Header of editor -->
    <div class="flex items-center justify-between border-b border-slate-200 pb-3">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-slate-500" data-testid="editor-notebook-name">
          {{ notebookName }}
        </span>
      </div>

      <div class="flex items-center gap-2 text-xs">
        <span
          v-if="saveStatus === 'saving'"
          role="status"
          data-testid="note-save-status"
          class="text-slate-500"
        >
          Đang lưu…
        </span>
        <span
          v-else-if="saveStatus === 'saved'"
          data-testid="note-save-status"
          class="font-medium text-emerald-600"
        >
          Đã lưu
        </span>
      </div>
    </div>

    <!-- Error message if save failed -->
    <div
      v-if="saveError"
      role="alert"
      data-testid="note-save-error"
      class="rounded-md bg-rose-50 p-2 text-xs text-rose-700"
    >
      {{ saveError }}
    </div>

    <!-- Title field: separately labelled -->
    <div class="space-y-1">
      <label for="note-title" class="block text-xs font-medium text-slate-700">
        Tiêu đề
      </label>
      <input
        id="note-title"
        ref="titleInputRef"
        v-model="title"
        type="text"
        placeholder="Tiêu đề (tùy chọn)"
        data-testid="note-title-input"
        class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        @input="onContentInput"
      />
    </div>

    <!-- Body field: separately labelled -->
    <div class="flex-1 space-y-1 flex flex-col">
      <label for="note-body" class="block text-xs font-medium text-slate-700">
        Nội dung
      </label>
      <textarea
        id="note-body"
        ref="bodyInputRef"
        v-model="body"
        placeholder="Bắt đầu viết…"
        data-testid="note-body-input"
        class="w-full flex-1 min-h-[300px] resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        @input="onContentInput"
      />
    </div>
  </div>
</template>
