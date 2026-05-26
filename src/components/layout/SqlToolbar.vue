<template>
  <div class="global-sql-toolbar" :class="{ vertical }">
    <div class="toolbar-left" :class="{ vertical }">
      <div class="toolbar-group" :class="{ vertical }">
        <a-tooltip :title="`${$t('common.run')} (F5)`">
          <a-button type="text" size="small" @click="$emit('action', 'executeQuery')" :disabled="executing" class="btn-run" :class="{ running: executing }">
            <template #icon><PlayCircleFilled /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :title="$t('common.explain')">
          <a-button type="text" size="small" @click="$emit('action', 'explainQuery')" :disabled="executing" class="btn-explain">
            <template #icon><SearchOutlined /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :title="$t('common.stop')">
          <a-button type="text" size="small" @click="$emit('action', 'stopExecution')" :disabled="!executing" class="btn-stop" :class="{ active: executing }">
            <template #icon><StopOutlined /></template>
          </a-button>
        </a-tooltip>
      </div>
      <a-divider :type="vertical ? 'horizontal' : 'vertical'" />
      <div class="toolbar-group" :class="{ vertical }">
        <a-tooltip :title="`${$t('common.save')} (Ctrl+S)`">
          <a-button type="text" size="small" @click="$emit('action', 'handleSave')"><template #icon><SaveOutlined /></template></a-button>
        </a-tooltip>
        <a-tooltip :title="$t('editor.save_as')">
          <a-button type="text" size="small" @click="$emit('action', 'saveAsFile')"><template #icon><FileAddOutlined /></template></a-button>
        </a-tooltip>
        <a-tooltip :title="$t('common.format')">
          <a-button type="text" size="small" @click="$emit('action', 'formatSql')"><template #icon><FormatPainterOutlined /></template></a-button>
        </a-tooltip>
        <a-tooltip :title="$t('common.clear')">
          <a-button type="text" size="small" @click="$emit('action', 'clearEditor')"><template #icon><ClearOutlined /></template></a-button>
        </a-tooltip>
      </div>
      <a-divider :type="vertical ? 'horizontal' : 'vertical'" />
      <div class="toolbar-group" :class="{ vertical }">
        <a-tooltip :title="$t('common.history')">
          <a-button type="text" size="small" @click="$emit('action', 'openHistory')"><template #icon><HistoryOutlined /></template></a-button>
        </a-tooltip>
        <a-tooltip :title="$t('common.snippets')">
          <a-button type="text" size="small" @click="$emit('action', 'openSnippets')"><template #icon><CodeOutlined /></template></a-button>
        </a-tooltip>
        <a-tooltip :title="$t('common.refresh')">
          <a-button type="text" size="small" @click="$emit('action', 'refreshAutocomplete')"><template #icon><SyncOutlined /></template></a-button>
        </a-tooltip>
      </div>
    </div>

    <div class="toolbar-right" :class="{ vertical }">
      <!-- 垂直布局 (保留兼容) -->
      <template v-if="vertical">
        <a-dropdown placement="bottomLeft" trigger="click">
          <a-tooltip :title="selectedDatabase || $t('editor.default_database')">
            <a-button type="text" size="small" class="db-trigger">
              <template #icon><DatabaseOutlined /></template>
            </a-button>
          </a-tooltip>
          <template #overlay>
            <a-menu :selected-keys="[selectedDatabase || '__default__']" @click="handleDatabaseMenuClick">
              <a-menu-item key="__default__">{{ $t('common.default_prefix') }}</a-menu-item>
              <a-menu-item v-for="db in databases" :key="db.name">{{ db.name }}</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <a-divider type="horizontal" />
        <a-tooltip :title="$t('editor.result')">
          <a-button type="text" size="small" class="result-toggle-btn" :class="{ active: resultPanelVisible }" @click="$emit('action', 'toggleResultPanel')">
            <template #icon><TableOutlined /></template>
          </a-button>
        </a-tooltip>
      </template>

      <!-- 水平布局 -->
      <template v-else>
        <div class="toolbar-right-section">
          <span class="toolbar-label">{{ $t('common.database') }}</span>
          <a-select
            :value="selectedDatabase"
            :placeholder="$t('common.database')"
            size="small"
            class="database-select"
            @change="(val: unknown) => $emit('databaseChange', String(val ?? ''))"
          >
            <a-select-option value="">{{ $t('editor.default_database') }}</a-select-option>
            <a-select-option v-for="db in databases" :key="db.name" :value="db.name">{{ db.name }}</a-select-option>
          </a-select>
        </div>
        <a-divider type="vertical" />
        <div class="toolbar-right-section" v-if="showSearchPath">
          <span class="toolbar-label">{{ $t('editor.search_path_label') }}</span>
          <a-popover
            v-model:open="searchPathEditorOpen"
            trigger="click"
            placement="bottomRight"
          >
            <template #content>
              <div class="search-path-editor">
                <div class="search-path-tags">
                  <a-tag
                    v-for="(schema, i) in searchPathItems"
                    :key="i"
                    closable
                    @close="removeSearchPathItem(i)"
                    color="processing"
                    size="small"
                  >
                    {{ schema }}
                  </a-tag>
                  <a-input
                    v-if="searchPathAdding"
                    ref="searchPathInputRef"
                    v-model:value="searchPathNewItem"
                    size="small"
                    class="search-path-input"
                    :placeholder="$t('editor.search_path_schema_placeholder')"
                    @pressEnter="confirmAddSearchPathItem"
                    @blur="confirmAddSearchPathItem"
                  />
                </div>
                <a-button type="dashed" size="small" block @click="startAddSearchPathItem" v-if="!searchPathAdding">
                  <template #icon><PlusOutlined /></template>{{ $t('editor.search_path_add') }}
                </a-button>
                <div class="code-block-compact search-path-sql-preview" v-if="searchPathSql">
                  <code>{{ searchPathSql }}</code>
                </div>
                <a-space :size="8" class="search-path-actions">
                  <a-button size="small" @click="cancelSearchPathEdit">{{ $t('common.cancel') }}</a-button>
                  <a-button size="small" type="primary" @click="applySearchPath">{{ $t('common.ok') }}</a-button>
                </a-space>
              </div>
            </template>
            <a-button type="text" size="small" class="search-path-trigger">
              <template #icon><ApartmentOutlined /></template>
              <span class="search-path-text">{{ searchPathDisplay }}</span>
            </a-button>
          </a-popover>
        </div>
        <a-divider type="vertical" />
        <a-tooltip :title="$t('editor.result')">
          <a-button type="text" size="small" class="result-toggle-btn" :class="{ active: resultPanelVisible }" @click="$emit('action', 'toggleResultPanel')">
            <template #icon><TableOutlined /></template>
          </a-button>
        </a-tooltip>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import {
  PlayCircleFilled, StopOutlined, SaveOutlined, FileAddOutlined,
  FormatPainterOutlined, ClearOutlined, HistoryOutlined, CodeOutlined, SyncOutlined,
  SearchOutlined, DatabaseOutlined, TableOutlined, ApartmentOutlined, PlusOutlined
} from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { DatabaseInfo } from '@/types/database'

