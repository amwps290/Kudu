<template>
  <div class="table-data-grid">
    <div class="panel-toolbar panel-toolbar--strong-border grid-toolbar">
      <a-space>
        <a-button-group>
          <a-button :icon="h(ReloadOutlined)" @click="refresh" :loading="loading">
            {{ $t('common.refresh') }}
          </a-button>
          <a-button :icon="h(PlusOutlined)" @click="addRow" :disabled="isReadOnly">
            {{ $t('data.add_inline') }}
          </a-button>
          <a-button :icon="h(FormOutlined)" @click="showInsertDialog = true" :disabled="isReadOnly">
            {{ $t('data.add_form') }}
          </a-button>
          <a-button 
            :icon="h(DeleteOutlined)" 
            danger 
            :disabled="isReadOnly || selectedRowKeys.length === 0"
            @click="deleteSelected"
          >
            {{ $t('common.delete') }}
          </a-button>
        </a-button-group>

        <a-divider type="vertical" />

        <!-- 提交变更按钮 -->
        <a-button-group v-if="hasChanges">
          <a-button type="primary" @click="submitChanges" :loading="saving" :disabled="isReadOnly">
            {{ $t('data.save_changes', { n: changeCount }) }}
          </a-button>
          <a-button @click="discardChanges">
            {{ $t('data.discard_changes') }}
          </a-button>
        </a-button-group>

        <a-divider type="vertical" v-if="hasChanges" />

        <a-button :icon="h(FilterOutlined)" @click="showFilterDialog = true">
          {{ $t('data.filter') }}
        </a-button>
        <a-button :icon="h(UploadOutlined)" @click="showImportDialog = true" :disabled="isReadOnly">
          {{ $t('data.import') }}
        </a-button>
        <a-dropdown>
          <template #overlay>
            <a-menu @click="(info: any) => handleExport(info)">
              <a-menu-item key="csv">{{ $t('data.export_csv') }}</a-menu-item>
              <a-menu-item key="json">{{ $t('data.export_json') }}</a-menu-item>
              <a-menu-item key="sql">{{ $t('data.export_sql') }}</a-menu-item>
            </a-menu>
          </template>
          <a-button :icon="h(ExportOutlined)">
            {{ $t('data.export') }}
          </a-button>
        </a-dropdown>
        <a-divider type="vertical" />
        <a-button :type="showViewer ? 'primary' : 'default'" @click="showViewer = !showViewer">
          {{ $t('data.cell_viewer') }}
        </a-button>
      </a-space>
      
      <div class="toolbar-right">
        <a-tag v-if="isReadOnly" color="gold">
          {{ $t('data.read_only_mode') }}
        </a-tag>
        <a-tag v-if="deletedRows.length > 0" color="red">
          {{ $t('data.pending_delete_count', { n: deletedRows.length }) }}
        </a-tag>
        <div class="text-caption data-info">
          {{ $t('editor.loaded_rows', { n: gridOptions.data?.length || 0 }) }}
          <span v-if="loading" class="loading-text">
            <a-spin size="small" class="loading-spinner" /> {{ $t('common.loading') }}
          </span>
          <span v-else-if="!hasMore" class="text-subtle end-text"> {{ $t('data.loaded_all') }}</span>
        </div>
      </div>
    </div>

    <!-- 高性能虚拟滚动表格 + 滚动加载 -->
    <div class="grid-wrapper">
      <vxe-grid 
        ref="gridRef" 
        v-bind="gridOptions" 
        @checkbox-change="handleCheckboxChange" 
        @checkbox-all="handleCheckboxChange"
        @scroll="handleScroll"
        @edit-closed="handleEditClosed"
        @cell-click="(params: any) => handleCellClick(params)"
        :cell-class-name="getCellClassName"
      >
        <template #cell_default="{ row, column }">
          <span :class="{ 'null-text': row[column.field] === null }">
            {{ row[column.field] === null ? 'NULL' : row[column.field] }}
          </span>
        </template>
      </vxe-grid>
    </div>

    <!-- 单元格查看器 Drawer -->
    <a-drawer
      v-model:open="showViewer"
      :title="$t('data.cell_viewer')"
      placement="right"
      :width="500"
      :mask="false"
      class="cell-viewer-drawer"
    >
      <template #extra>
        <a-space>
          <a-button size="small" @click="formatJsonInViewer">{{ $t('data.format_json') }}</a-button>
          <a-dropdown-button size="small" @click="copyViewerContent">
            {{ $t('data.copy_content') }}
            <template #overlay>
              <a-menu @click="handleViewerCopyAction">
                <a-menu-item key="cell">{{ $t('data.copy_content') }}</a-menu-item>
                <a-menu-item key="row-json">{{ $t('data.copy_row_json') }}</a-menu-item>
                <a-menu-item key="row-insert">{{ $t('data.copy_row_insert_sql') }}</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown-button>
        </a-space>
      </template>
      <div v-if="selectedCell" class="viewer-container">
        <div class="viewer-header">
          <a-tag color="blue">{{ selectedCell.column.title }}</a-tag>
          <a-checkbox v-model:checked="isViewerSetNull" @change="handleViewerNullChange" :disabled="isReadOnly">{{ $t('data.set_null') }}</a-checkbox>
        </div>
        <a-textarea
          v-model:value="viewerValue"
          :rows="20"
          :disabled="isReadOnly || isViewerSetNull"
          class="viewer-textarea"
          @change="handleViewerValueChange"
        />
      </div>
      <a-empty v-else :description="$t('data.select_cell_prompt')" />
    </a-drawer>

    <!-- 筛选对话框 -->
    <a-modal v-model:open="showFilterDialog" :title="$t('data.data_filter')" @ok="applyFilter">
      <a-form layout="vertical">
        <a-form-item :label="$t('data.where_condition')">
          <a-textarea v-model:value="filterCondition" :rows="4" :placeholder="$t('data.filter_placeholder')" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="showPreviewDialog"
      :title="$t('data.change_preview')"
      :ok-text="$t('data.confirm_execute')"
      :cancel-text="$t('common.cancel')"
      :confirm-loading="saving"
      width="760px"
      @ok="confirmSubmitChanges"
      @cancel="resetPreviewState"
    >
      <div class="preview-summary">
        <a-tag color="green">{{ $t('data.preview_insert_count', { n: previewPlan?.inserts.length || 0 }) }}</a-tag>
        <a-tag color="gold">{{ $t('data.preview_update_count', { n: previewPlan?.updates.length || 0 }) }}</a-tag>
        <a-tag color="red">{{ $t('data.preview_delete_count', { n: previewPlan?.deletes.length || 0 }) }}</a-tag>
      </div>
      <div class="preview-hint">{{ $t('data.preview_hint') }}</div>
      <a-textarea :value="previewSql" :rows="18" readonly class="preview-sql" />
    </a-modal>

    <InsertRecordDialog
      v-model="showInsertDialog"
      :connection-id="props.connectionId"
      :database="props.database"
      :table="props.table"
      :schema="props.schema"
      @inserted="handleRecordInserted"
    />

    <ImportDataDialog
      v-model="showImportDialog"
      :connection-id="props.connectionId"
      :database="props.database"
      :table="props.table"
      :schema="props.schema"
      @imported="handleDataImported"
    />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, h, ref, watch, computed, reactive, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ReloadOutlined, PlusOutlined, DeleteOutlined, FilterOutlined,
  ExportOutlined, FormOutlined, UploadOutlined
} from '@ant-design/icons-vue'
import { message, Modal } from '@/ui/antd'
import { queryApi, metadataApi, dataApi, exportApi } from '@/api'
import { save } from '@tauri-apps/plugin-dialog'
import { useConnectionStore } from '@/stores/connection'
import InsertRecordDialog from '@/components/database/InsertRecordDialog.vue'
import ImportDataDialog from '@/components/database/ImportDataDialog.vue'
import { writeClipboardText } from '@/utils/clipboard'
import { buildInitialColumnValue, normalizeInsertValue } from '@/utils/tableColumns'
import { quoteIdentifier, hasColumnDefault, buildInsertSql, buildUpdateSql, buildDeleteSql } from '@/utils/sqlHelpers'
import { getErrorMessage } from '@/utils/errorHandler'
import type { VxeGridProps, VxeGridInstance, VxeGridEvents } from 'vxe-table'
import type { ColumnInfo, QueryResult } from '@/types/database'

