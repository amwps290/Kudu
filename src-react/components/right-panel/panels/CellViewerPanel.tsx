import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Empty, Input, Space, Tag } from 'antd'
import { useRightPanelStore } from '../../../stores/rightPanelStore'
import { getCellViewerActions } from '../../../stores/cellViewerRegistry'
import styles from './CellViewerPanel.module.css'

/**
 * 单元格查看器（对等 Vue 版 CellViewerPanel.vue）。
 * store 只存数据（cellViewer），操作经 cellViewerRegistry 按 ownerId 反查（4.4 注册表模式）。
 */
export default function CellViewerPanel() {
  const { t } = useTranslation()
  const viewer = useRightPanelStore((s) => s.cellViewer)

  if (!viewer) {
    return (
      <div className={styles.panelShell}>
        <Empty description={t('right_panel.cell_viewer.empty')} />
      </div>
    )
  }

  const actions = getCellViewerActions(viewer.ownerId)

  return (
    <div className={styles.panelShell}>
      <div className={`${styles.panelCard} ${styles.panelCardHeader}`}>
        <div>
          <div className={styles.panelEyebrow}>{viewer.objectName || t('right_panel.cell_viewer.default_target')}</div>
          <div className={styles.panelTitle}>{viewer.columnTitle}</div>
        </div>
        <Tag color={viewer.isNull ? 'default' : 'processing'}>{viewer.field}</Tag>
      </div>

      <div className={`${styles.panelCard} ${styles.panelCardActions}`}>
        <Space wrap size={[8, 8]}>
          <Button size="small" onClick={() => actions?.onFormatJson?.()}>{t('data.format_json')}</Button>
          <Button size="small" onClick={() => actions?.onCopyCell?.()}>{t('data.copy_content')}</Button>
          <Button size="small" onClick={() => actions?.onCopyRowJson?.()}>{t('data.copy_row_json')}</Button>
          <Button size="small" onClick={() => actions?.onCopyRowInsert?.()}>{t('data.copy_row_insert_sql')}</Button>
        </Space>
      </div>

      <div className={`${styles.panelCard} ${styles.panelCardEditor}`}>
        <div className={styles.editorToolbar}>
          <span className={styles.metaText}>{viewer.rowLabel || t('right_panel.cell_viewer.no_row_label')}</span>
          <Checkbox
            checked={viewer.isNull}
            disabled={viewer.readOnly}
            onChange={(e) => getCellViewerActions(viewer.ownerId)?.onToggleNull?.(e.target.checked)}
          >
            {t('data.set_null')}
          </Checkbox>
        </div>
        <Input.TextArea
          value={viewer.value}
          rows={18}
          readOnly={viewer.readOnly || viewer.isNull}
          className={styles.viewerTextarea}
          onChange={(e) => getCellViewerActions(viewer.ownerId)?.onChange?.(e.target.value)}
        />
      </div>
    </div>
  )
}
