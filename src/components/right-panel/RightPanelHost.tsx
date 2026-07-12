import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs } from 'antd'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { rightPanelRegistry } from './panelRegistry'
import type { RightPanelId } from '@/types/rightPanel'
import styles from './RightPanelHost.module.css'

/** 右侧面板宿主（对等 Vue 版 RightPanelHost.vue）：拖宽 280–560 clamp + 三面板 tabs */
export default function RightPanelHost() {
  const { t } = useTranslation()
  const collapsed = useRightPanelStore((s) => s.collapsed)
  const width = useRightPanelStore((s) => s.width)
  const activePanelId = useRightPanelStore((s) => s.activePanelId)
  const openedPanelIds = useRightPanelStore((s) => s.openedPanelIds)
  const context = useRightPanelStore((s) => s.context)
  const setActivePanel = useRightPanelStore((s) => s.setActivePanel)
  const setWidth = useRightPanelStore((s) => s.setWidth)

  if (collapsed) return null

  const visiblePanels = rightPanelRegistry
    .filter((panel) => openedPanelIds.includes(panel.id))
    .filter((panel) => (panel.visibleWhen ? panel.visibleWhen(context) : true))
    .sort((left, right) => left.order - right.order)

  const startResize = (event: React.PointerEvent) => {
    const startX = event.clientX
    const startWidth = useRightPanelStore.getState().width

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setWidth(startWidth + (startX - moveEvent.clientX))
    }
    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }

  const tabItems = visiblePanels.map((panel) => {
    const PanelComponent = panel.component
    return {
      key: panel.id,
      label: t(panel.titleKey),
      children: (
        <div className={styles.rightPanelContent}>
          <Suspense fallback={null}>
            <PanelComponent context={context} />
          </Suspense>
        </div>
      ),
    }
  })

  return (
    <div className={styles.rightPanelHost} style={{ width: `${width}px` }}>
      <div className={styles.rightPanelResizer} onPointerDown={startResize} />
      <div className={styles.rightPanelShell}>
        <div className={`panel-toolbar panel-toolbar--muted-border ${styles.rightPanelToolbar}`}>
          <span className="panel-toolbar__title">{t('right_panel.title')}</span>
        </div>
        <Tabs
          activeKey={activePanelId}
          size="small"
          className={styles.rightPanelTabs}
          onChange={(key) => setActivePanel(key as RightPanelId)}
          items={tabItems}
        />
      </div>
    </div>
  )
}
