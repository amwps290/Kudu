/**
 * 应用设置相关类型（框架无关层）。
 * 从 stores/app.ts 抽出，供 utils/storage 等共享代码与 React 侧复用；
 * stores/app.ts 对这些类型做了 re-export，既有导入路径不受影响。
 */
export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'system'
export type Language = 'zh-CN' | 'en-US'
export type LineNumbersMode = 'on' | 'off'
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

export interface InterfaceSettings {
  fontFamily: string
}

export interface EditorSettings {
  fontSize: number
  minimap: boolean
  lineNumbers: LineNumbersMode
  fontFamily: string
}

export interface DatabaseSettings {
  mysqlCharset: string
  mysqlInitSql: string
}
