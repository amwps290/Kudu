import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import './style.css'
import { logStartupStage, createStartupTimer } from './utils/startupProfiler'
import { message } from '@/ui/antd'
import { setErrorNotifier } from './utils/errorHandler'
import { setAutoReconnectStoreProvider } from './utils/autoReconnect'
import { useConnectionStore } from './stores/connection'


// 设置 Monaco Editor 的 Worker 配置
(window as any).MonacoEnvironment = {
  getWorkerUrl: function (_moduleId: string, label: string) {
    if (label === 'json') return './monaco-editor/esm/vs/language/json/json.worker.js'
    if (label === 'css' || label === 'scss' || label === 'less') return './monaco-editor/esm/vs/language/css/css.worker.js'
    if (label === 'html' || label === 'handlebars' || label === 'razor') return './monaco-editor/esm/vs/language/html/html.worker.js'
    if (label === 'typescript' || label === 'javascript') return './monaco-editor/esm/vs/language/typescript/ts.worker.js'
    return './monaco-editor/esm/vs/editor/editor.worker.js'
  }
}

void logStartupStage('main.ts imports ready')
const finishBootstrap = createStartupTimer('frontend bootstrap')

const app = createApp(App)
const pinia = createPinia()
void logStartupStage('vue app created')

// 关键：必须在所有可能用到 Store 的插件之前安装 Pinia
app.use(pinia)
app.use(router)
app.use(i18n)

// 注入共享层的宿主实现（Vue 侧）：错误提示走 antdv message，
// 自动重连的 store 访问包装 Pinia connection store（调用时才求值，Pinia 已激活）
setErrorNotifier((text) => { message.error(text) })
setAutoReconnectStoreProvider(() => {
  const store = useConnectionStore()
  return {
    getConnections: () => store.connections,
    getConnectionOverrides: (config) => store.getConnectionOverrides(config),
    updateConnectionStatus: (id, status) => store.updateConnectionStatus(id, status),
  }
})

app.mount('#app')
void logStartupStage('app mounted')
void finishBootstrap()
