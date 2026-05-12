export interface AppThemeTokens {
  appBg: string
  appText: string
  appTextMuted: string
  appTextSubtle: string
  surface: string
  surfaceElevated: string
  surfaceMuted: string
  surfaceHover: string
  surfaceActive: string
  surfaceOverlay: string
  border: string
  borderStrong: string
  borderMuted: string
  primary: string
  primaryHoverBg: string
  primaryActiveBg: string
  primarySoftBg: string
  primaryBorder: string
  danger: string
  dangerHover: string
  dangerSoftBg: string
  dangerBorder: string
  warning: string
  warningSoftBg: string
  warningText: string
  success: string
  successSoftBg: string
  successText: string
  headerBg: string
  headerBorder: string
  sidebarBg: string
  tabBarBg: string
  tabActiveBg: string
  toolbarBg: string
  overlayBg: string
  overlayBorder: string
  scrollbarThumb: string
  scrollbarThumbHover: string
  shadowOverlay: string
  shadowSoft: string
  radiusSm: string
  radiusMd: string
}

export const lightThemeTokens: AppThemeTokens = {
  appBg: '#f5f7fa',
  appText: 'rgba(0, 0, 0, 0.88)',
  appTextMuted: 'rgba(0, 0, 0, 0.72)',
  appTextSubtle: 'rgba(0, 0, 0, 0.45)',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  surfaceMuted: '#fafbfc',
  surfaceHover: 'rgba(0, 0, 0, 0.05)',
  surfaceActive: 'rgba(22, 119, 255, 0.10)',
  surfaceOverlay: '#ffffff',
  border: '#e5e7eb',
  borderStrong: '#d9d9d9',
  borderMuted: '#f0f0f0',
  primary: '#1677ff',
  primaryHoverBg: 'rgba(22, 119, 255, 0.08)',
  primaryActiveBg: 'rgba(22, 119, 255, 0.14)',
  primarySoftBg: 'rgba(22, 119, 255, 0.04)',
  primaryBorder: 'rgba(22, 119, 255, 0.25)',
  danger: '#ff4d4f',
  dangerHover: '#ff7875',
  dangerSoftBg: 'rgba(255, 77, 79, 0.04)',
  dangerBorder: 'rgba(255, 77, 79, 0.12)',
  warning: '#faad14',
  warningSoftBg: 'rgba(250, 173, 20, 0.22)',
  warningText: '#856404',
  success: '#52c41a',
  successSoftBg: 'rgba(82, 196, 26, 0.10)',
  successText: '#52c41a',
  headerBg: '#ffffff',
  headerBorder: '#e5e7eb',
  sidebarBg: '#fafafa',
  tabBarBg: '#f8f9fb',
  tabActiveBg: '#ffffff',
  toolbarBg: '#fafbfc',
  overlayBg: '#ffffff',
  overlayBorder: '#d9d9d9',
  scrollbarThumb: '#d0d7de',
  scrollbarThumbHover: '#b8c0cc',
  shadowOverlay: '0 4px 14px rgba(15, 23, 42, 0.10)',
  shadowSoft: '0 1px 2px rgba(15, 23, 42, 0.06)',
  radiusSm: '6px',
  radiusMd: '10px',
}

export const darkThemeTokens: AppThemeTokens = {
  appBg: '#141414',
  appText: 'rgba(255, 255, 255, 0.88)',
  appTextMuted: 'rgba(255, 255, 255, 0.72)',
  appTextSubtle: 'rgba(255, 255, 255, 0.45)',
  surface: '#1f1f1f',
  surfaceElevated: '#252525',
  surfaceMuted: '#181818',
  surfaceHover: 'rgba(255, 255, 255, 0.08)',
  surfaceActive: 'rgba(23, 125, 220, 0.18)',
  surfaceOverlay: '#252525',
  border: '#303030',
  borderStrong: '#383838',
  borderMuted: '#2a2a2a',
  primary: '#177ddc',
  primaryHoverBg: 'rgba(23, 125, 220, 0.16)',
  primaryActiveBg: 'rgba(23, 125, 220, 0.22)',
  primarySoftBg: 'rgba(23, 125, 220, 0.08)',
  primaryBorder: 'rgba(23, 125, 220, 0.35)',
  danger: '#ff7875',
  dangerHover: '#ff9c9a',
  dangerSoftBg: 'rgba(255, 77, 79, 0.06)',
  dangerBorder: 'rgba(255, 77, 79, 0.18)',
  warning: '#faad14',
  warningSoftBg: 'rgba(250, 173, 20, 0.18)',
  warningText: '#ffd666',
  success: '#49aa19',
  successSoftBg: 'rgba(73, 170, 25, 0.16)',
  successText: '#73d13d',
  headerBg: '#1f1f1f',
  headerBorder: '#303030',
  sidebarBg: '#141414',
  tabBarBg: '#181818',
  tabActiveBg: '#1f1f1f',
  toolbarBg: '#1a1a1a',
  overlayBg: '#252525',
  overlayBorder: '#383838',
  scrollbarThumb: '#444444',
  scrollbarThumbHover: '#555555',
  shadowOverlay: '0 8px 24px rgba(0, 0, 0, 0.35)',
  shadowSoft: '0 1px 2px rgba(0, 0, 0, 0.24)',
  radiusSm: '6px',
  radiusMd: '10px',
}
