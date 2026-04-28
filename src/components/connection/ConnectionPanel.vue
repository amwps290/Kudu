<template>
  <div class="connection-panel">
    <div class="panel-header">
      <span class="panel-title">{{ $t('connection.manager') }}</span>
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
          <template #prefix><SearchOutlined style="color: #bfbfbf" /></template>
        </a-input>
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
              expanded: expandedConnections.has(conn.id)
            }"
            :style="{ '--connection-accent': conn.color || 'transparent' }"
            :title="`${conn.db_type} • ${conn.host}:${conn.port}`"
            @click="handleSelectConnection(conn)"
            @dblclick="handleToggleConnection(conn)"
            @contextmenu.prevent="handleContextMenu($event, conn)"
          >
            <div class="connection-expand-icon" @click.stop="handleToggleExpand(conn)">
              <DownOutlined 
                v-if="getConnectionStatus(conn.id) === 'connected' && expandedConnections.has(conn.id)" 
                class="expand-icon"
              />
              <RightOutlined 
                v-else-if="getConnectionStatus(conn.id) === 'connected'" 
                class="expand-icon"
              />
              <span v-else style="width: 12px; display: inline-block;"></span>
            </div>
            
            <!-- 专业品牌图标 -->
            <div class="connection-icon">
              <Icon 
                :icon="getBrandIcon(conn.db_type)" 
                class="brand-icon"
              />
            </div>
            
            <div class="connection-name">{{ conn.name }}</div>
            
            <div class="connection-actions">
              <a-badge :status="getStatusBadge(conn.id)" size="small" />
              <DisconnectOutlined 
                v-if="getConnectionStatus(conn.id) === 'connected'"
                class="disconnect-btn"
                @click.stop="handleDisconnect(conn)"
              />
            </div>
          </div>
          
          <!-- 数据库对象树 -->
          <div 
            v-if="getConnectionStatus(conn.id) === 'connected' && expandedConnections.has(conn.id)" 
            class="database-tree-wrapper"
            :style="{ '--connection-accent': conn.color || '#e8e8e8' }"
          >
            <div class="root-tree-line"></div>
            
            <DatabaseTree
              :ref="(el: unknown) => { if (el) databaseTreeRefs.set(conn.id, el) }"
              :connection-id="conn.id"
              :db-type="conn.db_type"
              :search-value="searchText"
              @table-selected="(data: TableTreeEventData) => emit('table-selected', { ...data, connectionId: conn.id })"
              @database-selected="(data: DatabaseTreeEventData) => emit('database-selected', { ...data, connectionId: conn.id })"
              @new-query="(data: QueryTreeEventData) => emit('new-query', data)"
              @design-table="(data: TableTreeEventData) => emit('design-table', { ...data, connectionId: conn.id })"
              @view-structure="(data: TableTreeEventData) => emit('view-structure', { ...data, connectionId: conn.id })"
              @open-scripts="(data: QueryTreeEventData) => emit('open-scripts', data)"
            />
          </div>
        </div>
      </div>

      <a-empty
        v-if="filteredConnections.length === 0"
        :description="$t('connection.no_connections')"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        style="margin-top: 40px"
      />
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu-overlay"
      @click="hideContextMenu()"
    >
      <div
        class="context-menu"
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
  DisconnectOutlined, DownOutlined, RightOutlined, SearchOutlined
} from '@ant-design/icons-vue'
import { message, Modal, Empty } from 'ant-design-vue'
import { getErrorMessage } from '@/utils/errorHandler'
import { useConnectionStore } from '@/stores/connection'
import type { ConnectionConfig } from '@/types/database'
import DatabaseTree from '@/components/database/DatabaseTree.vue'
import CreateDatabaseDialog from '@/components/database/CreateDatabaseDialog.vue'
import { Icon } from '@iconify/vue'
import { useContextMenu } from '@/composables/useContextMenu'
import { createStartupTimer, logStartupStage } from '@/utils/startupProfiler'

const { t } = useI18n()
const emit = defineEmits(['add-connection', 'edit-connection', 'table-selected', 'database-selected', 'new-query', 'design-table', 'view-structure', 'open-scripts'])

const connectionStore = useConnectionStore()
const searchText = ref('')
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
    connectionStore.setActiveConnection(conn.id)
    connectionStore.updateConnectionStatus(conn.id, 'connected')
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
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
.dark-mode .panel-header { border-bottom-color: #303030; }
.panel-title { font-size: 12px; font-weight: 600; color: #8c8c8c; text-transform: uppercase; }
.search-wrapper { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; }
.dark-mode .search-wrapper { border-bottom-color: #303030; }
.compact-search { background: transparent; }
.panel-content { flex: 1; overflow: auto; padding: 4px 0; }
.connection-group { position: relative; }
.connection-item { display: flex; align-items: center; padding: 0 8px; height: 28px; cursor: pointer; transition: background-color 0.1s; user-select: none; position: relative; }
.connection-item::before { content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; border-radius: 0 999px 999px 0; background-color: var(--connection-accent, transparent); opacity: 0.95; }
.connection-item:hover { background-color: rgba(0, 0, 0, 0.04); }
.dark-mode .connection-item:hover { background-color: rgba(255, 255, 255, 0.05); }
.connection-item.active { background-color: #e6f7ff; color: #1890ff; }
.dark-mode .connection-item.active { background-color: #111b26; color: #177ddc; }
.connection-expand-icon { display: flex; align-items: center; justify-content: center; width: 16px; font-size: 10px; color: #bfbfbf; margin-right: 2px; }
.connection-icon { display: flex; align-items: center; justify-content: center; width: 20px; margin-right: 8px; flex-shrink: 0; }
.brand-icon { font-size: 16px; }
.connection-name { flex: 1; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #434343; }
.dark-mode .connection-name { color: #d9d9d9; }
.active .connection-name { color: inherit; }
.connection-actions { display: flex; align-items: center; gap: 6px; opacity: 0.6; }
.connection-item:hover .connection-actions { opacity: 1; }
.disconnect-btn { font-size: 12px; color: #ff4d4f; cursor: pointer; }
.disconnect-btn:hover { color: #ff7875; }
.database-tree-wrapper { position: relative; }
.database-tree-wrapper :deep(.database-tree) { padding-left: 10px; box-sizing: border-box; }
.root-tree-line { position: absolute; left: 16px; top: 0; bottom: 0; width: 1px; background-color: var(--connection-accent, #e8e8e8); z-index: 1; pointer-events: none; opacity: 0.55; }
.dark-mode .root-tree-line { opacity: 0.4; }
.context-menu-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; }
.context-menu { position: absolute; background: #fff; border-radius: 4px; border: 1px solid #d9d9d9; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 10000; min-width: 120px; }
.dark-mode .context-menu { background: #1f1f1f; border-color: #303030; }
</style>
