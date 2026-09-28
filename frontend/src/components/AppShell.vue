<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'

import { useAccountStore } from '../stores/account'
import { useAuthStore } from '../stores/auth'
import { useJournalDraftsStore } from '../stores/journalDrafts'
import { useSyncStore } from '../stores/sync'

const auth = useAuthStore()
const account = useAccountStore()
const journalDrafts = useJournalDraftsStore()
const sync = useSyncStore()
const router = useRouter()
const navigationOpen = ref(false)
const loggingOut = ref(false)
const logoutError = ref<string | null>(null)

const navigation = [
  { to: '/today', label: 'Hôm nay' },
  { to: '/challenges', label: 'Challenge' },
  { to: '/notes', label: 'Ghi chú' },
  { to: '/calendar', label: 'Lịch' },
]

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!journalDrafts.hasUnsavedDrafts()) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  void sync.start()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
})

async function logOut(): Promise<void> {
  if (journalDrafts.hasUnsavedDrafts() && !window.confirm('Bạn có bản nháp chưa lưu. Đăng xuất sẽ xóa bản nháp trong phiên này. Tiếp tục?')) {
    return
  }

  loggingOut.value = true
  logoutError.value = null
  try {
    await auth.logOut()
    sync.stop()
    navigationOpen.value = false
    await router.replace('/sign-in')
  } catch {
    logoutError.value = 'Không thể đăng xuất. Phiên làm việc và bản nháp vẫn được giữ.'
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <a
    class="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-slate-950 px-4 py-2 text-white transition focus:translate-y-0"
    href="#main-content"
  >
    Bỏ qua điều hướng
  </a>

  <div class="min-h-screen min-w-0 bg-slate-50 text-slate-950">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
        <RouterLink
          class="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
          :to="auth.status === 'authenticated' ? '/today' : '/sign-in'"
        >
          <h1 class="text-xl font-semibold tracking-tight">NoteFlow</h1>
        </RouterLink>

        <!-- Sync Status Indicator -->
        <div
          v-if="auth.status === 'authenticated'"
          id="sync-status"
          data-testid="sync-status"
          class="flex items-center gap-2 text-xs"
          role="status"
          aria-live="polite"
        >
          <span
            v-if="!sync.isOnline"
            class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-800"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Ngoại tuyến
          </span>
          <span
            v-else-if="sync.syncStatus === 'error'"
            class="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 font-medium text-rose-800"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Lỗi đồng bộ
            <button
              type="button"
              class="ml-1 font-semibold text-indigo-700 underline hover:text-indigo-900"
              @click="sync.reconcile(true)"
            >
              Thử lại
            </button>
          </span>
          <span
            v-else-if="sync.syncStatus === 'syncing'"
            class="inline-flex items-center gap-1.5 text-slate-500"
          >
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
            Đang đồng bộ...
          </span>
          <span
            v-else-if="sync.syncStatus === 'synced'"
            class="inline-flex items-center gap-1.5 text-slate-500"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Đã đồng bộ
          </span>
        </div>

        <button
          v-if="auth.status === 'authenticated'"
          aria-controls="primary-navigation"
          :aria-expanded="navigationOpen"
          class="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium md:hidden"
          type="button"
          @click="navigationOpen = !navigationOpen"
        >
          Mở điều hướng
        </button>

        <nav
          v-if="auth.status === 'authenticated'"
          id="primary-navigation"
          aria-label="Điều hướng chính"
          class="w-full items-center gap-1 md:ml-auto md:flex md:w-auto"
          :class="navigationOpen ? 'block' : 'hidden md:flex'"
        >
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            class="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
            :to="item.to"
            @click="navigationOpen = false"
          >
            {{ item.label }}
          </RouterLink>
          <RouterLink
            class="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 md:ml-3"
            to="/settings"
            @click="navigationOpen = false"
          >
            Cài đặt
          </RouterLink>
          <button
            class="mt-2 rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 md:mt-0"
            :disabled="loggingOut"
            type="button"
            @click="logOut"
          >
            Đăng xuất
          </button>
        </nav>
      </div>
    </header>

    <div
      v-if="logoutError"
      role="alert"
      class="border-b border-rose-300 bg-rose-50 px-4 py-2.5 text-center text-sm font-medium text-rose-900 sm:px-6"
    >
      {{ logoutError }}
    </div>

    <!-- Write State Warning Banner -->
    <div
      v-if="auth.status === 'authenticated' && account.context?.write_state && account.context.write_state !== 'open'"
      role="alert"
      class="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-xs font-medium text-amber-900 sm:px-6"
    >
      Tài khoản đang trong trạng thái tạm khóa ghi ({{ account.context.write_state }}). Các thao tác thêm mới hoặc chỉnh sửa tạm thời bị khóa.
    </div>

    <main id="main-content" class="mx-auto w-full min-w-0 max-w-6xl px-4 py-10 sm:px-6" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
