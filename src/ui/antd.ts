/**
 * antd（React 版）桥接文件——与 Vue 版 src/ui/antd.ts 对应的统一替换点。
 * 业务代码一律从这里导入消息/弹窗/主题 API，不直接 import 'antd' 的这些命名，
 * 便于集中管理（如 React 19 patch、未来的 App.useApp 上下文化改造）。
 */
export { theme, Modal, message, Empty } from 'antd'
export type { FormInstance } from 'antd'
