<template>
  <header class="header">
    <!-- 专门的拖拽背景层 -->
    <div class="header-drag-handle" data-tauri-drag-region></div>

    <div class="header-content">
      <!-- Logo 区域 (支持拖拽) -->
      <div class="logo" data-tauri-drag-region>
        <img src="/kudu-mark.svg" alt="Kudu" class="brand-mark" data-tauri-drag-region />
        <span class="title" data-tauri-drag-region>Kudu</span>
      </div>

      <!-- 菜单区域 (宽度自适应，不阻挡两侧拖拽) -->
      <div class="header-menu">
        <a-menu mode="horizontal" :selected-keys="[]" :disabled-overflow="true" class="top-menu">
          <a-sub-menu key="file">
            <template #title>{{ $t('common.file') }}</template>
            <a-menu-item key="new-query" @click="$emit('newQuery')">
              <FileAddOutlined /> {{ $t('tree.new_query') }}
            </a-menu-item>
            <a-menu-item key="open-sql-file" @click="$emit('openSqlFile')">
              <FolderOpenOutlined /> {{ $t('editor.sql_file') || 'Open SQL File' }}
            </a-menu-item>
            <a-menu-item key="save-query" :disabled="!canSaveQuery" @click="$emit('saveQuery')">
              <SaveOutlined /> {{ $t('common.save') }}
            </a-menu-item>
            <a-menu-item key="save-query-as" :disabled="!canSaveQueryAs" @click="$emit('saveQueryAs')">
              <FileTextOutlined /> {{ $t('editor.save_as') }}
            </a-menu-item>
            <a-menu-divider />
            <a-menu-item key="new-connection" @click="$emit('newConnection')">
              <PlusOutlined /> {{ $t('connection.new') }}
            </a-menu-item>
            <a-menu-item v-if="showQueryBuilder" key="query-builder" @click="$emit('openQueryBuilder')">
              <BuildOutlined /> {{ $t('tools.query_builder.title') }}
            </a-menu-item>
            <a-menu-item v-if="showDataCompare" key="data-compare" @click="$emit('openDataCompare')">
              <RetweetOutlined /> {{ $t('tools.data_compare.title') }}
            </a-menu-item>
            <a-menu-divider />
            <a-menu-item key="settings" @click="$emit('openSettings')">
              <SettingOutlined /> {{ $t('common.settings') }}
            </a-menu-item>
          </a-sub-menu>
          <a-sub-menu key="view">
            <template #title>{{ $t('common.view') }}</template>
            <a-menu-item key="toggle-sidebar" @click="appStore.toggleSidebar()">
              <MenuOutlined /> {{ appStore.sidebarCollapsed ? $t('common.show_sidebar') : $t('common.hide_sidebar') }}
            </a-menu-item>
            <a-menu-divider />
            <a-menu-item key="theme" @click="appStore.cycleThemeMode()">
              <Icon :icon="themeModeIcon" class="menu-icon" /> {{ themeModeLabel }}
            </a-menu-item>
          </a-sub-menu>
        </a-menu>
      </div>

      <!-- 核心：中间大面积可拖拽空白区 -->
      <div class="header-drag-spacer" data-tauri-drag-region></div>

      <!-- 动作区与窗口控制 -->
      <div class="header-actions">
        <a-space :size="0">
          <a-button
            type="text"
            size="small"
            :title="$t('common.settings')"
            @click="$emit('openSettings')"
            class="settings-btn"
          >
            <template #icon><SettingOutlined /></template>
          </a-button>

          <a-dropdown placement="bottomRight" trigger="click">
            <a-button
              type="text"
              size="small"
              :title="themeModeLabel"
              class="theme-btn"
            >
              <template #icon>
                <Icon :icon="themeModeIcon" />
              </template>
            </a-button>
            <template #overlay>
              <a-menu :selected-keys="[appStore.themeMode]" @click="handleThemeMenuClick">
                <a-menu-item key="light">
                  <Icon icon="fluent:weather-sunny-20-regular" class="menu-icon" />
                  {{ $t('settings_page.theme_light') }}
                </a-menu-item>
                <a-menu-item key="dark">
                  <Icon icon="fluent:weather-moon-20-regular" class="menu-icon" />
                  {{ $t('settings_page.theme_dark') }}
                </a-menu-item>
                <a-menu-item key="system">
                  <Icon icon="fluent:desktop-20-regular" class="menu-icon" />
                  {{ $t('settings_page.theme_system') }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>

          <a-button v-if="showSearch" type="text" size="small" @click="$emit('openSearch')" class="search-btn">
            <template #icon><SearchOutlined /></template>
          </a-button>

          <div class="window-controls">
            <div class="win-btn" title="最小化" @click="minimizeWindow">
              <Icon icon="fluent:subtract-16-filled" />
            </div>
            <div class="win-btn" title="最大化/还原" @click="toggleMaximize">
              <Icon :icon="isMaximized ? 'fluent:square-multiple-16-regular' : 'fluent:square-16-regular'" />
            </div>
            <div class="win-btn close" title="关闭" @click="closeWindow">
              <Icon icon="fluent:dismiss-16-filled" />
            </div>
          </div>
        </a-space>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import {
  BuildOutlined, PlusOutlined, SettingOutlined,
  MenuOutlined, RetweetOutlined, SearchOutlined,
  FileAddOutlined, FolderOpenOutlined, SaveOutlined, FileTextOutlined,
} from '@ant-design/icons-vue'
import { useAppStore } from '@/stores/app'
import { useWindowControls } from '@/composables/useWindowControls'
import type { ThemeMode } from '@/stores/app'
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{
  showSearch?: boolean
  showQueryBuilder?: boolean
  showDataCompare?: boolean
  canSaveQuery?: boolean
  canSaveQueryAs?: boolean
}>(), {
  showSearch: true,
  showQueryBuilder: false,
  showDataCompare: false,
  canSaveQuery: false,
  canSaveQueryAs: false,
})

