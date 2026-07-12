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
  | 'unique-constraint'
  | 'check-constraint'
  | 'exclude-constraint'
  | 'trigger'
  | 'rule'
  | 'function'
  | 'procedure'
  | 'aggregate'
  | 'sequence'
  | 'enum-type'
  | 'enum-label'
  | 'domain-type'
  | 'domain-detail'
  | 'domain-constraint'
  | 'composite-type'
  | 'composite-field'
  | 'extension'
  | 'partition-key'
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
