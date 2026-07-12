import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      // 迁移期：Slice 12 入口切换后 Vue 版经 /react.html 作为对照入口加载（Slice 27 一并删除）
      alias: '/react.html',
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
