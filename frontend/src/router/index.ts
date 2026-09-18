import { createRouter, createWebHistory } from 'vue-router'

import { pinia } from '../pinia'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import PrivatePlaceholderView from '../views/PrivatePlaceholderView.vue'

const privateRoutes = [
  { path: '/today', name: 'today', title: 'Hôm nay' },
  { path: '/challenges', name: 'challenges', title: 'Challenge' },
  { path: '/notes', name: 'notes', title: 'Ghi chú' },
  { path: '/calendar', name: 'calendar', title: 'Lịch' },
  { path: '/settings', name: 'settings', title: 'Cài đặt tài khoản' },
] as const

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/today' },
    { path: '/sign-in', name: 'login', component: LoginView, meta: { public: true } },
    ...privateRoutes.map((route) => ({
      path: route.path,
      name: route.name,
      component: PrivatePlaceholderView,
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

  return true
})

export default router
