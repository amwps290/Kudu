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
          <a-tooltip :title="selectedDatabase || (appStore.language === 'zh-CN' ? '默认数据库' : 'Default Database')">
            <a-button type="text" size="small" class="db-trigger">
              <template #icon><DatabaseOutlined /></template>
            </a-button>
          </a-tooltip>
          <template #overlay>
            <a-menu :selected-keys="[selectedDatabase || '__default__']" @click="handleDatabaseMenuClick">
              <a-menu-item key="__default__">{{ appStore.language === 'zh-CN' ? '默认' : 'Default' }}</a-menu-item>
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
        <a-tooltip :title="$t('editor.messages')">
          <a-button type="text" size="small" class="result-toggle-btn" :class="{ active: messagesPanelVisible }" @click="$emit('action', 'toggleMessagesPanel')">
            <template #icon><MessageOutlined /></template>
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
            style="width: 130px"
            @change="(val: unknown) => $emit('databaseChange', String(val ?? ''))"
          >
            <a-select-option value="">{{ $t('editor.default_database') }}</a-select-option>
            <a-select-option v-for="db in databases" :key="db.name" :value="db.name">{{ db.name }}</a-select-option>
          </a-select>
        </div>
        <a-divider type="vertical" />
        <div class="toolbar-right-section" v-if="showSearchPath">
          <span class="toolbar-label">search_path</span>
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
                    style="width: 100px"
                    placeholder="schema"
                    @pressEnter="confirmAddSearchPathItem"
                    @blur="confirmAddSearchPathItem"
                  />
                </div>
                <a-button type="dashed" size="small" block @click="startAddSearchPathItem" v-if="!searchPathAdding">
                  <template #icon><PlusOutlined /></template>{{ $t('editor.search_path_add') }}
                </a-button>
                <div class="search-path-sql-preview" v-if="searchPathSql">
                  <code>{{ searchPathSql }}</code>
                </div>
                <a-space :size="8" style="margin-top: 8px; justify-content: flex-end; width: 100%;">
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
        <a-tooltip :title="$t('editor.messages')">
          <a-button type="text" size="small" class="result-toggle-btn" :class="{ active: messagesPanelVisible }" @click="$emit('action', 'toggleMessagesPanel')">
            <template #icon><MessageOutlined /></template>
          </a-button>
        </a-tooltip>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import {
  PlayCircleFilled, StopOutlined, SaveOutlined,
  FormatPainterOutlined, ClearOutlined, HistoryOutlined, CodeOutlined, SyncOutlined,
  SearchOutlined, DatabaseOutlined, TableOutlined, MessageOutlined, ApartmentOutlined, PlusOutlined
} from '@ant-design/icons-vue'
import { useAppStore } from '@/stores/app'
import type { DatabaseInfo } from '@/types/database'

