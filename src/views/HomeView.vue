<template>
  <a-layout class="main-layout" :class="{ 'dark-mode': appStore.theme === 'dark' }">
    <!-- 顶部标题栏 -->
    <AppHeader
      :show-query-builder="showQueryBuilderEntry"
      :show-data-compare="showDataCompareEntry"
      @new-connection="showConnectionDialog = true"
      @open-query-builder="handleOpenQueryBuilder"
      @open-data-compare="handleOpenDataCompare"
      @open-settings="openSettings"
      @open-search="showGlobalSearch = true"
    />

    <a-layout-content class="content-container">
      <div class="sidebar-wrapper" :style="{ width: appStore.sidebarCollapsed ? '0' : sidebarWidth + 'px' }">
        <div class="sidebar-inner">
          <ConnectionPanel
            @add-connection="showConnectionDialog = true"
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

    <ConnectionDialog v-model:visible="showConnectionDialog" :editing-connection="editingConnection" @close="editingConnection = null" />
    <GlobalSearch v-model:visible="showGlobalSearch" :connection-id="connectionStore.activeConnectionId" @view-data="handleTableSelected" />
  </a-layout>
</template>

<script setup lang="ts">
import { defineAsyncComponent, reactive, ref, computed, nextTick, onMounted, onUnmounted, watch, h } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useI18n } from 'vue-i18n'
import {
  FileTextOutlined,
  TableOutlined, EditOutlined, RetweetOutlined, BuildOutlined, SettingOutlined,
} from '@ant-design/icons-vue'
import { useAppStore } from '@/stores/app'
import { useConnectionStore } from '@/stores/connection'
import { useWorkspaceStore } from '@/stores/workspace'
import { message, Modal } from 'ant-design-vue'
import type { ConnectionConfig } from '@/types/database'
import { TabType } from '@/types/workspace'
import { useSidebarResize } from '@/composables/useSidebarResize'
import { useTabManager, type DataTab } from '@/composables/useTabManager'
import { useContextMenu } from '@/composables/useContextMenu'
import { getDatabaseSupportProfile, supportsDataCompare, supportsQueryBuilder, supportsSqlWorkspace } from '@/utils/databaseSupport'
import { logStartupStage, createStartupTimer } from '@/utils/startupProfiler'

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

const showConnectionDialog = ref(false)
const showGlobalSearch = ref(false)
const editingConnection = ref<ConnectionConfig | null>(null)
const redisEditorRef = ref()
const appWindow = getCurrentWindow()
let sessionReconnectTimer: number | null = null
let sessionSaveTimer: number | null = null
let unlistenCloseRequested: (() => void) | null = null

function collectSessionConnectionIds(tabs: DataTab[]) {
  return [...new Set(tabs.map(tab => tab.connectionId).filter((id): id is string => Boolean(id)))]
}

function scheduleSessionSave() {
  if (workspaceStore.isRestoring) return
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer)
  sessionSaveTimer = window.setTimeout(() => {
    sessionSaveTimer = null
    void workspaceStore.saveSession(dataTabs.value, mainTabKey.value)
  }, 800)
}

function clearSessionReconnectTimer() {
  if (sessionReconnectTimer !== null) {
    clearTimeout(sessionReconnectTimer)
    sessionReconnectTimer = null
  }
}

function getDirtyQueryTabs(tabKeys?: string[]) {
  const targetKeys = tabKeys ? new Set(tabKeys) : null
  return dataTabs.value.filter(tab =>
    tab.type === TabType.Query &&
    tab.dirty &&
    (!targetKeys || targetKeys.has(tab.key))
  )
}

function scheduleSessionReconnect(connectionIds: string[]) {
  clearSessionReconnectTimer()
  if (connectionIds.length === 0) return

  void logStartupStage('sessionReconnect:scheduled', `count=${connectionIds.length}`, true)

  sessionReconnectTimer = window.setTimeout(async () => {
    const finishReconnect = createStartupTimer('sessionReconnect.total')
    sessionReconnectTimer = null
    await nextTick()

    // 所有连接并行重连，不做串行等待
    await Promise.allSettled(
      connectionIds.map(async (id) => {
        const conn = connectionStore.connections.find(item => item.id === id)
        if (!conn || connectionStore.getConnectionStatus(id) === 'connected') return
        const finish = createStartupTimer(`sessionReconnect.${id}`)
        await connectionStore.connectToDatabase(id, { showErrorMessage: false }).catch(() => {})
        await finish(conn.name)
      })
    )

    await finishReconnect(`count=${connectionIds.length}`)
  }, 450)
}

