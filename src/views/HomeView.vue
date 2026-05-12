<template>
  <a-layout class="main-layout" :class="{ 'dark-mode': appStore.theme === 'dark' }">
    <!-- 顶部标题栏 -->
    <AppHeader
      :show-query-builder="showQueryBuilderEntry"
      :show-data-compare="showDataCompareEntry"
      @new-connection="openConnectionDialog"
      @open-query-builder="handleOpenQueryBuilder"
      @open-data-compare="handleOpenDataCompare"
      @open-settings="openSettings"
      @open-search="openGlobalSearch"
    />

    <a-layout-content class="content-container">
      <div class="sidebar-wrapper" :style="{ width: appStore.sidebarCollapsed ? '0' : sidebarWidth + 'px' }">
        <div class="sidebar-inner">
          <ConnectionPanel
            @add-connection="openConnectionDialog"
            @edit-connection="handleEditConnection"
            @table-selected="handleTableSelected"
            @database-selected="handleDatabaseSelected"
            @new-query="handleNewQuery"
            @design-table="handleDesignTable"
            @view-structure="handleViewStructure"
            @open-scripts="handleOpenSavedScript"
            @generate-sql="handleGeneratedSql"
          />
        </div>
      </div>

      <div v-if="!appStore.sidebarCollapsed" class="sidebar-resizer" @mousedown="startResize"></div>

      <div class="main-workspace">
        <a-tabs v-model:activeKey="mainTabKey" type="editable-card" size="small" @edit="onTabEdit" class="workspace-tabs">
          <a-tab-pane v-for="tab in dataTabs" :key="tab.key" :closable="tab.closable !== false">
            <template #tab>
              <span class="tab-title" @contextmenu.prevent="handleTabContextMenu($event, tab.key, tab.closable !== false)">
                <span v-if="getConnectionColor(tab.connectionId)" class="tab-connection-dot" :style="{ backgroundColor: getConnectionColor(tab.connectionId) }"></span>
                <FileTextOutlined v-if="tab.type === 'query'" />
                <TableOutlined v-else-if="tab.type === 'data'" />
                <EditOutlined v-else-if="tab.type === 'design'" />
                <BuildOutlined v-else-if="tab.type === 'builder'" />
                <RetweetOutlined v-else-if="tab.type === 'compare'" />
                <SettingOutlined v-else-if="tab.type === 'settings'" />
                <span class="title-text">{{ tab.title }}<span v-if="tab.type === 'query' && tab.dirty" class="tab-dirty-indicator"> •</span></span>
              </span>
            </template>
            <div class="tab-content-wrapper">
              <KeepAlive>
                <SqlEditor v-if="tab.type === 'query'" :key="tab.key" :ref="(el: unknown) => setSqlEditorRef(el, tab.key)" :connection-id="tab.connectionId" :initial-database="tab.database" :initial-value="tab.content" :file-path="tab.filePath" :tab-id="tab.key" @content-change="(val: string) => handleContentChange(tab.key, val)" @file-saved="(path: string, title: string) => handleFileSaved(tab.key, path, title)" @database-change="(db: string) => handleEditorDatabaseChange(tab.key, String(db || ''))" @execution-state-change="(state) => updateSqlExecutionState(tab.key, state)" />
                <TableDataGrid v-else-if="tab.type === 'data'" :key="tab.key" :connection-id="tab.connectionId!" :database="tab.database!" :table="tab.table!" :schema="tab.schema" />
                <TableDesigner v-else-if="tab.type === 'design'" :key="tab.key" :connection-id="tab.connectionId!" :database="tab.database!" :table="tab.table!" :schema="tab.schema" :read-only="tab.readOnly" />
                <QueryBuilder v-else-if="tab.type === 'builder'" :key="tab.key" :connection-id="tab.connectionId || null" :initial-database="tab.database || null" @execute-query="(payload: QueryBuilderExecutePayload | string) => handleQueryBuilderExecute(tab, payload)" />
                <DataCompare v-else-if="tab.type === 'compare'" :key="tab.key" :connection-id="tab.connectionId || null" :initial-database="tab.database || null" />
                <SettingsContent v-else-if="tab.type === 'settings'" :key="tab.key" embedded />
                <RedisEditor v-else-if="tab.type === 'redis'" :key="tab.key" :ref="redisEditorRef" />
              </KeepAlive>
            </div>
          </a-tab-pane>
        </a-tabs>

        <div v-if="dataTabs.length === 0" class="empty-workspace">
          <a-empty :description="$t('editor.no_open_tabs')">
            <template #extra><a-button type="primary" @click="handleNewQuery({})">{{ $t('tree.new_query') }}</a-button></template>
          </a-empty>
        </div>
      </div>
    </a-layout-content>

    <div
      v-if="contextMenuVisible"
      class="context-menu-overlay"
      @click="hideContextMenu()"
    >
      <div
        class="context-menu"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
        @click.stop
      >
        <a-menu @click="handleTabMenuClick" size="small">
          <a-menu-item key="close-current" :disabled="!currentContextTab.closable">
            {{ $t('common.close') }}
          </a-menu-item>
          <a-menu-item key="close-left" :disabled="!hasClosableTabsOnLeft">
            {{ $t('common.close_left') }}
          </a-menu-item>
          <a-menu-item key="close-right" :disabled="!hasClosableTabsOnRight">
            {{ $t('common.close_right') }}
          </a-menu-item>
          <a-menu-item key="close-others" :disabled="!hasClosableOtherTabs">
            {{ $t('common.close_others') }}
          </a-menu-item>
          <a-menu-item key="close-saved" :disabled="!hasClosableSavedTabs">
            {{ $t('common.close_saved') }}
          </a-menu-item>
          <a-divider style="margin: 4px 0" />
          <a-menu-item key="open-file-location" :disabled="!currentContextTabFilePath">
            {{ $t('editor.open_file_location') }}
          </a-menu-item>
        </a-menu>
      </div>
    </div>

    <ConnectionDialog v-model:visible="showConnectionDialog" :editing-connection="editingConnection" @close="handleConnectionDialogClose" />
    <GlobalSearch v-model:visible="showGlobalSearch" :connection-id="connectionStore.activeConnectionId" @view-data="handleTableSelected" />
  </a-layout>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  FileTextOutlined,
  TableOutlined, EditOutlined, RetweetOutlined, BuildOutlined, SettingOutlined,
} from '@ant-design/icons-vue'
import { useAppStore } from '@/stores/app'
import { useConnectionStore } from '@/stores/connection'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSidebarResize } from '@/composables/useSidebarResize'
import { useTabManager } from '@/composables/useTabManager'
import { useWorkspaceTabContextMenu } from '@/composables/useWorkspaceTabContextMenu'
import { useWorkspaceTabMenuActions } from '@/composables/useWorkspaceTabMenuActions'
import { useWorkspacePageLifecycle } from '@/composables/useWorkspacePageLifecycle'
import { useWorkspaceViewActions } from '@/composables/useWorkspaceViewActions'
import { useWorkspaceCloseGuards } from '@/composables/useWorkspaceCloseGuards'
import { useWorkspaceSessionLifecycle } from '@/composables/useWorkspaceSessionLifecycle'
import { useWorkspaceClipboardRouting } from '@/composables/useWorkspaceClipboardRouting'
import {
  useWorkspaceTabActions,
  type QueryBuilderExecutePayload,
} from '@/composables/useWorkspaceTabActions'
import { getDatabaseSupportProfile, supportsSqlWorkspace } from '@/utils/databaseSupport'

