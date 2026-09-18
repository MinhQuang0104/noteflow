import { createRouter, createWebHistory } from 'vue-router'
import DeepLinkView from '../views/DeepLinkView.vue'
import FoundationView from '../views/FoundationView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'foundation',
      component: FoundationView,
    },
    {
      path: '/smoke/deep-link',
      name: 'deep-link',
      component: DeepLinkView,
    },
  ],
})

export default router
