<template>
  <div class="connection-panel">
    <div class="panel-toolbar panel-toolbar--muted-border panel-header">
      <span class="panel-toolbar__title panel-title">{{ $t('connection.manager') }}</span>
      <a-button
        type="text"
        size="small"
        :icon="h(PlusOutlined)"
        @click="$emit('add-connection')"
      >
        {{ $t('common.new') }}
      </a-button>
    </div>

    <div class="panel-content">
      <div class="search-wrapper">
        <a-input
          v-model:value="searchText"
          :placeholder="$t('common.search')"
          size="small"
          :bordered="false"
          allow-clear
          class="compact-search"
        >
          <template #prefix><SearchOutlined class="search-prefix-icon" /></template>
        </a-input>
        <div v-if="searchText" class="search-options">
          <a-checkbox v-model:checked="searchCaseSensitive" class="search-option-item">{{ $t('search.case_sensitive') }}</a-checkbox>
          <a-checkbox v-model:checked="searchRegex" class="search-option-item">{{ $t('search.regex') }}</a-checkbox>
          <a-checkbox v-model:checked="searchColumns" class="search-option-item">{{ $t('search.search_columns') }}</a-checkbox>
          <span v-if="matchesCount > 0" class="search-match-count">{{ $t('search.matches_count', { count: matchesCount }) }}</span>
        </div>
      </div>

      <div class="connection-list">
        <div
          v-for="conn in filteredConnections"
          :key="conn.id"
          class="connection-group"
        >
          <!-- 连接项：顶级节点 -->
          <div
            class="connection-item"
            :class="{ 
              active: activeConnectionId === conn.id,
              expanded: expandedConnections.has(conn.id),
              'connection-item--error': getConnectionStatus(conn.id) === 'error'
            }"
            :style="{ '--connection-accent': conn.color || 'transparent' }"
            :title="getConnectionTooltip(conn)"
            @click="handleSelectConnection(conn)"
            @dblclick="handleToggleConnection(conn)"
            @contextmenu.prevent="handleContextMenu($event, conn)"
          >
            <div class="connection-expand-icon" @click.stop="getConnectionStatus(conn.id) === 'error' ? handleConnectToDatabase(conn) : handleToggleExpand(conn)">
              <ReloadOutlined
                v-if="getConnectionStatus(conn.id) === 'error'"
                class="reconnect-icon"
              />
              <DownOutlined 
                v-else-if="getConnectionStatus(conn.id) === 'connected' && expandedConnections.has(conn.id)" 
                class="expand-icon"
              />
              <RightOutlined 
                v-else-if="getConnectionStatus(conn.id) === 'connected'" 
                class="expand-icon"
              />
              <LoadingOutlined
                v-else-if="getConnectionStatus(conn.id) === 'connecting'"
                class="expand-icon connecting-icon"
              />
              <span v-else class="connection-indent-placeholder"></span>
            </div>
            
            <!-- 专业品牌图标 -->
            <div class="connection-icon" :class="{ 'connection-icon--dimmed': getConnectionStatus(conn.id) !== 'connected' && getConnectionStatus(conn.id) !== 'connecting' }">
              <Icon 
                :icon="getBrandIcon(conn.db_type)" 
                class="brand-icon"
              />
            </div>
            
            <div class="connection-name" :class="{ 'connection-name--error': getConnectionStatus(conn.id) === 'error' }">{{ conn.name }}</div>
            
            <div class="connection-actions">
              <a-badge :status="getStatusBadge(conn.id)" size="small" />
              <DisconnectOutlined 
                v-if="getConnectionStatus(conn.id) === 'connected'"
                class="disconnect-btn"
                @click.stop="handleDisconnect(conn)"
              />
              <LinkOutlined
                v-if="getConnectionStatus(conn.id) === 'error'"
                class="reconnect-action-btn"
                @click.stop="handleConnectToDatabase(conn)"
              />
            </div>
          </div>
          
          <!-- 数据库对象树 -->
          <div 
            v-if="getConnectionStatus(conn.id) === 'connected' && expandedConnections.has(conn.id)" 
            class="database-tree-wrapper"
            :style="{ '--connection-accent': conn.color || 'var(--border-color)' }"
          >
            <div class="root-tree-line"></div>
            
            <DatabaseTree
              :ref="(el: unknown) => { if (el) databaseTreeRefs.set(conn.id, el) }"
              :connection-id="conn.id"
              :db-type="conn.db_type"
              :search-options="searchOptions"
              @update-matches-count="handleUpdateMatchesCount"
              @table-selected="(data: TableTreeEventData) => emit('table-selected', { ...data, connectionId: conn.id })"
              @database-selected="(data: DatabaseTreeEventData) => emit('database-selected', { ...data, connectionId: conn.id })"
              @object-selected="(data: any) => emit('object-selected', { ...data, connectionId: conn.id })"
              @new-query="(data: QueryTreeEventData) => emit('new-query', data)"
              @design-table="(data: TableTreeEventData) => emit('design-table', { ...data, connectionId: conn.id })"
              @view-structure="(data: TableTreeEventData) => emit('view-structure', { ...data, connectionId: conn.id })"
              @open-scripts="(data: QueryTreeEventData) => emit('open-scripts', data)"
              @generate-sql="(data: any) => emit('generate-sql', data)"
            />
          </div>
        </div>
      </div>

      <a-empty
        v-if="filteredConnections.length === 0"
        :description="$t('connection.no_connections')"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        class="empty-connections"
      />
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="app-context-menu-overlay context-menu-overlay"
      @click="hideContextMenu()"
    >
      <div
        class="app-context-menu context-menu"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
        @click.stop
      >
        <a-menu @click="handleMenuClick" size="small">
          <a-menu-item key="connect" v-if="getConnectionStatus(selectedConnection?.id || '') !== 'connected'">
            <LinkOutlined /> {{ $t('common.run') }}
          </a-menu-item>
          <a-menu-item key="disconnect" v-if="getConnectionStatus(selectedConnection?.id || '') === 'connected'">
            <DisconnectOutlined /> {{ $t('common.close') }}
          </a-menu-item>
          <a-menu-divider v-if="getConnectionStatus(selectedConnection?.id || '') === 'connected' && canCreateDatabase" />
          <a-menu-item key="create-database" v-if="getConnectionStatus(selectedConnection?.id || '') === 'connected' && canCreateDatabase">
            <DatabaseOutlined /> {{ $t('common.new') }}{{ $t('common.database') }}
          </a-menu-item>
          <a-menu-divider />
          <a-menu-item key="edit"><EditOutlined /> {{ $t('common.edit') }}</a-menu-item>
          <a-menu-item key="delete" danger><DeleteOutlined /> {{ $t('common.delete') }}</a-menu-item>
        </a-menu>
      </div>
    </div>
    
    <CreateDatabaseDialog
      v-model:visible="showCreateDatabaseDialog"
      :connection-id="selectedConnection?.id || ''"
      :db-type="selectedConnection?.db_type"
      @created="handleDatabaseCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { h, computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DatabaseOutlined, PlusOutlined, LinkOutlined, EditOutlined, DeleteOutlined,
  DisconnectOutlined, DownOutlined, RightOutlined, SearchOutlined,
  ReloadOutlined, LoadingOutlined
} from '@ant-design/icons-vue'
import { message, Modal, Empty } from '@/ui/antd'
import { getErrorMessage } from '@/utils/errorHandler'
import { useConnectionStore } from '@/stores/connection'
import type { ConnectionConfig } from '@/types/database'
import DatabaseTree from '@/components/database/DatabaseTree.vue'
import CreateDatabaseDialog from '@/components/database/CreateDatabaseDialog.vue'
import { Icon } from '@iconify/vue'
import { useContextMenu } from '@/composables/useContextMenu'
import { createStartupTimer, logStartupStage } from '@/utils/startupProfiler'