// ── 类型定义 ──
interface GridCell {
  row: GridRow
  column: { field?: string; title?: string; type?: string }
}

interface GridRow {
  __rowIndex: number
  _originalData: Record<string, unknown>
  _isNew?: boolean
  _isDeletedPending?: boolean
  _newTouchedFields?: Record<string, boolean>
  [field: string]: unknown
}

interface InsertPlanItem {
  rowIndex: number
  data: Record<string, unknown>
  sql: string
}

interface UpdatePlanItem {
  rowIndex: number
  field: string
  value: unknown
  whereConditions: Record<string, unknown>
  sql: string
}

interface DeletePlanItem {
  rowIndex: number
  whereConditions: Record<string, unknown>
  sql: string
}

interface SubmitPreviewPlan {
  inserts: InsertPlanItem[]
  updates: UpdatePlanItem[]
  deletes: DeletePlanItem[]
}

const VxeGrid = defineAsyncComponent(() => import('@/components/vxe/VxeGridRuntime'))

const { t } = useI18n()
const props = defineProps<{ connectionId: string; database: string; table: string; schema?: string }>()
const connectionStore = useConnectionStore()
const gridRef = ref<VxeGridInstance>()

const loading = ref(false)
const hasMore = ref(true)
const selectedRowKeys = ref<number[]>([])
const showFilterDialog = ref(false)
const showInsertDialog = ref(false)
const showImportDialog = ref(false)
const filterCondition = ref('')
const primaryKeys = ref<string[]>([])
const tableColumns = ref<ColumnInfo[]>([])
const saving = ref(false)
const nextRowIndex = ref(0)
const showPreviewDialog = ref(false)
const previewSql = ref('')
const previewPlan = ref<SubmitPreviewPlan | null>(null)

