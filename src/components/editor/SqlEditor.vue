<template>
  <div ref="sqlEditorRoot" class="sql-editor-container">
    <SqlToolbar
      :executing="executing"
      :selected-database="selectedDatabase"
      :databases="availableDatabases"
      :result-panel-visible="resultPanelVisible"
      :messages-panel-visible="messagesPanelVisible"
      :show-search-path="supportsSearchPath"
      :search-path="searchPath"
      @action="handleToolbarAction"
      @database-change="handleToolbarDbChange"
      @search-path-change="handleSearchPathChange"
    />

    <div class="editor-workbench">
      <div class="editor-section">
        <div ref="editorContainer" class="monaco-container"></div>
      </div>
    </div>

    <div class="result-dock" :class="{ collapsed: !resultPanelVisible }" :style="{ height: `${resultDockHeight}px` }">
      <div v-if="resultPanelVisible" class="split-resizer" @mousedown="startResultResize">
        <div class="resizer-handle"></div>
      </div>

      <!-- 统一 Tabs (按时间先后排列) -->
      <a-tabs v-if="hasAnyResultContent" v-model:activeKey="resultTabKey" size="small" class="result-tabs">
        <template v-for="tab in orderedTabs" :key="tab.key">
          <!-- 错误 Tab -->
          <a-tab-pane v-if="tab.kind === 'error' && tab.errorIndex != null" :key="tab.key">
            <template #tab>
              <span class="result-tab-label" @contextmenu.prevent>
                <CloseCircleOutlined class="error-tab-icon" />
                <span class="result-tab-title">{{ errorTabs[tab.errorIndex].status === 'cancelled' ? $t('editor.status.cancelled') : $t('editor.status.failed') }}</span>
                <button class="result-tab-close" type="button" :title="$t('common.close')" @click.stop="closeErrorTab(tab.errorIndex!)">×</button>
              </span>
            </template>
            <div class="execution-error-tab">
              <div class="error-center">
                <CloseCircleOutlined class="error-icon" />
                <div class="error-title">{{ errorTabs[tab.errorIndex].status === 'cancelled' ? $t('editor.summary.query_cancelled') : $t('editor.execution_failed') }}</div>
                <div class="error-summary">{{ errorTabs[tab.errorIndex].summary }}</div>
                <div class="error-detail" v-if="errorTabs[tab.errorIndex].detail">{{ errorTabs[tab.errorIndex].detail }}</div>
                <div class="error-time" v-if="errorTabs[tab.errorIndex].elapsedMs > 0">{{ $t('editor.elapsed') }} {{ formatElapsed(errorTabs[tab.errorIndex].elapsedMs) }}</div>
              </div>
            </div>
          </a-tab-pane>

          <!-- 结果 Tab -->
          <a-tab-pane v-else-if="tab.kind === 'result' && tab.resultIndex != null" :key="tab.key">
            <template #tab>
              <span class="result-tab-label" @contextmenu.prevent="handleResultTabContextMenu($event, tab.resultIndex!)">
                <span class="result-tab-title">
                  {{ queryResults.length > 1 ? $t('editor.result_n', { n: tab.resultIndex! + 1 }) : $t('editor.result') }}
                </span>
                <button class="result-tab-close" type="button" :title="$t('common.close')" @click.stop="closeResultAt(tab.resultIndex!)">×</button>
              </span>
            </template>
            <div class="result-content">
              <!-- 无数据行 (DDL / 无结果集) -->
              <div v-if="queryResults[tab.resultIndex].columns.length === 0 && queryResults[tab.resultIndex].rows.length === 0" class="result-empty-ddl">
                <CheckCircleOutlined class="ddl-success-icon" />
                <span class="ddl-success-text">{{ $t('editor.exec_success_simple') }}</span>
                <span class="ddl-elapsed">{{ $t('editor.elapsed') }} {{ queryResults[tab.resultIndex].execution_time_ms }} ms</span>
                <span class="ddl-affected" v-if="queryResults[tab.resultIndex].affected_rows > 0">{{ $t('editor.affected_rows', { n: queryResults[tab.resultIndex].affected_rows }) }}</span>
              </div>

              <!-- 有数据行 -->
              <template v-else>
              <div class="result-info">
                <a-space>
                  <a-tag color="success">{{ $t('editor.loaded_rows', { n: queryResults[tab.resultIndex].rows.length }) }}</a-tag>
                  <a-tag color="processing">{{ queryResults[tab.resultIndex].execution_time_ms }} ms</a-tag>
                  <a-divider type="vertical" />
                  <span class="affected-text" v-if="queryResults[tab.resultIndex].affected_rows > 0">{{ $t('editor.affected_rows', { n: queryResults[tab.resultIndex].affected_rows }) }}</span>
                </a-space>
                <a-space :size="8">
                  <a-dropdown>
                    <template #overlay>
                      <a-menu @click="handleCopyMenuClick(tab.resultIndex!, $event)">
                        <a-menu-item key="cell" :disabled="!hasResultClipboardSelection(tab.resultIndex!)">{{ $t('editor.copy_cell') }}</a-menu-item>
                        <a-menu-item key="row" :disabled="!hasResultClipboardSelection(tab.resultIndex!)">{{ $t('editor.copy_row') }}</a-menu-item>
                        <a-menu-item key="result" :disabled="queryResults[tab.resultIndex].columns.length === 0">{{ $t('editor.copy_result_set') }}</a-menu-item>
                      </a-menu>
                    </template>
                    <a-button size="small" :icon="h(CopyOutlined)" :disabled="queryResults[tab.resultIndex].columns.length === 0">{{ $t('common.copy') }}</a-button>
                  </a-dropdown>
                  <a-dropdown>
                    <template #overlay>
                      <a-menu @click="handleExportMenuClick(tab.resultIndex!, $event)">
                        <a-menu-item key="csv">{{ $t('data.export_csv') }}</a-menu-item>
                        <a-menu-item key="json">{{ $t('data.export_json') }}</a-menu-item>
                        <a-menu-item key="sql">{{ $t('data.export_sql') }}</a-menu-item>
                      </a-menu>
                    </template>
                    <a-button size="small" :icon="h(ExportOutlined)" :disabled="queryResults[tab.resultIndex].columns.length === 0">{{ $t('editor.export_result') }}</a-button>
                  </a-dropdown>
                </a-space>
              </div>
              <div class="table-wrapper">
                <vxe-grid
                  :ref="(el: any) => setGridRef(el, tab.resultIndex!)"
                  v-bind="getGridOptions(queryResults[tab.resultIndex], tab.resultIndex!)"
                  @scroll="(params: any) => handleScroll({ ...params, index: tab.resultIndex! })"
                  @cell-click="(params: any) => handleResultCellClick({ ...params, index: tab.resultIndex! })"
                >
                  <template #cell_default="{ row, column }">
                    <span class="result-cell-text" :class="{ 'null-text': row[column.field] === null }">
                      {{ row[column.field] === null ? 'NULL' : row[column.field] }}
                    </span>
                  </template>
                </vxe-grid>
              </div>
              </template>
            </div>
          </a-tab-pane>

          <!-- 进度 Tab -->
          <a-tab-pane v-else-if="tab.kind === 'progress'" :key="tab.key">
            <template #tab>
              <span class="result-tab-label">
                <LoadingOutlined spin class="progress-tab-icon" />
                <span class="result-tab-title">{{ $t('editor.status.running') }}</span>
              </span>
            </template>
            <div class="execution-progress-tab">
              <div class="progress-tab-center">
                <div class="progress-status">{{ executionStatusLabel }}</div>
                <div class="progress-summary-text">{{ executionState.summary }}</div>
                <div class="progress-stats">
                  <div class="stat-item" v-if="executionState.statementCount > 1">
                    <span class="stat-label">{{ $t('editor.progress.statements') }}</span>
                    <span class="stat-value">{{ executionState.completedStatements }}/{{ executionState.statementCount }}</span>
                  </div>
                  <div class="stat-item" v-if="executionState.resultSetCount > 0">
                    <span class="stat-label">{{ $t('editor.progress.result_sets') }}</span>
                    <span class="stat-value">{{ executionState.resultSetCount }}</span>
                  </div>
                  <div class="stat-item" v-if="executionState.affectedRows > 0">
                    <span class="stat-label">{{ $t('editor.progress.affected_rows') }}</span>
                    <span class="stat-value">{{ executionState.affectedRows }}</span>
                  </div>
                  <div class="stat-item timer" v-if="executionElapsedLabel">
                    <span class="stat-label">{{ $t('editor.progress.elapsed') }}</span>
                    <span class="stat-value">{{ executionElapsedLabel }}</span>
                  </div>
                </div>
                <a-button danger type="primary" size="small" @click="stopExec" class="progress-stop-btn">
                  <template #icon><StopOutlined /></template>{{ $t('editor.stop_exec') }}
                </a-button>
              </div>
            </div>
          </a-tab-pane>
        </template>
      </a-tabs>

      <!-- 空状态 -->
      <div v-else class="result-content">
        <a-empty :description="$t('editor.no_result')" />
      </div>
    </div>

    <!-- 面板间分隔条 -->
    <div v-if="resultPanelVisible && messagesPanelVisible" class="inter-panel-resizer" @mousedown="startMessagesResize"></div>

    <!-- 数据库消息面板 -->
    <div class="messages-dock" :class="{ collapsed: !messagesPanelVisible }" :style="{ height: messagesPanelVisible ? `${messagesPanelHeight}px` : '0' }">
      <div v-if="messagesPanelVisible" class="split-resizer" @mousedown="startMessagesResize">
        <div class="resizer-handle"></div>
      </div>
      <div class="messages-panel-header">
        <span class="messages-panel-title">{{ $t('editor.messages_panel') }}</span>
      </div>
      <div class="messages-content">
        <div v-for="(msg, index) in dbMessages" :key="index" class="message-line">
          <span class="message-time">{{ formatMessageTime(index) }}</span>
          <span class="message-body">{{ msg.text }}</span>
        </div>
        <a-empty v-if="dbMessages.length === 0" :description="$t('editor.messages_hint')" />
      </div>
    </div>

    <!-- 历史记录 -->
    <a-drawer :title="$t('editor.history_title')" placement="right" v-model:open="showHistory" width="400">
      <div class="history-panel">
        <div class="history-toolbar">
          <a-input v-model:value="historySearch" allow-clear size="small" :placeholder="$t('editor.history_search_placeholder')" />
          <span class="history-count">{{ filteredHistory.length }}</span>
        </div>
        <a-list v-if="filteredHistory.length > 0" :data-source="filteredHistory" size="small" class="history-list">
          <template #renderItem="{ item }">
            <a-list-item class="history-item" @click="useHistorySql(item.sql)">
              <div class="history-entry">
                <code class="history-sql">{{ getHistoryPreview(item.sql) }}</code>
                <div class="history-meta">{{ formatHistoryMeta(item) }}</div>
              </div>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-else :description="historyEmptyDescription" />
      </div>
    </a-drawer>

    <div v-if="resultContextMenuVisible" class="result-context-menu-overlay" @click="hideResultContextMenu()">
      <div class="result-context-menu" :style="{ left: resultContextMenuX + 'px', top: resultContextMenuY + 'px' }" @click.stop>
        <a-menu @click="handleResultMenuClick" size="small">
          <a-menu-item key="close-current" :disabled="resultContextIndex < 0">{{ $t('common.close') }}</a-menu-item>
          <a-menu-item key="close-left" :disabled="!hasResultTabsOnLeft">{{ $t('common.close_left') }}</a-menu-item>
          <a-menu-item key="close-right" :disabled="!hasResultTabsOnRight">{{ $t('common.close_right') }}</a-menu-item>
        </a-menu>
      </div>
    </div>

    <SaveQueryDialog v-model="showSaveDialog" :sql="editor?.getValue() || ''" @saved="handleQuerySaved" />
    <SqlSnippetsManager v-model:visible="showSnippets" @insert="handleSnippetInsert" />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, watch, ref, computed, onActivated, reactive, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { getSqlAutocompleteManager } from '@/services/sqlAutocomplete'
