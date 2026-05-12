import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import './style.css'
import { logStartupStage, createStartupTimer } from './utils/startupProfiler'

// 引入 vxe-table 高性能表格库
import VxeTable from 'vxe-table'
import 'vxe-table/lib/style.css'
import VxeUI from 'vxe-pc-ui'
import 'vxe-pc-ui/lib/style.css'

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
app.use(VxeUI)
app.use(VxeTable)

app.mount('#app')
void logStartupStage('app mounted')
void finishBootstrap()