const props = withDefaults(defineProps<{
  executing: boolean
  selectedDatabase: string
  databases: DatabaseInfo[]
  resultPanelVisible?: boolean
  vertical?: boolean
  showSearchPath?: boolean
  searchPath?: string
}>(), {
  resultPanelVisible: false,
  vertical: false,
  showSearchPath: false,
  searchPath: '',
})

const emit = defineEmits<{
  action: [method: string]
  databaseChange: [value: string]
  searchPathEditorToggle: [open: boolean]
  searchPathChange: [value: string]
}>()

const { t } = useI18n()

// ── search_path 编辑器 ──
const searchPathEditorOpen = ref(false)
const searchPathAdding = ref(false)
const searchPathNewItem = ref('')
const searchPathInputRef = ref()

const searchPathItems = computed({
  get: () => props.searchPath ? props.searchPath.split(',').map(s => s.trim()).filter(Boolean) : [],
  set: (_val) => {}
})

const searchPathDisplay = computed(() => searchPathItems.value.join(', ') || t('common.no_data'))

const searchPathSql = computed(() => {
  if (searchPathItems.value.length === 0) return ''
  return `SET search_path TO ${searchPathItems.value.join(', ')};`
})

function startAddSearchPathItem() {
  searchPathAdding.value = true
  nextTick(() => searchPathInputRef.value?.focus())
}

