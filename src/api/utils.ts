import { invoke } from '@tauri-apps/api/core'

export interface SystemFont {
  family: string
  is_monospace: boolean
}

export interface SavedFileInfo {
  path: string
  title: string
}

export interface AppInfo {
  app_name: string
  version: string
  repository_url: string
  git_commit?: string | null
  git_short_commit?: string | null
  git_branch?: string | null
  git_commit_date?: string | null
  build_time?: string | null
  profile: string
  os: string
  arch: string
}

export interface SaveFileAsPayload {
  path: string
  content: string
}

export const SQL_FILE_FILTERS = [{ name: 'SQL', extensions: ['sql'] }]

export const utilsApi = {
  /**
   * 获取应用信息
   */
  async getAppInfo(): Promise<AppInfo> {
    return invoke<AppInfo>('get_app_info')
  },

  /**
   * 读取文件内容
   */
  async readFile(path: string): Promise<string> {
    return invoke<string>('read_file', { path })
  },

  /**
   * 写入文件内容
   */
  async writeFile(path: string, content: string): Promise<void> {
    return invoke('write_file', { path, content })
  },

  /**
   * 保存到新文件
   */
  async saveFileAs(payload: SaveFileAsPayload): Promise<SavedFileInfo> {
    return invoke<SavedFileInfo>('save_file_as', { ...payload })
  },

  /**
   * 更新运行时日志等级
   */
  async setLogLevel(level: string): Promise<string> {
    return invoke<string>('set_log_level', { level })
  },

  /**
   * 获取系统已安装的字体列表
   */
  async getSystemFonts(): Promise<SystemFont[]> {
    return invoke<SystemFont[]>('list_system_fonts')
  },

  /**
   * 在系统默认浏览器中打开外部链接
   */
  async openExternalUrl(url: string): Promise<void> {
    return invoke('open_external_url', { url })
  },

  /**
   * 在文件管理器中打开路径
   */
  async openInFileManager(path: string): Promise<void> {
    return invoke('open_in_file_manager', { path })
  }
}