// 变更追踪状态
const pendingEdits = reactive<Record<number, Record<string, { old: unknown; new: unknown }>>>({})
const newRows = computed(() => ((gridOptions.data || []) as GridRow[]).filter(row => row._isNew))
const deletedRows = computed(() => ((gridOptions.data || []) as GridRow[]).filter(row => row._isDeletedPending))
const hasChanges = computed(() => Object.keys(pendingEdits).length > 0 || newRows.value.length > 0 || deletedRows.value.length > 0)
const changeCount = computed(() => {
  const updatedCells = Object.values(pendingEdits).reduce((acc, row) => acc + Object.keys(row).length, 0)
  return updatedCells + newRows.value.length + deletedRows.value.length
})

// 查看器状态
const showViewer = ref(false)
const selectedCell = ref<GridCell | null>(null)
const viewerValue = ref('')
const isViewerSetNull = ref(false)

const pagination = reactive({ current: 1, pageSize: 100 })

const currentConnection = computed(() => connectionStore.connections.find(c => c.id === props.connectionId) || null)
const isReadOnly = computed(() => Boolean(currentConnection.value?.read_only))
const dbType = computed(() => currentConnection.value?.db_type || 'mysql')
const tableRef = computed(() => {
  const schema = dbType.value === 'postgresql' ? (props.schema || 'public') : null
  const q = (n: string) => quoteIdentifier(n, dbType.value)
  return schema ? `${q(schema)}.${q(props.table)}` : q(props.table)
})

function warnReadOnly() {
  message.warning(t('data.read_only_blocked'))
}

const gridOptions = reactive<VxeGridProps>({
  border: true,
  height: 'auto',
  loading: false,
  columnConfig: { resizable: true, drag: true },
  rowConfig: { isCurrent: true, isHover: true, keyField: '__rowIndex', height: 36 },
  checkboxConfig: { reserve: true, trigger: 'cell' },
  editConfig: { trigger: 'dblclick', mode: 'cell', showStatus: true },
  scrollX: { enabled: true, gt: 20 },
  scrollY: { enabled: true, gt: 0 },
  columns: [],
  data: []
})

const handleScroll: VxeGridEvents.Scroll = ({ isY, scrollTop, bodyHeight, scrollHeight }) => {
  if (isY && !loading.value && hasMore.value) {
    if (scrollTop + bodyHeight + 50 >= scrollHeight) {
      loadNextPage()
    }
  }
}

function getCellClassName({ row, column }: { row: GridRow; column: { field: string } }) {
  if (row._isDeletedPending) {
    return 'cell-pending-delete'
  }
  if (row._isNew) {
    return 'cell-new-row'
  }
  const rowIndex = row.__rowIndex
  if (pendingEdits[rowIndex] && pendingEdits[rowIndex][column.field]) {
    return 'cell-modified'
  }
  return ''
}

