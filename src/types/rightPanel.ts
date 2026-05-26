import type { Component } from 'vue'
import type { DbMessage } from '@/types/database'

export type RightPanelId = 'cell' | 'output' | 'object'

export type RightPanelObjectType =
  | 'connection'
  | 'database'
  | 'schema'
  | 'table'
  | 'view'
  | 'materialized-view'
  | 'column'
  | 'index'
  | 'foreign-key'
  | 'trigger'
  | 'rule'
  | 'function'
  | 'procedure'
  | 'aggregate'
  | 'sequence'
  | 'enum-type'
  | 'domain-type'
  | 'composite-type'
  | 'extension'
  | 'redis-key'
  | 'unknown'

export interface RightPanelContext {
  connectionId?: string
  connectionName?: string
  database?: string
  schema?: string
  objectType?: RightPanelObjectType
  objectName?: string
  tabKey?: string
  tabType?: string
  readOnly?: boolean
  metadata?: Record<string, unknown>
}

export interface RightPanelDefinition {
  id: RightPanelId
  titleKey: string
  component: Component
  order: number
  visibleWhen?: (context: RightPanelContext | null) => boolean
}

export interface RightPanelSettings {
  collapsed: boolean
  width: number
  activePanelId: RightPanelId
  openedPanelIds: RightPanelId[]
}

export interface RightPanelCellViewerState {
  columnTitle: string
  field: string
  rowLabel?: string
  value: string
  isNull: boolean
  readOnly: boolean
  objectName?: string
  onChange?: (value: string) => void
  onToggleNull?: (checked: boolean) => void
  onFormatJson?: () => void
  onCopyCell?: () => void
  onCopyRowJson?: () => void
  onCopyRowInsert?: () => void
}

export interface RightPanelDbMessage extends DbMessage {
  time: number
  connectionName?: string
  database?: string
}
