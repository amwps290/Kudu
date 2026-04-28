<template>
  <div ref="sqlEditorRoot" class="sql-editor-container">
    <div class="editor-workbench">
      <SqlToolbar
        vertical
        :executing="executing"
        :selected-database="selectedDatabase"
        :databases="availableDatabases"
        :result-panel-visible="resultPanelVisible"
        @action="handleToolbarAction"
        @database-change="handleToolbarDbChange"
      />

      <div class="editor-section">
        <div ref="editorContainer" class="monaco-container"></div>
      </div>
    </div>

    <div class="result-dock" :class="{ collapsed: !resultPanelVisible }" :style="{ height: `${resultDockHeight}px` }">
      <div v-if="resultPanelVisible" class="split-resizer" @mousedown="startResize">
        <div class="resizer-handle"></div>
      </div>

      <div v-if="showExecutionSummary" class="result-dock-header">
        <a-tag :color="executionStatusColor" class="execution-summary-tag">
          {{ executionStatusLabel }}
        </a-tag>
        <span class="execution-summary-text">{{ executionState.summary }}</span>
        <span v-if="executionSummaryMeta" class="execution-summary-meta">{{ executionSummaryMeta }}</span>
      </div>

      <a-tabs v-if="resultPanelVisible" v-model:activeKey="resultTabKey" size="small" class="result-tabs">
        <a-tab-pane v-for="(result, index) in queryResults" :key="'result-' + index">
          <template #tab>
            <span class="result-tab-label" @contextmenu.prevent="handleResultTabContextMenu($event, index)">
              <span class="result-tab-title">
                {{ queryResults.length > 1 ? $t('editor.result_n', { n: index + 1 }) : $t('editor.result') }}
              </span>
              <button class="result-tab-close" type="button" :title="$t('common.close')" @click.stop="closeResultAt(index)">×</button>
            </span>
          </template>
          <div class="result-content">
            <div v-if="executing" class="executing-overlay">
              <a-spin :tip="$t('editor.executing')" />
              <a-button danger size="small" @click="stopExec" style="margin-top: 16px">{{ $t('editor.stop_exec') }}</a-button>
            </div>
            <div class="result-info">
              <a-space>
                <a-tag color="success">{{ $t('editor.loaded_rows', { n: result.rows.length }) }}</a-tag>
                <a-tag color="processing">{{ result.execution_time_ms }} ms</a-tag>
                <a-divider type="vertical" />
                <span class="affected-text" v-if="result.affected_rows > 0">{{ $t('editor.affected_rows', { n: result.affected_rows }) }}</span>
              </a-space>
              <a-space :size="8">
                <a-dropdown>
                  <template #overlay>
                    <a-menu @click="handleCopyMenuClick(index, $event)">
                      <a-menu-item key="cell" :disabled="!hasResultClipboardSelection(index)">{{ $t('editor.copy_cell') }}</a-menu-item>
                      <a-menu-item key="row" :disabled="!hasResultClipboardSelection(index)">{{ $t('editor.copy_row') }}</a-menu-item>
                      <a-menu-item key="result" :disabled="result.columns.length === 0">{{ $t('editor.copy_result_set') }}</a-menu-item>
                    </a-menu>
                  </template>
                  <a-button size="small" :icon="h(CopyOutlined)" :disabled="result.columns.length === 0">{{ $t('common.copy') }}</a-button>
                </a-dropdown>
                <a-dropdown>
                  <template #overlay>
                    <a-menu @click="handleExportMenuClick(index, $event)">
                      <a-menu-item key="csv">{{ $t('data.export_csv') }}</a-menu-item>
                      <a-menu-item key="json">{{ $t('data.export_json') }}</a-menu-item>
                      <a-menu-item key="sql">{{ $t('data.export_sql') }}</a-menu-item>
                    </a-menu>
                  </template>
                  <a-button size="small" :icon="h(ExportOutlined)" :disabled="result.columns.length === 0">{{ $t('editor.export_result') }}</a-button>
                </a-dropdown>
              </a-space>
            </div>
            <div class="table-wrapper">
              <vxe-grid
                :ref="(el: any) => setGridRef(el, index)"
                v-bind="getGridOptions(result, index)"
                @scroll="(params: any) => handleScroll({ ...params, index })"
                @cell-click="(params: any) => handleResultCellClick({ ...params, index })"
              >
                <template #cell_default="{ row, column }">
                  <span class="result-cell-text" :class="{ 'null-text': row[column.field] === null }">
                    {{ row[column.field] === null ? 'NULL' : row[column.field] }}
                  </span>
                </template>
              </vxe-grid>
            </div>
          </div>
        </a-tab-pane>

        <a-tab-pane v-if="queryResults.length === 0" key="empty" :tab="$t('editor.result')">
          <div class="result-content">
            <div v-if="executing" class="executing-overlay"><a-spin :tip="$t('editor.executing')" /></div>
            <a-empty :description="$t('editor.no_result')" />
          </div>
        </a-tab-pane>

        <a-tab-pane key="messages" :tab="$t('editor.messages')">
          <div class="messages-content">
            <div v-for="(msg, index) in messages" :key="index" :class="['message-item', msg.type]">
              <span class="message-time">{{ msg.time }}</span>
              <span class="message-text">{{ msg.text }}</span>
            </div>
            <a-empty v-if="messages.length === 0" :description="$t('editor.no_result')" />
          </div>
        </a-tab-pane>
      </a-tabs>
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
    <SqlSnippetsManager v-model:visible="showSnippets" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref, computed, onActivated, reactive, h } from 'vue'
