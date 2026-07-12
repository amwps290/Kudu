import { create } from 'zustand'
import { storage } from '@/utils/storage'
import { utilsApi } from '@/api'
import { setLocale, resolveInitialLanguage } from '../i18n'
import type {
  Theme,
  ThemeMode,
  Language,
  LineNumbersMode,
  LogLevel,
  InterfaceSettings,
  EditorSettings,
  DatabaseSettings,
} from '@/types/settings'

/**
 * 应用设置 store（Zustand）。
 * 与 Pinia 版 stores/app.ts 保持同名成员与相同持久化行为：
 * Pinia 版的 watch 持久化在这里改为「setter 内同步执行」，时序更可控。
 */

// 默认值与 Pinia 版完全一致
const DEFAULT_INTERFACE_SETTINGS: InterfaceSettings = {
  fontFamily: `Inter, "SF Pro Display", "Segoe UI", sans-serif`,
}

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 14,
  minimap: false,
  lineNumbers: 'on',
  fontFamily: `"JetBrains Mono", "Fira Code", "Cascadia Code", monospace`,
}

const DEFAULT_DATABASE_SETTINGS: DatabaseSettings = {
  mysqlCharset: 'utf8mb4',
  mysqlInitSql: '',
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface AppStoreState {
  themeMode: ThemeMode
  systemTheme: Theme
  language: Language
  logLevel: LogLevel
  sidebarCollapsed: boolean
  interfaceSettings: InterfaceSettings
  editorSettings: EditorSettings
  databaseSettings: DatabaseSettings

  setThemeMode(mode: ThemeMode): void
  cycleThemeMode(): void
  setLanguage(lang: Language): void
  toggleLanguage(): void
  setLogLevel(level: LogLevel): void
  setSidebarCollapsed(collapsed: boolean): void
  toggleSidebar(): void
  setInterfaceFontFamily(fontFamily: string): void
  setEditorFontSize(fontSize: number): void
  setEditorMinimap(enabled: boolean): void
  setEditorLineNumbers(mode: LineNumbersMode): void
  setEditorFontFamily(fontFamily: string): void
  setMysqlCharset(charset: string): void
  setMysqlInitSql(sql: string): void
}

export const useAppStore = create<AppStoreState>()((set, get) => {
  const patchInterfaceSettings = (patch: Partial<InterfaceSettings>) => {
    const interfaceSettings = { ...get().interfaceSettings, ...patch }
    set({ interfaceSettings })
    storage.set('interface_settings', interfaceSettings)
  }

  const patchEditorSettings = (patch: Partial<EditorSettings>) => {
    const editorSettings = { ...get().editorSettings, ...patch }
    set({ editorSettings })
    storage.set('editor_settings', editorSettings)
  }

  const patchDatabaseSettings = (patch: Partial<DatabaseSettings>) => {
    const databaseSettings = { ...get().databaseSettings, ...patch }
    set({ databaseSettings })
    storage.set('database_settings', databaseSettings)
  }

  return {
    themeMode: storage.get('theme') || 'system',
    systemTheme: getSystemTheme(),
    language: resolveInitialLanguage(),
    logLevel: storage.get('log_level') || 'info',
    sidebarCollapsed: storage.get('sidebar_collapsed') || false,
    interfaceSettings: { ...DEFAULT_INTERFACE_SETTINGS, ...(storage.get('interface_settings') || {}) },
    editorSettings: { ...DEFAULT_EDITOR_SETTINGS, ...(storage.get('editor_settings') || {}) },
    databaseSettings: { ...DEFAULT_DATABASE_SETTINGS, ...(storage.get('database_settings') || {}) },

    setThemeMode(mode) {
      set({ themeMode: mode })
      storage.set('theme', mode)
    },

    cycleThemeMode() {
      const modes: ThemeMode[] = ['light', 'dark', 'system']
      const nextIndex = (modes.indexOf(get().themeMode) + 1) % modes.length
      get().setThemeMode(modes[nextIndex])
    },

    setLanguage(lang) {
      set({ language: lang })
      // setLocale 负责持久化（裸字符串写 localStorage.language）并切换 i18next
      setLocale(lang)
    },

    toggleLanguage() {
      get().setLanguage(get().language === 'zh-CN' ? 'en-US' : 'zh-CN')
    },

    setLogLevel(level) {
      set({ logLevel: level })
      storage.set('log_level', level)
      void utilsApi.setLogLevel(level).catch((error) => {
        console.error('同步日志等级失败:', error)
      })
    },

    setSidebarCollapsed(collapsed) {
      set({ sidebarCollapsed: collapsed })
      storage.set('sidebar_collapsed', collapsed)
    },

    toggleSidebar() {
      get().setSidebarCollapsed(!get().sidebarCollapsed)
    },

    setInterfaceFontFamily(fontFamily) {
      patchInterfaceSettings({ fontFamily })
    },

    setEditorFontSize(fontSize) {
      patchEditorSettings({ fontSize })
    },

    setEditorMinimap(enabled) {
      patchEditorSettings({ minimap: enabled })
    },

    setEditorLineNumbers(mode) {
      patchEditorSettings({ lineNumbers: mode })
    },

    setEditorFontFamily(fontFamily) {
      patchEditorSettings({ fontFamily })
    },

    setMysqlCharset(charset) {
      patchDatabaseSettings({ mysqlCharset: charset })
    },

    setMysqlInitSql(sql) {
      patchDatabaseSettings({ mysqlInitSql: sql })
    },
  }
})

/** 实际生效主题（Pinia 版的 theme computed 对等物） */
export const selectTheme = (state: Pick<AppStoreState, 'themeMode' | 'systemTheme'>): Theme =>
  state.themeMode === 'system' ? state.systemTheme : state.themeMode

export function useAppTheme(): Theme {
  return useAppStore(selectTheme)
}

// 监听系统主题变化（对等 Pinia 版的模块级 matchMedia 监听）
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', (event) => {
    useAppStore.setState({ systemTheme: event.matches ? 'dark' : 'light' })
  })
}

// 启动时把日志等级同步给后端（对等 Pinia 版 watch(logLevel, { immediate: true })）
void utilsApi.setLogLevel(useAppStore.getState().logLevel).catch((error) => {
  console.error('同步日志等级失败:', error)
})
