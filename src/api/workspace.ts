import { invoke } from '@tauri-apps/api/core'
import type { ScriptInfo } from '@/types/database'

/** 后端 session 的原始格式（snake_case 字段） */
export interface RawSessionTabState {
  key: string
  title: string
  type: string
  connection_id?: string
  database?: string
  schema?: string
  table?: string
  content?: string
  file_path?: string
  read_only?: boolean
}

export interface RawSessionState {
  open_tabs: RawSessionTabState[]
  active_tab_key: string
}

export const workspaceApi = {
  /**
   * 保存当前工作区会话
   */
  async saveSession(state: RawSessionState): Promise<void> {
    return invoke('save_session', { state })
  },

  /**
   * 加载上次工作区会话
   */
  async loadSession(): Promise<RawSessionState | null> {
    return invoke<RawSessionState | null>('load_session')
  },

  /**
   * 列出数据库相关的脚本文件
   */
  async listDbScripts(connectionId: string, database: string): Promise<ScriptInfo[]> {
    return invoke<ScriptInfo[]>('list_db_scripts', { connectionId, database })
  },

  /**
   * 创建新的数据库脚本文件
   */
  async createDbScript(connectionId: string, database: string, content: string): Promise<ScriptInfo> {
    return invoke<ScriptInfo>('create_db_script', { connectionId, database, content })
  }
}
