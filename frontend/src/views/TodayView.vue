<script setup lang="ts">
import { useAccountStore } from '../stores/account'

const account = useAccountStore()
</script>

<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
    <p class="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Hôm nay</p>
    <p v-if="account.status === 'loading' || account.status === 'unknown'" class="mt-4" role="status">
      Đang lấy ngày tài khoản…
    </p>
    <p v-else-if="account.status === 'error'" class="mt-4 text-rose-800" role="alert">
      Không thể xác định ngày tài khoản. Hãy thử tải lại.
    </p>
    <div v-else-if="account.context" class="mt-4 space-y-2">
      <h2 class="text-3xl font-semibold">{{ account.context.account_date }}</h2>
      <p class="text-slate-600">
        Tuần {{ account.context.week.start_date }} – {{ account.context.week.end_date }}
      </p>
    </div>
  </section>
</template>
