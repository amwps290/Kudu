import { create } from 'zustand'
import { workspaceApi } from '@/api/workspace'
import { withErrorHandler } from '@/utils/errorHandler'
import type { TabState } from '@/types/workspace'
import i18next from '../i18n'
import { fromRawSessionState, toRawSessionState } from './workspaceSession'

export type { TabState }

/**
 * 工作区会话 store（Zustand）。与 Pinia 版 stores/workspace.ts 同名成员逐一对齐：
 * isRestoring / saveSession / loadSession。
 * toRaw/fromRaw 转换在 ./workspaceSession（纯函数，含单测）。
 *
 * isRestoring 双重防回写（合约 2.3-7）：
 * 生命周期 hook 在「调度」时检查一次，本 store 的 saveSession 在「落盘」时再检查一次。
 */

interface WorkspaceStoreState {
  isRestoring: boolean
  setIsRestoring(value: boolean): void
  saveSession(tabs: TabState[], activeKey: string): Promise<void>
  loadSession(): Promise<{ open_tabs: TabState[], active_tab_key: string } | null>
}

export const useWorkspaceStore = create<WorkspaceStoreState>()((set, get) => ({
  isRestoring: false,

  setIsRestoring(value) {
    set({ isRestoring: value })
  },

  async saveSession(tabs, activeKey) {
    if (get().isRestoring) return
    await workspaceApi.saveSession(toRawSessionState(tabs, activeKey))
  },

  async loadSession() {
    const result = await withErrorHandler(async () => {
      const session = await workspaceApi.loadSession()
      if (!session) return null
      return fromRawSessionState(session, () => i18next.t('common.settings'))
    }, { messagePrefix: '加载工作区会话失败' })

    return result || null
  },
}))
