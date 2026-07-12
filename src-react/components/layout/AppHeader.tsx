import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dropdown, Menu, Space } from 'antd'
import type { MenuProps } from 'antd'
import { Icon } from '@iconify/react'
import {
  BuildOutlined, PlusOutlined, SettingOutlined,
  MenuOutlined, RetweetOutlined, SearchOutlined,
  FileAddOutlined, FolderOpenOutlined, SaveOutlined, FileTextOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../../stores/appStore'
import { useWindowControls } from '../../hooks/useWindowControls'
import type { ThemeMode } from '@/types/settings'
import styles from './AppHeader.module.css'

export interface AppHeaderProps {
  showSearch?: boolean
  showQueryBuilder?: boolean
  showDataCompare?: boolean
  canSaveQuery?: boolean
  canSaveQueryAs?: boolean
  onNewConnection?: () => void
  onNewQuery?: () => void
  onOpenSqlFile?: () => void
  onSaveQuery?: () => void
  onSaveQueryAs?: () => void
  onOpenQueryBuilder?: () => void
  onOpenDataCompare?: () => void
  onOpenSettings?: () => void
  onOpenSearch?: () => void
}

export default function AppHeader({
  showSearch = true,
  showQueryBuilder = false,
  showDataCompare = false,
  canSaveQuery = false,
  canSaveQueryAs = false,
  onNewConnection,
  onNewQuery,
  onOpenSqlFile,
  onSaveQuery,
  onSaveQueryAs,
  onOpenQueryBuilder,
  onOpenDataCompare,
  onOpenSettings,
  onOpenSearch,
}: AppHeaderProps) {
  const { t } = useTranslation()
  const themeMode = useAppStore((s) => s.themeMode)
  const setThemeMode = useAppStore((s) => s.setThemeMode)
  const cycleThemeMode = useAppStore((s) => s.cycleThemeMode)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const { isMaximized, minimizeWindow, toggleMaximize, closeWindow } = useWindowControls()

  const themeModeIcon = themeMode === 'dark'
    ? 'fluent:weather-moon-20-filled'
    : themeMode === 'system'
      ? 'fluent:desktop-20-filled'
      : 'fluent:weather-sunny-20-filled'

  const themeModeLabel = themeMode === 'dark'
    ? t('settings_page.theme_dark')
    : themeMode === 'system'
      ? t('settings_page.theme_system')
      : t('settings_page.theme_light')

  const topMenuItems: MenuProps['items'] = useMemo(() => [
    {
      key: 'file',
      label: t('common.file'),
      children: [
        { key: 'new-query', label: <span><FileAddOutlined /> {t('tree.new_query')}</span> },
        { key: 'open-sql-file', label: <span><FolderOpenOutlined /> {t('editor.open_sql_file')}</span> },
        { key: 'save-query', disabled: !canSaveQuery, label: <span><SaveOutlined /> {t('common.save')}</span> },
        { key: 'save-query-as', disabled: !canSaveQueryAs, label: <span><FileTextOutlined /> {t('editor.save_as')}</span> },
        { type: 'divider' },
        { key: 'new-connection', label: <span><PlusOutlined /> {t('connection.new')}</span> },
        ...(showQueryBuilder
          ? [{ key: 'query-builder', label: <span><BuildOutlined /> {t('tools.query_builder.title')}</span> }]
          : []),
        ...(showDataCompare
          ? [{ key: 'data-compare', label: <span><RetweetOutlined /> {t('tools.data_compare.title')}</span> }]
          : []),
        { type: 'divider' },
        { key: 'settings', label: <span><SettingOutlined /> {t('common.settings')}</span> },
      ],
    },
    {
      key: 'view',
      label: t('common.view'),
      children: [
        {
          key: 'toggle-sidebar',
          label: <span><MenuOutlined /> {sidebarCollapsed ? t('common.show_sidebar') : t('common.hide_sidebar')}</span>,
        },
        { type: 'divider' },
        {
          key: 'theme',
          label: <span><Icon icon={themeModeIcon} className={styles.menuIcon} /> {themeModeLabel}</span>,
        },
      ],
    },
  ], [t, canSaveQuery, canSaveQueryAs, showQueryBuilder, showDataCompare, sidebarCollapsed, themeModeIcon, themeModeLabel])

  const handleTopMenuClick: MenuProps['onClick'] = ({ key }) => {
    switch (key) {
      case 'new-query': onNewQuery?.(); break
      case 'open-sql-file': onOpenSqlFile?.(); break
      case 'save-query': onSaveQuery?.(); break
      case 'save-query-as': onSaveQueryAs?.(); break
      case 'new-connection': onNewConnection?.(); break
      case 'query-builder': onOpenQueryBuilder?.(); break
      case 'data-compare': onOpenDataCompare?.(); break
      case 'settings': onOpenSettings?.(); break
      case 'toggle-sidebar': toggleSidebar(); break
      case 'theme': cycleThemeMode(); break
    }
  }

  const themeMenu: MenuProps = {
    selectedKeys: [themeMode],
    onClick: ({ key }) => setThemeMode(key as ThemeMode),
    items: [
      { key: 'light', label: <span><Icon icon="fluent:weather-sunny-20-regular" className={styles.menuIcon} /> {t('settings_page.theme_light')}</span> },
      { key: 'dark', label: <span><Icon icon="fluent:weather-moon-20-regular" className={styles.menuIcon} /> {t('settings_page.theme_dark')}</span> },
      { key: 'system', label: <span><Icon icon="fluent:desktop-20-regular" className={styles.menuIcon} /> {t('settings_page.theme_system')}</span> },
    ],
  }

  return (
    <header className={styles.header}>
      {/* 专门的拖拽背景层 */}
      <div className={styles.headerDragHandle} data-tauri-drag-region="" />

      <div className={styles.headerContent}>
        {/* Logo 区域（支持拖拽） */}
        <div className={styles.logo} data-tauri-drag-region="">
          <img src="/kudu-mark.svg" alt="Kudu" className={styles.brandMark} data-tauri-drag-region="" />
          <span className={styles.title} data-tauri-drag-region="">Kudu</span>
        </div>

        {/* 菜单区域（宽度自适应，不阻挡两侧拖拽） */}
        <div className={styles.headerMenu}>
          <Menu
            mode="horizontal"
            selectedKeys={[]}
            disabledOverflow
            className={styles.topMenu}
            items={topMenuItems}
            onClick={handleTopMenuClick}
          />
        </div>

        {/* 核心：中间大面积可拖拽空白区 */}
        <div className={styles.headerDragSpacer} data-tauri-drag-region="" />

        {/* 动作区与窗口控制 */}
        <div className={styles.headerActions}>
          <Space size={0}>
            <Button
              type="text"
              size="small"
              title={t('common.settings')}
              onClick={() => onOpenSettings?.()}
              className={styles.settingsBtn}
              icon={<SettingOutlined />}
            />

            <Dropdown placement="bottomRight" trigger={['click']} menu={themeMenu}>
              <Button
                type="text"
                size="small"
                title={themeModeLabel}
                className={styles.themeBtn}
                icon={<Icon icon={themeModeIcon} />}
              />
            </Dropdown>

            {showSearch && (
              <Button
                type="text"
                size="small"
                onClick={() => onOpenSearch?.()}
                className={styles.searchBtn}
                icon={<SearchOutlined />}
              />
            )}

            <div className={styles.windowControls}>
              <div className={styles.winBtn} title={t('window.minimize')} onClick={() => { void minimizeWindow() }}>
                <Icon icon="fluent:subtract-16-filled" />
              </div>
              <div className={styles.winBtn} title={t('window.maximize_restore')} onClick={() => { void toggleMaximize() }}>
                <Icon icon={isMaximized ? 'fluent:square-multiple-16-regular' : 'fluent:square-16-regular'} />
              </div>
              <div className={`${styles.winBtn} ${styles.winBtnClose}`} title={t('window.close')} onClick={() => { void closeWindow() }}>
                <Icon icon="fluent:dismiss-16-filled" />
              </div>
            </div>
          </Space>
        </div>
      </div>
    </header>
  )
}
