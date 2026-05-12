<template>
  <div class="settings-editor" :class="{ embedded }">
    <aside class="settings-nav">
      <div class="settings-nav-title">{{ $t('common.settings') }}</div>
      <button type="button" class="settings-nav-item" :class="{ active: currentSection === 'interface' }" @click="selectedKeys = ['interface']">
        {{ $t('settings_page.interface_title') }}
      </button>
      <button type="button" class="settings-nav-item" :class="{ active: currentSection === 'editor' }" @click="selectedKeys = ['editor']">
        {{ $t('settings_page.editor_title') }}
      </button>
      <button type="button" class="settings-nav-item" :class="{ active: currentSection === 'database' }" @click="selectedKeys = ['database']">
        {{ $t('settings_page.database_title') }}
      </button>
    </aside>

    <main class="settings-main">
      <div class="settings-header">
        <div class="settings-heading">
          <h1>{{ currentSectionTitle }}</h1>
          <p>{{ currentSectionDescription }}</p>
          <div class="settings-subtle">{{ $t('settings_page.instant_save_hint') }}</div>
        </div>
      </div>

      <template v-if="currentSection === 'interface'">
        <section class="settings-group">
          <div class="settings-group-title">{{ $t('settings_page.appearance_group') }}</div>
          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('common.theme') }}</div>
              <div class="setting-help">{{ $t('settings_page.theme_help') }}</div>
            </div>
            <a-select v-model:value="themeModeModel" class="setting-select compact">
              <a-select-option value="light">{{ $t('settings_page.theme_light') }}</a-select-option>
              <a-select-option value="dark">{{ $t('settings_page.theme_dark') }}</a-select-option>
              <a-select-option value="system">{{ $t('settings_page.theme_system') }}</a-select-option>
            </a-select>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('settings_page.current_theme') }}</div>
              <div class="setting-help">{{ $t('settings_page.current_theme_help') }}</div>
            </div>
            <a-input :value="appStore.theme === 'dark' ? $t('settings_page.theme_dark') : $t('settings_page.theme_light')" class="setting-select compact" readonly />
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('settings_page.interface_font') }}</div>
              <div class="setting-help">{{ $t('settings_page.interface_font_help') }}</div>
            </div>
            <a-select
              v-model:value="interfaceFontModel"
              class="setting-select"
              show-search
              :filter-option="filterFontOption"
              :options="interfaceFontOptionsEffective"
              placeholder="搜索或选择界面字体"
            />
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('common.language') }}</div>
              <div class="setting-help">{{ $t('settings_page.language_help') }}</div>
            </div>
            <a-select v-model:value="languageModel" class="setting-select compact">
              <a-select-option value="zh-CN">中文</a-select-option>
              <a-select-option value="en-US">English</a-select-option>
            </a-select>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('settings_page.log_level') }}</div>
              <div class="setting-help">{{ $t('settings_page.log_level_help') }}</div>
            </div>
            <a-select v-model:value="logLevelModel" class="setting-select compact" :options="logLevelOptions" />
          </div>
        </section>
      </template>

      <template v-else-if="currentSection === 'editor'">
        <section class="settings-group">
          <div class="settings-group-title">{{ $t('settings_page.editor_typography_group') }}</div>
          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('settings_page.editor_font') }}</div>
              <div class="setting-help">{{ $t('settings_page.editor_font_help') }}</div>
            </div>
            <a-select
              v-model:value="editorFontModel"
              class="setting-select"
              show-search
              :filter-option="filterFontOption"
              :options="editorFontOptionsEffective"
              placeholder="搜索或选择编辑器字体"
            />
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('settings_page.font_size') }}</div>
              <div class="setting-help">{{ $t('settings_page.font_size_help') }}</div>
            </div>
            <a-input-number v-model:value="fontSizeModel" :min="12" :max="24" class="setting-select compact" />
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('settings_page.line_numbers') }}</div>
              <div class="setting-help">{{ $t('settings_page.line_numbers_help') }}</div>
            </div>
            <a-select v-model:value="lineNumbersModel" class="setting-select compact">
              <a-select-option value="on">{{ $t('settings_page.option_on') }}</a-select-option>
              <a-select-option value="off">{{ $t('settings_page.option_off') }}</a-select-option>
            </a-select>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('settings_page.minimap') }}</div>
              <div class="setting-help">{{ $t('settings_page.minimap_help') }}</div>
            </div>
            <a-select v-model:value="minimapModeModel" class="setting-select compact">
              <a-select-option value="on">{{ $t('settings_page.option_on') }}</a-select-option>
              <a-select-option value="off">{{ $t('settings_page.option_off') }}</a-select-option>
            </a-select>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="settings-group">
          <div class="settings-group-title">{{ $t('settings_page.database_connection_group') }}</div>
          <a-alert
            type="info"
            show-icon
            class="settings-note"
            :message="$t('settings_page.database_defaults_scope')"
          />

          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('settings_page.mysql_charset') }}</div>
              <div class="setting-help">{{ $t('settings_page.mysql_charset_help') }}</div>
            </div>
            <a-select v-model:value="mysqlCharsetModel" class="setting-select compact">
              <a-select-option value="utf8mb4">utf8mb4</a-select-option>
              <a-select-option value="utf8">utf8</a-select-option>
              <a-select-option value="latin1">latin1</a-select-option>
              <a-select-option value="gbk">gbk</a-select-option>
            </a-select>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <div class="setting-label">{{ $t('settings_page.mysql_init_sql') }}</div>
              <div class="setting-help">{{ $t('settings_page.mysql_init_sql_help') }}</div>
            </div>
            <a-textarea
              v-model:value="mysqlInitSqlModel"
              :rows="4"
              class="setting-textarea"
              :placeholder="$t('settings_page.mysql_init_sql_placeholder')"
            />
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore, type Language, type LogLevel, type ThemeMode } from '@/stores/app'
import { utilsApi } from '@/api'

