export enum TabType {
  Data = 'data',
  Design = 'design',
  Query = 'query',
  Redis = 'redis',
  Compare = 'compare',
  Builder = 'builder',
  Settings = 'settings'
}

export interface TabState {
  key: string
  title: string
  type: TabType
  connectionId?: string
  database?: string
  schema?: string
  table?: string
  content?: string
  filePath?: string
  readOnly?: boolean
  dirty?: boolean
  isUntitled?: boolean
}

export interface SessionState {
  open_tabs: TabState[]
  active_tab_key: string
}