defineEmits<{
  newConnection: []
  newQuery: []
  openSqlFile: []
  saveQuery: []
  saveQueryAs: []
  openQueryBuilder: []
  openDataCompare: []
  openSettings: []
  openSearch: []
}>()

const appStore = useAppStore()
const { t } = useI18n()
const { isMaximized, minimizeWindow, toggleMaximize, closeWindow, setupMaximizeListener } = useWindowControls()

const themeModeIcon = computed(() => {
  if (appStore.themeMode === 'dark') return 'fluent:weather-moon-20-filled'
  if (appStore.themeMode === 'system') return 'fluent:desktop-20-filled'
  return 'fluent:weather-sunny-20-filled'
})

const themeModeLabel = computed(() => {
  if (appStore.themeMode === 'dark') return t('settings_page.theme_dark')
  if (appStore.themeMode === 'system') return t('settings_page.theme_system')
  return t('settings_page.theme_light')
})

function handleThemeMenuClick({ key }: { key: string | number }) {
  appStore.setThemeMode(String(key) as ThemeMode)
}

onMounted(() => {
  setupMaximizeListener()
})
</script>

<style scoped>
.header {
  height: var(--header-height);
  background: var(--header-bg);
  border-bottom: 1px solid var(--header-border);
  flex-shrink: 0;
  z-index: 100;
  padding: 0;
  overflow: hidden;
  position: relative;
  user-select: none;
  -webkit-user-select: none;
}

.header-drag-handle { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 1; }

.header-content { display: flex; align-items: center; height: 100%; width: 100%; position: relative; z-index: 2; pointer-events: none; }

.logo { display: flex; align-items: center; font-size: 14px; font-weight: bold; color: var(--color-primary); padding: 0 12px; height: 100%; pointer-events: auto; position: relative; z-index: 3; }
.brand-mark { width: 18px; height: 18px; margin-right: 6px; display: block; flex-shrink: 0; }
.header-menu { height: 100%; display: flex; align-items: center; pointer-events: auto; flex: 0 0 auto; min-width: max-content; margin-left: 6px; position: relative; z-index: 3; }
.top-menu { border-bottom: none; background: transparent; height: 100%; line-height: var(--header-height); min-width: max-content; font-size: 13px; display: flex; align-items: center; }
.top-menu :deep(.ant-menu-overflow) { display: flex; align-items: center; height: 100%; }
.top-menu :deep(.ant-menu-overflow-item) { padding-inline: 0 !important; }
.top-menu :deep(.ant-menu-submenu-title) { height: var(--header-height) !important; line-height: var(--header-height) !important; padding: 0 10px; }
.top-menu :deep(.ant-menu-title-content) { line-height: var(--header-height); }

.header-drag-spacer { flex: 1 1 auto; min-width: 16px; height: 100%; pointer-events: auto; }

.header-actions { display: flex; align-items: center; height: 100%; pointer-events: auto; padding-right: 0; margin-left: auto; position: relative; z-index: 3; }
.settings-btn { margin-right: 4px; }
.theme-btn {
  margin-right: 4px;
  color: var(--app-text);
}
.theme-btn :deep(.iconify) {
  font-size: 18px;
  opacity: 0.95;
}
.search-btn { margin-right: 6px; }
.menu-icon { margin-right: 8px; }

.header-actions :deep(.ant-btn.ant-btn-sm) {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
}
.window-controls { display: flex; align-items: center; gap: 0; height: 100%; padding: 0 2px 0 0; }
.win-btn { display: inline-flex; justify-content: center; align-items: center; width: 28px; height: 28px; border-radius: 0; cursor: pointer; transition: background-color 0.2s; font-size: 13px; color: var(--app-text-subtle); }
.win-btn:hover { background-color: var(--surface-hover); }
.win-btn.close:hover { background-color: var(--window-close-hover-bg) !important; color: var(--color-on-danger) !important; }
</style>