withDefaults(defineProps<{
  embedded?: boolean
}>(), {
  embedded: false,
})

defineEmits<{
  close: []
}>()

const appStore = useAppStore()
const { t } = useI18n()
const selectedKeys = ref<string[]>(['interface'])

const filterFontOption = (input: string, option: { label: string; value: string }) => {
  return option.label.toLowerCase().includes(input.toLowerCase()) || option.value.toLowerCase().includes(input.toLowerCase())
}

// 从 CSS font-family 值中提取首个字体名（用于自定义选项的 label）
function extractFirstFont(value: string): string {
  // 去掉引号，取出第一个逗号前的字体名
  const first = value.split(',')[0].trim().replace(/^["']|["']$/g, '')
  return first || value
}

// 兜底字体选项（系统字体列表加载失败时使用）
const FALLBACK_INTERFACE_FONTS = [
  { label: 'Inter / SF Pro Display (默认)', value: `Inter, "SF Pro Display", "Segoe UI", sans-serif` },
  { label: 'System UI', value: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` },
]

const FALLBACK_EDITOR_FONTS = [
  { label: 'JetBrains Mono (默认)', value: `"JetBrains Mono"` },
  { label: 'Fira Code', value: `"Fira Code"` },
  { label: 'Cascadia Code', value: `"Cascadia Code"` },
  { label: 'Consolas', value: `"Consolas"` },
  { label: 'Courier New', value: `"Courier New"` },
]

const interfaceFontOptions = ref<{ label: string; value: string }[]>([...FALLBACK_INTERFACE_FONTS])
const editorFontOptions = ref<{ label: string; value: string }[]>([...FALLBACK_EDITOR_FONTS])

// 确保当前选中的值始终出现在下拉列表中（大小写不敏感去重）
function hasOptionWithValue(options: { label: string; value: string }[], value: string): boolean {
  const norm = value.toLowerCase().replace(/^["']|["']$/g, '').trim()
  return options.some(o => {
    const optNorm = o.value.toLowerCase().replace(/^["']|["']$/g, '').trim()
    return optNorm === norm
  })
}

const interfaceFontOptionsEffective = computed(() => {
  const options = [...interfaceFontOptions.value]
  const current = appStore.interfaceSettings.fontFamily
  if (current && !hasOptionWithValue(options, current)) {
    options.unshift({ label: `${extractFirstFont(current)} (当前)`, value: current })
  }
  return options
})

const editorFontOptionsEffective = computed(() => {
  const options = [...editorFontOptions.value]
  const current = appStore.editorSettings.fontFamily
  if (current && !hasOptionWithValue(options, current)) {
    options.unshift({ label: `${extractFirstFont(current)} (当前)`, value: current })
  }
  return options
})

async function loadSystemFonts() {
  try {
    const fonts = await utilsApi.getSystemFonts()
    if (!fonts || fonts.length === 0) return

    // 构建所有系统字体的选项（供界面字体使用）
    const allFonts = fonts.map(f => ({
      label: f.family,
      value: `"${f.family}", sans-serif`,
    }))

    // 等宽字体优先（供编辑器字体使用）
    const monoFonts = fonts
      .filter(f => f.is_monospace)
      .map(f => ({
        label: f.family,
        value: `"${f.family}"`,
      }))
    const otherFonts = fonts
      .filter(f => !f.is_monospace)
      .map(f => ({
        label: f.family + ' (非等宽)',
        value: `"${f.family}"`,
      }))

    // 界面字体：常用兜底字体 + 所有系统字体
    interfaceFontOptions.value = [
      ...FALLBACK_INTERFACE_FONTS,
      ...allFonts,
    ]

    // 编辑器字体：常用兜底字体 + 等宽系统字体优先 + 其他字体
    editorFontOptions.value = [
      ...FALLBACK_EDITOR_FONTS,
      ...monoFonts,
      ...otherFonts.slice(0, 150),
    ]
  } catch {
    // 系统字体加载失败，保留兜底选项
    console.warn('无法加载系统字体列表，使用内置选项')
  }
}

onMounted(() => {
  loadSystemFonts()
})

const logLevelOptions = [
  { label: 'Error', value: 'error' },
  { label: 'Warn', value: 'warn' },
  { label: 'Info', value: 'info' },
  { label: 'Debug', value: 'debug' },
  { label: 'Trace', value: 'trace' },
]

const currentSection = computed(() => selectedKeys.value[0] || 'interface')
const currentSectionTitle = computed(() => {
  if (currentSection.value === 'interface') return t('settings_page.interface_preferences')
  if (currentSection.value === 'database') return t('settings_page.database_preferences')
  return t('settings_page.editor_preferences')
})
const currentSectionDescription = computed(() => {
  if (currentSection.value === 'interface') return t('settings_page.interface_description')
  if (currentSection.value === 'database') return t('settings_page.database_description')
  return t('settings_page.editor_description')
})

const themeModeModel = computed({
  get: () => appStore.themeMode,
  set: (value: ThemeMode) => appStore.setThemeMode(value),
})
const languageModel = computed({
  get: () => appStore.language,
  set: (value: Language) => appStore.setLanguage(value),
})
const logLevelModel = computed({
  get: () => appStore.logLevel,
  set: (value: LogLevel) => appStore.setLogLevel(value),
})
const fontSizeModel = computed({
  get: () => appStore.editorSettings.fontSize,
  set: (value: number | null) => appStore.setEditorFontSize(Number(value || 14)),
})
const interfaceFontModel = computed({
  get: () => appStore.interfaceSettings.fontFamily,
  set: (value: string) => appStore.setInterfaceFontFamily(value),
})
const editorFontModel = computed({
  get: () => appStore.editorSettings.fontFamily,
  set: (value: string) => appStore.setEditorFontFamily(value),
})
const minimapModeModel = computed({
  get: () => appStore.editorSettings.minimap ? 'on' : 'off',
  set: (value: string) => appStore.setEditorMinimap(value === 'on'),
})
const lineNumbersModel = computed({
  get: () => appStore.editorSettings.lineNumbers,
  set: (value: 'on' | 'off') => appStore.setEditorLineNumbers(value),
})
const mysqlCharsetModel = computed({
  get: () => appStore.databaseSettings.mysqlCharset,
  set: (value: string) => appStore.setMysqlCharset(value),
})
const mysqlInitSqlModel = computed({
  get: () => appStore.databaseSettings.mysqlInitSql,
  set: (value: string) => appStore.setMysqlInitSql(value),
})
</script>

<style scoped>
.settings-editor {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--surface);
  color: var(--app-text);
}

.settings-editor.embedded {
  border-top: 1px solid var(--border-color);
}

.settings-nav {
  width: 188px;
  flex-shrink: 0;
  padding: 8px 8px;
  border-right: 1px solid var(--border-color);
  background: transparent;
}

.settings-nav-title {
  margin-bottom: 8px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--app-text-subtle);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.settings-nav-item {
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--app-text-muted);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.settings-nav-item + .settings-nav-item {
  margin-top: 2px;
}

.settings-nav-item:hover {
  background: var(--color-primary-hover-bg);
}

.settings-nav-item.active {
  background: var(--color-primary-active-bg);
  color: var(--color-primary);
}

.settings-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 10px 16px 16px;
  background: transparent;
}

.settings-header {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color-muted);
}

.settings-heading h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.settings-heading p {
  margin: 4px 0 0;
  color: var(--app-text-subtle);
  font-size: 12px;
  line-height: 1.5;
}

.settings-subtle {
  margin-top: 6px;
  color: var(--color-primary);
  font-size: 11px;
}

.settings-group {
  margin-bottom: 10px;
  border: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
}

.dark-mode .settings-group {
  background: transparent;
}

.settings-group-title {
  padding: 4px 0 6px;
  border-bottom: 1px solid var(--border-color-muted);
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-subtle);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color-muted);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-meta {
  flex: 1;
  min-width: 0;
}

.setting-label {
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 500;
}

.setting-help {
  color: var(--app-text-subtle);
  font-size: 11px;
  line-height: 1.4;
}

.setting-select {
  width: 240px;
}

.setting-select.compact {
  width: 180px;
}

.setting-textarea {
  width: 320px;
}

.settings-note {
  margin: 16px;
  margin-bottom: 0;
}

@media (max-width: 900px) {
  .settings-editor {
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }

  .settings-header,
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .setting-select,
  .setting-select.compact,
  .setting-textarea {
    width: 100%;
  }
}
</style>
