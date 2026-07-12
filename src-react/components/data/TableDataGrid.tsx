import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Divider, Dropdown, Form, Input, Modal as AntModal, Space, Spin, Tag } from 'antd'
import {
  DeleteOutlined, ExportOutlined, FilterOutlined, FormOutlined, PlusOutlined, ReloadOutlined, UploadOutlined,
} from '@ant-design/icons'
import { save } from '@tauri-apps/plugin-dialog'
import { message, Modal } from '../../ui/antd'
import { dataApi, exportApi, metadataApi, queryApi } from '@/api'
import { getErrorMessage } from '@/utils/errorHandler'
import { quoteIdentifier, buildInsertSql, buildUpdateSql, buildDeleteSql, hasColumnDefault } from '@/utils/sqlHelpers'
import { buildInitialColumnValue, normalizeInsertValue } from '@/utils/tableColumns'
import { writeClipboardText } from '@/utils/clipboard'
import type { ColumnInfo, QueryResult } from '@/types/database'
import { useConnectionStore } from '../../stores/connectionStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import {
  registerCellViewerActions,
  unregisterCellViewerActions,
} from '../../stores/cellViewerRegistry'
import type { CellVisualState } from './DataEditGrid'
import styles from './TableDataGrid.module.css'

const DataEditGrid = lazy(() => import('./DataEditGrid'))
const InsertRecordDialog = lazy(() => import('../database/InsertRecordDialog'))
const ImportDataDialog = lazy(() => import('../database/ImportDataDialog'))

/**
 * 表数据网格（Slice 16 读侧 + Slice 17 子批 A 编辑基座）。
 * 已迁：滚动加载/筛选/只读 tag/导出/刷新（读侧）；cell 编辑（改回原值自动清脏）/
 * inline 新增/删除标记（无主键拒绝）/丢弃/cell viewer 双向联动（4.4 注册表模式）。
 * 子批 B 待迁：SQL 预览 + 提交（dataApi 参数化）/表单新增（InsertRecordDialog）/导入对话框。
 *
 * 范式差异（计划 Slice 17 要点）：Vue 版行标记 `_isNew/_isDeletedPending/_originalData/
 * _newTouchedFields` 挂在行对象上；这里改为**独立编辑状态层**（按 __rowIndex 的 Map/Set），
 * AG Grid 行数据保持纯净（仅 __rowIndex 身份字段）。
 */

interface TableDataGridProps {
  connectionId: string
  database: string
  table: string
  schema?: string
}

type GridRow = Record<string, unknown> & { __rowIndex: number }

interface InsertPlanItem { rowIndex: number; data: Record<string, unknown>; sql: string }
interface UpdatePlanItem { rowIndex: number; field: string; value: unknown; whereConditions: Record<string, unknown>; sql: string }
interface DeletePlanItem { rowIndex: number; whereConditions: Record<string, unknown>; sql: string }
interface SubmitPreviewPlan { inserts: InsertPlanItem[]; updates: UpdatePlanItem[]; deletes: DeletePlanItem[] }

interface EditStateSnapshot {
  pendingEdits: Record<number, Record<string, { old: unknown; new: unknown }>>
  newRowIndexes: Set<number>
  pendingDeleteIndexes: Set<number>
  version: number
}

function createEmptyEditState(): EditStateSnapshot {
  return { pendingEdits: {}, newRowIndexes: new Set(), pendingDeleteIndexes: new Set(), version: 0 }
}

let gridOwnerSeq = 0

