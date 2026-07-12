import { useLayoutEffect } from 'react'
import { darkThemeTokens, lightThemeTokens, type AppThemeTokens } from '@/theme/tokens'
import { useAppStore, useAppTheme } from '../stores/appStore'

/**
 * 把主题 token 写入 :root 的 CSS 变量。
 * 「CSS 变量名 → token 字段」映射照抄 Vue 版 App.vue 的 setProperty 清单，
 * 全局样式（style.css 及各组件样式）依赖这些变量取色。
 */
const CSS_VAR_MAP: ReadonlyArray<readonly [string, keyof AppThemeTokens]> = [
  ['--app-bg', 'appBg'],
  ['--app-text', 'appText'],
  ['--app-text-muted', 'appTextMuted'],
  ['--app-text-subtle', 'appTextSubtle'],
  ['--surface', 'surface'],
  ['--surface-elevated', 'surfaceElevated'],
  ['--surface-muted', 'surfaceMuted'],
  ['--surface-hover', 'surfaceHover'],
  ['--surface-active', 'surfaceActive'],
  ['--surface-overlay', 'surfaceOverlay'],
  ['--border-color', 'border'],
  ['--border-color-strong', 'borderStrong'],
  ['--border-color-muted', 'borderMuted'],
  ['--color-primary', 'primary'],
  ['--color-primary-hover-bg', 'primaryHoverBg'],
  ['--color-primary-active-bg', 'primaryActiveBg'],
  ['--color-primary-soft-bg', 'primarySoftBg'],
  ['--color-primary-border', 'primaryBorder'],
  ['--color-danger', 'danger'],
  ['--color-danger-hover', 'dangerHover'],
  ['--color-danger-soft-bg', 'dangerSoftBg'],
  ['--color-danger-border', 'dangerBorder'],
  ['--color-warning', 'warning'],
  ['--color-warning-soft-bg', 'warningSoftBg'],
  ['--color-warning-text', 'warningText'],
  ['--color-success', 'success'],
  ['--color-success-soft-bg', 'successSoftBg'],
  ['--color-success-text', 'successText'],
  ['--header-bg', 'headerBg'],
  ['--header-border', 'headerBorder'],
  ['--sidebar-bg', 'sidebarBg'],
  ['--tabbar-bg', 'tabBarBg'],
  ['--tab-active-bg', 'tabActiveBg'],
  ['--toolbar-bg', 'toolbarBg'],
  ['--overlay-bg', 'overlayBg'],
  ['--overlay-border', 'overlayBorder'],
  ['--scrollbar-thumb', 'scrollbarThumb'],
  ['--scrollbar-thumb-hover', 'scrollbarThumbHover'],
  ['--shadow-overlay', 'shadowOverlay'],
  ['--shadow-soft', 'shadowSoft'],
  ['--swatch-ring', 'swatchRing'],
  ['--focus-ring-primary', 'focusRingPrimary'],
  ['--window-close-hover-bg', 'windowCloseHoverBg'],
  ['--color-on-danger', 'colorOnDanger'],
  ['--connection-color-1', 'connectionColor1'],
  ['--connection-color-2', 'connectionColor2'],
  ['--connection-color-3', 'connectionColor3'],
  ['--connection-color-4', 'connectionColor4'],
  ['--connection-color-5', 'connectionColor5'],
  ['--connection-color-6', 'connectionColor6'],
  ['--connection-color-7', 'connectionColor7'],
  ['--connection-color-8', 'connectionColor8'],
  ['--icon-color-blue', 'iconColorBlue'],
  ['--icon-color-orange', 'iconColorOrange'],
  ['--icon-color-yellow', 'iconColorYellow'],
  ['--icon-color-green', 'iconColorGreen'],
  ['--icon-color-teal', 'iconColorTeal'],
  ['--icon-color-purple', 'iconColorPurple'],
  ['--icon-color-pink', 'iconColorPink'],
  ['--icon-color-slate', 'iconColorSlate'],
  ['--icon-color-emerald', 'iconColorEmerald'],
  ['--icon-color-brown', 'iconColorBrown'],
  ['--icon-color-cyan', 'iconColorCyan'],
  ['--icon-color-gray', 'iconColorGray'],
  ['--icon-color-muted', 'iconColorMuted'],
  ['--indicator-ring-soft', 'indicatorRingSoft'],
  ['--brand-accent', 'brandAccent'],
  ['--brand-accent-soft-bg', 'brandAccentSoftBg'],
  ['--radius-sm', 'radiusSm'],
  ['--radius-md', 'radiusMd'],
]

export function useThemeVariables() {
  const theme = useAppTheme()
  const interfaceFontFamily = useAppStore((s) => s.interfaceSettings.fontFamily)
  const editorFontFamily = useAppStore((s) => s.editorSettings.fontFamily)

  useLayoutEffect(() => {
    const tokens: AppThemeTokens = theme === 'dark' ? darkThemeTokens : lightThemeTokens
    const root = document.documentElement
    for (const [cssVar, tokenKey] of CSS_VAR_MAP) {
      root.style.setProperty(cssVar, tokens[tokenKey])
    }
  }, [theme])

  // 界面字体：body/#app 通过 var(--app-font-family) 继承
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--app-font-family', interfaceFontFamily)
  }, [interfaceFontFamily])

  // 编辑器字体：Monaco 通过 CSS 兜底覆盖使用
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--editor-font-family', editorFontFamily)
  }, [editorFontFamily])
}
