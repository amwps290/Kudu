import { useTranslation } from 'react-i18next'
import { Button } from 'antd'
import { useRightPanelStore } from '../../../stores/rightPanelStore'
import styles from './DatabaseOutputPanel.module.css'

/** 数据库消息面板（对等 Vue 版 DatabaseOutputPanel.vue）：NOTICE/WARNING 等，上限 500 */
export default function DatabaseOutputPanel() {
  const { t } = useTranslation()
  const dbMessages = useRightPanelStore((s) => s.dbMessages)
  const clearDbMessages = useRightPanelStore((s) => s.clearDbMessages)

  const severityTone = (severity?: string) => {
    const normalized = String(severity || '').toLowerCase()
    if (normalized.includes('error')) return 'error'
    if (normalized.includes('warn')) return 'warning'
    if (normalized.includes('notice')) return 'notice'
    if (normalized.includes('debug')) return 'debug'
    return 'info'
  }

  const formatTime = (value: number) => {
    const date = new Date(value)
    const h = date.getHours().toString().padStart(2, '0')
    const m = date.getMinutes().toString().padStart(2, '0')
    const s = date.getSeconds().toString().padStart(2, '0')
    const ms = date.getMilliseconds().toString().padStart(3, '0')
    return `${h}:${m}:${s}.${ms}`
  }

  const formatScope = (connectionName?: string, database?: string) =>
    [connectionName, database].filter(Boolean).join(' / ')

  return (
    <div className={styles.panelShell}>
      <div className={styles.panelHeader}>
        <div>
          <div className={styles.panelTitle}>{t('right_panel.output.title')}</div>
          <div className={styles.panelSubtitle}>{t('right_panel.output.subtitle', { count: dbMessages.length })}</div>
        </div>
        <Button size="small" type="text" disabled={dbMessages.length === 0} onClick={() => clearDbMessages()}>
          {t('common.clear')}
        </Button>
      </div>

      {dbMessages.length > 0 ? (
        <div className={styles.messageTableWrap}>
          <div className={styles.messageTable}>
            <div className={`${styles.messageRow} ${styles.messageRowHead}`}>
              <div>{t('right_panel.fields.time')}</div>
              <div>{t('right_panel.fields.level')}</div>
              <div>{t('right_panel.fields.scope')}</div>
              <div>{t('right_panel.fields.message')}</div>
            </div>
            {dbMessages.map((msg, index) => (
              <div key={index} className={styles.messageRow}>
                <div className={`${styles.messageCell} ${styles.messageCellMono}`}>{formatTime(msg.time)}</div>
                <div className={styles.messageCell}>
                  <span className={`${styles.severityPill} ${styles[`severityPill-${severityTone(msg.severity)}`]}`}>
                    {msg.severity || 'info'}
                  </span>
                </div>
                <div className={`${styles.messageCell} ${styles.messageCellScope}`}>{formatScope(msg.connectionName, msg.database)}</div>
                <div className={`${styles.messageCell} ${styles.messageCellText}`}>{msg.text}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.panelEmptyState} />
      )}
    </div>
  )
}