function openSettings() {
  const key = 'settings'
  if (tabExists(key)) {
    mainTabKey.value = key
    return
  }

  addTab({
    key,
    title: t('common.settings'),
    type: TabType.Settings,
  })
}

const activeConnection = computed(() => connectionStore.getActiveConnection())
const activeSupportProfile = computed(() => getDatabaseSupportProfile(activeConnection.value?.db_type || null))
const showQueryBuilderEntry = computed(() => Boolean(activeConnection.value?.id) && activeSupportProfile.value.supportsQueryBuilder)
const showDataCompareEntry = computed(() => Boolean(activeConnection.value?.id) && activeSupportProfile.value.supportsDataCompare)
const isSqlSupported = computed(() => {
  return !activeConnection.value || supportsSqlWorkspace(activeConnection.value.db_type)
})

watch(dataTabs, scheduleSessionSave, { deep: true })
watch(mainTabKey, scheduleSessionSave)
watch(mainTabKey, async () => {
  await nextTick()
  if (activeTabType.value === 'query') {
    window.setTimeout(() => callActiveEditor('focusEditor'), 0)
  }
})

function isEditableTargetOutsideMonaco(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  if (element.closest('.monaco-editor')) return false
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return true
  if (element.isContentEditable) return true
  return Boolean(element.closest('[contenteditable="true"], [contenteditable=""], input, textarea'))
}

function shouldRouteClipboardToActiveEditor(target: EventTarget | null) {
  return activeTabType.value === 'query' && !isEditableTargetOutsideMonaco(target)
}

function routeClipboardAction(action: 'copy' | 'cut' | 'paste') {
  window.setTimeout(() => callActiveEditor('handleSystemClipboardAction', action), 0)
}

function handleGlobalClipboardKeydown(event: KeyboardEvent) {
  // 快速退出：非 Ctrl/Cmd 组合键、非 query tab、焦点在无关元素
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  if (activeTabType.value !== 'query') return
  if (!shouldRouteClipboardToActiveEditor(event.target)) return

  const key = event.key.toLowerCase()
  if (key !== 'c' && key !== 'x' && key !== 'v') return

  event.preventDefault()
  event.stopPropagation()
  routeClipboardAction(key === 'c' ? 'copy' : key === 'x' ? 'cut' : 'paste')
}

function handleGlobalClipboardEvent(event: ClipboardEvent) {
  const type = event.type
  if ((type !== 'copy' && type !== 'cut' && type !== 'paste') || !shouldRouteClipboardToActiveEditor(event.target)) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  routeClipboardAction(type)
}

async function restoreSession() {
  workspaceStore.isRestoring = true
  const finishRestore = createStartupTimer('restoreSession')
  let pendingReconnectIds: string[] = []
  try {
    await logStartupStage('restoreSession:start')
    const session = await workspaceStore.loadSession()
    await logStartupStage('restoreSession:session-loaded', session ? `tabs=${session.open_tabs.length}` : 'tabs=0')
    if (session && session.open_tabs.length > 0) {
      dataTabs.value = session.open_tabs.map(tab => ({
        ...tab,
        type: tab.type,
      })) as DataTab[]
      mainTabKey.value = session.active_tab_key
      await logStartupStage('restoreSession:tabs-applied', `active=${session.active_tab_key}`)
      if (connectionStore.connections.length === 0) {
        const finishFetchConnections = createStartupTimer('restoreSession.fetchConnections')
        await connectionStore.fetchConnections()
        await finishFetchConnections(`count=${connectionStore.connections.length}`)
      }
      pendingReconnectIds = collectSessionConnectionIds(dataTabs.value)
      await logStartupStage('restoreSession:pending-reconnects', pendingReconnectIds.join(',') || 'none')
    } else if (isSqlSupported.value) {
      handleNewQuery({})
      await logStartupStage('restoreSession:created-default-query')
    }
  } catch (_e) {
    if (isSqlSupported.value) handleNewQuery({})
    await logStartupStage('restoreSession:error-fallback', undefined, true)
  } finally {
    workspaceStore.isRestoring = false
    scheduleSessionReconnect(pendingReconnectIds)
    await finishRestore(`reconnects=${pendingReconnectIds.length}`)
  }
}

