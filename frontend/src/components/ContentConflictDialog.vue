<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type ConflictChoice = 'local' | 'server'

const props = defineProps<{
  open: boolean
  resourceLabel: string
  localText: string
  serverText: string
  serverVersion: number
  clientRevision: number
  busy: boolean
  error: string | null
}>()

const emit = defineEmits<{
  confirm: [payload: {
    choice: ConflictChoice
    expectedServerVersion: number
    expectedClientRevision: number
  }]
  close: []
}>()

const dialogElement = ref<HTMLDialogElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const selectedChoice = ref<ConflictChoice | null>(null)
let returnFocusElement: HTMLElement | null = null

function restoreFocus(): void {
  if (returnFocusElement?.isConnected) returnFocusElement.focus()
  returnFocusElement = null
}

function syncDialog(open: boolean): void {
  const dialog = dialogElement.value
  if (!dialog) return

  if (open) {
    if (dialog.open) return
    const activeElement = document.activeElement
    returnFocusElement = activeElement instanceof HTMLElement ? activeElement : null
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    void nextTick(() => closeButton.value?.focus())
    return
  }

  selectedChoice.value = null
  if (dialog.open) {
    if (typeof dialog.close === 'function') dialog.close()
    else dialog.removeAttribute('open')
  }
  restoreFocus()
}

function close(): void {
  emit('close')
}

function recoverDisabledFocus(): void {
  const dialog = dialogElement.value
  const active = document.activeElement
  if (!dialog?.open || !(active instanceof HTMLElement) || !dialog.contains(active)) return

  // Capture before Vue disables the focused control. Chromium may then blur it to BODY.
  void nextTick(() => {
    if (!props.open || !dialog.open || !active.isConnected || !active.matches(':disabled')) return
    const focused = document.activeElement
    if (focused === active || focused === document.body) closeButton.value?.focus()
  })
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (event.isComposing || event.keyCode === 229) return
    event.preventDefault()
    close()
    return
  }

  if (event.key !== 'Tab' || event.isComposing || event.keyCode === 229) return
  const dialog = dialogElement.value
  if (!dialog) return
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled])',
  )).filter(element => !element.matches(':disabled') && !element.hidden && element.getAttribute('aria-hidden') !== 'true')
  if (!focusable.length) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  const active = document.activeElement
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

function preventNativeCancel(event: Event): void {
  // Escape is handled above so IME composition is never consumed as a dialog shortcut.
  event.preventDefault()
}

function confirmChoice(): void {
  if (!selectedChoice.value || props.busy) return
  emit('confirm', {
    choice: selectedChoice.value,
    expectedServerVersion: props.serverVersion,
    expectedClientRevision: props.clientRevision,
  })
}

watch(() => props.open, syncDialog, { flush: 'post' })
watch(() => props.busy, recoverDisabledFocus)
watch(() => [props.serverVersion, props.clientRevision], () => {
  recoverDisabledFocus()
  selectedChoice.value = null
})

onMounted(() => {
  if (props.open) syncDialog(true)
})

onBeforeUnmount(() => {
  const dialog = dialogElement.value
  if (dialog?.open) {
    if (typeof dialog.close === 'function') dialog.close()
    else dialog.removeAttribute('open')
  }
})
</script>

<template>
  <dialog
    id="content-conflict-dialog"
    ref="dialogElement"
    aria-modal="true"
    aria-labelledby="content-conflict-title"
    aria-describedby="content-conflict-description"
    class="max-h-[min(90dvh,52rem)] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-xl border border-slate-300 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
    @keydown="handleKeydown"
    @cancel="preventNativeCancel"
  >
    <div class="space-y-5 p-4 sm:p-6">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h2 id="content-conflict-title" class="text-lg font-semibold">Giải quyết xung đột nhật ký</h2>
          <p id="content-conflict-description" class="mt-1 text-sm text-slate-600">
            {{ resourceLabel }} · phiên bản máy chủ {{ serverVersion }} · bản nháp {{ clientRevision }}.
            Chọn rõ nội dung cần giữ; nội dung còn lại sẽ bị thay thế sau khi máy chủ xác nhận.
          </p>
        </div>
        <button
          id="content-conflict-close"
          ref="closeButton"
          type="button"
          class="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
          @click="close"
        >
          Để sau
        </button>
      </header>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section aria-labelledby="content-conflict-local-heading" class="min-w-0 rounded-lg border border-slate-200 p-3">
          <h3 id="content-conflict-local-heading" class="font-semibold">Bản đang nhập trên thiết bị này</h3>
          <p class="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm leading-relaxed">{{ localText }}</p>
        </section>
        <section aria-labelledby="content-conflict-server-heading" class="min-w-0 rounded-lg border border-slate-200 p-3">
          <h3 id="content-conflict-server-heading" class="font-semibold">Bản đã lưu trên máy chủ (phiên bản {{ serverVersion }})</h3>
          <p class="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm leading-relaxed">{{ serverText }}</p>
        </section>
      </div>

      <fieldset :disabled="busy" class="space-y-3">
        <legend class="font-medium">Chọn phiên bản nhật ký sẽ giữ lại</legend>
        <label for="conflict-local" class="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-300 p-3 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50">
          <input id="conflict-local" v-model="selectedChoice" type="radio" name="conflict-choice" value="local" class="mt-1 accent-indigo-700">
          <span>
            <span class="block font-medium">Giữ bản đang nhập trên thiết bị này</span>
            <span class="mt-1 block text-sm text-slate-600">Bản đã lưu trên máy chủ sẽ được thay bằng bản đang nhập sau khi xác nhận.</span>
          </span>
        </label>
        <label for="conflict-server" class="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-300 p-3 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50">
          <input id="conflict-server" v-model="selectedChoice" type="radio" name="conflict-choice" value="server" class="mt-1 accent-indigo-700">
          <span>
            <span class="block font-medium">Dùng bản đã lưu trên máy chủ</span>
            <span class="mt-1 block text-sm text-slate-600">Bản đang nhập trên thiết bị này sẽ được thay bằng bản máy chủ sau khi xác nhận.</span>
          </span>
        </label>
      </fieldset>

      <p v-if="error" role="alert" aria-live="polite" class="rounded-md bg-rose-50 p-3 text-sm text-rose-800">
        {{ error }}
      </p>
      <p v-if="busy" role="status" aria-live="polite" class="text-sm text-slate-600">Đang gửi lựa chọn; đóng hộp thoại không hủy yêu cầu.</p>

      <footer class="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          class="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
          @click="close"
        >
          Để sau
        </button>
        <button
          id="content-conflict-confirm"
          type="button"
          :disabled="!selectedChoice || busy"
          :aria-busy="busy ? 'true' : 'false'"
          class="rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-indigo-600"
          @click="confirmChoice"
        >
          Xác nhận lựa chọn
        </button>
      </footer>
    </div>
  </dialog>
</template>