function handleEditClosed({ row, column }: { row: GridRow; column: { field: string } }) {
  if (isReadOnly.value) return
  if (row._isDeletedPending) return
  recordChange(row, column.field, row[column.field])
  // 如果当前查看器正在显示这个单元格，同步它
  if (selectedCell.value && selectedCell.value.row.__rowIndex === row.__rowIndex && selectedCell.value.column.field === column.field) {
    viewerValue.value = row[column.field] === null ? '' : String(row[column.field])
    isViewerSetNull.value = row[column.field] === null
  }
}

function recordChange(row: GridRow, field: string, newVal: unknown) {
  if (row._isNew) {
    if (!row._newTouchedFields) row._newTouchedFields = {}
    row._newTouchedFields[field] = true
    return
  }

  const rowIndex = row.__rowIndex
  const existingEdit = pendingEdits[rowIndex]?.[field]
  const oldVal = existingEdit ? existingEdit.old : row._originalData?.[field]

  if (newVal === oldVal) {
    if (pendingEdits[rowIndex]) {
      delete pendingEdits[rowIndex][field]
      if (Object.keys(pendingEdits[rowIndex]).length === 0) delete pendingEdits[rowIndex]
    }
  } else {
    if (!pendingEdits[rowIndex]) pendingEdits[rowIndex] = {}
    pendingEdits[rowIndex][field] = { old: oldVal, new: newVal }
  }
}

function handleCellClick(params: Record<string, unknown>) {
  const row = params.row as GridRow
  const column = params.column as Record<string, unknown>
  if (column.type === 'checkbox' || column.type === 'seq' || row._isDeletedPending) return
  const field = String(column.field || '')
  const title = String(column.title || '')
  selectedCell.value = { row, column: { field, title, type: column.type as string | undefined } }
  viewerValue.value = row[field] === null ? '' : String(row[field])
  isViewerSetNull.value = row[field] === null
}

function applyViewerSelection(row: GridRow, field: string) {
  const gridColumn = (gridOptions.columns || []).find(column => column.field === field)
  if (!gridColumn) return

  const colField = String(gridColumn.field || '')
  const colTitle = String(gridColumn.title || '')
  selectedCell.value = { row, column: { field: colField, title: colTitle, type: (gridColumn as Record<string, unknown>).type as string | undefined } }
  viewerValue.value = row[field] === null ? '' : String(row[field])
  isViewerSetNull.value = row[field] === null
  showViewer.value = true
}

function handleViewerValueChange() {
  if (isReadOnly.value) return
  if (!selectedCell.value) return
  const { row, column } = selectedCell.value
  const colField = column.field!
  if (row._isDeletedPending) return
  row[colField] = viewerValue.value
  recordChange(row, colField, viewerValue.value)
}

function handleViewerNullChange() {
  if (isReadOnly.value) return
  if (!selectedCell.value) return
  const { row, column } = selectedCell.value
  const colField = column.field!
  if (row._isDeletedPending) return
  const newVal = isViewerSetNull.value ? null : ''
  row[colField] = newVal
  viewerValue.value = newVal === null ? '' : ''
  recordChange(row, colField, newVal)
}

function formatJsonInViewer() {
  try {
    const obj = JSON.parse(viewerValue.value)
    viewerValue.value = JSON.stringify(obj, null, 2)
    handleViewerValueChange()
  } catch (e) {
    message.error(t('data.invalid_json'))
  }
}

async function copyViewerContent() {
  await writeClipboardText(viewerValue.value)
  message.success(t('data.copy_cell_success'))
}

function getSelectedRowPayload() {
  const row = selectedCell.value?.row as GridRow | undefined
  if (!row) return null

  const payload = tableColumns.value.reduce<Record<string, unknown>>((acc, column) => {
    acc[column.name] = row[column.name] ?? null
    return acc
  }, {})

  return Object.keys(payload).length > 0 ? payload : null
}

async function copySelectedRowAsJson() {
  const payload = getSelectedRowPayload()
  if (!payload) {
    message.warning(t('data.select_cell_prompt'))
    return
  }

  await writeClipboardText(JSON.stringify(payload, null, 2))
  message.success(t('data.copy_row_json_success'))
}

async function copySelectedRowAsInsertSql() {
  const payload = getSelectedRowPayload()
  if (!payload) {
    message.warning(t('data.select_cell_prompt'))
    return
  }

  const sql = buildInsertSql(tableRef.value, payload, dbType.value)
  await writeClipboardText(sql)
  message.success(t('data.copy_row_insert_sql_success'))
}

