<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'

import { getChallenges, type Challenge } from '../api/challenges'
import { useAccountStore } from '../stores/account'

const account = useAccountStore()

const {
  data: challengesData,
  isLoading: isChallengesLoading,
  isError: isChallengesError,
  refetch: refetchChallenges,
} = useQuery({
  queryKey: ['challenges'],
  queryFn: getChallenges,
})

const challenges = computed<Challenge[]>(() => challengesData.value?.challenges ?? [])

async function retryChallengesLoad(): Promise<void> {
  await refetchChallenges()
}
</script>

<template>
  <section class="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
    <div>
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
    </div>

    <section id="today-challenges" aria-labelledby="today-challenges-heading" class="rounded-xl border border-slate-200 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 id="today-challenges-heading" class="text-lg font-semibold text-slate-900">Challenge hôm nay</h2>
          <p class="mt-1 text-xs text-slate-500">Mở chi tiết để xem và ghi nhật ký tùy chọn theo ngày tài khoản.</p>
        </div>
        <span class="text-xs font-medium text-slate-500">{{ challenges.length }} challenge</span>
      </div>

      <p v-if="isChallengesLoading" class="py-6 text-sm text-slate-500" role="status">
        Đang tải challenge…
      </p>
      <div v-else-if="isChallengesError" id="today-challenges-error" class="py-6 text-sm text-rose-800" role="alert">
        <p>Không thể tải danh sách challenge.</p>
        <button
          id="today-challenges-retry"
          type="button"
          class="mt-2 font-semibold text-indigo-700 underline hover:text-indigo-900"
          @click="retryChallengesLoad"
        >
          Thử lại
        </button>
      </div>
      <p v-else-if="challenges.length === 0" class="py-6 text-sm text-slate-500">
        Chưa có challenge đang theo dõi.
      </p>
      <ul v-else class="mt-3 divide-y divide-slate-100" role="list">
        <li v-for="challenge in challenges" :key="challenge.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <h3 class="font-medium text-slate-900">{{ challenge.name }}</h3>
            <p class="mt-1 text-xs text-slate-500">Bắt đầu {{ challenge.start_date }} · Mục tiêu {{ challenge.target_days }} ngày/tuần</p>
          </div>
          <RouterLink
            :to="`/challenges/${challenge.id}`"
            data-testid="today-journal-link"
            class="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            Mở chi tiết và nhật ký
          </RouterLink>
        </li>
      </ul>
    </section>
  </section>
</template>
