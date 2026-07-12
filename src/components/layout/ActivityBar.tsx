import { useTranslation } from 'react-i18next'
import { DatabaseOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'
import { useAppStore } from '../../stores/appStore'
import styles from './ActivityBar.module.css'

export interface ActivityBarProps {
  onOpenSearch: () => void
  onOpenSettings: () => void
}

/** VS Code 式活动图标栏（设计文档 §6.1）。侧栏收起复用 sidebar_collapsed 合约。 */
export default function ActivityBar({ onOpenSearch, onOpenSettings }: ActivityBarProps) {
  const { t } = useTranslation()
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  return (
    <nav className={styles.activityBar}>
      <div className={styles.brandMark} title="Kudu">
        <img src="/kudu-mark.svg" alt="" className={styles.brandIcon} />
      </div>
      <Tooltip title={t('common.database')} placement="right">
        <button
          type="button"
          className={`${styles.actButton} ${!sidebarCollapsed ? styles.active : ''}`}
          onClick={toggleSidebar}
        >
          <DatabaseOutlined />
        </button>
      </Tooltip>
      <Tooltip title={t('common.search')} placement="right">
        <button type="button" className={styles.actButton} onClick={onOpenSearch}>
          <SearchOutlined />
        </button>
      </Tooltip>
      <div className={styles.spacer} />
      <Tooltip title={t('common.settings')} placement="right">
        <button type="button" className={styles.actButton} onClick={onOpenSettings}>
          <SettingOutlined />
        </button>
      </Tooltip>
    </nav>
  )
}
