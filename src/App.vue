<template>
  <a-config-provider :theme="themeConfig">
    <div id="app" :class="{ 'dark-mode': isDark }">
      <router-view v-slot="{ Component, route }">
        <transition name="page-shell" mode="out-in">
          <keep-alive v-if="route.meta.keepAlive">
            <component :is="Component" :key="String(route.name || route.path)" />
          </keep-alive>
          <component v-else :is="Component" :key="String(route.name || route.path)" />
        </transition>
      </router-view>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { theme as antTheme } from '@/ui/antd'
import { useAppStore } from '@/stores/app'
import { applyVxeTheme } from '@/utils/vxeTheme'

const appStore = useAppStore()
const isDark = computed(() => appStore.theme === 'dark')

const themeConfig = computed(() => ({
  algorithm: isDark.value ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: {
    fontFamily: appStore.interfaceSettings.fontFamily,
  },
}))

// 将界面字体和编辑器字体设置到 :root 上
// 界面字体：body/#app 通过 var(--app-font-family) 继承
// 编辑器字体：Monaco 通过 CSS !important 作为兜底覆盖
watch(() => appStore.interfaceSettings.fontFamily, (fontFamily) => {
  document.documentElement.style.setProperty('--app-font-family', fontFamily)
}, { immediate: true })

watch(() => appStore.editorSettings.fontFamily, (fontFamily) => {
  document.documentElement.style.setProperty('--editor-font-family', fontFamily)
}, { immediate: true })

// 在组件挂载后再开始监听 Store 变化，确保 Pinia 已完全激活
onMounted(() => {
  watch(() => appStore.theme, (val) => {
    void applyVxeTheme(val === 'dark' ? 'dark' : 'light')
  }, { immediate: true })
})
</script>

<style>
#app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.dark-mode {
  background-color: #141414;
  color: rgba(255, 255, 255, 0.85);
}

.page-shell-enter-active,
.page-shell-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.page-shell-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-shell-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.workspace-unsaved-confirm .ant-modal-content {
  border-radius: 10px;
}

.workspace-unsaved-confirm .ant-modal-body {
  padding: 20px 24px 16px;
}

.workspace-unsaved-confirm .ant-modal-confirm-body {
  display: block;
}

.workspace-unsaved-confirm .ant-modal-confirm-title {
  display: block;
  margin-bottom: 8px;
  color: rgba(0, 0, 0, 0.88);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
}

.workspace-unsaved-confirm .ant-modal-confirm-content {
  max-width: none;
  margin-top: 0;
  margin-inline-start: 0;
}

.workspace-unsaved-confirm__content {
  color: rgba(0, 0, 0, 0.72);
  font-size: 13px;
  line-height: 1.65;
  white-space: normal;
  word-break: break-word;
}

.workspace-unsaved-confirm__message {
  margin: 0;
}

.workspace-unsaved-confirm__hint {
  margin-top: 6px;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 1.5;
}

.workspace-unsaved-confirm__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.workspace-unsaved-confirm__button {
  min-width: 72px;
  height: 30px;
}

.dark-mode .workspace-unsaved-confirm .ant-modal-content {
  background: #1f1f1f;
}

.dark-mode .workspace-unsaved-confirm .ant-modal-confirm-title {
  color: rgba(255, 255, 255, 0.92);
}

.dark-mode .workspace-unsaved-confirm__content {
  color: rgba(255, 255, 255, 0.72);
}

.dark-mode .workspace-unsaved-confirm__hint {
  color: rgba(255, 255, 255, 0.45);
}
</style>
