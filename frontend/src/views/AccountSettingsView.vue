<script setup lang="ts">
import { useAccountStore } from '../stores/account'

const account = useAccountStore()
</script>

<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
    <h2 class="text-2xl font-semibold">Cài đặt tài khoản</h2>
    <p v-if="account.status === 'loading' || account.status === 'unknown'" class="mt-4" role="status">
      Đang tải cài đặt…
    </p>
    <p v-else-if="account.status === 'error'" class="mt-4 text-rose-800" role="alert">
      Không thể tải timezone tài khoản. Hãy thử tải lại.
    </p>
    <dl v-else-if="account.context" class="mt-6">
      <dt class="text-sm font-medium text-slate-600">Timezone</dt>
      <dd class="mt-1 font-mono text-base">{{ account.context.timezone }}</dd>
      <p class="mt-2 text-sm text-slate-500">Timezone cố định và chỉ đọc trong MVP.</p>
    </dl>
  </section>
</template>