function handleEditorDatabaseChange(tabKey: string, database: string) {
  const tab = dataTabs.value.find(item => item.key === tabKey)
  if (tab) tab.database = database
}

async function handleWindowCloseRequested() {
  const dirtyTabs = getDirtyQueryTabs()
  if (dirtyTabs.length === 0) return true

  for (const tab of dirtyTabs) {
    mainTabKey.value = tab.key
    const canClose = await confirmCloseDirtyQueryTab(tab.key)
    if (!canClose) {
      return false
    }
  }

  return true
}

onMounted(async () => {
  await logStartupStage('HomeView mounted')
  window.addEventListener('keydown', handleGlobalClipboardKeydown, true)
  window.addEventListener('copy', handleGlobalClipboardEvent, true)
  window.addEventListener('cut', handleGlobalClipboardEvent, true)
  window.addEventListener('paste', handleGlobalClipboardEvent, true)
  unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
    const canClose = await handleWindowCloseRequested()
    if (!canClose) {
      event.preventDefault()
    }
  })
  restoreSession()
})

onUnmounted(() => {
  clearSessionReconnectTimer()
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer)
    sessionSaveTimer = null
  }
  if (unlistenCloseRequested) {
    unlistenCloseRequested()
    unlistenCloseRequested = null
  }
  window.removeEventListener('keydown', handleGlobalClipboardKeydown, true)
  window.removeEventListener('copy', handleGlobalClipboardEvent, true)
  window.removeEventListener('cut', handleGlobalClipboardEvent, true)
  window.removeEventListener('paste', handleGlobalClipboardEvent, true)
})

interface TableEventData { connectionId?: string; database?: string; table?: string; schema?: string; metadata?: { schema?: string } }
interface QueryEventData { connectionId?: string; database?: string; filePath?: string; title?: string; content?: string }
interface DatabaseEventData { connectionId?: string; name?: string }
interface QueryBuilderExecutePayload { sql: string; database?: string }

function handleOpenSavedScript(data: QueryEventData) { handleNewQuery(data) }
function handleGeneratedSql(data: { sql: string; database: string; connectionId: string }) {
  handleNewQuery({ connectionId: data.connectionId, database: data.database, content: data.sql })
}
function handleViewStructure(data: TableEventData) {
  const key = `structure-${data.connectionId}-${data.database}-${data.table}`
  if (tabExists(key)) { mainTabKey.value = key; return }
  addTab({ key, title: `${t('common.file')}: ${data.table}`, type: TabType.Design, connectionId: data.connectionId, database: data.database, table: data.table, schema: data.schema, readOnly: true })
}
function handleDesignTable(data: TableEventData) {
  const key = `design-${data.connectionId}-${data.database}-${data.table}`
  if (tabExists(key)) { mainTabKey.value = key; return }
  addTab({ key, title: `${t('tree.design_table')}: ${data.table}`, type: TabType.Design, connectionId: data.connectionId, database: data.database, table: data.table, schema: data.schema, readOnly: false })
}

const { contextMenuVisible, contextMenuX, contextMenuY, showContextMenu, hideContextMenu } = useContextMenu()
const currentContextTab = reactive({ key: '', closable: false })
function handleTabContextMenu(e: MouseEvent, key: string, closable: boolean) { currentContextTab.key = key; currentContextTab.closable = closable; showContextMenu(e); }

const currentContextTabIndex = computed(() => dataTabs.value.findIndex(tab => tab.key === currentContextTab.key))
const hasClosableTabsOnLeft = computed(() => currentContextTabIndex.value > 0 && dataTabs.value.slice(0, currentContextTabIndex.value).some(tab => tab.closable !== false))
const hasClosableTabsOnRight = computed(() => currentContextTabIndex.value >= 0 && dataTabs.value.slice(currentContextTabIndex.value + 1).some(tab => tab.closable !== false))
const hasClosableOtherTabs = computed(() => dataTabs.value.some(tab => tab.key !== currentContextTab.key && tab.closable !== false))
const hasClosableSavedTabs = computed(() => dataTabs.value.some(tab => tab.closable !== false && Boolean(tab.filePath)))
const currentContextTabFilePath = computed(() => dataTabs.value.find(tab => tab.key === currentContextTab.key)?.filePath || '')

