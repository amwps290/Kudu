import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  AllCommunityModule,
  ModuleRegistry,
  type BodyScrollEvent,
  type CellClassParams,
  type CellClickedEvent,
  type CellValueChangedEvent,
  type ColDef,
  type EditableCallbackParams,
  type GridApi,
  type GridReadyEvent,
  type SelectionChangedEvent,
} from 'ag-grid-community'
import { kuduGridTheme } from '../grid/agGridTheme'
import '../grid/grid.css'

ModuleRegistry.registerModules([AllCommunityModule])

/**
 * 表数据编辑网格（Slice 17；D7 特性面：checkbox 列固定左侧、双击 cell 编辑（input）、
 * 列拖拽重排、cell 三态样式（modified 黄/new 蓝/pending-delete 红）、触底加载）。
 *
 * 行数据保持纯净（仅 __rowIndex 身份字段），编辑标记在父组件的独立状态层，
 * 经 getCellVisual 回调查询；父组件状态变化时递增 refreshToken 触发 refreshCells。
 */

export const DATA_GRID_ROW_HEIGHT = 32

export type CellVisualState = 'pending-delete' | 'new' | 'modified' | null

export interface DataEditGridProps {
  columns: string[]
  /** 行对象须含 __rowIndex 身份字段 */
  rows: Array<Record<string, unknown>>
  readOnly: boolean
  loading?: boolean
  /** 编辑状态查询（父组件经 ref 提供最新值） */
  getCellVisual: (rowIndex: number, field: string) => CellVisualState
  onCellEdited: (rowIndex: number, field: string, newValue: unknown) => void
  onCellClick: (payload: { rowIndex: number; field: string; title: string }) => void
  onSelectionChanged: (rowIndexes: number[]) => void
  onReachBottom: () => void
  /** 编辑状态版本号：变化时强制重绘单元格样式 */
  refreshToken: number
  /** 版本号变化时清空勾选（父组件删除/丢弃/刷新后调用） */
  deselectToken: number
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return value === null ? 'NULL' : ''
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}

export default function DataEditGrid({
  columns, rows, readOnly, loading = false,
  getCellVisual, onCellEdited, onCellClick, onSelectionChanged, onReachBottom,
  refreshToken, deselectToken,
}: DataEditGridProps) {
  const apiRef = useRef<GridApi | null>(null)

  const latestRef = useRef({ readOnly, getCellVisual, onCellEdited, onCellClick, onSelectionChanged, onReachBottom })
  latestRef.current = { readOnly, getCellVisual, onCellEdited, onCellClick, onSelectionChanged, onReachBottom }

  const rowIndexOf = (data: unknown) => Number((data as { __rowIndex?: unknown })?.__rowIndex ?? -1)

  const columnDefs = useMemo<ColDef[]>(() => columns.map((col) => ({
    field: col,
    headerName: col,
    minWidth: 120,
    valueFormatter: (p) => formatCellValue(p.value),
    editable: (p: EditableCallbackParams) => {
      if (latestRef.current.readOnly) return false
      return latestRef.current.getCellVisual(rowIndexOf(p.data), col) !== 'pending-delete'
    },
    cellClassRules: {
      'data-grid-cell-pending-delete': (p: CellClassParams) => latestRef.current.getCellVisual(rowIndexOf(p.data), col) === 'pending-delete',
      'data-grid-cell-new-row': (p: CellClassParams) => latestRef.current.getCellVisual(rowIndexOf(p.data), col) === 'new',
      'data-grid-cell-modified': (p: CellClassParams) => latestRef.current.getCellVisual(rowIndexOf(p.data), col) === 'modified',
      'result-grid-null-cell': (p: CellClassParams) => p.value === null,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [columns])

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    sortable: false, // Vue 版数据网格无排序（已知业务问题 3，保持现状）
    suppressHeaderMenuButton: true,
  }), [])

  const handleGridReady = useCallback((e: GridReadyEvent) => {
    apiRef.current = e.api
  }, [])

  // 编辑状态变化 → 重绘单元格样式
  useEffect(() => {
    apiRef.current?.refreshCells({ force: true })
  }, [refreshToken])

  // 父组件请求清空勾选
  useEffect(() => {
    apiRef.current?.deselectAll()
  }, [deselectToken])

  const handleCellValueChanged = useCallback((e: CellValueChangedEvent) => {
    const field = e.colDef.field
    if (!field) return
    latestRef.current.onCellEdited(rowIndexOf(e.data), field, e.newValue)
  }, [])

  const handleCellClicked = useCallback((e: CellClickedEvent) => {
    const field = e.colDef.field
    if (!field) return
    latestRef.current.onCellClick({
      rowIndex: rowIndexOf(e.data),
      field: String(field),
      title: String(e.colDef.headerName || field),
    })
  }, [])

  const handleSelectionChanged = useCallback((e: SelectionChangedEvent) => {
    latestRef.current.onSelectionChanged(e.api.getSelectedRows().map((row) => rowIndexOf(row)))
  }, [])

  const handleBodyScroll = useCallback((e: BodyScrollEvent) => {
    if (e.direction !== 'vertical') return
    const range = e.api.getVerticalPixelRange()
    const totalHeight = e.api.getDisplayedRowCount() * DATA_GRID_ROW_HEIGHT
    if (totalHeight > 0 && range.bottom + 50 >= totalHeight) {
      latestRef.current.onReachBottom()
    }
  }, [])

  return (
    <AgGridReact
      theme={kuduGridTheme}
      columnDefs={columnDefs}
      rowData={rows}
      defaultColDef={defaultColDef}
      getRowId={(p) => String(rowIndexOf(p.data))}
      rowHeight={DATA_GRID_ROW_HEIGHT}
      headerHeight={DATA_GRID_ROW_HEIGHT}
      loading={loading}
      suppressFieldDotNotation
      enableCellTextSelection
      stopEditingWhenCellsLoseFocus
      rowSelection={{
        mode: 'multiRow',
        checkboxes: true,
        headerCheckbox: true,
        enableClickSelection: false,
      }}
      onGridReady={handleGridReady}
      onCellValueChanged={handleCellValueChanged}
      onCellClicked={handleCellClicked}
      onSelectionChanged={handleSelectionChanged}
      onBodyScroll={handleBodyScroll}
    />
  )
}
