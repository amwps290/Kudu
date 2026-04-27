import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      meta: { keepAlive: true },
      component: HomeView,
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('@/views/SettingsView.vue'),
    },
  ],
})

export default router
