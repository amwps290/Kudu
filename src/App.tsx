import { ConfigProvider } from 'antd'
import { theme as antTheme } from './ui/antd'
import { darkThemeTokens, lightThemeTokens } from '@/theme/tokens'
import { useAppStore, useAppTheme } from './stores/appStore'
import { useThemeVariables } from './hooks/useThemeVariables'
import HomeView from './views/HomeView'

/**
 * 应用根组件：ConfigProvider 的算法与 token 映射照抄 Vue 版 App.vue 的 themeConfig；
 * CSS 变量注入由 useThemeVariables 承担。无路由（决策 D5），根即工作台。
 */
export default function App() {
  const interfaceFontFamily = useAppStore((s) => s.interfaceSettings.fontFamily)
  const theme = useAppTheme()
  const isDark = theme === 'dark'
  const activeTokens = isDark ? darkThemeTokens : lightThemeTokens

  useThemeVariables()

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          fontFamily: interfaceFontFamily,
          colorPrimary: activeTokens.primary,
          colorBgBase: activeTokens.appBg,
          colorBgContainer: activeTokens.surface,
          colorBgElevated: activeTokens.surfaceElevated,
          colorBorder: activeTokens.border,
          colorText: activeTokens.appText,
          colorTextSecondary: activeTokens.appTextSubtle,
          borderRadius: Number.parseInt(activeTokens.radiusMd, 10) || 10,
        },
      }}
    >
      <HomeView />
    </ConfigProvider>
  )
}
