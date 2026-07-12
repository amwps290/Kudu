import { defineAsyncComponent, type Component } from 'vue'
import type { RightPanelContext, RightPanelId } from '@/types/rightPanel'

/**
 * 面板注册定义。含 Vue 组件引用，因此放在组件层；
 * @/types/rightPanel 只保留框架无关的数据类型。
 */
export interface RightPanelDefinition {
  id: RightPanelId
  titleKey: string
  component: Component
  order: number
  visibleWhen?: (context: RightPanelContext | null) => boolean
}

const CellViewerPanel = defineAsyncComponent(() => import('@/components/right-panel/panels/CellViewerPanel.vue'))
const DatabaseOutputPanel = defineAsyncComponent(() => import('@/components/right-panel/panels/DatabaseOutputPanel.vue'))
const ObjectInfoPanel = defineAsyncComponent(() => import('@/components/right-panel/panels/ObjectInfoPanel.vue'))

export const rightPanelRegistry: RightPanelDefinition[] = [
  {
    id: 'cell',
    titleKey: 'right_panel.panels.cell',
    component: CellViewerPanel,
    order: 10,
  },
  {
    id: 'output',
    titleKey: 'right_panel.panels.output',
    component: DatabaseOutputPanel,
    order: 20,
  },
  {
    id: 'object',
    titleKey: 'right_panel.panels.object',
    component: ObjectInfoPanel,
    order: 30,
  },
]