const { t } = useI18n()
const emit = defineEmits(['add-connection', 'edit-connection', 'table-selected', 'database-selected', 'object-selected', 'new-query', 'design-table', 'view-structure', 'open-scripts', 'generate-sql'])

const connectionStore = useConnectionStore()
const searchText = ref('')
const searchCaseSensitive = ref(false)
const searchRegex = ref(false)
const searchColumns = ref(false)
const matchesCount = ref(0)

const searchOptions = computed(() => ({
  text: searchText.value,
  caseSensitive: searchCaseSensitive.value,
  regex: searchRegex.value,
  searchColumns: searchColumns.value,
}))

function handleUpdateMatchesCount(count: number) {
  matchesCount.value = count
}
const activeConnectionId = computed(() => connectionStore.activeConnectionId)
const showCreateDatabaseDialog = ref(false)
const expandedConnections = ref<Set<string>>(new Set())
const { contextMenuVisible, contextMenuX, contextMenuY, showContextMenu, hideContextMenu } = useContextMenu()
const selectedConnection = ref<ConnectionConfig | null>(null)
const databaseTreeRefs = new Map<string, any>()

interface TableTreeEventData {
  connectionId?: string
  database?: string
  table?: string
  schema?: string
  metadata?: { schema?: string }
}

interface DatabaseTreeEventData {
  connectionId?: string
  name?: string
}

