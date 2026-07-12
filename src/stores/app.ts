import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { setLocale } from '@/i18n'
import { storage } from '@/utils/storage'
import { utilsApi } from '@/api'
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

// 设置类型已抽至 @/types/settings（框架无关层）；此处 re-export 保持既有导入路径兼容
export type {
  Theme,
  ThemeMode,
  Language,
  LineNumbersMode,
  LogLevel,
  InterfaceSettings,
  EditorSettings,
  DatabaseSettings,
} from '@/types/settings'

export const useAppStore = defineStore('app', () => {
  const getSystemTheme = (): Theme => {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  // 用户选择的主题模式
  const themeMode = ref<ThemeMode>(storage.get('theme') || 'system')
  const systemTheme = ref<Theme>(getSystemTheme())
  const theme = computed<Theme>(() => themeMode.value === 'system' ? systemTheme.value : themeMode.value)
  
  // 语言
  const language = ref<Language>(storage.get('language') || 
    (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US'))
  const logLevel = ref<LogLevel>(storage.get('log_level') || 'info')

  // 侧边栏折叠状态
  const sidebarCollapsed = ref(storage.get('sidebar_collapsed') || false)

  // 编辑器设置
  const interfaceSettings = reactive<InterfaceSettings>({
    fontFamily: `Inter, "SF Pro Display", "Segoe UI", sans-serif`,
    ...(storage.get('interface_settings') || {}),
  })

  const editorSettings = reactive<EditorSettings>({
    fontSize: 14,
    minimap: false,
    lineNumbers: 'on',
    fontFamily: `"JetBrains Mono", "Fira Code", "Cascadia Code", monospace`,
    ...(storage.get('editor_settings') || {}),
  })

  const databaseSettings = reactive<DatabaseSettings>({
    mysqlCharset: 'utf8mb4',
    mysqlInitSql: '',
    ...(storage.get('database_settings') || {}),
  })

  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystemTheme = (event?: MediaQueryListEvent) => {
      const isDark = event?.matches ?? mediaQuery.matches
      systemTheme.value = isDark ? 'dark' : 'light'
    }
    syncSystemTheme()
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncSystemTheme)
    } else {
      mediaQuery.addListener(syncSystemTheme)
    }
  }

  // 监听主题模式变化并持久化
  watch(themeMode, (newThemeMode) => {
    storage.set('theme', newThemeMode)
  })

  // 监听语言变化并同步到 i18n 实例及持久化
  watch(language, (newLang) => {
    storage.set('language', newLang)
    setLocale(newLang)
  }, { immediate: true })

  watch(logLevel, async (newLevel) => {
    storage.set('log_level', newLevel)
    if (typeof window === 'undefined') return
    try {
      await utilsApi.setLogLevel(newLevel)
    } catch (error) {
      console.error('同步日志等级失败:', error)
    }
  }, { immediate: true })

  // 监听侧边栏状态
  watch(sidebarCollapsed, (newVal) => {
    storage.set('sidebar_collapsed', newVal)
  })

  watch(interfaceSettings, (newSettings) => {
    storage.set('interface_settings', { ...newSettings })
  }, { deep: true })

  watch(editorSettings, (newSettings) => {
    storage.set('editor_settings', { ...newSettings })
  }, { deep: true })

  watch(databaseSettings, (newSettings) => {
    storage.set('database_settings', { ...newSettings })
  }, { deep: true })

  function cycleThemeMode() {
    const modes: ThemeMode[] = ['light', 'dark', 'system']
    const nextIndex = (modes.indexOf(themeMode.value) + 1) % modes.length
    themeMode.value = modes[nextIndex]
  }

  function setThemeMode(newThemeMode: ThemeMode) {
    themeMode.value = newThemeMode
  }

  // 切换语言
  function toggleLanguage() {
    language.value = language.value === 'zh-CN' ? 'en-US' : 'zh-CN'
  }

  // 设置语言
  function setLanguage(newLang: Language) {
    language.value = newLang
  }

  function setLogLevel(newLevel: LogLevel) {
    logLevel.value = newLevel
  }

  // 切换侧边栏
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setEditorFontSize(fontSize: number) {
    editorSettings.fontSize = fontSize
  }

  function setEditorMinimap(enabled: boolean) {
    editorSettings.minimap = enabled
  }

  function setEditorLineNumbers(mode: LineNumbersMode) {
    editorSettings.lineNumbers = mode
  }

  function setInterfaceFontFamily(fontFamily: string) {
    interfaceSettings.fontFamily = fontFamily
  }

  function setEditorFontFamily(fontFamily: string) {
    editorSettings.fontFamily = fontFamily
  }

  function setMysqlCharset(charset: string) {
    databaseSettings.mysqlCharset = charset
  }

  function setMysqlInitSql(sql: string) {
    databaseSettings.mysqlInitSql = sql
  }

  return {
    theme,
    themeMode,
    systemTheme,
    language,
    logLevel,
    sidebarCollapsed,
    interfaceSettings,
    editorSettings,
    databaseSettings,
    cycleThemeMode,
    setThemeMode,
    toggleLanguage,
    setLanguage,
    setLogLevel,
    toggleSidebar,
    setInterfaceFontFamily,
    setEditorFontSize,
    setEditorMinimap,
    setEditorLineNumbers,
    setEditorFontFamily,
    setMysqlCharset,
    setMysqlInitSql,
  }
})
