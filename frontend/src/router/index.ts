import { createRouter, createWebHistory } from 'vue-router'

import { pinia } from '../pinia'
import { useAuthStore } from '../stores/auth'
import { useAccountStore } from '../stores/account'
import AccountSettingsView from '../views/AccountSettingsView.vue'
import ChallengesView from '../views/ChallengesView.vue'
import LoginView from '../views/LoginView.vue'
import PrivatePlaceholderView from '../views/PrivatePlaceholderView.vue'
import TodayView from '../views/TodayView.vue'

const privateRoutes = [
  { path: '/today', name: 'today', title: 'Hôm nay', component: TodayView },
  { path: '/challenges', name: 'challenges', title: 'Challenge', component: ChallengesView },
  { path: '/challenges/:id', name: 'challenge-detail', title: 'Chi tiết Challenge', component: ChallengesView },
  { path: '/notes', name: 'notes', title: 'Ghi chú', component: PrivatePlaceholderView },
  { path: '/calendar', name: 'calendar', title: 'Lịch', component: PrivatePlaceholderView },
  { path: '/settings', name: 'settings', title: 'Cài đặt tài khoản', component: AccountSettingsView },
] as const

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/today' },
    { path: '/sign-in', name: 'login', component: LoginView, meta: { public: true } },
    ...privateRoutes.map((route) => ({
      path: route.path,
      name: route.name,
      component: route.component,
      props: { title: route.title },
    })),
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia)

  if (auth.status === 'unknown') {
    try {
      await auth.refreshSession()
    } catch {
      auth.status = 'guest'
    }
  }

  if (to.meta.public) {
    return auth.status === 'authenticated' ? { name: 'today' } : true
  }

  if (auth.status !== 'authenticated') {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  const account = useAccountStore(pinia)
  if (account.status === 'unknown') {
    try {
      await account.refresh()
    } catch {
      // The destination renders an explicit account-context error without using device time.
    }
  }

  if (auth.status !== 'authenticated') {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  return true
})

export default router