// Step 34: 重量级组件懒加载
const AppHeader = defineAsyncComponent(() => import('@/components/layout/AppHeader.vue'))
const ConnectionPanel = defineAsyncComponent(() => import('@/components/connection/ConnectionPanel.vue'))
const ConnectionDialog = defineAsyncComponent(() => import('@/components/connection/ConnectionDialog.vue'))
const SqlEditor = defineAsyncComponent(() => import('@/components/editor/SqlEditor.vue'))
const RedisEditor = defineAsyncComponent(() => import('@/components/editor/RedisEditor.vue'))
const TableDataGrid = defineAsyncComponent(() => import('@/components/data/TableDataGrid.vue'))
const TableDesigner = defineAsyncComponent(() => import('@/components/database/TableDesigner.vue'))
const GlobalSearch = defineAsyncComponent(() => import('@/components/search/GlobalSearch.vue'))
const QueryBuilder = defineAsyncComponent(() => import('@/components/tools/QueryBuilder.vue'))
const DataCompare = defineAsyncComponent(() => import('@/components/tools/DataCompare.vue'))
const SettingsContent = defineAsyncComponent(() => import('@/components/settings/SettingsContent.vue'))

const { t } = useI18n()
const appStore = useAppStore()
const connectionStore = useConnectionStore()
const workspaceStore = useWorkspaceStore()

// Composables
const { sidebarWidth, startResize } = useSidebarResize()
const {
  dataTabs, mainTabKey,
  activeTabType, activeTabDatabase,
  setSqlEditorRef, updateSqlExecutionState, callActiveEditor, closeTab,
  removeTabs, findTabByKey, tabExists, addTab, handleContentChange, handleFileSaved,
} = useTabManager()

