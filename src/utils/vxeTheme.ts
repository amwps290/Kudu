let appliedTheme: 'light' | 'dark' | null = null

export async function applyVxeTheme(theme: 'light' | 'dark') {
  if (appliedTheme === theme) return
  const { VxeUI } = await import('@/plugins/vxe')
  VxeUI.setTheme(theme)
  appliedTheme = theme
}
