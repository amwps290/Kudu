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
import { darkThemeTokens, lightThemeTokens, type AppThemeTokens } from '@/theme/tokens'

const appStore = useAppStore()
const isDark = computed(() => appStore.theme === 'dark')

const activeThemeTokens = computed<AppThemeTokens>(() => (
  isDark.value ? darkThemeTokens : lightThemeTokens
))

const themeConfig = computed(() => ({
  algorithm: isDark.value ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: {
    fontFamily: appStore.interfaceSettings.fontFamily,
    colorPrimary: activeThemeTokens.value.primary,
    colorBgBase: activeThemeTokens.value.appBg,
    colorBgContainer: activeThemeTokens.value.surface,
    colorBgElevated: activeThemeTokens.value.surfaceElevated,
    colorBorder: activeThemeTokens.value.border,
    colorText: activeThemeTokens.value.appText,
    colorTextSecondary: activeThemeTokens.value.appTextSubtle,
    borderRadius: Number.parseInt(activeThemeTokens.value.radiusMd, 10) || 10,
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

watch(activeThemeTokens, (tokens) => {
  const root = document.documentElement
  root.style.setProperty('--app-bg', tokens.appBg)
  root.style.setProperty('--app-text', tokens.appText)
  root.style.setProperty('--app-text-muted', tokens.appTextMuted)
  root.style.setProperty('--app-text-subtle', tokens.appTextSubtle)
  root.style.setProperty('--surface', tokens.surface)
  root.style.setProperty('--surface-elevated', tokens.surfaceElevated)
  root.style.setProperty('--surface-muted', tokens.surfaceMuted)
  root.style.setProperty('--surface-hover', tokens.surfaceHover)
  root.style.setProperty('--surface-active', tokens.surfaceActive)
  root.style.setProperty('--surface-overlay', tokens.surfaceOverlay)
  root.style.setProperty('--border-color', tokens.border)
  root.style.setProperty('--border-color-strong', tokens.borderStrong)
  root.style.setProperty('--border-color-muted', tokens.borderMuted)
  root.style.setProperty('--color-primary', tokens.primary)
  root.style.setProperty('--color-primary-hover-bg', tokens.primaryHoverBg)
  root.style.setProperty('--color-primary-active-bg', tokens.primaryActiveBg)
  root.style.setProperty('--color-primary-soft-bg', tokens.primarySoftBg)
  root.style.setProperty('--color-primary-border', tokens.primaryBorder)
  root.style.setProperty('--color-danger', tokens.danger)
  root.style.setProperty('--color-danger-hover', tokens.dangerHover)
  root.style.setProperty('--color-danger-soft-bg', tokens.dangerSoftBg)
  root.style.setProperty('--color-danger-border', tokens.dangerBorder)
  root.style.setProperty('--color-warning', tokens.warning)
  root.style.setProperty('--color-warning-soft-bg', tokens.warningSoftBg)
  root.style.setProperty('--color-warning-text', tokens.warningText)
  root.style.setProperty('--color-success', tokens.success)
  root.style.setProperty('--color-success-soft-bg', tokens.successSoftBg)
  root.style.setProperty('--color-success-text', tokens.successText)
  root.style.setProperty('--header-bg', tokens.headerBg)
  root.style.setProperty('--header-border', tokens.headerBorder)
  root.style.setProperty('--sidebar-bg', tokens.sidebarBg)
  root.style.setProperty('--tabbar-bg', tokens.tabBarBg)
  root.style.setProperty('--tab-active-bg', tokens.tabActiveBg)
  root.style.setProperty('--toolbar-bg', tokens.toolbarBg)
  root.style.setProperty('--overlay-bg', tokens.overlayBg)
  root.style.setProperty('--overlay-border', tokens.overlayBorder)
  root.style.setProperty('--scrollbar-thumb', tokens.scrollbarThumb)
  root.style.setProperty('--scrollbar-thumb-hover', tokens.scrollbarThumbHover)
  root.style.setProperty('--shadow-overlay', tokens.shadowOverlay)
  root.style.setProperty('--shadow-soft', tokens.shadowSoft)
  root.style.setProperty('--swatch-ring', tokens.swatchRing)
  root.style.setProperty('--focus-ring-primary', tokens.focusRingPrimary)
  root.style.setProperty('--window-close-hover-bg', tokens.windowCloseHoverBg)
  root.style.setProperty('--color-on-danger', tokens.colorOnDanger)
  root.style.setProperty('--connection-color-1', tokens.connectionColor1)
  root.style.setProperty('--connection-color-2', tokens.connectionColor2)
  root.style.setProperty('--connection-color-3', tokens.connectionColor3)
  root.style.setProperty('--connection-color-4', tokens.connectionColor4)
  root.style.setProperty('--connection-color-5', tokens.connectionColor5)
  root.style.setProperty('--connection-color-6', tokens.connectionColor6)
  root.style.setProperty('--connection-color-7', tokens.connectionColor7)
  root.style.setProperty('--connection-color-8', tokens.connectionColor8)
  root.style.setProperty('--icon-color-blue', tokens.iconColorBlue)
  root.style.setProperty('--icon-color-orange', tokens.iconColorOrange)
  root.style.setProperty('--icon-color-yellow', tokens.iconColorYellow)
  root.style.setProperty('--icon-color-green', tokens.iconColorGreen)
  root.style.setProperty('--icon-color-teal', tokens.iconColorTeal)
  root.style.setProperty('--icon-color-purple', tokens.iconColorPurple)
  root.style.setProperty('--icon-color-pink', tokens.iconColorPink)
  root.style.setProperty('--icon-color-slate', tokens.iconColorSlate)
  root.style.setProperty('--icon-color-emerald', tokens.iconColorEmerald)
  root.style.setProperty('--icon-color-brown', tokens.iconColorBrown)
  root.style.setProperty('--icon-color-cyan', tokens.iconColorCyan)
  root.style.setProperty('--icon-color-gray', tokens.iconColorGray)
  root.style.setProperty('--icon-color-muted', tokens.iconColorMuted)
  root.style.setProperty('--indicator-ring-soft', tokens.indicatorRingSoft)
  root.style.setProperty('--radius-sm', tokens.radiusSm)
  root.style.setProperty('--radius-md', tokens.radiusMd)
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
  background-color: var(--app-bg);
  color: var(--app-text);
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
  color: var(--app-text);
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
  color: var(--app-text-muted);
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
  color: var(--app-text-subtle);
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
  background: var(--surface);
}
</style>