async function handleViewerCopyAction({ key }: { key: string | number }) {
  const action = String(key)
  if (action === 'cell') {
    await copyViewerContent()
    return
  }
  if (action === 'row-json') {
    await copySelectedRowAsJson()
    return
  }
  if (action === 'row-insert') {
    await copySelectedRowAsInsertSql()
  }
}

function clearPendingEdits() {
  Object.keys(pendingEdits).forEach(k => delete pendingEdits[Number(k)])
}

function clearPendingDeletes() {
  for (const row of (gridOptions.data || []) as GridRow[]) {
    delete row._isDeletedPending
  }
}

function formatInsertError(error: unknown) {
  const detail = String(error)
  if (detail.startsWith('Error: INVALID_JSON:')) {
    const field = detail.slice('Error: INVALID_JSON:'.length)
    return t('dialog.insert_record.invalid_json', { field })
  }
  return detail
}

function resetPreviewState() {
  showPreviewDialog.value = false
  previewPlan.value = null
  previewSql.value = ''
}

function clearSelection() {
  selectedRowKeys.value = []
  ;(gridRef.value as any)?.clearCheckboxRow?.()
}

function clearViewerIfNeeded(rowIndexes?: Set<number>) {
  if (!selectedCell.value) return
  if (!rowIndexes || rowIndexes.has(selectedCell.value.row.__rowIndex)) {
    selectedCell.value = null
    viewerValue.value = ''
    isViewerSetNull.value = false
  }
}

function createGridRow(rowData: Record<string, unknown>, options: { isNew?: boolean } = {}): GridRow {
  const row: GridRow = {
    __rowIndex: nextRowIndex.value++,
    ...rowData,
    _originalData: { ...rowData },
  }

  if (options.isNew) {
    row._isNew = true
    row._newTouchedFields = {}
  }

  return row
}

function buildGridColumns(columnNames: string[]): NonNullable<VxeGridProps['columns']> {
  return [
    { type: 'checkbox', width: 50, fixed: 'left' },
    ...columnNames.map(col => ({
      field: col,
      title: col,
      minWidth: 120,
      showOverflow: true,
      slots: { default: 'cell_default' },
      editRender: isReadOnly.value ? undefined : { name: 'input' }
    }))
  ] as NonNullable<VxeGridProps['columns']>
}

function buildInsertPayload(row: GridRow) {
  const data: Record<string, unknown> = {}
  const missingRequired: string[] = []

  for (const column of tableColumns.value) {
    const rawValue = row[column.name]
    const touched = Boolean(row._newTouchedFields?.[column.name])
    const hasDefault = hasColumnDefault(column)

    let value = rawValue
    if (value !== null && value !== undefined) {
      value = normalizeInsertValue(column, value)
    }

    if (value === null || value === undefined) {
      if (touched) {
        if (column.nullable) {
          data[column.name] = null
        } else if (!column.is_auto_increment) {
          missingRequired.push(column.name)
        }
      } else if (!column.nullable && !column.is_auto_increment && !hasDefault) {
        missingRequired.push(column.name)
      }
      continue
    }

    data[column.name] = value
  }

  return { data, missingRequired }
}

function createPreviewPlan(): SubmitPreviewPlan {
  const plan: SubmitPreviewPlan = { inserts: [], updates: [], deletes: [] }

  const hasPendingUpdates = Object.keys(pendingEdits).length > 0
  const hasPendingDeletes = deletedRows.value.length > 0
  if ((hasPendingUpdates || hasPendingDeletes) && primaryKeys.value.length === 0) {
    throw new Error(t('data.no_pk_error'))
  }

  for (const row of newRows.value) {
    const { data, missingRequired } = buildInsertPayload(row)
    if (missingRequired.length > 0) {
      throw new Error(t('data.required_fields_missing', { fields: missingRequired.join(', ') }))
    }
    if (Object.keys(data).length === 0) {
      throw new Error(t('data.insert_empty_error'))
    }

    const sql = buildInsertSql(tableRef.value, data, dbType.value)
    plan.inserts.push({ rowIndex: row.__rowIndex, data, sql })
  }

  for (const [rowIndexStr, fields] of Object.entries(pendingEdits)) {
    const rowIndex = Number(rowIndexStr)
    const row = ((gridOptions.data || []) as GridRow[]).find(item => item.__rowIndex === rowIndex)
    if (!row || row._isDeletedPending) continue

    const whereConditions: Record<string, unknown> = {}
    primaryKeys.value.forEach(pk => {
      whereConditions[pk] = row._originalData[pk]
    })

    for (const [field, change] of Object.entries(fields)) {
      plan.updates.push({
        rowIndex,
        field,
        value: change.new,
        whereConditions,
        sql: buildUpdateSql(tableRef.value, field, change.new, whereConditions, dbType.value),
      })
    }
  }

  for (const row of deletedRows.value) {
    const whereConditions: Record<string, unknown> = {}
    primaryKeys.value.forEach(pk => {
      whereConditions[pk] = row._originalData[pk]
    })

    plan.deletes.push({
      rowIndex: row.__rowIndex,
      whereConditions,
      sql: buildDeleteSql(tableRef.value, whereConditions, dbType.value),
    })
  }

  return plan
}

