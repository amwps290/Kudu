import { useCallback, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  AllCommunityModule,
  ModuleRegistry,
  type BodyScrollEvent,
  type CellClickedEvent,
  type ColDef,
} from 'ag-grid-community'
import type { QueryResult } from '@/types/database'
import { kuduGridTheme } from './agGridTheme'
import './grid.css'

ModuleRegistry.registerModules([AllCommunityModule])

/**
 * 查询结果只读表格（D7：AG Grid Community）。
 * 对齐 Vue 版 VXE 结果表实际用到的特性面：纵向虚拟滚动 / 列宽拖拽 / 行 hover 与当前行 /
 * 固定行高 36 / NULL 灰字 / cell 点击上报（供 TSV 复制）/ 触底加载。
 * 区域选择/内建右键菜单/剪贴板等 Enterprise 能力本就未使用。
 */

export const RESULT_GRID_ROW_HEIGHT = 32

export interface ResultCellClickPayload {
  row: Record<string, unknown>
  rowIndex: number
  field: string
  title: string
}

interface ResultGridProps {
  result: QueryResult
  loading?: boolean
  onCellClick?: (payload: ResultCellClickPayload) => void
  /** 纵向滚动触底（距底 50px 内）；分页守卫由调用方负责 */
  onReachBottom?: () => void
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return value === null ? 'NULL' : ''
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}

export default function ResultGrid({ result, loading = false, onCellClick, onReachBottom }: ResultGridProps) {
  const onCellClickRef = useRef(onCellClick)
  onCellClickRef.current = onCellClick
  const onReachBottomRef = useRef(onReachBottom)
  onReachBottomRef.current = onReachBottom

  const columnDefs = useMemo<ColDef[]>(() => result.columns.map((col) => ({
    field: col,
    headerName: col,
    minWidth: 150,
    valueFormatter: (p) => formatCellValue(p.value),
    cellClassRules: {
      'result-grid-null-cell': (p) => p.value === null,
    },
  })), [result.columns])

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    sortable: false, // Vue 版结果表无排序（已知业务问题 3，保持现状）
    suppressHeaderMenuButton: true,
  }), [])

  const handleCellClicked = useCallback((e: CellClickedEvent) => {
    const field = e.colDef.field
    if (!field) return
    const row = (e.data ?? {}) as Record<string, unknown>
    onCellClickRef.current?.({
      row,
      rowIndex: Number((row as { __rowIndex?: unknown }).__rowIndex ?? -1),
      field: String(field),
      title: String(e.colDef.headerName || field),
    })
  }, [])

  const handleBodyScroll = useCallback((e: BodyScrollEvent) => {
    if (e.direction !== 'vertical') return
    const range = e.api.getVerticalPixelRange()
    const totalHeight = e.api.getDisplayedRowCount() * RESULT_GRID_ROW_HEIGHT
    if (totalHeight > 0 && range.bottom + 50 >= totalHeight) {
      onReachBottomRef.current?.()
    }
  }, [])

  return (
    <AgGridReact
      theme={kuduGridTheme}
      columnDefs={columnDefs}
      rowData={result.rows as Array<Record<string, unknown>>}
      defaultColDef={defaultColDef}
      rowHeight={RESULT_GRID_ROW_HEIGHT}
      headerHeight={RESULT_GRID_ROW_HEIGHT}
      loading={loading}
      suppressFieldDotNotation
      suppressCellFocus={false}
      enableCellTextSelection
      rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
      selectionColumnDef={undefined}
      onCellClicked={handleCellClicked}
      onBodyScroll={handleBodyScroll}
    />
  )
}