function generateNextScriptTitle() {
  const used = new Set(
    dataTabs.value
      .map(tab => /^script-(\d+)\.sql$/i.exec(tab.title)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value > 0)
  )

  let index = 1
  while (used.has(index)) index += 1
  return `script-${index}.sql`
}

function getDirtyQueryTab(tabKey: string) {
  const tab = findTabByKey(tabKey)
  if (!tab || tab.type !== TabType.Query || !tab.dirty) return null
  return tab
}

async function confirmCloseDirtyQueryTab(tabKey: string) {
  const tab = getDirtyQueryTab(tabKey)
  if (!tab) return true

  return new Promise<boolean>((resolve) => {
    let resolved = false
    let modal: { destroy: () => void } | null = null

    const finish = (result: boolean) => {
      if (resolved) return
      resolved = true
      resolve(result)
      modal?.destroy()
    }

    modal = Modal.confirm({
      title: t('common.warning'),
      content: t('editor.unsaved_close_confirm', { title: tab.title }),
      closable: false,
      maskClosable: false,
      keyboard: false,
      icon: () => null,
      footer: () => [
        h('button', {
          class: 'ant-btn ant-btn-default',
          type: 'button',
          onClick: () => finish(false),
        }, t('common.cancel')),
        h('button', {
          class: 'ant-btn ant-btn-default',
          type: 'button',
          onClick: () => finish(true),
        }, t('editor.discard_changes')),
        h('button', {
          class: 'ant-btn ant-btn-primary',
          type: 'button',
          onClick: async () => {
            try {
              const saved = await (callActiveEditor('handleSave') as Promise<boolean> | undefined)
              if (saved) {
                finish(true)
              }
            } catch {
              finish(false)
            }
          },
        }, t('common.save')),
      ],
    })
  })
}

async function closeTabWithConfirm(tabKey: string) {
  const canClose = await confirmCloseDirtyQueryTab(tabKey)
  if (!canClose) return false
  closeTab(tabKey)
  return true
}

async function closeTabsWithConfirm(keys: string[], fallbackActiveKey?: string) {
  const dirtyTabs = keys
    .map(key => getDirtyQueryTab(key))
    .filter((tab): tab is DataTab => Boolean(tab))

  for (const tab of dirtyTabs) {
    mainTabKey.value = tab.key
    const canClose = await confirmCloseDirtyQueryTab(tab.key)
    if (!canClose) {
      return false
    }
  }

  removeTabs(keys, fallbackActiveKey)
  return true
}

async function handleTabMenuClick({ key }: { key: string | number }) {
  if (!currentContextTab.key) return
  const action = String(key)

  if (action === 'close-current' && currentContextTab.closable) {
    await closeTabWithConfirm(currentContextTab.key)
  } else if (action === 'close-left') {
    const anchorIndex = dataTabs.value.findIndex(tab => tab.key === currentContextTab.key)
    const keys = dataTabs.value.slice(0, anchorIndex).filter(tab => tab.closable !== false).map(tab => tab.key)
    await closeTabsWithConfirm(keys, currentContextTab.key)
  } else if (action === 'close-right') {
    const anchorIndex = dataTabs.value.findIndex(tab => tab.key === currentContextTab.key)
    const keys = dataTabs.value.slice(anchorIndex + 1).filter(tab => tab.closable !== false).map(tab => tab.key)
    await closeTabsWithConfirm(keys, currentContextTab.key)
  } else if (action === 'close-others') {
    const keys = dataTabs.value.filter(tab => tab.key !== currentContextTab.key && tab.closable !== false).map(tab => tab.key)
    await closeTabsWithConfirm(keys, currentContextTab.key)
  } else if (action === 'close-saved') {
    const keys = dataTabs.value.filter(tab => tab.closable !== false && Boolean(tab.filePath)).map(tab => tab.key)
    await closeTabsWithConfirm(keys, currentContextTab.key)
  } else if (action === 'open-file-location') {
    const fp = currentContextTabFilePath.value
    if (fp) {
      import('@/api/utils').then(({ utilsApi }) => utilsApi.openInFileManager(fp).catch(() => {}))
    }
  }

  hideContextMenu()
}

