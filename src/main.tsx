import '@ant-design/v5-patch-for-react-19'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import App from './App'
import './i18n'
import { message } from './ui/antd'
import { setErrorNotifier } from '@/utils/errorHandler'
import { setAutoReconnectStoreProvider } from '@/utils/autoReconnect'
import { useConnectionStore } from './stores/connectionStore'
import './styles/global.css'

// Monaco worker：Vite ?worker 标准方案（修复 Vue 版 main.ts 中指向不存在构建产物的
// getWorkerUrl 配置——迁移计划 9.5-1）。本项目仅加载 SQL/Shell 两种 basic-language，
// 无专属语言 worker，统一走 editor.worker（语法高亮/tokenize 不再占用主线程）。
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

// 共享层宿主注入（React 侧）：withErrorHandler 的错误提示走 antd message
setErrorNotifier((text) => {
  void message.error(text)
})

// 共享层宿主注入（React 侧）：autoReconnect 的 store 访问包装 Zustand getState
setAutoReconnectStoreProvider(() => ({
  getConnections: () => useConnectionStore.getState().connections,
  getConnectionOverrides: (config) => useConnectionStore.getState().getConnectionOverrides(config),
  updateConnectionStatus: (id, status) => useConnectionStore.getState().updateConnectionStatus(id, status),
}))

const container = document.getElementById('app')
if (!container) {
  throw new Error('挂载点 #app 不存在')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
