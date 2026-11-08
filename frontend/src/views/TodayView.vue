<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'

import {
  getChallenges,
  markChallengeDone,
  generateCommandId,
  type ChallengeListItem,
  type ChallengeListResult,
} from '../api/challenges'
import { useAccountStore } from '../stores/account'
import { useAuthStore } from '../stores/auth'
import { useSyncStore } from '../stores/sync'

const account = useAccountStore()
const auth = useAuthStore()
const sync = useSyncStore()
const queryClient = useQueryClient()

const {
  data: challengesData,
  isLoading: isChallengesLoading,
  isError: isChallengesError,
  refetch: refetchChallenges,
} = useQuery({
  queryKey: ['challenges'],
  queryFn: getChallenges,
})

const challenges = computed<ChallengeListItem[]>(() => challengesData.value?.challenges ?? [])

async function retryChallengesLoad(): Promise<void> {
  await refetchChallenges()
}

export interface RowActionState {
  status: 'idle' | 'saving' | 'saved' | 'failed'
  error?: string | null
  commandId?: string
}

const actionStates = ref<Record<string, RowActionState>>({})

auth.registerPrivateStateReset(() => {
  actionStates.value = {}
})

function getRowState(challengeId: string): RowActionState {
  return actionStates.value[challengeId] ?? { status: 'idle' }
}

async function handleMarkDone(challenge: ChallengeListItem): Promise<void> {
  if (challenge.today.is_done) {
    return
  }

  const currentState = getRowState(challenge.id)
  if (currentState.status === 'saving') {
    return
  }

  const commandId = currentState.commandId || generateCommandId()
  const epoch = account.context?.data_epoch ?? 1
  const targetDate = challenge.today.local_date || account.context?.account_date

  if (!targetDate) {
    actionStates.value[challenge.id] = {
      status: 'failed',
      error: 'Không xác định được ngày tài khoản.',
      commandId,
    }
    return
  }

  actionStates.value[challenge.id] = {
    status: 'saving',
    commandId,
  }

  try {
    const result = await markChallengeDone(challenge.id, targetDate, {
      command_id: commandId,
      data_epoch: epoch,
      is_done: true,
    })

    // Server-authoritative update: update Vue Query cache with exact server projection
    queryClient.setQueryData<ChallengeListResult>(['challenges'], (old) => {
      if (!old) return old
      return {
        ...old,
        challenges: old.challenges.map((c) =>
          c.id === result.completion.challenge_id
            ? {
                ...c,
                week_progress: result.week_progress,
                today: {
                  local_date: result.completion.local_date,
                  is_done: result.completion.is_done,
                  completion_version: result.completion.completion_version,
                },
              }
            : c,
        ),
      }
    })

    if (auth.status === 'authenticated') {
      await sync.recordMutationAck(result.account_revision, result.data_epoch, auth.generation)
    }

    actionStates.value[challenge.id] = {
      status: 'saved',
      commandId,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lưu thất bại.'
    actionStates.value[challenge.id] = {
      status: 'failed',
      error: message,
      commandId,
    }
  }
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
        <li
          v-for="challenge in challenges"
          :key="challenge.id"
          :data-testid="'today-challenge-' + challenge.id"
          class="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <div class="min-w-0 flex-1">
            <h3 class="font-medium text-slate-900" data-testid="challenge-name">{{ challenge.name }}</h3>
            <p class="mt-1 text-xs text-slate-500" data-testid="challenge-progress">
              {{ challenge.week_progress.done_days }}/{{ challenge.week_progress.target_days }} ngày tuần này · Bắt đầu {{ challenge.start_date }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Today state badge -->
            <span
              v-if="challenge.today.is_done || getRowState(challenge.id).status === 'saved'"
              data-testid="challenge-today-state"
              class="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
            >
              Đã xong
            </span>
            <span
              v-else
              data-testid="challenge-today-state"
              class="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
            >
              Chưa xong
            </span>

            <!-- Saved status notification -->
            <span
              v-if="getRowState(challenge.id).status === 'saved'"
              data-testid="challenge-saved-status"
              class="text-xs font-medium text-emerald-600"
            >
              Đã lưu
            </span>

            <!-- Saving state -->
            <template v-if="getRowState(challenge.id).status === 'saving'">
              <span
                data-testid="challenge-saving-status"
                class="text-xs text-slate-500"
                role="status"
              >
                Đang lưu…
              </span>
              <button
                type="button"
                disabled
                data-testid="challenge-done-button"
                class="inline-flex items-center rounded-lg bg-emerald-400 px-3 py-1.5 text-sm font-semibold text-white opacity-70 cursor-not-allowed"
              >
                Đang lưu…
              </button>
            </template>

            <!-- Failed state with retry -->
            <template v-else-if="getRowState(challenge.id).status === 'failed'">
              <span
                data-testid="challenge-error-status"
                class="text-xs text-rose-700"
                role="alert"
              >
                {{ getRowState(challenge.id).error || 'Lưu thất bại.' }}
              </span>
              <button
                type="button"
                data-testid="challenge-retry-button"
                class="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-600"
                @click="handleMarkDone(challenge)"
              >
                Thử lại
              </button>
            </template>

            <!-- Already done / saved state -->
            <template v-else-if="challenge.today.is_done || getRowState(challenge.id).status === 'saved'">
              <button
                type="button"
                disabled
                data-testid="challenge-done-button"
                class="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-400 cursor-not-allowed"
              >
                Đã xong
              </button>
            </template>

            <!-- Idle uncompleted state -->
            <template v-else>
              <button
                type="button"
                data-testid="challenge-done-button"
                class="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-600"
                @click="handleMarkDone(challenge)"
              >
                Done
              </button>
            </template>

            <!-- Journal link -->
            <RouterLink
              :to="`/challenges/${challenge.id}`"
              data-testid="today-journal-link"
              class="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              Mở chi tiết và nhật ký
            </RouterLink>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
