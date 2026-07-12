import { useTranslation } from 'react-i18next'
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
  /** 右侧面板折叠态与切换（Slice 13 接入 rightPanelStore 前由父级传占位） */
  rightPanelCollapsed?: boolean
  onToggleRightPanel?: () => void
}

const STATUS_BADGE_CLASS: Record<ConnectionStatus, string> = {
  connected: 'statusBadgeConnected',
  connecting: 'statusBadgeConnecting',
  disconnected: 'statusBadgeDisconnected',
  error: 'statusBadgeError',
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

  const connectionStatusLabel = (() => {
    switch (connectionStatus) {
      case 'connected': return t('status_bar.connected')
      case 'connecting': return t('status_bar.connecting')
      case 'error': return t('status_bar.error')
      default: return t('status_bar.disconnected')
    }
  })()

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
      <div className={`${styles.statusGroup} ${styles.statusGroupLeft}`}>
        <span className={styles.statusItem}>
          <span className={styles.statusLabel}>{t('status_bar.connection')}</span>
          <span className={styles.statusValue}>{connectionName}</span>
        </span>
        <span className={styles.statusDivider} />
        <span className={styles.statusItem}>
          <span className={styles.statusLabel}>{t('status_bar.database')}</span>
          <span className={styles.statusValue}>{databaseName}</span>
        </span>
        <span className={styles.statusDivider} />
        <span className={styles.statusItem}>
          <span className={styles.statusLabel}>{t('status_bar.schema')}</span>
          <span className={styles.statusValue}>{schemaName}</span>
        </span>
        {readOnly && (
          <span className={`${styles.statusBadge} ${styles.statusBadgeReadonly}`}>
            {t('status_bar.read_only')}
          </span>
        )}
      </div>

      <div className={styles.statusGroup}>
        <button
          type="button"
          className={`${styles.statusToggle} ${styles.statusToggleIcon}`}
          title={rightPanelCollapsed ? t('right_panel.show') : t('right_panel.hide')}
          onClick={() => onToggleRightPanel?.()}
        >
          i
        </button>
        <span className={styles.statusDivider} />
        <span className={styles.statusItem}>
          <span className={styles.statusLabel}>{t('status_bar.connection_status')}</span>
          <span className={`${styles.statusBadge} ${styles[STATUS_BADGE_CLASS[connectionStatus]]}`}>
            {connectionStatusLabel}
          </span>
        </span>
        <span className={styles.statusDivider} />
        <span className={styles.statusItem}>
          <span className={styles.statusLabel}>{t('status_bar.task_status')}</span>
          <span className={styles.statusValue}>{taskStatusLabel}</span>
        </span>
      </div>
    </footer>
  )
}