function removeRows(rowIndexes: number[]) {
  if (rowIndexes.length === 0) return

  const rowIndexSet = new Set(rowIndexes)
  gridOptions.data = ((gridOptions.data || []) as GridRow[]).filter(row => !rowIndexSet.has(row.__rowIndex))
  rowIndexes.forEach(rowIndex => delete pendingEdits[rowIndex])
  clearSelection()
  clearViewerIfNeeded(rowIndexSet)
}

async function submitChanges() {
  if (isReadOnly.value) {
    warnReadOnly()
    return
  }
  try {
    const plan = createPreviewPlan()
    if (plan.inserts.length === 0 && plan.updates.length === 0 && plan.deletes.length === 0) {
      message.info(t('common.no_data'))
      return
    }
    previewPlan.value = plan
    previewSql.value = [...plan.inserts, ...plan.updates, ...plan.deletes].map(item => item.sql).join('\n\n')
    showPreviewDialog.value = true
  } catch (e: unknown) {
    message.error(t('data.save_fail', { error: formatInsertError(e) }))
  }
}

async function confirmSubmitChanges() {
  if (isReadOnly.value) {
    warnReadOnly()
    resetPreviewState()
    return
  }
  if (!previewPlan.value) return

  saving.value = true
  let shouldRefresh = previewPlan.value.inserts.length > 0 || previewPlan.value.deletes.length > 0
  let hasAppliedChanges = false
  try {
    for (const insert of previewPlan.value.inserts) {
      await dataApi.insertTableData({
        connectionId: props.connectionId,
        database: props.database,
        table: props.table,
        schema: props.schema || undefined,
        data: insert.data,
      })
      hasAppliedChanges = true
    }

    for (const update of previewPlan.value.updates) {
      await dataApi.updateTableData({
        connectionId: props.connectionId,
        database: props.database,
        table: props.table,
        schema: props.schema || null,
        column: update.field,
        value: update.value === null ? null : String(update.value),
        whereConditions: update.whereConditions
      })
      hasAppliedChanges = true

      const row = ((gridOptions.data || []) as GridRow[]).find(item => item.__rowIndex === update.rowIndex)
      if (row) {
        row._originalData[update.field] = update.value
      }
    }

    for (const deletion of previewPlan.value.deletes) {
      await dataApi.deleteTableData({
        connectionId: props.connectionId,
        database: props.database,
        table: props.table,
        schema: props.schema || null,
        whereConditions: deletion.whereConditions
      })
      hasAppliedChanges = true
    }

    resetPreviewState()
    clearPendingEdits()
    clearPendingDeletes()

    if (shouldRefresh) {
      await doRefresh()
    }

    message.success(t('data.save_success'))
  } catch (e: unknown) {
    if (hasAppliedChanges) {
      try { await doRefresh() } catch { /* ignore */ }
    }
    message.error(t('data.save_fail', { error: formatInsertError(e) }))
  } finally {
    saving.value = false
  }
}

function discardChanges() {
  Modal.confirm({
    title: t('data.discard_changes'), content: t('data.discard_confirm'),
    onOk() {
      for (const [rowIndexStr, fields] of Object.entries(pendingEdits)) {
        const rowIndex = Number(rowIndexStr)
        const row = (gridOptions.data as GridRow[] | undefined)?.find(r => r.__rowIndex === rowIndex)
        if (row) { for (const [field, change] of Object.entries(fields)) { row[field] = change.old } }
      }
      gridOptions.data = ((gridOptions.data || []) as GridRow[]).filter(row => !row._isNew)
      clearPendingEdits()
      clearPendingDeletes()
      resetPreviewState()
      if (selectedCell.value?.row._isNew) {
        clearViewerIfNeeded()
      } else if (selectedCell.value) {
        const cf = selectedCell.value.column.field!
        viewerValue.value = selectedCell.value.row[cf] === null ? '' : String(selectedCell.value.row[cf])
        isViewerSetNull.value = selectedCell.value.row[cf] === null
      }
      clearSelection()
    }
  })
}