const redisEditorRef = ref()

const activeConnection = computed(() => connectionStore.getActiveConnection())
const activeSupportProfile = computed(() => getDatabaseSupportProfile(activeConnection.value?.db_type || null))
const showQueryBuilderEntry = computed(() => Boolean(activeConnection.value?.id) && activeSupportProfile.value.supportsQueryBuilder)
const showDataCompareEntry = computed(() => Boolean(activeConnection.value?.id) && activeSupportProfile.value.supportsDataCompare)
const isSqlSupported = computed(() => {
  return !activeConnection.value || supportsSqlWorkspace(activeConnection.value.db_type)
})

const tabActions = useWorkspaceTabActions({
  connectionStore,
  dataTabs,
  mainTabKey,
  activeTabType,
  activeTabDatabase,
  isSqlSupported,
  redisEditorRef,
  t,
  tabExists,
  addTab,
})

const {
  handleTableSelected,
  handleDatabaseSelected,
  handleNewQuery,
  handleOpenSavedScript,
  handleGeneratedSql,
  handleViewStructure,
  handleDesignTable,
  handleOpenQueryBuilder,
  handleQueryBuilderExecute,
  handleOpenDataCompare,
  getConnectionColor,
} = tabActions

const {
  showConnectionDialog,
  showGlobalSearch,
  editingConnection,
  openConnectionDialog,
  openGlobalSearch,
  openSettings,
  handleEditConnection,
  handleConnectionDialogClose,
} = useWorkspaceViewActions({
  mainTabKey,
  tabExists,
  addTab,
  t,
})

const {
  contextMenuVisible,
  contextMenuX,
  contextMenuY,
  currentContextTab,
  handleTabContextMenu,
  hideContextMenu,
  hasClosableTabsOnLeft,
  hasClosableTabsOnRight,
  hasClosableOtherTabs,
  hasClosableSavedTabs,
  currentContextTabFilePath,
} = useWorkspaceTabContextMenu({ dataTabs })

const sessionLifecycle = useWorkspaceSessionLifecycle({
  workspaceStore,
  connectionStore,
  dataTabs,
  mainTabKey,
  isSqlSupported,
  handleNewQuery,
})

const { restoreSession } = sessionLifecycle

watch(dataTabs, sessionLifecycle.scheduleSessionSave, { deep: true })
watch(mainTabKey, sessionLifecycle.scheduleSessionSave)

const { setupClipboardRouting, cleanupClipboardRouting } = useWorkspaceClipboardRouting({
  activeTabType,
  callActiveEditor,
})

const {
  closeTabWithConfirm,
  closeTabsWithConfirm,
  setupWindowCloseGuard,
  cleanupWindowCloseGuard,
} = useWorkspaceCloseGuards({
  dataTabs,
  mainTabKey,
  findTabByKey,
  callActiveEditor,
  closeTab,
  removeTabs,
  t,
})

const { handleTabMenuClick } = useWorkspaceTabMenuActions({
  dataTabs,
  currentContextTab,
  currentContextTabFilePath,
  closeTabWithConfirm,
  closeTabsWithConfirm,
  hideContextMenu,
  openFileLocation: async (path: string) => {
    const { utilsApi } = await import('@/api/utils')
    await utilsApi.openInFileManager(path).catch(() => {})
  },
})

const { handleEditorDatabaseChange } = useWorkspacePageLifecycle({
  dataTabs,
  mainTabKey,
  activeTabType,
  callActiveEditor,
  restoreSession,
  sessionCleanup: sessionLifecycle.cleanup,
  setupClipboardRouting,
  cleanupClipboardRouting,
  setupWindowCloseGuard,
  cleanupWindowCloseGuard,
})

async function onTabEdit(key: string | number | MouseEvent | KeyboardEvent, action: string) {
  if (action === 'add') {
    handleNewQuery({})
    return
  }
  await closeTabWithConfirm(String(key))
}
</script>

<style scoped>
.main-layout { height: 100vh; width: 100vw; display: flex; flex-direction: column; overflow: hidden; }