import { useI18n } from 'vue-i18n'
import * as monaco from 'monaco-editor'
import { getSqlAutocompleteManager } from '@/services/sqlAutocomplete'
import { message } from 'ant-design-vue'
import { ExportOutlined, CopyOutlined } from '@ant-design/icons-vue'
import { save } from '@tauri-apps/plugin-dialog'
import { exportApi, queryApi, metadataApi, utilsApi } from '@/api'
import type { QueryResult } from '@/types/database'
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

// ── 基础设置 ──
const { t } = useI18n()
const props = defineProps<{ connectionId?: string; initialDatabase?: string; initialValue?: string; filePath?: string; tabId?: string }>()
const emit = defineEmits(['contentChange', 'fileSaved', 'databasesLoaded', 'databaseChange', 'executionStateChange'])
const connectionStore = useConnectionStore()
const appStore = useAppStore()
const autocompleteManager = getSqlAutocompleteManager()

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
let editor: monaco.editor.IStandaloneCodeEditor | null = null

// ── 数据库上下文 ──
const availableDatabases = ref<any[]>([])
const selectedDatabase = ref(props.initialDatabase || '')
const currentConnection = computed(() =>
  connectionStore.connections.find(c => c.id === (props.connectionId || connectionStore.activeConnectionId)) || null
)
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
const resultTabKey = ref('empty')
const messages = ref<{ type: string; text: string; time: string }[]>([])
const resultPanelVisible = ref(getStorageItem(RESULT_PANEL_VISIBLE_KEY, false))
const resultPanelHeight = ref(getStorageItem(RESULT_PANEL_HEIGHT_KEY, 260))
const isSplitResizing = ref(false)

const queryResultStates = reactive<Record<number, { pagination: { current: number; pageSize: number }; loading: boolean; hasMore: boolean; sql: string }>>({})

function addMessage(type: string, text: string) {
  messages.value.unshift({ type, text, time: new Date().toLocaleTimeString() })
}

function revealResultPanel() { resultPanelVisible.value = true }
function toggleResultPanel() { resultPanelVisible.value = !resultPanelVisible.value; setStorageItem(RESULT_PANEL_VISIBLE_KEY, resultPanelVisible.value) }

function appendQueryResults(results: QueryResult[], states: Array<{ pagination: { current: number; pageSize: number }; loading: boolean; hasMore: boolean; sql: string }>) {
  const startIndex = queryResults.value.length
  queryResults.value = [...queryResults.value, ...results]
  states.forEach((state, offset) => {
    queryResultStates[startIndex + offset] = { ...state }
  })
  return startIndex
}