import { loadMonaco, type MonacoModule } from '@/utils/monacoLoader'
import { message } from 'ant-design-vue'
import { ExportOutlined, CopyOutlined, LoadingOutlined, CloseCircleOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons-vue'
import { save } from '@tauri-apps/plugin-dialog'
import { exportApi, queryApi, metadataApi, utilsApi, SQL_FILE_FILTERS } from '@/api'
import type { QueryResult, DatabaseInfo } from '@/types/database'
import { useConnectionStore } from '@/stores/connection'
import { useAppStore } from '@/stores/app'
import { getStorageItem, setStorageItem } from '@/utils/storageService'
import { readClipboardText, writeClipboardText } from '@/utils/clipboard'
import { getErrorMessage } from '@/utils/errorHandler'
import SqlToolbar from '@/components/layout/SqlToolbar.vue'
import SaveQueryDialog from './SaveQueryDialog.vue'
import SqlSnippetsManager from './SqlSnippetsManager.vue'
import type { VxeGridProps } from 'vxe-table'
import { useSqlHistory } from '@/composables/useSqlHistory'
import { useSqlExecution } from '@/composables/useSqlExecution'

const VxeGrid = defineAsyncComponent(() => import('@/components/vxe/VxeGridRuntime'))

// ── 基础设置 ──
const { t } = useI18n()
const props = defineProps<{ connectionId?: string; initialDatabase?: string; initialValue?: string; filePath?: string; tabId?: string }>()
const emit = defineEmits(['contentChange', 'fileSaved', 'databasesLoaded', 'databaseChange', 'executionStateChange'])
const connectionStore = useConnectionStore()
const appStore = useAppStore()
let autocompleteManager: Awaited<ReturnType<typeof getSqlAutocompleteManager>> | null = null

const RESULT_PANEL_HEIGHT_KEY = 'sql_result_panel_height'
const RESULT_PANEL_VISIBLE_KEY = 'sql_result_panel_visible'
const RESULT_PANEL_MIN_HEIGHT = 180
const RESULT_PANEL_COLLAPSED_HEIGHT = 0

// ── 会话身份 ──
const internalSessionId = ref(props.tabId || props.filePath || `editor-${Math.random().toString(36).substring(2, 9)}`)
const sessionConnectionId = computed(() => {
  const baseId = props.connectionId || connectionStore.activeConnectionId
  if (!baseId) return ''
  return `${baseId}:tab_${internalSessionId.value.replace(/[^a-zA-Z0-9]/g, '_')}`
})

// ── Monaco 编辑器 ──
const sqlEditorRoot = ref<HTMLElement>()
const editorContainer = ref<HTMLElement>()
let monacoInstance: MonacoModule | null = null
let editor: any = null

// ── 数据库上下文 ──
const availableDatabases = ref<DatabaseInfo[]>([])
const selectedDatabase = ref(props.initialDatabase || '')

// ── search_path (PostgreSQL) ──
const searchPath = ref('')
const supportsSearchPath = computed(() => currentConnection.value?.db_type === 'postgresql')

async function loadSearchPath() {
  if (!supportsSearchPath.value) return
  const connId = props.connectionId || connectionStore.activeConnectionId
  if (!connId) return
  try {
    searchPath.value = await queryApi.getSearchPath(connId)
  } catch { searchPath.value = '' }
}

async function handleSearchPathChange(newPath: string) {
  searchPath.value = newPath
  if (!newPath) return
  try {
    await queryApi.setSearchPath(sessionConnectionId.value, newPath)
    updateAutocompleteContext()
  } catch (e: unknown) { message.error(getErrorMessage(e)) }
}

const currentConnection = computed(() =>
  connectionStore.connections.find(c => c.id === (props.connectionId || connectionStore.activeConnectionId)) || null
)
const currentFilePath = ref(props.filePath || '')
const isDirty = ref(false)

watch(() => props.filePath, (value) => {
  currentFilePath.value = value || ''
  if (value) {
    isDirty.value = false
  }
})
const currentDatabaseLabel = computed(() => {
  const conn = currentConnection.value
  if (selectedDatabase.value) return selectedDatabase.value
  if (props.initialDatabase) return props.initialDatabase
  if (conn?.database) return conn.database
  if (conn?.db_type === 'sqlite') return 'main'
  return t('editor.default_database')
})

// ── 结果管理 ──
const queryResults = ref<QueryResult[]>([])
const resultTabKey = ref('result-0')
const dbMessages = ref<{ severity: string; text: string; time: number }[]>([])
const resultPanelVisible = ref(getStorageItem(RESULT_PANEL_VISIBLE_KEY, false))
const resultPanelHeight = ref(getStorageItem(RESULT_PANEL_HEIGHT_KEY, 260))

// ── 错误 Tabs (持久化，不随新执行关闭) ──
interface ErrorTabInfo {
  key: string
  status: 'failed' | 'cancelled' | 'partial_success'
  summary: string
  detail: string
  elapsedMs: number
  createdAt: number
}
const errorTabs = ref<ErrorTabInfo[]>([])
let errorTabCounter = 0

// ── 统一 Tab 排序 ──
interface OrderedTab {
  kind: 'error' | 'result' | 'progress'
  key: string
  errorIndex?: number    // index into errorTabs
  resultIndex?: number   // index into queryResults
  createdAt: number
}

// 为每个结果 tab 记录创建时间
const resultTabCreatedAt = ref<Record<number, number>>({})

const orderedTabs = computed<OrderedTab[]>(() => {
  const tabs: OrderedTab[] = []
  
  // 错误 tabs
  errorTabs.value.forEach((err, i) => {
    tabs.push({ kind: 'error', key: err.key, errorIndex: i, createdAt: err.createdAt })
  })
  
  // 结果 tabs
  queryResults.value.forEach((_, i) => {
    tabs.push({ kind: 'result', key: `result-${i}`, resultIndex: i, createdAt: resultTabCreatedAt.value[i] || 0 })
  })
  
  // 进度 tab (始终最后)
  if (executing.value) {
    tabs.push({ kind: 'progress', key: 'progress', createdAt: Date.now() })
  }
  
  // 按时间排序
  tabs.sort((a, b) => a.createdAt - b.createdAt)
  return tabs
})

function addErrorTab(status: 'failed' | 'cancelled' | 'partial_success', summary: string, detail: string, elapsedMs: number) {
  const key = `error-${++errorTabCounter}`
  errorTabs.value.push({ key, status, summary, detail, elapsedMs, createdAt: Date.now() })
  resultTabKey.value = key
  revealResultPanel()
}

function closeErrorTab(index: number) {
  if (index < 0 || index >= errorTabs.value.length) return
  const removedKey = errorTabs.value[index].key
  errorTabs.value.splice(index, 1)
  if (resultTabKey.value === removedKey) {
    if (executing.value) resultTabKey.value = 'progress'
    else if (queryResults.value.length > 0) resultTabKey.value = 'result-' + Math.max(0, queryResults.value.length - 1)
    else if (errorTabs.value.length > 0) resultTabKey.value = errorTabs.value[errorTabs.value.length - 1].key
    else resultTabKey.value = 'result-0'
  }
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return '0 ms'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

// ── 消息面板 ──
const MESSAGES_PANEL_VISIBLE_KEY = 'sql_messages_panel_visible'
const MESSAGES_PANEL_HEIGHT_KEY = 'sql_messages_panel_height'
const MESSAGES_PANEL_MIN_HEIGHT = 100
const messagesPanelVisible = ref(getStorageItem(MESSAGES_PANEL_VISIBLE_KEY, false))
const messagesPanelHeight = ref(getStorageItem(MESSAGES_PANEL_HEIGHT_KEY, 200))

const isSplitResizing = ref(false)
const isMessagesResizing = ref(false)

const queryResultStates = reactive<Record<number, { pagination: { current: number; pageSize: number }; loading: boolean; hasMore: boolean; sql: string }>>({})

function addDbMessage(severity: string, text: string) {
  dbMessages.value.unshift({ severity, text, time: Date.now() })
  if (dbMessages.value.length > 500) dbMessages.value = dbMessages.value.slice(0, 500)
}

function formatMessageTime(index: number): string {
  const msg = dbMessages.value[index]
  if (!msg || !msg.time) return ''
  const d = new Date(msg.time)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  const ms = d.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function revealResultPanel() { resultPanelVisible.value = true }
function toggleResultPanel() { resultPanelVisible.value = !resultPanelVisible.value; setStorageItem(RESULT_PANEL_VISIBLE_KEY, resultPanelVisible.value) }
function toggleMessagesPanel() { messagesPanelVisible.value = !messagesPanelVisible.value; setStorageItem(MESSAGES_PANEL_VISIBLE_KEY, messagesPanelVisible.value) }

function appendQueryResults(results: QueryResult[], states: Array<{ pagination: { current: number; pageSize: number }; loading: boolean; hasMore: boolean; sql: string }>) {
  const startIndex = queryResults.value.length
  queryResults.value = [...queryResults.value, ...results]
  states.forEach((state, offset) => {
    queryResultStates[startIndex + offset] = { ...state }
    resultTabCreatedAt.value[startIndex + offset] = Date.now()
  })
  return startIndex
}

function replaceResultTabs(keptSourceIndices: number[]) {
  const nextResults = keptSourceIndices.map(i => queryResults.value[i])
  const nextStates = keptSourceIndices.map(i => queryResultStates[i])
  const nextSelections = keptSourceIndices.map(i => resultClipboardSelections[i])
  const nextCreatedAt: Record<number, number> = {}
  keptSourceIndices.forEach((oldIdx, newIdx) => {
    nextCreatedAt[newIdx] = resultTabCreatedAt.value[oldIdx] || 0
  })
  const prevActive = activeResultIndex.value

  queryResults.value = nextResults
  resultTabCreatedAt.value = nextCreatedAt
  Object.keys(queryResultStates).forEach(k => delete queryResultStates[Number(k)])
  Object.keys(resultClipboardSelections).forEach(k => delete resultClipboardSelections[Number(k)])
  nextStates.forEach((s, i) => { if (s) queryResultStates[i] = { ...s } })
  nextSelections.forEach((s, i) => { if (s) resultClipboardSelections[i] = s })

  if (prevActive < 0) {
    if (queryResults.value.length === 0) {
      resultTabKey.value = executing.value ? 'progress' : (errorTabs.value.length > 0 ? errorTabs.value[errorTabs.value.length - 1].key : 'result-0')
      return
    }
    resultTabKey.value = 'result-0'
    return
  }
  const preserved = keptSourceIndices.indexOf(prevActive)
  if (preserved >= 0) { resultTabKey.value = `result-${preserved}`; return }
  if (queryResults.value.length === 0) { resultTabKey.value = executing.value ? 'progress' : (errorTabs.value.length > 0 ? errorTabs.value[errorTabs.value.length - 1].key : 'result-0'); return }
  resultTabKey.value = `result-${keptSourceIndices.findIndex(i => i > prevActive) >= 0 ? keptSourceIndices.findIndex(i => i > prevActive) : queryResults.value.length - 1}`
}

function closeResultAt(index: number) {
  if (index < 0 || index >= queryResults.value.length) return
  replaceResultTabs(queryResults.value.map((_, i) => i).filter(i => i !== index))
}
function closeResultTabsLeftOf(index: number) {
  if (index <= 0) return
  replaceResultTabs(queryResults.value.map((_, i) => i).filter(i => i >= index))
}
function closeResultTabsRightOf(index: number) {
  if (index < 0 || index >= queryResults.value.length - 1) return
  replaceResultTabs(queryResults.value.map((_, i) => i).filter(i => i <= index))
}

function getMaxResultPanelHeight() {
  const h = sqlEditorRoot.value?.clientHeight || 0
  // 编辑器最小高度 + 消息面板空间
  const editorMin = 120
  const messagesSpace = messagesPanelVisible.value ? messagesPanelHeight.value + 6 : 0
  return h <= 0 ? 420 : Math.max(RESULT_PANEL_MIN_HEIGHT, h - editorMin - messagesSpace)
}
const resultDockHeight = computed(() => resultPanelVisible.value ? resultPanelHeight.value : RESULT_PANEL_COLLAPSED_HEIGHT)

function getGridOptions(result: QueryResult, index: number): VxeGridProps {
  const state = queryResultStates[index]
  return {
    border: true, height: 'auto', loading: state?.loading || false,
    columnConfig: { resizable: true }, rowConfig: { isHover: true, isCurrent: true, height: 36 },
    mouseConfig: { selected: true }, scrollX: { enabled: true, gt: 20 }, scrollY: { enabled: true, gt: 0 },
    columns: result.columns.map(col => ({ field: col, title: col, minWidth: 150, showOverflow: true, slots: { default: 'cell_default' } })),
    data: result.rows,
  }
}

// ── 滚动分页 ──
const handleScroll = ({ isY, scrollTop, bodyHeight, scrollHeight, index }: any) => {
  if (isY && !execution.executing.value && queryResultStates[index]?.hasMore && !queryResultStates[index]?.loading) {
    if (scrollTop + bodyHeight + 50 >= scrollHeight) loadNextPage(index)
  }
}

async function loadNextPage(index: number) {
  const state = queryResultStates[index]
  if (!state || state.loading || !state.hasMore) return
  state.loading = true
  state.pagination.current++
  const offset = (state.pagination.current - 1) * state.pagination.pageSize
  let baseSql = state.sql.trim()
  if (baseSql.endsWith(';')) baseSql = baseSql.slice(0, -1).trim()
  const cleanSql = baseSql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(--|#).*$/gm, '').trim()
  const isSelect = cleanSql.toUpperCase().startsWith('SELECT')
  const hasLimit = /\bLIMIT\b/i.test(cleanSql)
  if (isSelect && !hasLimit && !cleanSql.includes(';')) {
    const pagedSql = `${baseSql} LIMIT ${state.pagination.pageSize} OFFSET ${offset};`
    try {
      const results = await queryApi.executeQuery(sessionConnectionId.value, pagedSql, selectedDatabase.value || null, undefined, { allowReconnectRetry: true })
      if (results.length > 0) {
        const r = results[0]
        state.hasMore = r.rows.length === state.pagination.pageSize
        queryResults.value[index] = { ...queryResults.value[index], rows: [...queryResults.value[index].rows, ...r.rows] }
      } else { state.hasMore = false }
    } catch (e: unknown) {
      message.error(getErrorMessage(e)); state.hasMore = false
    } finally { state.loading = false }
  } else { state.hasMore = false; state.loading = false }
}

// ── 结果上下文菜单 & 剪贴板 ──
interface ResultClipboardSelection { row: Record<string, any>; rowIndex: number; field: string; title: string }
const gridRefs = reactive<Record<number, any>>({})
function setGridRef(el: any, index: number) { if (el) gridRefs[index] = el; else delete gridRefs[index] }
const resultContextMenuVisible = ref(false)
const resultContextMenuX = ref(0)
const resultContextMenuY = ref(0)
const resultContextIndex = ref(-1)
const resultClipboardSelections = reactive<Record<number, ResultClipboardSelection>>({})
const activeResultIndex = computed(() => { const m = /^result-(\d+)$/.exec(resultTabKey.value); return m ? Number(m[1]) : -1 })
const hasResultTabsOnLeft = computed(() => resultContextIndex.value > 0)
const hasResultTabsOnRight = computed(() => resultContextIndex.value >= 0 && resultContextIndex.value < queryResults.value.length - 1)
function hideResultContextMenu() { resultContextMenuVisible.value = false; resultContextIndex.value = -1 }
function handleResultTabContextMenu(event: MouseEvent, index: number) {
  resultContextIndex.value = index; resultContextMenuX.value = event.clientX; resultContextMenuY.value = event.clientY; resultContextMenuVisible.value = true
}
function handleResultMenuClick({ key }: { key: string | number }) {
  const a = String(key); const idx = resultContextIndex.value
  if (a === 'close-current') closeResultAt(idx)
  else if (a === 'close-left') closeResultTabsLeftOf(idx)
  else if (a === 'close-right') closeResultTabsRightOf(idx)
  hideResultContextMenu()
}
function handleResultCellClick({ row, column, index }: { row: Record<string, any>; column: any; index: number }) {
  if (!column?.field || column.type === 'seq' || column.type === 'checkbox') return
  resultClipboardSelections[index] = { row, rowIndex: Number(row.__rowIndex ?? -1), field: String(column.field), title: String(column.title || column.field) }
}
function getResultClipboardSelection(index: number) { return resultClipboardSelections[index] || null }
function hasResultClipboardSelection(index: number) { return Boolean(getResultClipboardSelection(index)) }

function formatClipboardScalar(value: unknown) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  try { return JSON.stringify(value) } catch { return String(value) }
}
function formatClipboardTsvValue(value: unknown) { const t = formatClipboardScalar(value); return /[\t\r\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
function buildClipboardRowText(result: QueryResult, row: Record<string, any>) { return result.columns.map(c => formatClipboardTsvValue(row[c])).join('\t') }
function buildClipboardResultText(result: QueryResult) {
  if (result.columns.length === 0) return ''
  return [result.columns.map(c => formatClipboardTsvValue(c)).join('\t'), ...result.rows.map(r => buildClipboardRowText(result, r as Record<string, any>))].join('\n')
}
async function copyTextToClipboard(text: string, successMsg: string) { await writeClipboardText(text); message.success(successMsg) }

async function copyResultCell(index: number) {
  const sel = getResultClipboardSelection(index)
  if (!sel) { message.warning(t('editor.copy_cell_select_first')); return }
  await copyTextToClipboard(formatClipboardScalar(sel.row[sel.field]), t('editor.copy_cell_success'))
}
async function copyResultRow(index: number) {
  const sel = getResultClipboardSelection(index); const result = queryResults.value[index]
  if (!sel || !result) { message.warning(t('editor.copy_row_select_first')); return }
  await copyTextToClipboard(buildClipboardRowText(result, sel.row), t('editor.copy_row_success'))
}
async function copyResultSet(index: number) {
  const result = queryResults.value[index]
  if (!result || result.columns.length === 0) { message.warning(t('editor.copy_result_empty')); return }
  await copyTextToClipboard(buildClipboardResultText(result), t('editor.copy_result_success', { n: result.rows.length }))
}

// ── 编辑器剪贴板 ──
function getEditorSelections() { if (!editor) return []; return editor.getSelections() || (editor.getSelection() ? [editor.getSelection()!] : []) }
function getEditorClipboardEntries() {
  const model = editor?.getModel(); if (!editor || !model) return []
  return getEditorSelections().map((sel: any) => {
    if (!sel.isEmpty()) return { text: model.getValueInRange(sel), deleteRange: sel }
    const ln = sel.positionLineNumber; const mc = model.getLineMaxColumn(ln)
    if (!monacoInstance) return { text: model.getLineContent(ln), deleteRange: sel }
    if (ln !== model.getLineCount()) return { text: `${model.getLineContent(ln)}${model.getEOL()}`, deleteRange: new monacoInstance.Range(ln, 1, ln + 1, 1) }
    if (ln > 1) return { text: model.getLineContent(ln), deleteRange: new monacoInstance.Range(ln - 1, model.getLineMaxColumn(ln - 1), ln, mc) }
    return { text: model.getLineContent(ln), deleteRange: new monacoInstance.Range(ln, 1, ln, mc) }
  })
}
async function copyEditorSelectionToSystemClipboard() { const e = getEditorClipboardEntries(); if (e.length) await writeClipboardText(e.map((en: any) => en.text).join('')) }
async function cutEditorSelectionToSystemClipboard() {
  if (!editor) return; const e = getEditorClipboardEntries(); if (!e.length) return
  await writeClipboardText(e.map((en: any) => en.text).join(''))
  editor.executeEdits('system-clipboard-cut', e.map((en: any) => ({ range: en.deleteRange, text: '' }))); editor.focus()
}
async function pasteFromSystemClipboard() {
  if (!editor) return; const text = await readClipboardText(); const sels = getEditorSelections(); if (!sels.length) return
  editor.executeEdits('system-clipboard-paste', sels.map((r: any) => ({ range: r, text }))); editor.focus()
}
async function handleSystemClipboardAction(action: 'copy' | 'cut' | 'paste') {
  if (!editor) return
  try { focusEditor(); await new Promise<void>(r => requestAnimationFrame(() => r())); if (action === 'copy') await copyEditorSelectionToSystemClipboard(); else if (action === 'cut') await cutEditorSelectionToSystemClipboard(); else await pasteFromSystemClipboard() }
  catch (e: unknown) { message.error(getErrorMessage(e)) }
}

// ── 导出 ──
function sanitizeFileName(name: string) { return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || t('editor.export_default_name') }
function inferInsertTargetTable(index: number) {
  const sql = queryResultStates[index]?.sql?.trim() || ''
  const m = sql.replace(/\s+/g, ' ').match(/\bFROM\s+((?:["`\[]?[\w$]+["`\]]?\.)?["`\[]?[\w$]+["`\]]?)/i)
  const target = m?.[1]?.split('.').pop()
  return target ? target.replace(/^["'`[]+|["'`\]]+$/g, '') : `query_result_${index + 1}`
}
function inferExportBaseName(index: number, format: string) {
  return sanitizeFileName(`${selectedDatabase.value || currentDatabaseLabel.value || t('editor.export_default_name')}_${inferInsertTargetTable(index)}.${format}`)
}
async function handleExportResult(index: number, format: string) {
  const result = queryResults.value[index]; if (!result || result.columns.length === 0) return
  try {
    const path = await save({ defaultPath: inferExportBaseName(index, format), filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (!path) return
    if (format === 'csv') await exportApi.toCsv(result, path)
    else if (format === 'json') await exportApi.toJson(result, path)
    else if (format === 'sql') await exportApi.toSql(result, inferInsertTargetTable(index), path)
    message.success(t('data.export_success', { path }))
  } catch (e: unknown) { message.error(getErrorMessage(e)) }
}
function handleExportMenuClick(index: number, { key }: { key: string | number }) { return handleExportResult(index, String(key)) }
async function handleCopyMenuClick(index: number, { key }: { key: string | number }) {
  try { const a = String(key); if (a === 'cell') await copyResultCell(index); else if (a === 'row') await copyResultRow(index); else if (a === 'result') await copyResultSet(index) }
  catch (e: unknown) { message.error(getErrorMessage(e)) }
}

// ── 分隔条拖拽 ──
function startResultResize(e: MouseEvent) {
  e.preventDefault()
  isSplitResizing.value = true; const sy = e.clientY; const sh = resultPanelHeight.value
  const move = (ev: MouseEvent) => { if (!isSplitResizing.value) return; resultPanelHeight.value = Math.min(getMaxResultPanelHeight(), Math.max(RESULT_PANEL_MIN_HEIGHT, sh - (ev.clientY - sy))) }
  const stop = () => { isSplitResizing.value = false; setStorageItem(RESULT_PANEL_HEIGHT_KEY, resultPanelHeight.value); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); document.body.style.cursor = ''; document.body.style.userSelect = '' }
  document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop)
}

function startMessagesResize(e: MouseEvent) {
  e.preventDefault()
  isMessagesResizing.value = true; const sy = e.clientY; const sh = messagesPanelHeight.value
  const maxH = Math.max(MESSAGES_PANEL_MIN_HEIGHT, Math.floor((sqlEditorRoot.value?.clientHeight || 600) * 0.7))
  const move = (ev: MouseEvent) => { if (!isMessagesResizing.value) return; messagesPanelHeight.value = Math.min(maxH, Math.max(MESSAGES_PANEL_MIN_HEIGHT, sh - (ev.clientY - sy))) }
  const stop = () => { isMessagesResizing.value = false; setStorageItem(MESSAGES_PANEL_HEIGHT_KEY, messagesPanelHeight.value); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); document.body.style.cursor = ''; document.body.style.userSelect = '' }
  document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop)
}

// ── 编辑器操作 ──
function focusEditor() { if (!editor) return; editor.layout(); editor.focus() }
async function formatSql() { if (!editor) return; try { const f = await queryApi.beautifySql(sessionConnectionId.value, editor.getValue()); editor.setValue(f); message.success(t('editor.format_success')) } catch (e: unknown) { message.error(getErrorMessage(e)) } }
function clearEditor() { editor?.setValue(''); queryResults.value = []; resultTabKey.value = 'result-0'; errorTabs.value = []; resultTabCreatedAt.value = {}; dbMessages.value = []; Object.keys(queryResultStates).forEach(k => delete queryResultStates[Number(k)]); Object.keys(resultClipboardSelections).forEach(k => delete resultClipboardSelections[Number(k)]); hideResultContextMenu(); execution.hideSummary() }
function buildSuggestedFileName() {
  const base = currentDatabaseLabel.value && currentDatabaseLabel.value !== t('editor.default_database')
    ? currentDatabaseLabel.value
    : 'query'
  return `${base}.sql`.replace(/[\\/:*?"<>|]+/g, '_')
}

function handleQuerySaved() { message.success(t('common.save')) }

async function saveAsFile(): Promise<boolean> {
  if (!editor) return false

  const filePath = await save({
    defaultPath: currentFilePath.value || buildSuggestedFileName(),
    filters: [...SQL_FILE_FILTERS],
  })
  if (!filePath) return false

  try {
    const saved = await utilsApi.saveFileAs({ path: filePath, content: editor.getValue() })
    currentFilePath.value = saved.path
    isDirty.value = false
    emit('fileSaved', saved.path, saved.title)
    message.success(t('common.save'))
    return true
  } catch (err: unknown) {
    message.error(`${t('common.fail')}: ${getErrorMessage(err)}`)
    return false
  }
}

async function handleSave(isAuto = false): Promise<boolean> {
  if (!editor) return false

  const content = editor.getValue()
  if (!content.trim()) return false

  const targetPath = currentFilePath.value || props.filePath
  if (!targetPath) {
    if (!isAuto) {
      return saveAsFile()
    }
    return false
  }

  try {
    await utilsApi.writeFile(targetPath, content)
    currentFilePath.value = targetPath
    isDirty.value = false
    emit('fileSaved', targetPath, targetPath.split(/[\\/]/).pop() || buildSuggestedFileName())
    if (!isAuto) message.success(t('common.save'))
    return true
  } catch (err: unknown) {
    if (!isAuto) message.error(`${t('common.fail')}: ${getErrorMessage(err)}`)
    return false
  }
}
let autoSaveTimer: number | null = null
function triggerAutoSave() {
  isDirty.value = true
  if (!currentFilePath.value) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = window.setTimeout(() => { void handleSave(true) }, 2000)
}
async function refreshAutocomplete() { const bid = props.connectionId || connectionStore.activeConnectionId; if (!bid || !autocompleteManager) return; autocompleteManager.clearCache(bid); updateAutocompleteContext(); message.success(t('editor.refresh_cache_success')) }

// ── 历史记录（composable） ──
const {
  searchText: historySearch,
  filteredHistory: filteredHistory,
  load: loadHistory,
  add: saveToHistory,
  getPreview: getHistoryPreview,
  formatMeta: formatHistoryMeta,
} = useSqlHistory()

const showHistory = ref(false)
const showSaveDialog = ref(false)
const showSnippets = ref(false)

function openHistory() { historySearch.value = ''; showHistory.value = true }
function openSnippets() { showSnippets.value = true }
function handleSnippetInsert(sql: string) {
  if (!editor) return
  const selection = editor.getSelection()
  if (selection && !selection.isEmpty()) {
    editor.executeEdits('snippet-insert', [{ range: selection, text: sql }])
  } else {
    const position = editor.getPosition()
    if (position) {
      if (!monacoInstance) return
      editor.executeEdits('snippet-insert', [{ range: new monacoInstance.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: sql }])
    } else {
      editor.setValue(sql)
    }
  }
  editor.focus()
}
function useHistorySql(sql: string) { editor?.setValue(sql); showHistory.value = false }

const historyEmptyDescription = computed(() =>
  historySearch.value ? t('editor.history_no_match') : t('editor.history_empty')
)

// ── 当前语句检测 ──
interface StatementRange {
  sql: string
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

const STATEMENT_KEYWORDS = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|WITH|EXPLAIN|GRANT|REVOKE|TRUNCATE|BEGIN|COMMIT|ROLLBACK|DECLARE|DO|CALL|COPY|LOCK|UNLOCK|REINDEX|REFRESH|VACUUM|ANALYZE|CLUSTER|COMMENT|LISTEN|NOTIFY|MOVE|FETCH|CLOSE|PREPARE|EXECUTE|DEALLOCATE|DISCARD|REASSIGN|CHECKPOINT)\b/i

function findCurrentStatement(model: any, position: any): StatementRange | null {
  const fullText = model.getValue()
  if (!fullText.trim()) return null
  
  const cursorOffset = model.getOffsetAt(position)
  
  // 按分号分割 (处理注释、字符串、$$ 内的分号)
  const segments: Array<{ sql: string; startOffset: number; endOffset: number }> = []
  let current = ''
  let segStart = 0
  let inString = false
  let stringChar = ''
  let inLineComment = false
  let inBlockComment = false
  let dollarTag = ''
  
  for (let i = 0; i < fullText.length; i++) {
    const ch = fullText[i]
    const next = fullText[i + 1] || ''
    
    // 行注释
    if (!inString && !inBlockComment && !dollarTag && ch === '-' && next === '-') {
      inLineComment = true
      current += ch + next
      i++
      continue
    }
    if (inLineComment && (ch === '\n' || ch === '\r')) {
      inLineComment = false
      current += ch
      continue
    }
    if (inLineComment) { current += ch; continue }
    
    // 块注释
    if (!inString && !inLineComment && !dollarTag && ch === '/' && next === '*') {
      inBlockComment = true
      current += ch + next
      i++
      continue
    }
    if (inBlockComment && ch === '*' && next === '/') {
      inBlockComment = false
      current += ch + next
      i++
      continue
    }
    if (inBlockComment) { current += ch; continue }
    
    // $$ 引用 (PostgreSQL)
    if (!inString && !inLineComment && !inBlockComment) {
      if (dollarTag) {
        // 在 $$ 内部，找结束标记
        current += ch
        if (fullText.substring(i - dollarTag.length + 1, i + 1) === dollarTag) {
          dollarTag = ''
        }
        continue
      }
      // 检测 $$ 开始 (支持 $tag$ 格式)
      if (ch === '$') {
        const dollarMatch = fullText.substring(i).match(/^(\$[a-zA-Z_\x80-\xff]?[a-zA-Z0-9_\x80-\xff]*\$)/)
        if (dollarMatch) {
          dollarTag = dollarMatch[1]
          current += dollarTag
          i += dollarTag.length - 1
          continue
        }
      }
    }
    
    // 字符串
    if (!inLineComment && !inBlockComment && !dollarTag && (ch === "'" || ch === '"')) {
      if (!inString) {
        inString = true
        stringChar = ch
      } else if (ch === stringChar && (i === 0 || fullText[i - 1] !== '\\')) {
        inString = false
      }
    }
    
    // 分号分隔
    if (!inString && !inLineComment && !inBlockComment && !dollarTag && ch === ';') {
      current += ch
      segments.push({ sql: current, startOffset: segStart, endOffset: i + 1 })
      current = ''
      segStart = i + 1
      continue
    }
    
    if (current === '') segStart = i
    current += ch
  }
  
  // 最后一段
  if (current.trim()) {
    segments.push({ sql: current, startOffset: segStart, endOffset: fullText.length })
  }
  
  // 找光标所在段
  let targetSegment: { sql: string; startOffset: number; endOffset: number } | null = null
  for (const seg of segments) {
    if (cursorOffset >= seg.startOffset && cursorOffset <= seg.endOffset) {
      targetSegment = seg
      break
    }
  }
  
  // 如果只有一个段且没有分号，尝试按关键字分割
  if (segments.length === 1 && !fullText.includes(';')) {
    targetSegment = splitByKeywords(fullText, cursorOffset)
  }
  
  if (!targetSegment || !targetSegment.sql.trim()) return null
  
  // 计算去除首尾空白后的实际偏移
  const trimmedSql = targetSegment.sql.trim()
  const leadTrim = targetSegment.sql.length - targetSegment.sql.trimStart().length
  const trailTrim = targetSegment.sql.length - targetSegment.sql.trimEnd().length
  const adjStartOffset = targetSegment.startOffset + leadTrim
  const adjEndOffset = targetSegment.endOffset - trailTrim
  
  const startPos = model.getPositionAt(adjStartOffset)
  const endPos = model.getPositionAt(Math.min(adjEndOffset, fullText.length))
  
  return {
    sql: trimmedSql,
    startLine: startPos.lineNumber,
    startCol: startPos.column,
    endLine: endPos.lineNumber,
    endCol: endPos.column,
  }
}

function splitByKeywords(fullText: string, cursorOffset: number): { sql: string; startOffset: number; endOffset: number } | null {
  const lines = fullText.split('\n')
  const keywordLines: number[] = []
  
  for (let i = 0; i < lines.length; i++) {
    if (STATEMENT_KEYWORDS.test(lines[i].trimStart())) {
      keywordLines.push(i)
    }
  }
  
  if (keywordLines.length === 0) return null
  
  // 计算光标所在行
  let cursorLine = 0
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length + 1 // +1 for newline
    if (cursorOffset >= offset && cursorOffset < offset + lineLen) {
      cursorLine = i
      break
    }
    offset += lineLen
  }
  
  // 找光标所在的语句边界
  let startLine = keywordLines[0]
  let endLine = lines.length
  
  for (let i = 0; i < keywordLines.length; i++) {
    if (keywordLines[i] <= cursorLine) {
      startLine = keywordLines[i]
    }
    if (keywordLines[i] > cursorLine) {
      endLine = keywordLines[i]
      break
    }
  }
  
  // 计算偏移
  let startOffset = 0
  for (let i = 0; i < startLine; i++) startOffset += lines[i].length + 1
  
  let endOffset = 0
  for (let i = 0; i < endLine; i++) endOffset += lines[i].length + 1
  endOffset = Math.min(endOffset, fullText.length)
  
  const sql = fullText.substring(startOffset, endOffset).trim()
  if (!sql) return null
  
  return { sql, startOffset, endOffset }
}

// ── 当前语句高亮 ──
let currentStatementDecoration: any = null

function updateCurrentStatementHighlight() {
  if (!editor || !currentStatementDecoration) return
  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) {
    currentStatementDecoration.clear()
    return
  }
  const stmt = findCurrentStatement(model, position)
  if (!stmt || stmt.sql === model.getValue().trim()) {
    currentStatementDecoration.clear()
    return
  }
  currentStatementDecoration.set([{
    range: monacoInstance ? new monacoInstance.Range(stmt.startLine, stmt.startCol, stmt.endLine, stmt.endCol) : null,
    options: {
      isWholeLine: false,
      className: 'current-statement-highlight',
    },
  }])
}

// ── 执行管线（composable） ──
const execution = useSqlExecution({
  getSql: () => editor?.getValue() || '',
  getSelectionSql: () => {
    const sel = editor?.getSelection(); const model = editor?.getModel()
    if (sel && model && !sel.isEmpty()) return model.getValueInRange(sel).trim() || null
    return null
  },
  getCurrentStatementSql: () => {
    const model = editor?.getModel(); const pos = editor?.getPosition()
    if (!model || !pos) return null
    const stmt = findCurrentStatement(model, pos)
    return stmt?.sql || null
  },
  isReadOnly: () => Boolean(currentConnection.value?.read_only),
  onAppendResults: (results, states) => appendQueryResults(results, states),
  onSwitchToTab: (tabKey: string) => { resultTabKey.value = tabKey },
  onAddErrorTab: addErrorTab,
  onRevealPanel: revealResultPanel,
  onDbMessage: addDbMessage,
  onSaveHistory: (sql: string) => saveToHistory(sql, selectedDatabase.value),
  t: (key: string, options?: Record<string, unknown>) => t(key, options ?? {}) as string,
})

const {
  executing, executionState,
} = execution

const executionStatusLabel = computed(() => t(`editor.status.${executionState.value.status}`))

const executionElapsedLabel = computed(() => {
  const elapsed = executionState.value.elapsedMs || 0
  if (elapsed <= 0) return ''
  if (elapsed < 1000) return `${elapsed} ms`
  if (elapsed < 60_000) return `${(elapsed / 1000).toFixed(1)} s`
  const minutes = Math.floor(elapsed / 60_000)
  const seconds = Math.floor((elapsed % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
})

const hasAnyResultContent = computed(() =>
  queryResults.value.length > 0 || errorTabs.value.length > 0 || executing.value
)

// 模板级别的包装器（组合 composable 函数与连接上下文）
async function executeQuery() {
  const connId = sessionConnectionId.value
  if (!connId) return
  await execution.executeQuery(connId, selectedDatabase.value || null)
}
async function explainQuery() {
  const connId = sessionConnectionId.value
  if (!connId) return
  await execution.explainQuery(connId, selectedDatabase.value || null)
}
function stopExec() { execution.stopExecution(sessionConnectionId.value) }

// ── 工具栏分发 ──
function handleToolbarAction(method: string) {
  const actions: Record<string, () => unknown> = {
    executeQuery,
    explainQuery,
    stopExecution: stopExec,
    handleSave,
    saveAsFile,
    formatSql,
    clearEditor,
    openHistory,
    openSnippets,
    refreshAutocomplete,
    toggleResultPanel,
    toggleMessagesPanel,
  }
  actions[method]?.()
}
function handleToolbarDbChange(db: string) { void handleDatabaseChange(db) }

// ── 数据库上下文 ──
function updateAutocompleteContext() {
  const model = editor?.getModel(); const bid = props.connectionId || connectionStore.activeConnectionId
  if (model && bid && connectionStore.connections.length > 0 && autocompleteManager) {
    const conn = connectionStore.connections.find(c => c.id === bid)
    const fb = selectedDatabase.value || props.initialDatabase || conn?.database || (conn?.db_type === 'sqlite' ? 'main' : null)
    autocompleteManager.bindModel(model, { connectionId: bid, database: fb || null, dbType: conn?.db_type || null })
  }
}
async function loadAvailableDatabases() {
  const bid = props.connectionId || connectionStore.activeConnectionId
  if (!bid) return

  try {
    availableDatabases.value = await metadataApi.getDatabases(bid)
    emit('databasesLoaded', availableDatabases.value)
  } catch {
    availableDatabases.value = []
  }
}
function handleDatabaseChange(dbName: string) {
  selectedDatabase.value = dbName; updateAutocompleteContext(); emit('databaseChange', dbName)
  const notice = t('editor.database_switched', { database: currentDatabaseLabel.value })
  message.info(notice)
}
async function setSelectedDatabase(db: string) { if (availableDatabases.value.length === 0) await loadAvailableDatabases(); selectedDatabase.value = db; updateAutocompleteContext(); emit('databaseChange', db) }

// ── 生命周期 ──
onMounted(async () => {
  if (!editorContainer.value) return
  monacoInstance = await loadMonaco()
  autocompleteManager = await getSqlAutocompleteManager()
  resultPanelHeight.value = Math.min(getMaxResultPanelHeight(), Math.max(RESULT_PANEL_MIN_HEIGHT, resultPanelHeight.value))
  editor = monacoInstance.editor.create(editorContainer.value, {
    value: props.initialValue || '', language: 'sql',
    theme: appStore.theme === 'dark' ? 'vs-dark' : 'vs', automaticLayout: true,
    readOnly: false, domReadOnly: false, fontSize: appStore.editorSettings.fontSize,
    fontFamily: appStore.editorSettings.fontFamily, minimap: { enabled: appStore.editorSettings.minimap },
    scrollBeyondLastLine: false, lineNumbers: appStore.editorSettings.lineNumbers, inlayHints: { enabled: 'on' },
    renderLineHighlight: 'all', quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true, acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on', tabCompletion: 'on', emptySelectionClipboard: false, selectionClipboard: false,
  })
  updateAutocompleteContext()
  editor.onDidChangeModelContent(() => { emit('contentChange', editor?.getValue() || ''); triggerAutoSave() })
    editor.onKeyUp((e: any) => { if (monacoInstance && (e.keyCode === monacoInstance.KeyCode.Space || e.keyCode === monacoInstance.KeyCode.Period)) editor?.trigger('keyboard', 'editor.action.triggerSuggest', {}) })
  editor.addCommand(monacoInstance.KeyCode.F5, () => executeQuery())
  editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => handleSave())
  currentStatementDecoration = editor.createDecorationsCollection()
  editor.onDidChangeCursorPosition(() => updateCurrentStatementHighlight())
  editor.onDidChangeModelContent(() => updateCurrentStatementHighlight())
  updateCurrentStatementHighlight()
  loadHistory()
  loadAvailableDatabases()
  loadSearchPath()
  requestAnimationFrame(() => focusEditor())
})
onActivated(() => { requestAnimationFrame(() => focusEditor()); loadAvailableDatabases(); loadSearchPath() })
onUnmounted(() => { if (autoSaveTimer) clearTimeout(autoSaveTimer); execution.hideSummary(); hideResultContextMenu(); const m = editor?.getModel(); if (m && autocompleteManager) autocompleteManager.unbindModel(m); editor?.dispose() })

// ── 设置变更监听 ──
watch(() => [appStore.theme, appStore.editorSettings.fontSize, appStore.editorSettings.minimap, appStore.editorSettings.lineNumbers, appStore.editorSettings.fontFamily], ([theme]) => {
  if (!editor) return
  monacoInstance?.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs')
  editor.updateOptions({ readOnly: false, domReadOnly: false, fontSize: appStore.editorSettings.fontSize, fontFamily: appStore.editorSettings.fontFamily, minimap: { enabled: appStore.editorSettings.minimap }, lineNumbers: appStore.editorSettings.lineNumbers })
}, { immediate: true })
watch(() => props.connectionId || connectionStore.activeConnectionId, () => { updateAutocompleteContext(); loadAvailableDatabases(); loadSearchPath() })
watch(() => {
  const bid = props.connectionId || connectionStore.activeConnectionId
  return bid ? connectionStore.getConnectionStatus(bid) : null
}, (status) => {
  if (status === 'connected') loadAvailableDatabases()
})
watch(resultPanelVisible, v => setStorageItem(RESULT_PANEL_VISIBLE_KEY, v))
watch(resultPanelHeight, v => setStorageItem(RESULT_PANEL_HEIGHT_KEY, v))
watch(() => execution.executionState.value, (s) => emit('executionStateChange', { ...s }), { deep: true })

defineExpose({ setSelectedDatabase, executing, executionState, executeQuery, explainQuery, stopExecution: stopExec, handleDatabaseChange, focusEditor, handleSystemClipboardAction, formatSql, clearEditor, openHistory, openSnippets, refreshAutocomplete, handleSave, saveAsFile })
</script>

<style scoped>
.sql-editor-container { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: #ffffff; }
.dark-mode .sql-editor-container { background: #1f1f1f; }
.editor-workbench { display: flex; flex: 1; min-height: 120px; overflow: hidden; background: #ffffff; }
.dark-mode .editor-workbench { background: #1f1f1f; }
.editor-section { flex: 1; min-width: 0; min-height: 100px; overflow: hidden; position: relative; background: inherit; }
.monaco-container { height: 100%; width: 100%; background: transparent; }
.monaco-container :deep(.current-statement-highlight) {
  background: rgba(22, 119, 255, 0.04);
  border-left: 2px solid rgba(22, 119, 255, 0.25);
}
.dark-mode .monaco-container :deep(.current-statement-highlight) {
  background: rgba(22, 119, 255, 0.08);
  border-left-color: rgba(22, 119, 255, 0.35);
}
.result-dock { flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; border-top: 1px solid #e5e7eb; background: rgba(255,255,255,0.96); box-shadow: 0 -12px 24px rgba(15,23,42,0.06); transition: height 0.18s ease; }
.dark-mode .result-dock { background: rgba(24,24,24,0.98); border-top-color: #303030; box-shadow: 0 -12px 24px rgba(0,0,0,0.24); }
.result-dock.collapsed { border-top-color: transparent; box-shadow: none; }
.split-resizer { height: 1px; background: #e5e7eb; cursor: row-resize; display: block; transition: background-color 0.2s; flex-shrink: 0; position: relative; overflow: visible; }
.split-resizer::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; bottom: -4px; cursor: row-resize; }
.split-resizer:hover { background: #1677ff; }
.dark-mode .split-resizer { background: #303030; }
.resizer-handle { display: none; }
/* ── 无数据结果 (DDL 等) ── */
.result-empty-ddl { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px; }
.ddl-success-icon { font-size: 28px; color: #52c41a; }
.ddl-success-text { font-size: 14px; font-weight: 600; color: #262626; }
.dark-mode .ddl-success-text { color: #f5f5f5; }
.ddl-elapsed { font-size: 12px; color: #8c8c8c; font-variant-numeric: tabular-nums; }
.dark-mode .ddl-elapsed { color: #a6a6a6; }
.ddl-affected { font-size: 12px; color: #595959; }
.dark-mode .ddl-affected { color: #bfbfbf; }

/* ── 执行进度 Tab 视图 ── */
.execution-progress-tab { flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; }
.progress-tab-center { display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 360px; text-align: center; }
.progress-tab-icon { font-size: 12px; color: #1677ff; }
.progress-status { font-size: 14px; font-weight: 600; color: #262626; }
.dark-mode .progress-status { color: #f5f5f5; }
.progress-summary-text { font-size: 12px; color: #8c8c8c; line-height: 1.5; }
.dark-mode .progress-summary-text { color: #a6a6a6; }
.progress-stats { display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: center; }
.stat-item { display: flex; gap: 6px; align-items: baseline; }
.stat-label { font-size: 11px; color: #8c8c8c; }
.dark-mode .stat-label { color: #a6a6a6; }
.stat-value { font-size: 13px; font-weight: 600; color: #262626; font-variant-numeric: tabular-nums; }
.dark-mode .stat-value { color: #f5f5f5; }
.stat-item.timer .stat-value { color: #1677ff; }
.progress-stop-btn { margin-top: 4px; }

/* ── 错误 Tab 视图 ── */
.error-tab-icon { font-size: 11px; color: #ff4d4f; flex-shrink: 0; }
.execution-error-tab { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; }
.execution-error-tab .error-center { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 520px; text-align: center; }
.execution-error-tab .error-icon { font-size: 36px; color: #ff4d4f; }
.execution-error-tab .error-title { font-size: 15px; font-weight: 600; color: #262626; }
.dark-mode .execution-error-tab .error-title { color: #f5f5f5; }
.execution-error-tab .error-summary { font-size: 12px; color: #8c8c8c; line-height: 1.5; }
.dark-mode .execution-error-tab .error-summary { color: #a6a6a6; }
.execution-error-tab .error-detail { font-size: 12px; color: #ff4d4f; line-height: 1.6; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; font-family: monospace; background: rgba(255,77,79,0.04); padding: 8px 12px; border-radius: 4px; border: 1px solid rgba(255,77,79,0.12); }
.dark-mode .execution-error-tab .error-detail { background: rgba(255,77,79,0.06); border-color: rgba(255,77,79,0.18); }
.execution-error-tab .error-time { margin-top: 4px; font-size: 11px; color: #8c8c8c; font-variant-numeric: tabular-nums; }
.dark-mode .execution-error-tab .error-time { color: #a6a6a6; }

/* ── 面板间分隔条 & 消息面板 ── */
.inter-panel-resizer { height: 6px; background: transparent; cursor: row-resize; flex-shrink: 0; position: relative; }
.inter-panel-resizer::before { content: ''; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px; cursor: row-resize; }
.inter-panel-resizer::after { content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 32px; height: 3px; border-radius: 2px; background: #d9d9d9; transition: background-color 0.2s; }
.inter-panel-resizer:hover::after { background: #1677ff; }
.dark-mode .inter-panel-resizer::after { background: #434343; }
.dark-mode .inter-panel-resizer:hover::after { background: #1677ff; }
.messages-dock { flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; border-top: 1px solid #e5e7eb; background: rgba(255,255,255,0.96); transition: height 0.18s ease; }
.dark-mode .messages-dock { background: rgba(24,24,24,0.98); border-top-color: #303030; }
.messages-dock.collapsed { border-top-color: transparent; }
.messages-dock .split-resizer { height: 5px; background: transparent; cursor: row-resize; display: block; flex-shrink: 0; position: relative; }
.messages-dock .split-resizer::before { content: ''; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px; cursor: row-resize; }
.messages-dock .split-resizer::after { content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 32px; height: 3px; border-radius: 2px; background: #d9d9d9; transition: background-color 0.2s; }
.messages-dock .split-resizer:hover::after { background: #1677ff; }
.dark-mode .messages-dock .split-resizer::after { background: #434343; }
.dark-mode .messages-dock .split-resizer:hover::after { background: #1677ff; }
.messages-panel-header { display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 0 10px; border-bottom: 1px solid #f0f0f0; background: rgba(248,250,252,0.92); flex-shrink: 0; }
.dark-mode .messages-panel-header { border-bottom-color: #2c2c2c; background: rgba(24,24,24,0.96); }
.messages-panel-title { font-size: 12px; font-weight: 600; color: #595959; }
.dark-mode .messages-panel-title { color: #d9d9d9; }
/* 复用 .messages-content 和 .message-item 样式 */
.result-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.result-tabs :deep(.ant-tabs-content) { flex: 1; overflow: hidden; }
.result-tabs :deep(.ant-tabs-tabpane) { height: 100%; display: flex; flex-direction: column; }
.result-content { flex: 1; display: flex; flex-direction: column; padding: 12px; overflow: hidden; position: relative; }
.result-info { margin-bottom: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.affected-text { font-size: 12px; color: #8c8c8c; }
.table-wrapper { flex: 1; min-height: 0; overflow: hidden; }
.messages-content { flex: 1; padding: 6px 8px; overflow-y: auto; font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace; font-size: 12px; line-height: 1.6; }
.message-line { display: flex; gap: 8px; padding: 1px 0; white-space: pre-wrap; word-break: break-all; }
.message-time { flex-shrink: 0; color: #8c8c8c; font-variant-numeric: tabular-nums; }
.dark-mode .message-time { color: #a6a6a6; }
.message-body { color: #262626; }
.dark-mode .message-body { color: #e0e0e0; }
.history-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.history-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.history-count { flex-shrink: 0; min-width: 24px; font-size: 12px; color: #8c8c8c; text-align: right; }
.history-list { flex: 1; min-height: 0; overflow-y: auto; }
.history-item { cursor: pointer; transition: background 0.2s; }
.history-item:hover { background: #f5f5f5; }
.dark-mode .history-item:hover { background: #262626; }
.history-entry { display: flex; flex-direction: column; gap: 4px; width: 100%; min-width: 0; }
.history-sql { display: block; font-family: monospace; background: transparent; padding: 0; white-space: pre-wrap; word-break: break-word; color: inherit; }
.history-meta { font-size: 12px; color: #8c8c8c; line-height: 1.4; }
.dark-mode .history-meta { color: #a6a6a6; }
.result-tab-label { display: inline-flex; align-items: center; gap: 6px; max-width: 180px; }
.result-tab-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-tab-close { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 999px; background: transparent; color: #8c8c8c; font-size: 12px; line-height: 1; cursor: pointer; flex-shrink: 0; transition: background-color 0.2s, color 0.2s; }
.result-tab-close:hover { background: rgba(0,0,0,0.08); color: #262626; }
.dark-mode .result-tab-close { color: #a6a6a6; }
.dark-mode .result-tab-close:hover { background: rgba(255,255,255,0.12); color: #f5f5f5; }
.result-context-menu-overlay { position: fixed; inset: 0; z-index: 9999; }
.result-context-menu {
  position: absolute;
  min-width: 140px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.10), 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  padding: 2px;
}
.dark-mode .result-context-menu {
  background: #252525;
  border-color: #383838;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
.result-context-menu :deep(.ant-menu) {
  background: transparent;
  border-inline-end: none !important;
  font-size: 12px;
}
.result-context-menu :deep(.ant-menu-item) {
  margin: 0 !important;
  padding: 0 8px !important;
  height: 28px !important;
  line-height: 28px !important;
  border-radius: 3px;
  color: #333;
}
.dark-mode .result-context-menu :deep(.ant-menu-item) { color: #ccc; }
.result-context-menu :deep(.ant-menu-item:hover) {
  background: rgba(0, 0, 0, 0.05) !important;
}
.dark-mode .result-context-menu :deep(.ant-menu-item:hover) {
  background: rgba(255, 255, 255, 0.07) !important;
}
.result-context-menu :deep(.ant-menu-item-disabled) {
  color: #bbb !important;
}
.dark-mode .result-context-menu :deep(.ant-menu-item-disabled) {
  color: #555 !important;
}
.result-cell-text, .messages-content, :deep(.table-wrapper .vxe-cell), :deep(.table-wrapper .vxe-cell--label), :deep(.table-wrapper .vxe-body--row .vxe-cell) { user-select: text !important; -webkit-user-select: text !important; }
.null-text { color: #bfbfbf; font-style: italic; }
:deep(.danger-confirm-content) { display: flex; flex-direction: column; gap: 12px; }
:deep(.danger-confirm-intro) { margin: 0; color: #595959; }
:deep(.danger-confirm-list) { margin: 0; padding-left: 18px; color: #262626; }
:deep(.danger-confirm-list li) { margin-bottom: 8px; line-height: 1.5; word-break: break-word; }
@media (max-width: 768px) {
  .result-info { align-items: flex-start; flex-direction: column; }
}
</style>