interface QueryTreeEventData {
  connectionId?: string
  database?: string
  filePath?: string
  title?: string
  content?: string
}

/**
 * 获取专业品牌图标
 */
function getBrandIcon(dbType?: string) {
  const type = (dbType || '').toLowerCase()
  if (type.includes('postgres')) return 'logos:postgresql'
  if (type.includes('mysql')) return 'logos:mysql'
  if (type.includes('redis')) return 'logos:redis'
  if (type.includes('sqlite')) return 'logos:sqlite'
  if (type.includes('mongo')) return 'logos:mongodb-icon'
  return 'material-symbols:database'
}

const canCreateDatabase = computed(() => {
  if (!selectedConnection.value) return false
  return selectedConnection.value.db_type?.toLowerCase() !== 'sqlite'
})

const filteredConnections = computed(() => {
  const list = connectionStore.connections
  if (!searchText.value) return list
  const text = searchText.value.toLowerCase()
  return list.filter(c => {
    const isMatched = c.name.toLowerCase().includes(text) || c.host.toLowerCase().includes(text)
    if (isMatched) return true
    return connectionStore.getConnectionStatus(c.id) === 'connected'
  })
})

function handleSelectConnection(conn: ConnectionConfig) { connectionStore.setActiveConnection(conn.id) }

async function handleToggleExpand(conn: ConnectionConfig) {
  if (getConnectionStatus(conn.id) !== 'connected') { await handleConnectToDatabase(conn); return }
  const newExpanded = new Set(expandedConnections.value)
  const shouldExpand = !newExpanded.has(conn.id)
  if (!shouldExpand) newExpanded.delete(conn.id)
  else newExpanded.add(conn.id)
  expandedConnections.value = newExpanded

  if (shouldExpand) {
    await nextTick()
    databaseTreeRefs.get(conn.id)?.refresh?.()
  }
}

async function handleToggleConnection(conn: ConnectionConfig) {
  if (getConnectionStatus(conn.id) === 'connected') {
    const newExpanded = new Set(expandedConnections.value)
    if (newExpanded.has(conn.id)) newExpanded.delete(conn.id)
    else newExpanded.add(conn.id)
    expandedConnections.value = newExpanded
  } else { await handleConnectToDatabase(conn) }
}

async function handleConnectToDatabase(conn: ConnectionConfig) {
  try {
    connectionStore.updateConnectionStatus(conn.id, 'connecting')
    await connectionStore.connectToDatabase(conn.id)
    if (connectionStore.getConnectionStatus(conn.id) !== 'connected') {
      connectionStore.updateConnectionStatus(conn.id, 'error')
      return
    }
    connectionStore.setActiveConnection(conn.id)
    const newExpanded = new Set(expandedConnections.value)
    newExpanded.add(conn.id)
    expandedConnections.value = newExpanded
    message.success(`${t('connection.success')}: ${conn.name}`)
  } catch (error: unknown) { connectionStore.updateConnectionStatus(conn.id, 'error'); message.error(`${t('connection.fail')}: ${getErrorMessage(error)}`) }
}

async function handleDisconnect(conn: ConnectionConfig) {
  try {
    await connectionStore.disconnectFromDatabase(conn.id)
    connectionStore.updateConnectionStatus(conn.id, 'disconnected')
    const newExpanded = new Set(expandedConnections.value)
    newExpanded.delete(conn.id)
    expandedConnections.value = newExpanded
    message.success(`${t('common.close')}: ${conn.name}`)
  } catch (error: unknown) { message.error(getErrorMessage(error)) }
}

function handleContextMenu(event: MouseEvent, conn: ConnectionConfig) {
  selectedConnection.value = conn; showContextMenu(event);
}

async function handleMenuClick({ key }: { key: string | number }) {
  if (!selectedConnection.value) return
  hideContextMenu()
  if (key === 'connect') await handleConnectToDatabase(selectedConnection.value)
  else if (key === 'disconnect') await handleDisconnect(selectedConnection.value)
  else if (key === 'create-database') showCreateDatabaseDialog.value = true
  else if (key === 'edit') emit('edit-connection', selectedConnection.value)
  else if (key === 'delete') {
    Modal.confirm({
      title: t('common.delete'), content: `${t('connection.delete_confirm')} "${selectedConnection.value.name}"?`,
      async onOk() {
        try { await connectionStore.deleteConnection(selectedConnection.value!.id); message.success(t('common.save')) }
        catch (error: unknown) { message.error(getErrorMessage(error)) }
      }
    })
  }
}

