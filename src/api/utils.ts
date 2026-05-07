import { invoke } from '@tauri-apps/api/core'

export interface SystemFont {
  family: string
  is_monospace: boolean
}

export const utilsApi = {
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
   * 在文件管理器中打开路径
   */
  async openInFileManager(path: string): Promise<void> {
    return invoke('open_in_file_manager', { path })
  }
}