function replaceResultTabs(keptSourceIndices: number[]) {
  const nextResults = keptSourceIndices.map(i => queryResults.value[i])
  const nextStates = keptSourceIndices.map(i => queryResultStates[i])
  const nextSelections = keptSourceIndices.map(i => resultClipboardSelections[i])
  const prevActive = activeResultIndex.value

  queryResults.value = nextResults
  Object.keys(queryResultStates).forEach(k => delete queryResultStates[Number(k)])
  Object.keys(resultClipboardSelections).forEach(k => delete resultClipboardSelections[Number(k)])
  nextStates.forEach((s, i) => { if (s) queryResultStates[i] = { ...s } })
  nextSelections.forEach((s, i) => { if (s) resultClipboardSelections[i] = s })

  if (prevActive < 0) {
    if (queryResults.value.length === 0 && resultTabKey.value !== 'messages') resultTabKey.value = 'empty'
    return
  }
  const preserved = keptSourceIndices.indexOf(prevActive)
  if (preserved >= 0) { resultTabKey.value = `result-${preserved}`; return }
  if (queryResults.value.length === 0) { resultTabKey.value = 'empty'; return }
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
  return h <= 0 ? 420 : Math.max(RESULT_PANEL_MIN_HEIGHT, h - 180)
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
      const results = await queryApi.executeQuery(sessionConnectionId.value, pagedSql, selectedDatabase.value || null)
      if (results.length > 0) {
        const r = results[0]
        state.hasMore = r.rows.length === state.pagination.pageSize
        queryResults.value[index] = { ...queryResults.value[index], rows: [...queryResults.value[index].rows, ...r.rows] }
      } else { state.hasMore = false }
    } catch (e: any) {
      message.error(getErrorMessage(e)); addMessage('error', getErrorMessage(e)); state.hasMore = false
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
  return getEditorSelections().map(sel => {
    if (!sel.isEmpty()) return { text: model.getValueInRange(sel), deleteRange: sel }
    const ln = sel.positionLineNumber; const mc = model.getLineMaxColumn(ln)
    if (ln !== model.getLineCount()) return { text: `${model.getLineContent(ln)}${model.getEOL()}`, deleteRange: new monaco.Range(ln, 1, ln + 1, 1) }
    if (ln > 1) return { text: model.getLineContent(ln), deleteRange: new monaco.Range(ln - 1, model.getLineMaxColumn(ln - 1), ln, mc) }
    return { text: model.getLineContent(ln), deleteRange: new monaco.Range(ln, 1, ln, mc) }
  })
}
async function copyEditorSelectionToSystemClipboard() { const e = getEditorClipboardEntries(); if (e.length) await writeClipboardText(e.map(en => en.text).join('')) }
async function cutEditorSelectionToSystemClipboard() {
  if (!editor) return; const e = getEditorClipboardEntries(); if (!e.length) return
  await writeClipboardText(e.map(en => en.text).join(''))
  editor.executeEdits('system-clipboard-cut', e.map(en => ({ range: en.deleteRange, text: '' }))); editor.focus()
}
async function pasteFromSystemClipboard() {
  if (!editor) return; const text = await readClipboardText(); const sels = getEditorSelections(); if (!sels.length) return
  editor.executeEdits('system-clipboard-paste', sels.map(r => ({ range: r, text }))); editor.focus()
}
async function handleSystemClipboardAction(action: 'copy' | 'cut' | 'paste') {
  if (!editor) return
  try { focusEditor(); await new Promise<void>(r => requestAnimationFrame(() => r())); if (action === 'copy') await copyEditorSelectionToSystemClipboard(); else if (action === 'cut') await cutEditorSelectionToSystemClipboard(); else await pasteFromSystemClipboard() }
  catch (e: any) { message.error(getErrorMessage(e)) }
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
  } catch (e: any) { message.error(getErrorMessage(e)); addMessage('error', getErrorMessage(e)) }
}
function handleExportMenuClick(index: number, { key }: { key: string | number }) { return handleExportResult(index, String(key)) }
async function handleCopyMenuClick(index: number, { key }: { key: string | number }) {
  try { const a = String(key); if (a === 'cell') await copyResultCell(index); else if (a === 'row') await copyResultRow(index); else if (a === 'result') await copyResultSet(index) }
  catch (e: any) { message.error(getErrorMessage(e)) }
}

// ── 分隔条拖拽 ──
function startResize(e: MouseEvent) {
  isSplitResizing.value = true; const sy = e.clientY; const sh = resultPanelHeight.value
  const move = (ev: MouseEvent) => { if (!isSplitResizing.value) return; resultPanelHeight.value = Math.min(getMaxResultPanelHeight(), Math.max(RESULT_PANEL_MIN_HEIGHT, sh - (ev.clientY - sy))) }
  const stop = () => { isSplitResizing.value = false; setStorageItem(RESULT_PANEL_HEIGHT_KEY, resultPanelHeight.value); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); document.body.style.cursor = '' }
  document.body.style.cursor = 'row-resize'; document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop)
}

