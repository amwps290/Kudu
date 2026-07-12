import { lazy, type ComponentType } from 'react'
import type { RightPanelContext, RightPanelId } from '@/types/rightPanel'

/**
 * 面板注册定义（对等 Vue 版 panelRegistry.ts；`component: Component` → `ComponentType`）。
 * CellViewer/DatabaseOutput 自 store 取数据，不需要 context prop；
 * ObjectInfo 接收 context——统一声明为可选 context prop。
 */
export interface RightPanelDefinition {
  id: RightPanelId
  titleKey: string
  component: ComponentType<{ context: RightPanelContext | null }>
  order: number
  visibleWhen?: (context: RightPanelContext | null) => boolean
}

const CellViewerPanel = lazy(() => import('./panels/CellViewerPanel'))
const DatabaseOutputPanel = lazy(() => import('./panels/DatabaseOutputPanel'))
const ObjectInfoPanel = lazy(() => import('./panels/ObjectInfoPanel'))

export const rightPanelRegistry: RightPanelDefinition[] = [
  { id: 'cell', titleKey: 'right_panel.panels.cell', component: CellViewerPanel, order: 10 },
  { id: 'output', titleKey: 'right_panel.panels.output', component: DatabaseOutputPanel, order: 20 },
  { id: 'object', titleKey: 'right_panel.panels.object', component: ObjectInfoPanel, order: 30 },
]