function confirmAddSearchPathItem() {
  const val = searchPathNewItem.value.trim()
  searchPathNewItem.value = ''
  searchPathAdding.value = false
  if (!val) return
  if (searchPathItems.value.includes(val)) return
  const newItems = [...searchPathItems.value, val]
  emit('searchPathChange', newItems.join(', '))
}

function removeSearchPathItem(index: number) {
  const newItems = searchPathItems.value.filter((_, i) => i !== index)
  emit('searchPathChange', newItems.join(', '))
}

function applySearchPath() {
  emit('searchPathChange', searchPathItems.value.join(', '))
  searchPathEditorOpen.value = false
}

function cancelSearchPathEdit() {
  emit('searchPathChange', props.searchPath)
  searchPathEditorOpen.value = false
}

function handleDatabaseMenuClick({ key }: { key: string | number }) {
  emit('databaseChange', String(key) === '__default__' ? '' : String(key))
}
</script>

<style scoped>
.global-sql-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
  height: 32px;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  gap: 0;
}
.global-sql-toolbar.vertical {
  width: 32px;
  height: 100%;
  flex-direction: column;
  justify-content: flex-start;
  gap: 0;
  padding: 0;
  border-right: 1px solid var(--border-color);
  border-bottom: 0;
  background: var(--surface);
}
.toolbar-left { display: flex; align-items: center; gap: 0; }
.toolbar-left.vertical { flex-direction: column; width: 100%; }
.toolbar-group { display: flex; align-items: center; gap: 1px; }
.toolbar-group.vertical { width: 100%; flex-direction: column; gap: 0; }
.toolbar-left :deep(.ant-btn-text),
.toolbar-right :deep(.ant-btn-text) { width: 26px; min-width: 26px; padding: 0; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--app-text-subtle); font-size: 13px; transition: color 0.15s, background 0.15s; }
.toolbar-left.vertical :deep(.ant-btn-text),
.toolbar-right.vertical :deep(.ant-btn-text) {
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0;
  border-radius: 0;
  font-size: 12px;
}
.toolbar-left :deep(.ant-btn-text:hover),
.toolbar-right :deep(.ant-btn-text:hover) { background: var(--surface-hover); color: var(--app-text); }

.toolbar-right { display: flex; align-items: center; gap: 0; margin-left: auto; }
.toolbar-right.vertical { width: 100%; flex-direction: column; gap: 0; margin-top: auto; margin-left: 0; }

.toolbar-right-section { display: flex; align-items: center; gap: 5px; }
.toolbar-label { font-size: 10px; color: var(--app-text-subtle); white-space: nowrap; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }

.global-sql-toolbar :deep(.ant-divider-vertical) { height: 16px; margin: 0 6px; border-color: var(--border-color); }

.global-sql-toolbar.vertical :deep(.ant-divider-horizontal) {
  margin: 0;
  min-width: 100%;
  border-block-start-color: var(--border-color-muted);
}

.btn-run { color: var(--color-success) !important; }
.btn-run:hover { background: var(--color-success-soft-bg) !important; }
.btn-run.running { opacity: 0.5; }
.btn-stop { color: var(--color-danger) !important; }
.btn-stop.active { background: var(--color-danger-soft-bg); }
.btn-stop:hover { background: var(--color-danger-soft-bg) !important; }

.result-toggle-btn.active {
  color: var(--color-primary) !important;
  background: var(--color-primary-hover-bg);
}

.db-label { font-size: 10px; color: var(--app-text-subtle); margin-right: 6px; }
.db-trigger { width: 100%; }
.database-select { width: 130px; }
.search-path-input { width: 100px; }

/* search_path */
.search-path-actions {
  margin-top: 8px;
  justify-content: flex-end;
  width: 100%;
}

.search-path-trigger {
  display: inline-flex !important;
  align-items: center;
  gap: 3px;
  max-width: 160px;
  height: 22px !important;
  padding: 0 5px !important;
  min-width: auto !important;
  width: auto !important;
  font-size: 11px !important;
}
.search-path-text {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-subtle);
  max-width: 130px;
}
.search-path-editor { min-width: 260px; max-width: 340px; }
.search-path-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; align-items: center; }
.search-path-sql-preview { margin-top: 6px; padding: 6px 8px; }
.search-path-sql-preview code { font-size: 11px; font-family: monospace; color: var(--app-text-muted); }
</style>