// ── 编辑器操作 ──
function focusEditor() { if (!editor) return; editor.layout(); editor.focus() }
async function formatSql() { if (!editor) return; try { const f = await queryApi.beautifySql(sessionConnectionId.value, editor.getValue()); editor.setValue(f); message.success(t('editor.format_success')) } catch (e: any) { message.error(getErrorMessage(e)) } }
function clearEditor() { editor?.setValue(''); queryResults.value = []; resultTabKey.value = 'empty'; messages.value = []; Object.keys(queryResultStates).forEach(k => delete queryResultStates[Number(k)]); Object.keys(resultClipboardSelections).forEach(k => delete resultClipboardSelections[Number(k)]); hideResultContextMenu(); execution.hideSummary() }
function handleQuerySaved() { message.success(t('common.save')) }
async function handleSave(isAuto = false) { if (!editor || !props.filePath) return; const c = editor.getValue(); if (!c.trim()) return; try { await utilsApi.writeFile(props.filePath, c); if (!isAuto) message.success(t('common.save')) } catch (err: any) { if (!isAuto) message.error(`${t('common.fail')}: ${err}`) } }
let autoSaveTimer: any = null
function triggerAutoSave() { if (autoSaveTimer) clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(() => { handleSave(true) }, 2000) }
async function refreshAutocomplete() { const bid = props.connectionId || connectionStore.activeConnectionId; if (!bid) return; autocompleteManager.clearCache(bid); updateAutocompleteContext(); message.success(t('editor.refresh_cache_success')) }

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
function useHistorySql(sql: string) { editor?.setValue(sql); showHistory.value = false }

const historyEmptyDescription = computed(() =>
  historySearch.value ? t('editor.history_no_match') : t('editor.history_empty')
)

// ── 执行管线（composable） ──
const execution = useSqlExecution({
  getSql: () => editor?.getValue() || '',
  getSelectionSql: () => {
    const sel = editor?.getSelection(); const model = editor?.getModel()
    if (sel && model && !sel.isEmpty()) return model.getValueInRange(sel).trim() || null
    return null
  },
  isReadOnly: () => Boolean(currentConnection.value?.read_only),
  onAppendResults: (results, states) => appendQueryResults(results, states),
  onSwitchToResultTab: (tabKey: string) => { resultTabKey.value = tabKey },
  onRevealPanel: revealResultPanel,
  onAddMessage: addMessage,
  onSaveHistory: (sql: string) => saveToHistory(sql, selectedDatabase.value),
  t: (key: string, options?: Record<string, unknown>) => t(key, options ?? {}) as string,
})

const {
  executing, executionState, executionStatusColor, showExecutionSummary,
} = execution

const executionStatusLabel = computed(() => t(`editor.status.${executionState.value.status}`))

const executionSummaryMeta = computed(() => {
  const s = executionState.value; const p: string[] = []
  if (s.statementCount > 0) p.push(t('editor.statement_progress', { completed: s.completedStatements, total: s.statementCount }))
  if (s.resultSetCount > 0) p.push(`${s.resultSetCount} ${t('editor.messages_result_sets')}`)
  if (s.affectedRows > 0) p.push(t('editor.affected_rows_short', { n: s.affectedRows }))
  return p.join(' · ')
})

// 模板级别的包装器（组合 composable 函数与连接上下文）
async function executeQuery() {
  const connId = sessionConnectionId.value
  if (!connId) return
  addMessage('info', t('editor.exec_context', { database: currentDatabaseLabel.value }))
  await execution.executeQuery(connId, selectedDatabase.value || null)
}
async function explainQuery() {
  const connId = sessionConnectionId.value
  if (!connId) return
  addMessage('info', t('editor.exec_context', { database: currentDatabaseLabel.value }))
  await execution.explainQuery(connId, selectedDatabase.value || null)
}
function stopExec() { execution.stopExecution(sessionConnectionId.value) }

// ── 工具栏分发 ──
function handleToolbarAction(method: string) {
  const actions: Record<string, () => void | Promise<void>> = {
    executeQuery, explainQuery, stopExecution: stopExec, handleSave, formatSql,
    clearEditor, openHistory, openSnippets, refreshAutocomplete, toggleResultPanel,
  }
  actions[method]?.()
}
function handleToolbarDbChange(db: string) { void handleDatabaseChange(db) }

