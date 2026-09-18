<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
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
        <RouterLink class="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4" to="/">
          <h1 class="text-xl font-semibold tracking-tight">NoteFlow</h1>
        </RouterLink>

        <nav aria-label="Điều hướng chính" class="ml-auto flex flex-wrap items-center gap-2">
          <RouterLink class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100" to="/">
            Nền tảng
          </RouterLink>
          <RouterLink
            class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
            to="/smoke/deep-link"
          >
            Deep link
          </RouterLink>
        </nav>
      </div>
    </header>

    <main id="main-content" class="mx-auto w-full min-w-0 max-w-6xl px-4 py-10 sm:px-6" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