function handleTableSelected(d: TableEventData) {
  const id = d.connectionId || connectionStore.activeConnectionId, key = `table-${id}-${d.database}-${d.table}`
  if (tabExists(key)) { mainTabKey.value = key; return }
  addTab({ key, title: d.table || '', type: TabType.Data, connectionId: id!, database: d.database, table: d.table, schema: d.schema || d.metadata?.schema })
}
async function handleDatabaseSelected(d: DatabaseEventData) {
  if (d.connectionId) connectionStore.setActiveConnection(d.connectionId)
  if (!isSqlSupported.value) {
    if (connectionStore.getActiveConnection()?.db_type === 'redis') {
      if (!tabExists('redis')) addTab({ key: 'redis', title: 'Redis 命令行', type: TabType.Redis, closable: false })
      mainTabKey.value = 'redis'; await nextTick(); setTimeout(() => redisEditorRef.value?.switchDatabase(d.name || ''), 100)
    }
    return
  }
}

async function handleNewQuery(d: QueryEventData) {
  if (!isSqlSupported.value) return
  const connId = d.connectionId || connectionStore.activeConnectionId
  let dbName = d.database
  if (connId && !dbName) {
    const conn = connectionStore.connections.find(c => c.id === connId)
    if (conn?.db_type === 'sqlite') dbName = 'main'
  }

  if (d.filePath) {
    const existingTab = dataTabs.value.find(tab => tab.type === TabType.Query && tab.filePath === d.filePath)
    if (existingTab) {
      mainTabKey.value = existingTab.key
      return
    }
  }

  const initialContent = d.content || ''
  const key = `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  addTab({
    key,
    title: d.title || generateNextScriptTitle(),
    type: TabType.Query,
    connectionId: connId || undefined,
    database: dbName,
    content: initialContent,
    filePath: d.filePath,
    dirty: false,
  })
}

function handleOpenQueryBuilder() {
  const activeConnection = connectionStore.getActiveConnection()

  if (!activeConnection?.id) {
    message.warning(t('tools.query_builder.require_connection'))
    return
  }

  if (!supportsQueryBuilder(activeConnection.db_type)) {
    message.warning(t('tools.query_builder.unsupported_connection'))
    return
  }

  const key = `builder-${activeConnection.id}`
  if (tabExists(key)) {
    mainTabKey.value = key
    return
  }

  addTab({
    key,
    title: t('tools.query_builder.title'),
    type: TabType.Builder,
    connectionId: activeConnection.id,
    database: activeTabType.value === 'query' ? activeTabDatabase.value : activeConnection.database,
  })
}

function handleQueryBuilderExecute(tab: DataTab, payload: QueryBuilderExecutePayload | string) {
  const sql = typeof payload === 'string' ? payload : payload.sql
  const database = typeof payload === 'string' ? tab.database : payload.database || tab.database

  handleNewQuery({
    connectionId: tab.connectionId,
    database,
    content: sql,
  })
}

function handleOpenDataCompare() {
  const activeConnection = connectionStore.getActiveConnection()

  if (!activeConnection?.id) {
    message.warning(t('tools.data_compare.require_connection'))
    return
  }

  if (!supportsDataCompare(activeConnection.db_type)) {
    message.warning(t('tools.data_compare.unsupported_connection'))
    return
  }

  const key = `compare-${activeConnection.id}`
  if (tabExists(key)) {
    mainTabKey.value = key
    return
  }

  addTab({
    key,
    title: t('tools.data_compare.title'),
    type: TabType.Compare,
    connectionId: activeConnection.id,
    database: activeTabType.value === 'query' ? activeTabDatabase.value : activeConnection.database,
  })
}

async function onTabEdit(key: string | number | MouseEvent | KeyboardEvent, action: string) {
  if (action === 'add') {
    handleNewQuery({})
    return
  }
  await closeTabWithConfirm(String(key))
}
function handleEditConnection(c: ConnectionConfig) { editingConnection.value = c; showConnectionDialog.value = true; }
function getConnectionColor(connectionId?: string) {
  if (!connectionId) return ''
  return connectionStore.connections.find(connection => connection.id === connectionId)?.color || ''
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
