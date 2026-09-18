<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'

import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const navigationOpen = ref(false)
const loggingOut = ref(false)

const navigation = [
  { to: '/today', label: 'Hôm nay' },
  { to: '/challenges', label: 'Challenge' },
  { to: '/notes', label: 'Ghi chú' },
  { to: '/calendar', label: 'Lịch' },
]

async function logOut(): Promise<void> {
  loggingOut.value = true
  try {
    await auth.logOut()
    navigationOpen.value = false
    await router.replace('/sign-in')
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

    <main id="main-content" class="mx-auto w-full min-w-0 max-w-6xl px-4 py-10 sm:px-6" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
