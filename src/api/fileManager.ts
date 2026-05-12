import { invoke } from '@tauri-apps/api/core'

export async function openInFileManager(path: string): Promise<void> {
  return invoke('open_in_file_manager', { path })
}