.content-container { flex: 1; display: flex; flex-direction: row; overflow: hidden; position: relative; }
.sidebar-wrapper { background: #fafafa; border-right: 1px solid #e8e8e8; height: 100%; overflow: hidden; flex-shrink: 0; }
.dark-mode .sidebar-wrapper { background: #141414; border-right-color: #303030; }
.sidebar-inner { height: 100%; overflow: auto; padding: 0 8px; }
.sidebar-resizer { width: 1px; cursor: col-resize; background: #e5e7eb; transition: background-color 0.2s; z-index: 10; flex-shrink: 0; position: relative; overflow: visible; }
.sidebar-resizer::before { content: ''; position: absolute; top: 0; bottom: 0; left: -4px; right: -4px; cursor: col-resize; }
.dark-mode .sidebar-resizer { background: #303030; }
.sidebar-resizer:hover { background: #1677ff; }
.main-workspace { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fff; min-width: 0; }
.dark-mode .main-workspace { background: #1f1f1f; }
.workspace-tabs { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.workspace-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 0;
  padding: 0;
  background: #f8f9fb;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.dark-mode .workspace-tabs :deep(.ant-tabs-nav) {
  background: #181818;
  border-bottom-color: #303030;
}
.workspace-tabs :deep(.ant-tabs-nav::before) { display: none; }
.workspace-tabs :deep(.ant-tabs-nav-wrap) { padding: 0; }
.workspace-tabs :deep(.ant-tabs-nav-list) { gap: 0; }
.workspace-tabs :deep(.ant-tabs-tab) {
  margin: 0 !important;
  padding: 0 12px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  border: 0 !important;
  border-right: 1px solid #e5e7eb !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #595959;
}
.dark-mode .workspace-tabs :deep(.ant-tabs-tab) {
  border-right-color: #303030 !important;
  color: #a6a6a6;
}
.workspace-tabs :deep(.ant-tabs-tab:hover) {
  background: #f3f4f6 !important;
  color: #262626;
}
.dark-mode .workspace-tabs :deep(.ant-tabs-tab:hover) {
  background: #202020 !important;
  color: #f5f5f5;
}
.workspace-tabs :deep(.ant-tabs-tab-active) {
  background: #ffffff !important;
}
.dark-mode .workspace-tabs :deep(.ant-tabs-tab-active) {
  background: #1f1f1f !important;
}
.workspace-tabs :deep(.ant-tabs-tab-active .ant-tabs-tab-btn) {
  color: #1677ff;
}
.workspace-tabs :deep(.ant-tabs-tab-btn) {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  line-height: 1;
}
.workspace-tabs :deep(.ant-tabs-tab-remove) {
  margin-left: 8px;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  line-height: 1;
  transform: translateY(-1px);
}
.workspace-tabs :deep(.ant-tabs-nav-add) {
  min-width: 32px;
  width: 32px;
  height: 32px;
  margin: 0 !important;
  border: 0 !important;
  border-left: 1px solid #e5e7eb !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #595959;
}
.dark-mode .workspace-tabs :deep(.ant-tabs-nav-add) {
  border-left-color: #303030 !important;
  color: #a6a6a6;
}
.workspace-tabs :deep(.ant-tabs-nav-add:hover) {
  background: #f3f4f6 !important;
  color: #262626;
}
.dark-mode .workspace-tabs :deep(.ant-tabs-nav-add:hover) {
  background: #202020 !important;
  color: #f5f5f5;
}
.workspace-tabs :deep(.ant-tabs-content) { flex: 1; height: 100%; overflow: hidden; }
.workspace-tabs :deep(.ant-tabs-tabpane) { height: 100%; display: flex; flex-direction: column; }
.tab-title { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.tab-connection-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08); }
.title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab-dirty-indicator { color: #faad14; font-weight: 700; }
.tab-content-wrapper { flex: 1; height: 100%; overflow: hidden; position: relative; }
.empty-workspace { flex: 1; display: flex; align-items: center; justify-content: center; }
.context-menu-overlay { position: fixed; inset: 0; z-index: 9999; }
.context-menu {
  position: absolute;
  min-width: 140px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.10), 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  padding: 2px;
}
.dark-mode .context-menu {
  background: #252525;
  border-color: #383838;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
.context-menu :deep(.ant-menu) {
  background: transparent;
  border-inline-end: none !important;
  font-size: 12px;
}
.context-menu :deep(.ant-menu-item) {
  margin: 0 !important;
  padding: 0 8px !important;
  height: 28px !important;
  line-height: 28px !important;
  border-radius: 3px;
  color: #333;
}
.dark-mode .context-menu :deep(.ant-menu-item) { color: #ccc; }
.context-menu :deep(.ant-menu-item:hover) {
  background: rgba(0, 0, 0, 0.05) !important;
}
.dark-mode .context-menu :deep(.ant-menu-item:hover) {
  background: rgba(255, 255, 255, 0.07) !important;
}
.context-menu :deep(.ant-menu-item-disabled) {
  color: #bbb !important;
}
.dark-mode .context-menu :deep(.ant-menu-item-disabled) {
  color: #555 !important;
}
.context-menu :deep(.ant-divider) {
  margin: 2px 0 !important;
}
</style>
