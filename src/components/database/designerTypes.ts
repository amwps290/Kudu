import type { ColumnInfo, ForeignKeyInfo, IndexInfo } from '@/types/database'

/** 设计器扩展类型（对等 Vue 版 TableDesigner 内的 Designer* 接口） */

export interface DesignerColumn extends ColumnInfo {
  length?: number
  _modified: boolean
  _isNew: boolean
  _originalName?: string
  _createdOrder?: number
}

export interface DesignerIndex extends IndexInfo {
  _isNew: boolean
}

export interface DesignerForeignKey extends ForeignKeyInfo {
  _isNew: boolean
}

export interface DesignerChange {
  type: string
  data: any
}