export default function TableDataGrid({ connectionId, database, table, schema }: TableDataGridProps) {
  const { t } = useTranslation()

  const currentConnection = useConnectionStore((s) => s.connections.find((c) => c.id === connectionId) || null)
  const isReadOnly = Boolean(currentConnection?.read_only)
  const dbType = currentConnection?.db_type || 'mysql'
  const isPgLike = dbType === 'postgresql' || dbType === 'opengauss' || dbType === 'gaussdb'

  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [rows, setRows] = useState<GridRow[]>([])
  const [visibleColumns, setVisibleColumns] = useState<string[]>([])
  const [showFilterDialog, setShowFilterDialog] = useState(false)
  const [filterCondition, setFilterCondition] = useState('')
  const [editState, setEditState] = useState<EditStateSnapshot>(createEmptyEditState)
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([])
  const [deselectToken, setDeselectToken] = useState(0)
  const [showInsertDialog, setShowInsertDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [previewSql, setPreviewSql] = useState('')
  const previewPlanRef = useRef<SubmitPreviewPlan | null>(null)

  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const rowsRef = useRef<GridRow[]>([])
  const paginationRef = useRef({ current: 1, pageSize: 100 })
  const tableColumnsRef = useRef<ColumnInfo[]>([])
  const primaryKeysRef = useRef<string[]>([])
  const filterConditionRef = useRef('')
  filterConditionRef.current = filterCondition
  const nextRowIndexRef = useRef(0)

  // 编辑状态层（ref 镜像供同步读；originals/touched 不驱动渲染，纯 ref）
  const editStateRef = useRef(editState)
  editStateRef.current = editState
  const originalsRef = useRef(new Map<number, Record<string, unknown>>())
  const touchedFieldsRef = useRef(new Map<number, Set<string>>())

  // cell viewer（4.4 注册表模式）
  const ownerIdRef = useRef(`table-grid-${++gridOwnerSeq}`)
  const selectedCellRef = useRef<{ rowIndex: number; field: string; title: string } | null>(null)
  const viewerValueRef = useRef('')
  const viewerIsNullRef = useRef(false)

  const latestRef = useRef({ connectionId, database, table, schema, dbType, isPgLike, isReadOnly })
  latestRef.current = { connectionId, database, table, schema, dbType, isPgLike, isReadOnly }

  function tableRef(): string {
    const { schema: propSchema, table: propTable, dbType: type, isPgLike: pgLike } = latestRef.current
    const effectiveSchema = pgLike ? (propSchema || 'public') : null
    const q = (n: string) => quoteIdentifier(n, type)
    return effectiveSchema ? `${q(effectiveSchema)}.${q(propTable)}` : q(propTable)
  }

  function warnReadOnly() {
    message.warning(t('data.read_only_blocked'))
  }

  // ── 编辑状态层原语 ──

  function applyEditState(mutate: (draft: EditStateSnapshot) => void) {
    const prev = editStateRef.current
    const draft: EditStateSnapshot = {
      pendingEdits: { ...prev.pendingEdits },
      newRowIndexes: new Set(prev.newRowIndexes),
      pendingDeleteIndexes: new Set(prev.pendingDeleteIndexes),
      version: prev.version + 1,
    }
    mutate(draft)
    editStateRef.current = draft
    setEditState(draft)
  }

  function getCellVisual(rowIndex: number, field: string): CellVisualState {
    const state = editStateRef.current
    if (state.pendingDeleteIndexes.has(rowIndex)) return 'pending-delete'
    if (state.newRowIndexes.has(rowIndex)) return 'new'
    if (state.pendingEdits[rowIndex]?.[field]) return 'modified'
    return null
  }

  const newRowCount = editState.newRowIndexes.size
  const deletedRowCount = editState.pendingDeleteIndexes.size
  const updatedCellCount = Object.values(editState.pendingEdits).reduce((acc, row) => acc + Object.keys(row).length, 0)
  const hasChanges = updatedCellCount > 0 || newRowCount > 0 || deletedRowCount > 0
  const changeCount = updatedCellCount + newRowCount + deletedRowCount

  function clearAllEditState() {
    editStateRef.current = { ...createEmptyEditState(), version: editStateRef.current.version + 1 }
    setEditState(editStateRef.current)
    touchedFieldsRef.current.clear()
  }

  /** 记录变更（照抄 Vue recordChange：新行记 touched；旧行与原值比较，改回原值自动清脏） */
  function recordChange(rowIndex: number, field: string, newVal: unknown) {
    if (editStateRef.current.newRowIndexes.has(rowIndex)) {
      let touched = touchedFieldsRef.current.get(rowIndex)
      if (!touched) {
        touched = new Set()
        touchedFieldsRef.current.set(rowIndex, touched)
      }
      touched.add(field)
      return
    }

    const existingEdit = editStateRef.current.pendingEdits[rowIndex]?.[field]
    const oldVal = existingEdit ? existingEdit.old : originalsRef.current.get(rowIndex)?.[field]

    applyEditState((draft) => {
      if (newVal === oldVal) {
        if (draft.pendingEdits[rowIndex]) {
          const fields = { ...draft.pendingEdits[rowIndex] }
          delete fields[field]
          if (Object.keys(fields).length === 0) delete draft.pendingEdits[rowIndex]
          else draft.pendingEdits[rowIndex] = fields
        }
      } else {
        draft.pendingEdits[rowIndex] = { ...(draft.pendingEdits[rowIndex] || {}), [field]: { old: oldVal, new: newVal } }
      }
    })
  }

  function applyRows(next: GridRow[]) {
    rowsRef.current = next
    setRows(next)
  }

  function patchRowValue(rowIndex: number, field: string, value: unknown) {
    applyRows(rowsRef.current.map((row) => (row.__rowIndex === rowIndex ? { ...row, [field]: value } : row)))
  }

  function createGridRow(rowData: Record<string, unknown>, options: { isNew?: boolean } = {}): GridRow {
    const rowIndex = nextRowIndexRef.current++
    if (!options.isNew) {
      originalsRef.current.set(rowIndex, { ...rowData })
    }
    return { __rowIndex: rowIndex, ...rowData }
  }

  // ── cell viewer 联动（数据进 store，动作经注册表反调）──

  function syncRightPanelCellViewer() {
    const store = useRightPanelStore.getState()
    const cell = selectedCellRef.current
    if (!cell) {
      store.clearCellViewer()
      return
    }
    store.setCellViewer({
      ownerId: ownerIdRef.current,
      columnTitle: cell.title || cell.field,
      field: cell.field,
      rowLabel: `Row #${cell.rowIndex}`,
      value: viewerValueRef.current,
      isNull: viewerIsNullRef.current,
      readOnly: latestRef.current.isReadOnly,
      objectName: latestRef.current.table,
    })
  }

  function selectViewerCell(rowIndex: number, field: string, title: string) {
    const row = rowsRef.current.find((item) => item.__rowIndex === rowIndex)
    if (!row) return
    selectedCellRef.current = { rowIndex, field, title }
    viewerValueRef.current = row[field] === null ? '' : String(row[field])
    viewerIsNullRef.current = row[field] === null
    syncRightPanelCellViewer()
    useRightPanelStore.getState().setActivePanel('cell')
  }

  function clearViewerIfNeeded(rowIndexes?: Set<number>) {
    const cell = selectedCellRef.current
    if (!cell) return
    if (!rowIndexes || rowIndexes.has(cell.rowIndex)) {
      selectedCellRef.current = null
      viewerValueRef.current = ''
      viewerIsNullRef.current = false
      useRightPanelStore.getState().clearCellViewer()
    }
  }

  function handleViewerValueChange(value: string) {
    viewerValueRef.current = value
    if (latestRef.current.isReadOnly) return
    const cell = selectedCellRef.current
    if (!cell) return
    if (editStateRef.current.pendingDeleteIndexes.has(cell.rowIndex)) return
    viewerIsNullRef.current = false
    patchRowValue(cell.rowIndex, cell.field, value)
    recordChange(cell.rowIndex, cell.field, value)
    syncRightPanelCellViewer()
  }

  function handleViewerNullChange(checked: boolean) {
    if (latestRef.current.isReadOnly) return
    const cell = selectedCellRef.current
    if (!cell) return
    if (editStateRef.current.pendingDeleteIndexes.has(cell.rowIndex)) return
    viewerIsNullRef.current = checked
    const newVal = checked ? null : ''
    viewerValueRef.current = ''
    patchRowValue(cell.rowIndex, cell.field, newVal)
    recordChange(cell.rowIndex, cell.field, newVal)
    syncRightPanelCellViewer()
  }

  function formatJsonInViewer() {
    try {
      const obj = JSON.parse(viewerValueRef.current)
      handleViewerValueChange(JSON.stringify(obj, null, 2))
    } catch {
      message.error(t('data.invalid_json'))
    }
  }

  function getSelectedRowPayload() {
    const cell = selectedCellRef.current
    if (!cell) return null
    const row = rowsRef.current.find((item) => item.__rowIndex === cell.rowIndex)
    if (!row) return null
    const payload = tableColumnsRef.current.reduce<Record<string, unknown>>((acc, column) => {
      acc[column.name] = row[column.name] ?? null
      return acc
    }, {})
    return Object.keys(payload).length > 0 ? payload : null
  }

  async function copyViewerContent() {
    await writeClipboardText(viewerValueRef.current)
    message.success(t('data.copy_cell_success'))
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
    const sql = buildInsertSql(tableRef(), payload, latestRef.current.dbType)
    await writeClipboardText(sql)
    message.success(t('data.copy_row_insert_sql_success'))
  }

  // 注册表：挂载注册动作，卸载注销（4.4）
  useEffect(() => {
    const ownerId = ownerIdRef.current
    registerCellViewerActions(ownerId, {
      onChange: handleViewerValueChange,
      onToggleNull: handleViewerNullChange,
      onFormatJson: formatJsonInViewer,
      onCopyCell: () => { void copyViewerContent() },
      onCopyRowJson: () => { void copySelectedRowAsJson() },
      onCopyRowInsert: () => { void copySelectedRowAsInsertSql() },
    })
    return () => {
      unregisterCellViewerActions(ownerId)
      const store = useRightPanelStore.getState()
      if (store.cellViewer?.ownerId === ownerId) store.clearCellViewer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 网格编辑回调 ──

  function handleCellEdited(rowIndex: number, field: string, newValue: unknown) {
    if (latestRef.current.isReadOnly) return
    if (editStateRef.current.pendingDeleteIndexes.has(rowIndex)) return
    // AG Grid 已就地写入行对象；同步不可变状态保持一致
    patchRowValue(rowIndex, field, newValue)
    recordChange(rowIndex, field, newValue)
    const cell = selectedCellRef.current
    if (cell && cell.rowIndex === rowIndex && cell.field === field) {
      viewerValueRef.current = newValue === null ? '' : String(newValue)
      viewerIsNullRef.current = newValue === null
      syncRightPanelCellViewer()
    }
  }

  function handleCellClick(payload: { rowIndex: number; field: string; title: string }) {
    if (editStateRef.current.pendingDeleteIndexes.has(payload.rowIndex)) return
    selectViewerCell(payload.rowIndex, payload.field, payload.title)
  }

  // ── 数据加载 ──

  async function ensureTableStructure() {
    if (tableColumnsRef.current.length > 0) return
    tableColumnsRef.current = await metadataApi.getTableStructure({
      connectionId: latestRef.current.connectionId,
      table: latestRef.current.table,
      schema: latestRef.current.schema || null,
      database: latestRef.current.database,
    })
    primaryKeysRef.current = tableColumnsRef.current.filter((c) => c.is_primary_key).map((c) => c.name)
  }

  async function loadData(isAppend: boolean) {
    if (!latestRef.current.table) return
    loadingRef.current = true
    setLoading(true)
    try {
      await ensureTableStructure()
      const pagination = paginationRef.current
      const offset = (pagination.current - 1) * pagination.pageSize
      let sql = `SELECT * FROM ${tableRef()}`
      if (filterConditionRef.current) sql += ` WHERE ${filterConditionRef.current}`
      sql += ` LIMIT ${pagination.pageSize} OFFSET ${offset}`
      const results = await queryApi.executeQuery(latestRef.current.connectionId, sql, latestRef.current.database)
      const result = results[0]
      const fallbackColumns = tableColumnsRef.current.map((column) => column.name)
      if (!result) {
        hasMoreRef.current = false
        setHasMore(false)
        if (!isAppend) {
          setVisibleColumns(fallbackColumns)
          applyRows([])
        }
        return
      }

      const cols = result.columns.length > 0 ? result.columns : fallbackColumns
      hasMoreRef.current = result.rows.length === pagination.pageSize
      setHasMore(hasMoreRef.current)
      const mapped = (result.rows as Array<Record<string, unknown>>).map((row) => createGridRow(row))
      if (!isAppend) {
        setVisibleColumns(cols)
        applyRows(mapped)
      } else {
        applyRows([...rowsRef.current, ...mapped])
      }
    } catch (e: unknown) {
      message.error(getErrorMessage(e))
      paginationRef.current.current = Math.max(1, paginationRef.current.current - 1)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  async function doRefresh() {
    paginationRef.current.current = 1
    hasMoreRef.current = true
    setHasMore(true)
    applyRows([])
    nextRowIndexRef.current = 0
    originalsRef.current.clear()
    clearAllEditState()
    setSelectedRowIndexes([])
    setDeselectToken((v) => v + 1)
    clearViewerIfNeeded()
    await loadData(false)
  }

  function refresh() {
    if (hasChanges) {
      Modal.confirm({ title: t('common.refresh'), content: t('data.discard_confirm'), onOk: () => void doRefresh() })
      return
    }
    void doRefresh()
  }

  async function loadNextPage() {
    if (loadingRef.current || !hasMoreRef.current) return
    paginationRef.current.current++
    await loadData(true)
  }

  function handleGridReachBottom() {
    if (!loadingRef.current && hasMoreRef.current) {
      void loadNextPage()
    }
  }

  function applyFilter() {
    setShowFilterDialog(false)
    refresh()
  }

  // ── 编辑动作 ──

  async function addRow() {
    if (latestRef.current.isReadOnly) {
      warnReadOnly()
      return
    }
    await ensureTableStructure()
    const rowData = tableColumnsRef.current.reduce<Record<string, unknown>>((acc, column) => {
      acc[column.name] = buildInitialColumnValue(column)
      return acc
    }, {})
    const newRow = createGridRow(rowData, { isNew: true })
    applyEditState((draft) => { draft.newRowIndexes.add(newRow.__rowIndex) })
    touchedFieldsRef.current.set(newRow.__rowIndex, new Set())
    applyRows([newRow, ...rowsRef.current])
    // 定位到首个可编辑列（Vue 版另有 setCurrentRow/scrollToRow，AG Grid 下新行在首行可见）
    const editableName = tableColumnsRef.current.find((column) => !column.is_auto_increment)?.name
    if (editableName) selectViewerCell(newRow.__rowIndex, editableName, editableName)
  }

  function removeRows(rowIndexes: number[]) {
    if (rowIndexes.length === 0) return
    const rowIndexSet = new Set(rowIndexes)
    applyRows(rowsRef.current.filter((row) => !rowIndexSet.has(row.__rowIndex)))
    applyEditState((draft) => {
      rowIndexes.forEach((rowIndex) => {
        delete draft.pendingEdits[rowIndex]
        draft.newRowIndexes.delete(rowIndex)
        draft.pendingDeleteIndexes.delete(rowIndex)
      })
    })
    rowIndexes.forEach((rowIndex) => {
      originalsRef.current.delete(rowIndex)
      touchedFieldsRef.current.delete(rowIndex)
    })
    setSelectedRowIndexes([])
    setDeselectToken((v) => v + 1)
    clearViewerIfNeeded(rowIndexSet)
  }

  function deleteSelected() {
    if (latestRef.current.isReadOnly) {
      warnReadOnly()
      return
    }
    Modal.confirm({
      title: t('common.delete'),
      content: t('data.delete_confirm_n', { n: selectedRowIndexes.length }),
      okType: 'danger',
      onOk: () => {
        try {
          const selectedSet = new Set(selectedRowIndexes)
          const records = rowsRef.current.filter((row) => selectedSet.has(row.__rowIndex))
          const newRecords = records.filter((record) => editStateRef.current.newRowIndexes.has(record.__rowIndex))
          const existingRecords = records.filter((record) => !editStateRef.current.newRowIndexes.has(record.__rowIndex))

          if (existingRecords.length > 0 && primaryKeysRef.current.length === 0) {
            message.error(t('data.no_pk_error'))
            return
          }

          if (newRecords.length > 0) {
            removeRows(newRecords.map((record) => record.__rowIndex))
          }

          if (existingRecords.length > 0) {
            applyEditState((draft) => {
              existingRecords.forEach((record) => {
                draft.pendingDeleteIndexes.add(record.__rowIndex)
                delete draft.pendingEdits[record.__rowIndex]
              })
            })
          }

          setSelectedRowIndexes([])
          setDeselectToken((v) => v + 1)
          clearViewerIfNeeded(new Set(records.map((record) => record.__rowIndex)))
          message.success(t('data.delete_staged'))
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  function discardChanges() {
    Modal.confirm({
      title: t('data.discard_changes'),
      content: t('data.discard_confirm'),
      onOk() {
        // 恢复被编辑的旧值
        const edits = editStateRef.current.pendingEdits
        let nextRows = rowsRef.current.map((row) => {
          const fields = edits[row.__rowIndex]
          if (!fields) return row
          const restored = { ...row }
          for (const [field, change] of Object.entries(fields)) {
            restored[field] = change.old
          }
          return restored
        })
        // 移除新行
        const newIndexes = editStateRef.current.newRowIndexes
        nextRows = nextRows.filter((row) => !newIndexes.has(row.__rowIndex))
        newIndexes.forEach((rowIndex) => touchedFieldsRef.current.delete(rowIndex))
        applyRows(nextRows)
        clearAllEditState()

        const cell = selectedCellRef.current
        if (cell && newIndexes.has(cell.rowIndex)) {
          clearViewerIfNeeded()
        } else if (cell) {
          const row = rowsRef.current.find((item) => item.__rowIndex === cell.rowIndex)
          if (row) {
            viewerValueRef.current = row[cell.field] === null ? '' : String(row[cell.field])
            viewerIsNullRef.current = row[cell.field] === null
            syncRightPanelCellViewer()
          }
        }
        setSelectedRowIndexes([])
        setDeselectToken((v) => v + 1)
      },
    })
  }

  // ── SQL 预览 + 提交（预览是前端拼串、执行走参数化命令——已知问题 2 现状保留）──

  function formatInsertError(error: unknown) {
    const detail = String(error)
    if (detail.startsWith('Error: INVALID_JSON:')) {
      const field = detail.slice('Error: INVALID_JSON:'.length)
      return t('dialog.insert_record.invalid_json', { field })
    }
    return detail
  }

  function resetPreviewState() {
    setShowPreviewDialog(false)
    previewPlanRef.current = null
    setPreviewSql('')
  }

  /** 新行 INSERT 载荷（照抄 Vue buildInsertPayload：touched/nullable/default/auto_increment 判定） */
  function buildRowInsertPayload(row: GridRow) {
    const data: Record<string, unknown> = {}
    const missingRequired: string[] = []
    const touchedFields = touchedFieldsRef.current.get(row.__rowIndex)

    for (const column of tableColumnsRef.current) {
      const rawValue = row[column.name]
      const touched = Boolean(touchedFields?.has(column.name))
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
    const state = editStateRef.current

    const hasPendingUpdates = Object.keys(state.pendingEdits).length > 0
    const hasPendingDeletes = state.pendingDeleteIndexes.size > 0
    if ((hasPendingUpdates || hasPendingDeletes) && primaryKeysRef.current.length === 0) {
      throw new Error(t('data.no_pk_error'))
    }

    for (const row of rowsRef.current) {
      if (!state.newRowIndexes.has(row.__rowIndex)) continue
      const { data, missingRequired } = buildRowInsertPayload(row)
      if (missingRequired.length > 0) {
        throw new Error(t('data.required_fields_missing', { fields: missingRequired.join(', ') }))
      }
      if (Object.keys(data).length === 0) {
        throw new Error(t('data.insert_empty_error'))
      }
      plan.inserts.push({
        rowIndex: row.__rowIndex,
        data,
        sql: buildInsertSql(tableRef(), data, latestRef.current.dbType),
      })
    }

    for (const [rowIndexStr, fields] of Object.entries(state.pendingEdits)) {
      const rowIndex = Number(rowIndexStr)
      const row = rowsRef.current.find((item) => item.__rowIndex === rowIndex)
      if (!row || state.pendingDeleteIndexes.has(rowIndex)) continue

      const whereConditions: Record<string, unknown> = {}
      primaryKeysRef.current.forEach((pk) => {
        whereConditions[pk] = originalsRef.current.get(rowIndex)?.[pk]
      })

      for (const [field, change] of Object.entries(fields)) {
        plan.updates.push({
          rowIndex,
          field,
          value: change.new,
          whereConditions,
          sql: buildUpdateSql(tableRef(), field, change.new, whereConditions, latestRef.current.dbType),
        })
      }
    }

    for (const row of rowsRef.current) {
      if (!state.pendingDeleteIndexes.has(row.__rowIndex)) continue
      const whereConditions: Record<string, unknown> = {}
      primaryKeysRef.current.forEach((pk) => {
        whereConditions[pk] = originalsRef.current.get(row.__rowIndex)?.[pk]
      })
      plan.deletes.push({
        rowIndex: row.__rowIndex,
        whereConditions,
        sql: buildDeleteSql(tableRef(), whereConditions, latestRef.current.dbType),
      })
    }

    return plan
  }

  function submitChanges() {
    if (latestRef.current.isReadOnly) {
      warnReadOnly()
      return
    }
    try {
      const plan = createPreviewPlan()
      if (plan.inserts.length === 0 && plan.updates.length === 0 && plan.deletes.length === 0) {
        message.info(t('common.no_data'))
        return
      }
      previewPlanRef.current = plan
      setPreviewSql([...plan.inserts, ...plan.updates, ...plan.deletes].map((item) => item.sql).join('\n\n'))
      setShowPreviewDialog(true)
    } catch (e: unknown) {
      message.error(t('data.save_fail', { error: formatInsertError(e) }))
    }
  }

  async function confirmSubmitChanges() {
    if (latestRef.current.isReadOnly) {
      warnReadOnly()
      resetPreviewState()
      return
    }
    const plan = previewPlanRef.current
    if (!plan) return

    setSaving(true)
    const shouldRefresh = plan.inserts.length > 0 || plan.deletes.length > 0
    let hasAppliedChanges = false
    try {
      for (const insert of plan.inserts) {
        await dataApi.insertTableData({
          connectionId: latestRef.current.connectionId,
          database: latestRef.current.database,
          table: latestRef.current.table,
          schema: latestRef.current.schema || undefined,
          data: insert.data,
        })
        hasAppliedChanges = true
      }

      for (const update of plan.updates) {
        await dataApi.updateTableData({
          connectionId: latestRef.current.connectionId,
          database: latestRef.current.database,
          table: latestRef.current.table,
          schema: latestRef.current.schema || null,
          column: update.field,
          value: update.value === null ? null : String(update.value),
          whereConditions: update.whereConditions,
        })
        hasAppliedChanges = true
        // 提交成功后同步原值快照（对等 Vue row._originalData[field] = value）
        const original = originalsRef.current.get(update.rowIndex)
        if (original) original[update.field] = update.value
      }

      for (const deletion of plan.deletes) {
        await dataApi.deleteTableData({
          connectionId: latestRef.current.connectionId,
          database: latestRef.current.database,
          table: latestRef.current.table,
          schema: latestRef.current.schema || null,
          whereConditions: deletion.whereConditions,
        })
        hasAppliedChanges = true
      }

      resetPreviewState()
      clearAllEditState()

      if (shouldRefresh) {
        await doRefresh()
      }

      message.success(t('data.save_success'))
    } catch (e: unknown) {
      // 中途失败强制刷新（照抄 Vue：部分已应用时回读真实数据）
      if (hasAppliedChanges) {
        try { await doRefresh() } catch { /* ignore */ }
      }
      message.error(t('data.save_fail', { error: formatInsertError(e) }))
    } finally {
      setSaving(false)
    }
  }

  function findInsertedRow(payload: Record<string, unknown>) {
    return rowsRef.current.find((row) =>
      Object.entries(payload).every(([field, value]) => JSON.stringify(row[field] ?? null) === JSON.stringify(value ?? null)),
    ) || null
  }

  async function handleRecordInserted(payload?: Record<string, unknown>) {
    setShowInsertDialog(false)
    await doRefresh()
    if (!payload || Object.keys(payload).length === 0) return

    const matchedRow = findInsertedRow(payload)
    if (!matchedRow) return

    const field = Object.keys(payload)[0]
    selectViewerCell(matchedRow.__rowIndex, field, field)
  }

  async function handleExport(format: string) {
    try {
      const sql = `SELECT * FROM ${tableRef()}${filterConditionRef.current ? ' WHERE ' + filterConditionRef.current : ''}`
      const path = await save({
        defaultPath: `${latestRef.current.table}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      })
      if (!path) return

      const results = await queryApi.executeQuery(latestRef.current.connectionId, sql, latestRef.current.database)
      const data: QueryResult = results[0] || { columns: [], rows: [], affected_rows: 0, execution_time_ms: 0, messages: [] }

      if (format === 'csv') {
        await exportApi.toCsv(data, path)
      } else if (format === 'json') {
        await exportApi.toJson(data, path)
      } else if (format === 'sql') {
        await exportApi.toSql(data, latestRef.current.table, path)
      } else {
        throw new Error(`Unsupported export format: ${format}`)
      }

      message.success(t('data.export_success', { path }))
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  // 目标表/连接变化：重置结构缓存并重载（对等 Vue watch immediate）
  useEffect(() => {
    primaryKeysRef.current = []
    tableColumnsRef.current = []
    setFilterCondition('')
    filterConditionRef.current = ''
    void doRefresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, database, schema, table, isReadOnly])

  return (
    <div className={styles.tableDataGrid}>
      <div className={`panel-toolbar panel-toolbar--strong-border ${styles.gridToolbar}`}>
        <Space>
          <Space.Compact>
            <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
              {t('common.refresh')}
            </Button>
            <Button icon={<PlusOutlined />} disabled={isReadOnly} onClick={() => void addRow()}>
              {t('data.add_inline')}
            </Button>
            <Button icon={<FormOutlined />} disabled={isReadOnly} onClick={() => setShowInsertDialog(true)}>
              {t('data.add_form')}
            </Button>
            <Button
              icon={<DeleteOutlined />}
              danger
              disabled={isReadOnly || selectedRowIndexes.length === 0}
              onClick={deleteSelected}
            >
              {t('common.delete')}
            </Button>
          </Space.Compact>

          <Divider type="vertical" />

          {hasChanges && (
            <>
              <Space.Compact>
                <Button type="primary" onClick={submitChanges} loading={saving} disabled={isReadOnly}>
                  {t('data.save_changes', { n: changeCount })}
                </Button>
                <Button onClick={discardChanges}>
                  {t('data.discard_changes')}
                </Button>
              </Space.Compact>
              <Divider type="vertical" />
            </>
          )}

          <Button icon={<FilterOutlined />} onClick={() => setShowFilterDialog(true)}>
            {t('data.filter')}
          </Button>
          <Button icon={<UploadOutlined />} disabled={isReadOnly} onClick={() => setShowImportDialog(true)}>
            {t('data.import')}
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'csv', label: t('data.export_csv') },
                { key: 'json', label: t('data.export_json') },
                { key: 'sql', label: t('data.export_sql') },
              ],
              onClick: ({ key }) => void handleExport(String(key)),
            }}
          >
            <Button icon={<ExportOutlined />}>{t('data.export')}</Button>
          </Dropdown>
        </Space>

        <div className={styles.toolbarRight}>
          {isReadOnly && <Tag color="gold">{t('data.read_only_mode')}</Tag>}
          {deletedRowCount > 0 && <Tag color="red">{t('data.pending_delete_count', { n: deletedRowCount })}</Tag>}
          <div className={`text-caption ${styles.dataInfo}`}>
            {t('editor.loaded_rows', { n: rows.length })}
            {loading ? (
              <span className={styles.loadingText}>
                <Spin size="small" className={styles.loadingSpinner} /> {t('common.loading')}
              </span>
            ) : (
              !hasMore && <span className={`text-subtle ${styles.endText}`}> {t('data.loaded_all')}</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.gridWrapper}>
        <Suspense fallback={null}>
          <DataEditGrid
            columns={visibleColumns}
            rows={rows}
            readOnly={isReadOnly}
            loading={loading && rows.length === 0}
            getCellVisual={getCellVisual}
            onCellEdited={handleCellEdited}
            onCellClick={handleCellClick}
            onSelectionChanged={setSelectedRowIndexes}
            onReachBottom={handleGridReachBottom}
            refreshToken={editState.version}
            deselectToken={deselectToken}
          />
        </Suspense>
      </div>

      <AntModal
        open={showFilterDialog}
        title={t('data.data_filter')}
        onOk={applyFilter}
        onCancel={() => setShowFilterDialog(false)}
      >
        <Form layout="vertical">
          <Form.Item label={t('data.where_condition')}>
            <Input.TextArea
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              rows={4}
              placeholder={t('data.filter_placeholder')}
            />
          </Form.Item>
        </Form>
      </AntModal>

      <AntModal
        open={showPreviewDialog}
        title={t('data.change_preview')}
        okText={t('data.confirm_execute')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        width="760px"
        onOk={() => void confirmSubmitChanges()}
        onCancel={resetPreviewState}
      >
        <div className={styles.previewSummary}>
          <Tag color="green">{t('data.preview_insert_count', { n: previewPlanRef.current?.inserts.length || 0 })}</Tag>
          <Tag color="gold">{t('data.preview_update_count', { n: previewPlanRef.current?.updates.length || 0 })}</Tag>
          <Tag color="red">{t('data.preview_delete_count', { n: previewPlanRef.current?.deletes.length || 0 })}</Tag>
        </div>
        <div className={styles.previewHint}>{t('data.preview_hint')}</div>
        <Input.TextArea value={previewSql} rows={18} readOnly className={styles.previewSql} />
      </AntModal>

      <Suspense fallback={null}>
        <InsertRecordDialog
          open={showInsertDialog}
          connectionId={connectionId}
          database={database}
          table={table}
          schema={schema}
          onClose={() => setShowInsertDialog(false)}
          onInserted={(payload) => void handleRecordInserted(payload)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ImportDataDialog
          open={showImportDialog}
          connectionId={connectionId}
          database={database}
          table={table}
          schema={schema}
          onClose={() => setShowImportDialog(false)}
          onImported={() => { setShowImportDialog(false); void doRefresh() }}
        />
      </Suspense>
    </div>
  )
}