async function refresh() {
  if (hasChanges.value) {
    return Modal.confirm({ title: t('common.refresh'), content: t('data.discard_confirm'), onOk: () => doRefresh() })
  }
  doRefresh()
}

async function doRefresh() {
  pagination.current = 1
  hasMore.value = true
  gridOptions.data = []
  nextRowIndex.value = 0
  clearPendingEdits()
  clearPendingDeletes()
  resetPreviewState()
  clearSelection()
  clearViewerIfNeeded()
  await loadData(false)
}

async function loadNextPage() {
  if (loading.value || !hasMore.value) return
  pagination.current++; await loadData(true)
}

async function loadData(isAppend: boolean) {
  if (!props.table) return
  loading.value = true; if (!isAppend) gridOptions.loading = true
  try {
    await ensureTableStructure()
    const offset = (pagination.current - 1) * pagination.pageSize
    let sql = `SELECT * FROM ${tableRef.value}`
    if (filterCondition.value) sql += ` WHERE ${filterCondition.value}`
    sql += ` LIMIT ${pagination.pageSize} OFFSET ${offset}`
    const results = await queryApi.executeQuery(props.connectionId, sql, props.database)
    const result = results[0]
    const fallbackColumns = tableColumns.value.map(column => column.name)
    if (!result) {
      hasMore.value = false
      if (!isAppend) {
        gridOptions.columns = buildGridColumns(fallbackColumns)
        gridOptions.data = []
      }
      return
    }

    const visibleColumns = result.columns.length > 0 ? result.columns : fallbackColumns
    hasMore.value = result.rows.length === pagination.pageSize
    if (!isAppend) {
      gridOptions.columns = buildGridColumns(visibleColumns)
      gridOptions.data = result.rows.map(row => createGridRow(row))
    } else {
      const appendedRows = result.rows.map(row => createGridRow(row))
      gridOptions.data = [...(gridOptions.data || []), ...appendedRows]
    }
  } catch (e: unknown) { 
    message.error(getErrorMessage(e)); pagination.current = Math.max(1, pagination.current - 1)
  } finally { 
    loading.value = false; gridOptions.loading = false 
  }
}

async function ensureTableStructure() {
  if (tableColumns.value.length > 0) return

  tableColumns.value = await metadataApi.getTableStructure({
    connectionId: props.connectionId,
    table: props.table,
    schema: props.schema || null,
    database: props.database
  })
  primaryKeys.value = tableColumns.value.filter(c => c.is_primary_key).map(c => c.name)
}

function handleCheckboxChange() {
  const records = gridRef.value?.getCheckboxRecords() || []
  selectedRowKeys.value = records.map(r => r.__rowIndex)
}

function applyFilter() { showFilterDialog.value = false; refresh() }

function findFirstEditableColumn(): { field: string; title: string } | null {
  const editableName = tableColumns.value.find(column => !column.is_auto_increment)?.name
  if (!editableName) return null

  const gc = (gridOptions.columns || []).find(c => c.field === editableName)
  if (!gc) return { field: editableName, title: editableName }
  return { field: String(gc.field || ''), title: String(gc.title || '') }
}

async function focusNewRow(row: GridRow) {
  const targetColumn = findFirstEditableColumn()
  if (!targetColumn) return
  const fieldName = String(targetColumn.field || '')
  if (!fieldName) return

  await nextTick()
  selectedCell.value = { row, column: targetColumn }
  viewerValue.value = row[fieldName] === null ? '' : String(row[fieldName])
  isViewerSetNull.value = row[fieldName] === null
  showViewer.value = true
  ;(gridRef.value as any)?.setCurrentRow?.(row)
  ;(gridRef.value as any)?.scrollToRow?.(row)
}

async function addRow() {
  if (isReadOnly.value) {
    warnReadOnly()
    return
  }

  await ensureTableStructure()
  const rowData = tableColumns.value.reduce<Record<string, unknown>>((acc, column) => {
    acc[column.name] = buildInitialColumnValue(column)
    return acc
  }, {})

  const newRow = createGridRow(rowData, { isNew: true })
  gridOptions.data = [newRow, ...((gridOptions.data || []) as GridRow[])]
  await focusNewRow(newRow)
}

