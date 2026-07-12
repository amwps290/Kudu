import type { EditorSettings, InterfaceSettings, ThemeMode, Language, DatabaseSettings, LogLevel } from '@/types/settings'
import type { RightPanelSettings } from '@/types/rightPanel'

type StorageKey = 'theme' | 'language' | 'log_level' | 'sidebar_collapsed' | 'sql_history' | 'editor_settings' | 'interface_settings' | 'database_settings' | 'right_panel_settings'

interface StorageSchema {
  theme: ThemeMode
  language: Language
  log_level: LogLevel
  sidebar_collapsed: boolean
  sql_history: any[]
  editor_settings: EditorSettings
  interface_settings: InterfaceSettings
  database_settings: DatabaseSettings
  right_panel_settings: RightPanelSettings
}

/**
 * 类型安全的 LocalStorage 封装
 */
class TypedStorage {
  get<K extends StorageKey>(key: K): StorageSchema[K] | null {
    const value = localStorage.getItem(key)
    if (value === null) return null

    try {
      // 尝试解析 JSON
      return JSON.parse(value) as StorageSchema[K]
    } catch {
      // 如果不是有效的 JSON，直接作为字符串返回（适用于 theme, language 等）
      return value as unknown as StorageSchema[K]
    }
  }

  set<K extends StorageKey>(key: K, value: StorageSchema[K]): void {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, serialized)
  }

  remove(key: StorageKey): void {
    localStorage.removeItem(key)
  }

  clear(): void {
    localStorage.clear()
  }
}

export const storage = new TypedStorage()
