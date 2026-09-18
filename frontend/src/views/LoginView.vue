<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { AuthenticationError } from '../api/auth'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  submitting.value = true
  try {
    const redirectTo = typeof route.query.redirect === 'string' ? route.query.redirect : undefined
    const destination = await auth.logIn({ email: email.value, password: password.value, redirectTo })
    password.value = ''
    await router.replace(destination)
  } catch (loginError) {
    password.value = ''
    error.value =
      loginError instanceof AuthenticationError
        ? loginError.message
        : 'Không thể đăng nhập lúc này. Vui lòng thử lại.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <p class="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-700">Không gian riêng tư</p>
    <h2 class="mt-2 text-2xl font-semibold">Đăng nhập NoteFlow</h2>
    <p class="mt-2 text-sm text-slate-600">Dùng tài khoản owner đã được provision. NoteFlow không mở đăng ký công khai.</p>
    <form class="mt-6 space-y-4" @submit.prevent="submit">
      <label class="block text-sm font-medium">Email
        <input v-model="email" autocomplete="username" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="email" required type="email" />
      </label>
      <label class="block text-sm font-medium">Mật khẩu
        <input v-model="password" autocomplete="current-password" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="password" required type="password" />
      </label>
      <p v-if="error" role="alert" class="text-sm font-medium text-red-700">{{ error }}</p>
      <button class="w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-semibold text-white hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60" :disabled="submitting" type="submit">
        {{ submitting ? 'Đang đăng nhập…' : 'Đăng nhập' }}
      </button>
    </form>
  </section>
</template>