// ── 数据库上下文 ──
function updateAutocompleteContext() {
  const model = editor?.getModel(); const bid = props.connectionId || connectionStore.activeConnectionId
  if (model && bid && connectionStore.connections.length > 0) {
    const conn = connectionStore.connections.find(c => c.id === bid)
    const fb = selectedDatabase.value || props.initialDatabase || conn?.database || (conn?.db_type === 'sqlite' ? 'main' : null)
    autocompleteManager.bindModel(model, { connectionId: bid, database: fb || null, dbType: conn?.db_type || null })
  }
}
async function loadAvailableDatabases() { const bid = props.connectionId || connectionStore.activeConnectionId; if (!bid) return; try { availableDatabases.value = await metadataApi.getDatabases(bid); emit('databasesLoaded', availableDatabases.value) } catch (e) { console.error(e) } }
function handleDatabaseChange(dbName: string) {
  selectedDatabase.value = dbName; updateAutocompleteContext(); emit('databaseChange', dbName)
  const notice = t('editor.database_switched', { database: currentDatabaseLabel.value })
  addMessage('info', notice); message.info(notice)
}
async function setSelectedDatabase(db: string) { if (availableDatabases.value.length === 0) await loadAvailableDatabases(); selectedDatabase.value = db; updateAutocompleteContext(); emit('databaseChange', db) }

// ── 生命周期 ──
onMounted(() => {
  if (!editorContainer.value) return
  resultPanelHeight.value = Math.min(getMaxResultPanelHeight(), Math.max(RESULT_PANEL_MIN_HEIGHT, resultPanelHeight.value))
  editor = monaco.editor.create(editorContainer.value, {
    value: props.initialValue || t('editor.placeholder'), language: 'sql',
    theme: appStore.theme === 'dark' ? 'vs-dark' : 'vs', automaticLayout: true,
    readOnly: false, domReadOnly: false, fontSize: appStore.editorSettings.fontSize,
    fontFamily: appStore.editorSettings.fontFamily, minimap: { enabled: appStore.editorSettings.minimap },
    scrollBeyondLastLine: false, lineNumbers: appStore.editorSettings.lineNumbers,
    renderLineHighlight: 'all', quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true, acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on', tabCompletion: 'on', emptySelectionClipboard: false, selectionClipboard: false,
  })
  updateAutocompleteContext()
  editor.onDidChangeModelContent(() => { emit('contentChange', editor?.getValue() || ''); triggerAutoSave() })
  editor.onKeyUp(e => { if (e.keyCode === monaco.KeyCode.Space || e.keyCode === monaco.KeyCode.Period) editor?.trigger('keyboard', 'editor.action.triggerSuggest', {}) })
  editor.addCommand(monaco.KeyCode.F5, () => executeQuery())
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handleSave())
  loadHistory()
  loadAvailableDatabases()
  requestAnimationFrame(() => focusEditor())
})
onActivated(() => { requestAnimationFrame(() => focusEditor()) })
onUnmounted(() => { execution.hideSummary(); hideResultContextMenu(); const m = editor?.getModel(); if (m) autocompleteManager.unbindModel(m); editor?.dispose() })

// ── 设置变更监听 ──
watch(() => [appStore.theme, appStore.editorSettings.fontSize, appStore.editorSettings.minimap, appStore.editorSettings.lineNumbers, appStore.editorSettings.fontFamily], ([theme]) => {
  if (!editor) return
  monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs')
  editor.updateOptions({ readOnly: false, domReadOnly: false, fontSize: appStore.editorSettings.fontSize, fontFamily: appStore.editorSettings.fontFamily, minimap: { enabled: appStore.editorSettings.minimap }, lineNumbers: appStore.editorSettings.lineNumbers })
}, { immediate: true })
watch(() => props.connectionId || connectionStore.activeConnectionId, () => { updateAutocompleteContext(); loadAvailableDatabases() })
watch(resultPanelVisible, v => setStorageItem(RESULT_PANEL_VISIBLE_KEY, v))
watch(resultPanelHeight, v => setStorageItem(RESULT_PANEL_HEIGHT_KEY, v))
watch(() => execution.executionState.value, (s) => emit('executionStateChange', { ...s }), { deep: true })

defineExpose({ setSelectedDatabase, executing, executionState, executeQuery, explainQuery, stopExecution: stopExec, handleDatabaseChange, focusEditor, handleSystemClipboardAction, formatSql, clearEditor, openHistory, openSnippets, refreshAutocomplete, handleSave })
</script>

