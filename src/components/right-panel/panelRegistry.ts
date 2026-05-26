import { defineAsyncComponent } from 'vue'
import type { RightPanelDefinition } from '@/types/rightPanel'

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