function handleDatabaseCreated() { if (selectedConnection.value) databaseTreeRefs.get(selectedConnection.value.id)?.refresh() }
function getConnectionStatus(id: string) { return connectionStore.getConnectionStatus(id) }
function getConnectionTooltip(conn: ConnectionConfig): string {
  const baseInfo = `${conn.db_type} • ${conn.host}:${conn.port}`
  const status = connectionStore.getConnectionStatus(conn.id)
  if (status === 'error') return `${baseInfo}\n⚠ ${t('connection.connection_lost')}`
  if (status === 'connecting') return `${baseInfo}\n⌛ ${t('connection.connecting')}`
  return baseInfo
}
function getStatusBadge(id: string) {
  const s = connectionStore.getConnectionStatus(id)
  return s === 'connected' ? 'success' : s === 'connecting' ? 'processing' : s === 'error' ? 'error' : 'default'
}

let escapeHandler: ((e: KeyboardEvent) => void) | null = null

onMounted(async () => {
  const finishFetchConnections = createStartupTimer('ConnectionPanel.fetchConnections')
  await connectionStore.fetchConnections()
  await finishFetchConnections(`count=${connectionStore.connections.length}`)
  await logStartupStage('ConnectionPanel ready')
  escapeHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') hideContextMenu() }
  document.addEventListener('keydown', escapeHandler)
})

onUnmounted(() => {
  if (escapeHandler) document.removeEventListener('keydown', escapeHandler)
})
</script>

<style scoped>
.connection-panel { display: flex; flex-direction: column; height: 100%; background: transparent; }
.search-wrapper { padding: 4px 8px; border-bottom: 1px solid var(--border-color-muted); }
.search-options { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; }
.search-option-item { font-size: 12px; }
.search-match-count { margin-left: auto; color: var(--app-text-subtle); font-size: 11px; white-space: nowrap; }
.compact-search { background: transparent; }
.search-prefix-icon { color: var(--app-text-subtle); }
.panel-content { flex: 1; overflow: auto; padding: 4px 0; }
.connection-group { position: relative; }
.connection-item { display: flex; align-items: center; padding: 0 8px; height: 28px; cursor: pointer; transition: background-color 0.1s; user-select: none; position: relative; }
.connection-item::before { content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; border-radius: 0 999px 999px 0; background-color: var(--connection-accent, transparent); opacity: 0.95; transition: background-color 0.3s; }
.connection-item:hover { background-color: var(--surface-hover); }
.connection-item.active { background-color: var(--surface-active); color: var(--color-primary); }
.connection-item--error::before { background-color: var(--color-danger) !important; opacity: 0.85 !important; }
.connection-indent-placeholder { width: 12px; display: inline-block; }
.connection-expand-icon { display: flex; align-items: center; justify-content: center; width: 16px; font-size: 10px; color: var(--app-text-subtle); margin-right: 2px; }
.reconnect-icon { font-size: 12px; color: var(--color-danger); cursor: pointer; }
.reconnect-icon:hover { color: var(--color-danger-hover); }
.connecting-icon { color: var(--color-primary); animation: spin 1s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }
.connection-icon { display: flex; align-items: center; justify-content: center; width: 20px; margin-right: 8px; flex-shrink: 0; transition: opacity 0.3s; }
.connection-icon--dimmed { opacity: 0.45; }
.brand-icon { font-size: 16px; }
.connection-name { flex: 1; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--app-text-muted); }
.connection-name--error { color: var(--color-danger) !important; }
.active .connection-name { color: inherit; }
.connection-actions { display: flex; align-items: center; gap: 6px; opacity: 0.6; }
.connection-item:hover .connection-actions { opacity: 1; }
.disconnect-btn { font-size: 12px; color: var(--color-danger); cursor: pointer; }
.disconnect-btn:hover { color: var(--color-danger-hover); }
.reconnect-action-btn { font-size: 12px; color: var(--color-primary); cursor: pointer; }
.reconnect-action-btn:hover { color: var(--color-primary-hover); }
.database-tree-wrapper { position: relative; }
.database-tree-wrapper :deep(.database-tree) { padding-left: 10px; box-sizing: border-box; }
.root-tree-line { position: absolute; left: 16px; top: 0; bottom: 0; width: 1px; background-color: var(--connection-accent, var(--border-color)); z-index: 1; pointer-events: none; opacity: 0.55; }
.dark-mode .root-tree-line { opacity: 0.4; }
.empty-connections { margin-top: 40px; }
</style>
