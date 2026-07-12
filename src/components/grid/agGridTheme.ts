import { themeQuartz } from 'ag-grid-community'

/**
 * AG Grid 主题（D7/D10）：Quartz 基座 + 参数全部绑定现有 CSS 变量（theme/tokens.ts），
 * 亮暗主题随 useThemeVariables 写入的变量自动切换，无需按主题重建 theme 对象。
 * 若视觉对齐不可接受 → 触发 D7 备选（TanStack），影响面限 grid 组件内部。
 */
export const kuduGridTheme = themeQuartz.withParams({
  accentColor: 'var(--color-primary)',
  backgroundColor: 'var(--surface)',
  foregroundColor: 'var(--app-text)',
  borderColor: 'var(--border-color)',
  headerBackgroundColor: 'var(--surface-elevated)',
  headerTextColor: 'var(--app-text-muted)',
  oddRowBackgroundColor: 'var(--surface)',
  rowHoverColor: 'var(--surface-hover)',
  selectedRowBackgroundColor: 'var(--surface-active)',
  fontFamily: 'inherit',
  fontSize: 12,
  headerFontSize: 12,
  headerFontWeight: 600,
  wrapperBorder: true,
  wrapperBorderRadius: 0,
  rowBorder: true,
  columnBorder: true,
  cellHorizontalPadding: 10,
})