function findInsertedRow(payload: Record<string, unknown>) {
  return ((gridOptions.data || []) as GridRow[]).find(row =>
    Object.entries(payload).every(([field, value]) => JSON.stringify(row[field] ?? null) === JSON.stringify(value ?? null))
  ) || null
}

async function handleRecordInserted(payload?: Record<string, unknown>) {
  showInsertDialog.value = false
  await doRefresh()
  if (!payload || Object.keys(payload).length === 0) return

  const matchedRow = findInsertedRow(payload)
  if (!matchedRow) return

  const field = Object.keys(payload)[0]
  await nextTick()
  ;(gridRef.value as any)?.setCurrentRow?.(matchedRow)
  ;(gridRef.value as any)?.scrollToRow?.(matchedRow)
  applyViewerSelection(matchedRow, field)
}

async function handleDataImported() {
  showImportDialog.value = false
  await doRefresh()
}

async function deleteSelected() {
  if (isReadOnly.value) {
    warnReadOnly()
    return
  }
  Modal.confirm({
    title: t('common.delete'), content: t('data.delete_confirm_n', { n: selectedRowKeys.value.length }), okType: 'danger',
    async onOk() {
      try {
        const records = (gridRef.value?.getCheckboxRecords() || []) as GridRow[]
        const newRecords = records.filter(record => record._isNew)
        const existingRecords = records.filter(record => !record._isNew)

        if (existingRecords.length > 0 && primaryKeys.value.length === 0) {
          message.error(t('data.no_pk_error'))
          return
        }

        if (newRecords.length > 0) {
          removeRows(newRecords.map(record => record.__rowIndex))
        }

        for (const record of existingRecords) {
          record._isDeletedPending = true
          delete pendingEdits[record.__rowIndex]
        }

        clearSelection()
        clearViewerIfNeeded(new Set(records.map(record => record.__rowIndex)))
        message.success(t('data.delete_staged'))
      } catch (e: unknown) { message.error(getErrorMessage(e)) }
    }
  })
}

async function handleExport(_info: { key: string | number }) {
  const key = String(_info.key)
  try {
    const sql = `SELECT * FROM ${tableRef.value}${filterCondition.value ? ' WHERE ' + filterCondition.value : ''}`
    const path = await save({
      defaultPath: `${props.table}.${key}`,
      filters: [{ name: key.toUpperCase(), extensions: [key] }],
    })
    if (!path) return

    const results = await queryApi.executeQuery(props.connectionId, sql, props.database)
    const data: QueryResult = results[0] || { columns: [], rows: [], affected_rows: 0, execution_time_ms: 0 }

    if (key === 'csv') {
      await exportApi.toCsv(data, path)
    } else if (key === 'json') {
      await exportApi.toJson(data, path)
    } else if (key === 'sql') {
      await exportApi.toSql(data, props.table, path)
    } else {
      throw new Error(`Unsupported export format: ${key}`)
    }

    message.success(t('data.export_success', { path }))
  } catch (e: unknown) { message.error(getErrorMessage(e)) }
}

watch(
  () => [props.connectionId, props.database, props.schema, props.table, isReadOnly.value],
  () => {
    primaryKeys.value = []
    tableColumns.value = []
    refresh()
  },
  { immediate: true }
)
</script>

<style scoped>
.table-data-grid { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.grid-wrapper { flex: 1; min-height: 0; padding: 4px; background: var(--surface); }
.toolbar-right { display: flex; align-items: center; }
.loading-text { color: var(--color-primary); font-weight: 500; }
.loading-spinner { margin-left: 8px; }

:deep(.cell-modified) { background-color: var(--color-warning-soft-bg) !important; position: relative; }
:deep(.cell-modified)::after { content: ""; position: absolute; top: 0; left: 0; border: 4px solid transparent; border-left-color: var(--color-warning); border-top-color: var(--color-warning); }
:deep(.cell-new-row) { background-color: var(--color-primary-soft-bg) !important; }
:deep(.cell-pending-delete) { background-color: var(--color-danger-soft-bg) !important; color: var(--color-danger); text-decoration: line-through; pointer-events: none; opacity: 0.75; }

.viewer-container { padding: 12px; height: 100%; display: flex; flex-direction: column; background: var(--surface); color: var(--app-text); }
.viewer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.viewer-textarea { flex: 1; font-family: monospace; }
.preview-sql :deep(textarea) { font-family: monospace; }
</style>
