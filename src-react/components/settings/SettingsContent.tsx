import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Input, InputNumber, Select } from 'antd'
import { useAppStore, useAppTheme } from '../../stores/appStore'
import { utilsApi, type AppInfo } from '@/api'
import type { Language, LineNumbersMode, LogLevel, ThemeMode } from '@/types/settings'
import styles from './SettingsContent.module.css'

/**
 * 设置页（对等 Vue 版 SettingsContent.vue：四分区，12 个设置项全部即时保存）。
 * Vue 的可写 computed → 受控 value + store setter（持久化在 setter 内同步执行——Slice 4 模式）。
 */

interface SettingsContentProps {
  embedded?: boolean
}

interface FontOption { label: string; value: string }

export default function SettingsContent({ embedded = false }: SettingsContentProps) {
  const { t, i18n } = useTranslation()
  const theme = useAppTheme()

  const themeMode = useAppStore((s) => s.themeMode)
  const language = useAppStore((s) => s.language)
  const logLevel = useAppStore((s) => s.logLevel)
  const interfaceSettings = useAppStore((s) => s.interfaceSettings)
  const editorSettings = useAppStore((s) => s.editorSettings)
  const databaseSettings = useAppStore((s) => s.databaseSettings)

  const [currentSection, setCurrentSection] = useState<'interface' | 'editor' | 'database' | 'about'>('interface')
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  function withDefaultLabel(label: string): string {
    return `${label} (${t('common.default_prefix')})`
  }
  function withCurrentLabel(label: string): string {
    return `${label} (${t('settings_page.current_label')})`
  }
  function withNonMonospaceLabel(label: string): string {
    return `${label} (${t('settings_page.non_monospace_label')})`
  }

  function extractFirstFont(value: string): string {
    const first = value.split(',')[0].trim().replace(/^["']|["']$/g, '')
    return first || value
  }

  const FALLBACK_INTERFACE_FONTS: FontOption[] = [
    { label: withDefaultLabel('Inter / SF Pro Display'), value: `Inter, "SF Pro Display", "Segoe UI", sans-serif` },
    { label: 'System UI', value: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` },
  ]

  const FALLBACK_EDITOR_FONTS: FontOption[] = [
    { label: withDefaultLabel('JetBrains Mono'), value: `"JetBrains Mono"` },
    { label: 'Fira Code', value: `"Fira Code"` },
    { label: 'Cascadia Code', value: `"Cascadia Code"` },
    { label: 'Consolas', value: `"Consolas"` },
    { label: 'Courier New', value: `"Courier New"` },
  ]

  const [interfaceFontOptions, setInterfaceFontOptions] = useState<FontOption[]>(FALLBACK_INTERFACE_FONTS)
  const [editorFontOptions, setEditorFontOptions] = useState<FontOption[]>(FALLBACK_EDITOR_FONTS)

  function hasOptionWithValue(options: FontOption[], value: string): boolean {
    const norm = value.toLowerCase().replace(/^["']|["']$/g, '').trim()
    return options.some((o) => {
      const optNorm = o.value.toLowerCase().replace(/^["']|["']$/g, '').trim()
      return optNorm === norm
    })
  }

  const interfaceFontOptionsEffective = (() => {
    const options = [...interfaceFontOptions]
    const current = interfaceSettings.fontFamily
    if (current && !hasOptionWithValue(options, current)) {
      options.unshift({ label: withCurrentLabel(extractFirstFont(current)), value: current })
    }
    return options
  })()

  const editorFontOptionsEffective = (() => {
    const options = [...editorFontOptions]
    const current = editorSettings.fontFamily
    if (current && !hasOptionWithValue(options, current)) {
      options.unshift({ label: withCurrentLabel(extractFirstFont(current)), value: current })
    }
    return options
  })()

  const filterFontOption = (input: string, option?: FontOption) => {
    if (!option) return false
    return option.label.toLowerCase().includes(input.toLowerCase())
      || option.value.toLowerCase().includes(input.toLowerCase())
  }

  // 字体列表与应用信息加载（照抄策略：失败保留兜底选项）
  useEffect(() => {
    void (async () => {
      try {
        const fonts = await utilsApi.getSystemFonts()
        if (!fonts || fonts.length === 0) return

        const allFonts = fonts.map((f) => ({ label: f.family, value: `"${f.family}", sans-serif` }))
        const monoFonts = fonts.filter((f) => f.is_monospace).map((f) => ({ label: f.family, value: `"${f.family}"` }))
        const otherFonts = fonts.filter((f) => !f.is_monospace).map((f) => ({ label: withNonMonospaceLabel(f.family), value: `"${f.family}"` }))

        setInterfaceFontOptions([...FALLBACK_INTERFACE_FONTS, ...allFonts])
        setEditorFontOptions([...FALLBACK_EDITOR_FONTS, ...monoFonts, ...otherFonts.slice(0, 150)])
      } catch {
        console.warn('无法加载系统字体列表，使用内置选项')
      }
    })()
    void (async () => {
      try {
        setAppInfo(await utilsApi.getAppInfo())
      } catch (error) {
        console.warn('无法加载应用信息', error)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logLevelOptions = [
    { label: 'Error', value: 'error' },
    { label: 'Warn', value: 'warn' },
    { label: 'Info', value: 'info' },
    { label: 'Debug', value: 'debug' },
    { label: 'Trace', value: 'trace' },
  ]

  const currentSectionTitle = currentSection === 'interface'
    ? t('settings_page.interface_preferences')
    : currentSection === 'editor'
      ? t('settings_page.editor_preferences')
      : currentSection === 'database'
        ? t('settings_page.database_preferences')
        : t('settings_page.about_preferences')

  const currentSectionDescription = currentSection === 'interface'
    ? t('settings_page.interface_description')
    : currentSection === 'editor'
      ? t('settings_page.editor_description')
      : currentSection === 'database'
        ? t('settings_page.database_description')
        : t('settings_page.about_description')

  const appDisplayName = (() => {
    const raw = appInfo?.app_name?.trim()
    if (!raw) return 'Kudu'
    if (raw.toLowerCase() === 'kudu') return 'Kudu'
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  })()

  function formatDisplayDate(value?: string | null): string {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat(i18n.language, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(date)
  }

  function formatBuildTimestamp(value?: string | null): string {
    if (!value) return '-'
    const seconds = Number(value)
    if (!Number.isFinite(seconds) || seconds <= 0) return value
    return formatDisplayDate(new Date(seconds * 1000).toISOString())
  }

  async function openExternalLink(url?: string | null) {
    if (!url) return
    try {
      await utilsApi.openExternalUrl(url)
    } catch (error) {
      console.warn('无法打开外部链接', error)
    }
  }

  const store = useAppStore.getState

  const renderSettingRow = (label: string, help: string, control: React.ReactNode) => (
    <div className={styles.settingRow}>
      <div className={styles.settingMeta}>
        <div className={styles.settingLabel}>{label}</div>
        <div className={`help-text ${styles.settingHelp}`}>{help}</div>
      </div>
      {control}
    </div>
  )

  const navItems: Array<{ key: typeof currentSection; label: string }> = [
    { key: 'interface', label: t('settings_page.interface_title') },
    { key: 'editor', label: t('settings_page.editor_title') },
    { key: 'database', label: t('settings_page.database_title') },
    { key: 'about', label: t('settings_page.about_title') },
  ]

  return (
    <div className={`${styles.settingsEditor} ${embedded ? styles.embedded : ''}`}>
      <aside className={styles.settingsNav}>
        <div className={`app-section-title ${styles.settingsNavTitle}`}>{t('common.settings')}</div>
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`interactive-row ${styles.settingsNavItem} ${currentSection === item.key ? styles.active : ''}`}
            onClick={() => setCurrentSection(item.key)}
          >
            {item.label}
          </button>
        ))}
      </aside>

      <main className={styles.settingsMain}>
        {currentSection !== 'about' && (
          <div className={`section-header ${styles.settingsHeader}`}>
            <div className={styles.settingsHeading}>
              <h1>{currentSectionTitle}</h1>
              <p>{currentSectionDescription}</p>
              <div className={`app-subtle-note ${styles.settingsSubtle}`}>{t('settings_page.instant_save_hint')}</div>
            </div>
          </div>
        )}

        {currentSection === 'interface' && (
          <section className={styles.settingsGroup}>
            <div className={`setting-group-title ${styles.settingsGroupTitle}`}>{t('settings_page.appearance_group')}</div>
            {renderSettingRow(t('common.theme'), t('settings_page.theme_help'), (
              <Select
                value={themeMode}
                onChange={(v) => store().setThemeMode(v as ThemeMode)}
                className={`${styles.settingSelect} ${styles.compact}`}
                options={[
                  { value: 'light', label: t('settings_page.theme_light') },
                  { value: 'dark', label: t('settings_page.theme_dark') },
                  { value: 'system', label: t('settings_page.theme_system') },
                ]}
              />
            ))}
            {renderSettingRow(t('settings_page.current_theme'), t('settings_page.current_theme_help'), (
              <Input
                value={theme === 'dark' ? t('settings_page.theme_dark') : t('settings_page.theme_light')}
                className={`${styles.settingSelect} ${styles.compact}`}
                readOnly
              />
            ))}
            {renderSettingRow(t('settings_page.interface_font'), t('settings_page.interface_font_help'), (
              <Select
                value={interfaceSettings.fontFamily}
                onChange={(v) => store().setInterfaceFontFamily(String(v))}
                className={styles.settingSelect}
                showSearch
                filterOption={filterFontOption}
                options={interfaceFontOptionsEffective}
                placeholder={t('settings_page.interface_font_placeholder')}
              />
            ))}
            {renderSettingRow(t('common.language'), t('settings_page.language_help'), (
              <Select
                value={language}
                onChange={(v) => store().setLanguage(v as Language)}
                className={`${styles.settingSelect} ${styles.compact}`}
                options={[
                  { value: 'zh-CN', label: t('settings_page.language_zh_cn') },
                  { value: 'en-US', label: t('settings_page.language_en_us') },
                ]}
              />
            ))}
            {renderSettingRow(t('settings_page.log_level'), t('settings_page.log_level_help'), (
              <Select
                value={logLevel}
                onChange={(v) => store().setLogLevel(v as LogLevel)}
                className={`${styles.settingSelect} ${styles.compact}`}
                options={logLevelOptions}
              />
            ))}
          </section>
        )}

        {currentSection === 'editor' && (
          <section className={styles.settingsGroup}>
            <div className={`setting-group-title ${styles.settingsGroupTitle}`}>{t('settings_page.editor_typography_group')}</div>
            {renderSettingRow(t('settings_page.editor_font'), t('settings_page.editor_font_help'), (
              <Select
                value={editorSettings.fontFamily}
                onChange={(v) => store().setEditorFontFamily(String(v))}
                className={styles.settingSelect}
                showSearch
                filterOption={filterFontOption}
                options={editorFontOptionsEffective}
                placeholder={t('settings_page.editor_font_placeholder')}
              />
            ))}
            {renderSettingRow(t('settings_page.font_size'), t('settings_page.font_size_help'), (
              <InputNumber
                value={editorSettings.fontSize}
                onChange={(v) => store().setEditorFontSize(Number(v || 14))}
                min={12}
                max={24}
                className={`${styles.settingSelect} ${styles.compact}`}
              />
            ))}
            {renderSettingRow(t('settings_page.line_numbers'), t('settings_page.line_numbers_help'), (
              <Select
                value={editorSettings.lineNumbers}
                onChange={(v) => store().setEditorLineNumbers(v as LineNumbersMode)}
                className={`${styles.settingSelect} ${styles.compact}`}
                options={[
                  { value: 'on', label: t('settings_page.option_on') },
                  { value: 'off', label: t('settings_page.option_off') },
                ]}
              />
            ))}
            {renderSettingRow(t('settings_page.minimap'), t('settings_page.minimap_help'), (
              <Select
                value={editorSettings.minimap ? 'on' : 'off'}
                onChange={(v) => store().setEditorMinimap(v === 'on')}
                className={`${styles.settingSelect} ${styles.compact}`}
                options={[
                  { value: 'on', label: t('settings_page.option_on') },
                  { value: 'off', label: t('settings_page.option_off') },
                ]}
              />
            ))}
          </section>
        )}

        {currentSection === 'database' && (
          <section className={styles.settingsGroup}>
            <div className={`setting-group-title ${styles.settingsGroupTitle}`}>{t('settings_page.database_connection_group')}</div>
            <Alert type="info" showIcon className={styles.settingsNote} message={t('settings_page.database_defaults_scope')} />
            {renderSettingRow(t('settings_page.mysql_charset'), t('settings_page.mysql_charset_help'), (
              <Select
                value={databaseSettings.mysqlCharset}
                onChange={(v) => store().setMysqlCharset(String(v))}
                className={`${styles.settingSelect} ${styles.compact}`}
                options={['utf8mb4', 'utf8', 'latin1', 'gbk'].map((v) => ({ value: v, label: v }))}
              />
            ))}
            {renderSettingRow(t('settings_page.mysql_init_sql'), t('settings_page.mysql_init_sql_help'), (
              <Input.TextArea
                value={databaseSettings.mysqlInitSql}
                onChange={(e) => store().setMysqlInitSql(e.target.value)}
                rows={4}
                className={styles.settingTextarea}
                placeholder={t('settings_page.mysql_init_sql_placeholder')}
              />
            ))}
          </section>
        )}

        {currentSection === 'about' && (
          <>
            <section className={styles.aboutHeroCard}>
              <h2 className={styles.aboutHeroTitle}>{appDisplayName}</h2>
              <p className={styles.aboutHeroDescription}>{t('settings_page.about_summary')}</p>
              <div className={styles.aboutHeroMeta}>
                <span className={styles.aboutHeroBadge}>v{appInfo?.version || '-'}</span>
                {appInfo?.git_short_commit && <span className={styles.aboutHeroBadge}>{appInfo.git_short_commit}</span>}
              </div>
              <button type="button" className={styles.aboutPrimaryLink} onClick={() => void openExternalLink(appInfo?.repository_url)}>
                {t('settings_page.about_open_github')}
              </button>
            </section>

            <section className={styles.aboutInfoCard}>
              <div className={`${styles.settingRow} ${styles.settingRowDisplay}`}>
                <div className={styles.settingMeta}>
                  <div className={styles.settingLabel}>{t('settings_page.about_version')}</div>
                </div>
                <div className={styles.settingDisplayValue}>{appInfo?.version || '-'}</div>
              </div>
              <div className={`${styles.settingRow} ${styles.settingRowDisplay}`}>
                <div className={styles.settingMeta}>
                  <div className={styles.settingLabel}>{t('settings_page.about_git_commit')}</div>
                </div>
                <div className={styles.settingDisplayValue}>{appInfo?.git_short_commit || appInfo?.git_commit || '-'}</div>
              </div>
              <div className={`${styles.settingRow} ${styles.settingRowDisplay}`}>
                <div className={styles.settingMeta}>
                  <div className={styles.settingLabel}>{t('settings_page.about_build_time')}</div>
                </div>
                <div className={styles.settingDisplayValue}>{formatBuildTimestamp(appInfo?.build_time)}</div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
