<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { getFoundationHealth } from '../api/http'

const state = ref<'loading' | 'ready' | 'error'>('loading')

onMounted(async () => {
  try {
    await getFoundationHealth()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
    <p class="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Nền tảng NoteFlow</p>
    <h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Một ứng dụng, cùng một origin</h2>
    <p class="mt-4 max-w-2xl overflow-wrap-anywhere text-base leading-7 text-slate-600">
      Vue và Laravel đã sẵn sàng cho các capability tiếp theo của NoteFlow.
    </p>
    <p
      v-if="state !== 'error'"
      class="mt-8 inline-flex rounded-full px-4 py-2 text-sm font-medium"
      :class="state === 'ready' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'"
      role="status"
    >
      {{ state === 'ready' ? 'API NoteFlow sẵn sàng' : 'Đang kiểm tra nền tảng API…' }}
    </p>
    <p v-else class="mt-8 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-900" role="alert">
      Không thể kết nối API nền tảng. Hãy kiểm tra Laravel đang chạy và thử tải lại.
    </p>
  </section>
</template>