const props = withDefaults(defineProps<{
  executing: boolean
  selectedDatabase: string
  databases: DatabaseInfo[]
  resultPanelVisible?: boolean
  messagesPanelVisible?: boolean
  vertical?: boolean
  showSearchPath?: boolean
  searchPath?: string
}>(), {
  resultPanelVisible: false,
  messagesPanelVisible: false,
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

const appStore = useAppStore()

// ── search_path 编辑器 ──
const searchPathEditorOpen = ref(false)
const searchPathAdding = ref(false)
const searchPathNewItem = ref('')
const searchPathInputRef = ref()

const searchPathItems = computed({
  get: () => props.searchPath ? props.searchPath.split(',').map(s => s.trim()).filter(Boolean) : [],
  set: (_val) => {}
})

const searchPathDisplay = computed(() => searchPathItems.value.join(', ') || '—')

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
.global-sql-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 0 12px; height: 36px; background: #f5f5f5; border-bottom: 1px solid #d9d9d9; flex-shrink: 0; }
.dark-mode .global-sql-toolbar { background: #1a1a1a; border-bottom-color: #303030; }
.global-sql-toolbar.vertical {
  width: 32px;
  height: 100%;
  flex-direction: column;
  justify-content: flex-start;
  gap: 0;
  padding: 0;
  border-right: 1px solid #e5e7eb;
  border-bottom: 0;
  background: #ffffff;
}
.dark-mode .global-sql-toolbar.vertical {
  background: #1f1f1f;
  border-right-color: #303030;
}
.toolbar-left { display: flex; align-items: center; }
.toolbar-left.vertical { flex-direction: column; width: 100%; }
.toolbar-group { display: flex; align-items: center; gap: 2px; }
.toolbar-group.vertical { width: 100%; flex-direction: column; gap: 0; }
.toolbar-left :deep(.ant-btn-text),
.toolbar-right :deep(.ant-btn-text) { width: auto; min-width: 28px; padding: 0 6px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; color: #595959; font-size: 14px; }
.toolbar-left.vertical :deep(.ant-btn-text),
.toolbar-right.vertical :deep(.ant-btn-text) {
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0;
  border-radius: 0;
  font-size: 12px;
}
.dark-mode .toolbar-left :deep(.ant-btn-text),
.dark-mode .toolbar-right :deep(.ant-btn-text) { color: #aaa; }
.toolbar-left :deep(.ant-btn-text:hover),
.toolbar-right :deep(.ant-btn-text:hover) { background: rgba(0,0,0,0.06); color: #1890ff; }
.dark-mode .toolbar-left :deep(.ant-btn-text:hover),
.dark-mode .toolbar-right :deep(.ant-btn-text:hover) { background: rgba(255, 255, 255, 0.08); }

.toolbar-right { display: flex; align-items: center; gap: 4px; }
.toolbar-right.vertical { width: 100%; flex-direction: column; gap: 0; margin-top: auto; }

.toolbar-right-section { display: flex; align-items: center; gap: 6px; }
.toolbar-label { font-size: 11px; color: #8c8c8c; white-space: nowrap; }
.dark-mode .toolbar-label { color: #a6a6a6; }

.global-sql-toolbar.vertical :deep(.ant-divider-horizontal) {
  margin: 0;
  min-width: 100%;
  border-block-start-color: #eef2f7;
}
.dark-mode .global-sql-toolbar.vertical :deep(.ant-divider-horizontal) {
  border-block-start-color: #2a2a2a;
}

.btn-run { color: #52c41a !important; font-weight: bold; }
.btn-run:hover { background: rgba(82, 196, 26, 0.12) !important; }
.btn-run.running { opacity: 0.55; }
.btn-stop { color: #ff4d4f !important; }
.btn-stop.active { background: rgba(255, 77, 79, 0.10); }
.btn-stop:hover { background: rgba(255, 77, 79, 0.12) !important; }

.result-toggle-btn.active {
  color: #1677ff !important;
  background: rgba(22, 119, 255, 0.08);
}
.dark-mode .result-toggle-btn.active {
  background: rgba(22, 119, 255, 0.18);
}

.db-label { font-size: 12px; color: #8c8c8c; margin-right: 8px; }
.db-trigger { width: 100%; }

/* search_path */
.search-path-trigger {
  display: inline-flex !important;
  align-items: center;
  gap: 4px;
  max-width: 180px;
  padding: 0 6px !important;
}
.search-path-text {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #595959;
}
.dark-mode .search-path-text { color: #d9d9d9; }
.search-path-editor { min-width: 260px; max-width: 340px; }
.search-path-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; align-items: center; }
.search-path-sql-preview { margin-top: 6px; padding: 6px 8px; background: #f5f5f5; border-radius: 4px; }
.dark-mode .search-path-sql-preview { background: #262626; }
.search-path-sql-preview code { font-size: 11px; font-family: monospace; color: #595959; }
.dark-mode .search-path-sql-preview code { color: #d9d9d9; }
</style>