<style scoped>
.sql-editor-container { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: #ffffff; }
.dark-mode .sql-editor-container { background: #1f1f1f; }
.editor-workbench { display: flex; flex: 1; min-height: 120px; overflow: hidden; background: #ffffff; }
.dark-mode .editor-workbench { background: #1f1f1f; }
.editor-section { flex: 1; min-width: 0; min-height: 100px; overflow: hidden; position: relative; background: inherit; }
.editor-section::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 1px; background: #e5e7eb; pointer-events: none; z-index: 2; }
.dark-mode .editor-section::before { background: #303030; }
.monaco-container { height: 100%; width: 100%; background: transparent; }
.result-dock { flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; border-top: 1px solid #e5e7eb; background: rgba(255,255,255,0.96); box-shadow: 0 -12px 24px rgba(15,23,42,0.06); transition: height 0.18s ease; }
.dark-mode .result-dock { background: rgba(24,24,24,0.98); border-top-color: #303030; box-shadow: 0 -12px 24px rgba(0,0,0,0.24); }
.result-dock.collapsed { border-top-color: transparent; box-shadow: none; }
.split-resizer { height: 1px; background: #e5e7eb; cursor: row-resize; display: block; transition: background-color 0.2s; flex-shrink: 0; position: relative; overflow: visible; }
.split-resizer::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; bottom: -4px; cursor: row-resize; }
.split-resizer:hover { background: #1677ff; }
.dark-mode .split-resizer { background: #303030; }
.resizer-handle { display: none; }
.result-dock-header { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 10px; border-bottom: 1px solid #f0f0f0; background: rgba(248,250,252,0.92); flex-shrink: 0; }
.dark-mode .result-dock-header { border-bottom-color: #2c2c2c; background: rgba(24,24,24,0.96); }
.result-dock.collapsed .result-dock-header { border-bottom: 0; }
.execution-summary-tag { margin-inline-end: 0; }
.execution-summary-text { color: #262626; font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dark-mode .execution-summary-text { color: #f5f5f5; }
.execution-summary-meta { color: #8c8c8c; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dark-mode .execution-summary-meta { color: #a6a6a6; }
.result-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.result-tabs :deep(.ant-tabs-content) { flex: 1; overflow: hidden; }
.result-tabs :deep(.ant-tabs-tabpane) { height: 100%; display: flex; flex-direction: column; }
.result-content { flex: 1; display: flex; flex-direction: column; padding: 12px; overflow: hidden; position: relative; }
.executing-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center; z-index: 10; }
.dark-mode .executing-overlay { background: rgba(0,0,0,0.6); }
.result-info { margin-bottom: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.affected-text { font-size: 12px; color: #8c8c8c; }
.table-wrapper { flex: 1; min-height: 0; overflow: hidden; }
.messages-content { flex: 1; padding: 12px; overflow-y: auto; font-family: monospace; }
.message-item { margin-bottom: 8px; padding: 4px 8px; border-left: 3px solid #d9d9d9; background: #f5f5f5; white-space: pre-wrap; word-break: break-all; }
.dark-mode .message-item { background: #262626; border-left-color: #434343; }
.message-item.success { border-left-color: #52c41a; }
.message-item.error { border-left-color: #ff4d4f; color: #ff4d4f; }
.message-time { color: #8c8c8c; margin-right: 8px; }
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
.result-context-menu { position: absolute; min-width: 140px; background: #fff; border: 1px solid #d9d9d9; border-radius: 8px; box-shadow: 0 8px 24px rgba(15,23,42,0.16); overflow: hidden; }
.dark-mode .result-context-menu { background: #1f1f1f; border-color: #303030; box-shadow: 0 8px 24px rgba(0,0,0,0.36); }
.result-cell-text, .messages-content, :deep(.table-wrapper .vxe-cell), :deep(.table-wrapper .vxe-cell--label), :deep(.table-wrapper .vxe-body--row .vxe-cell) { user-select: text !important; -webkit-user-select: text !important; }
.null-text { color: #bfbfbf; font-style: italic; }
:deep(.danger-confirm-content) { display: flex; flex-direction: column; gap: 12px; }
:deep(.danger-confirm-intro) { margin: 0; color: #595959; }
:deep(.danger-confirm-list) { margin: 0; padding-left: 18px; color: #262626; }
:deep(.danger-confirm-list li) { margin-bottom: 8px; line-height: 1.5; word-break: break-word; }
@media (max-width: 768px) {
  .result-dock-header { flex-wrap: wrap; padding-bottom: 4px; padding-top: 4px; }
  .result-info { align-items: flex-start; flex-direction: column; }
}
</style>
