import { useTranslation } from 'react-i18next'
import { DatabaseOutlined, LoadingOutlined, PartitionOutlined } from '@ant-design/icons'
import type { ConnectionStatus } from '@/types/database'
import type { SqlExecutionState } from '@/types/sqlExecution'
import styles from './AppStatusBar.module.css'

export interface AppStatusBarProps {
  connectionName: string
  databaseName: string
  schemaName: string
  readOnly: boolean
  connectionStatus: ConnectionStatus
  executionState: SqlExecutionState | null
  rightPanelCollapsed?: boolean
  onToggleRightPanel?: () => void
}

const STATUS_PILL_CLASS: Record<ConnectionStatus, string> = {
  connected: 'pillConnected',
  connecting: 'pillConnecting',
  disconnected: 'pillDisconnected',
  error: 'pillError',
}

export default function AppStatusBar({
  connectionName,
  databaseName,
  schemaName,
  readOnly,
  connectionStatus,
  executionState,
  rightPanelCollapsed = true,
  onToggleRightPanel,
}: AppStatusBarProps) {
  const { t } = useTranslation()

  const running = executionState?.status === 'running'
  const taskStatusLabel = (() => {
    const state = executionState
    if (!state || state.status === 'idle') return t('status_bar.idle')
    if (state.status === 'running') return state.summary || t('status_bar.running')
    if (state.status === 'success') return state.summary || t('status_bar.completed')
    if (state.status === 'partial_success') return state.summary || t('status_bar.completed_with_warnings')
    if (state.status === 'cancelled') return state.summary || t('status_bar.cancelled')
    return state.summary || t('status_bar.failed')
  })()

  return (
    <footer className={styles.statusBar}>
      {/* 左段：连接上下文（设计文档 §6.2） */}
      <div className={styles.segment}>
        <span className={`${styles.pill} ${styles[STATUS_PILL_CLASS[connectionStatus]]}`}>
          <span className={styles.pillDot} />
          <span className={styles.pillText}>{connectionName}</span>
        </span>
        <span className={styles.item} title={t('status_bar.database')}>
          <DatabaseOutlined className={styles.itemIcon} />
          {databaseName}
        </span>
        <span className={styles.item} title={t('status_bar.schema')}>
          <PartitionOutlined className={styles.itemIcon} />
          {schemaName}
        </span>
        {readOnly && (
          <span className={`${styles.pill} ${styles.pillReadonly}`}>{t('status_bar.read_only')}</span>
        )}
      </div>

      {/* 右段：执行反馈 + 面板开关 */}
      <div className={styles.segment}>
        <span className={styles.item}>
          {running && <LoadingOutlined className={styles.itemIcon} spin />}
          {taskStatusLabel}
        </span>
        <button
          type="button"
          className={`${styles.panelToggle} ${!rightPanelCollapsed ? styles.panelToggleActive : ''}`}
          title={rightPanelCollapsed ? t('right_panel.show') : t('right_panel.hide')}
          onClick={() => onToggleRightPanel?.()}
        >
          i
        </button>
      </div>
    </footer>
  )
}
