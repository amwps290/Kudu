<template>
  <div class="database-tree">
    <a-spin :spinning="loading" :tip="$t('common.loading')">
      <div class="custom-tree">
        <div v-for="node in filteredTreeData" :key="node.key" class="tree-node-wrapper">
          <TreeNodeItem
            :node="node"
            :level="0"
            :expanded-keys="expandedKeys"
            :selected-keys="selectedKeys"
            :loading-nodes="loadingNodes"
            @toggle="handleToggle"
            @select="handleSelect"
            @dblclick="handleDoubleClick"
            @contextmenu="onRightClick"
          />
        </div>
      </div>
      <a-empty v-if="!loading && filteredTreeData.length === 0" :description="searchValue ? $t('tree.no_data') : '请选择连接'" :image-style="{ height: '60px' }" />
    </a-spin>

    <!-- 右键菜单 -->
    <div v-if="contextMenuVisible" class="context-menu-overlay" @click="hideContextMenu()">
      <div class="context-menu" :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }" @click.stop>
        <a-menu @click="handleMenuClick" size="small">
          <template v-if="selectedNode?.type === 'database'">
            <template v-if="supportProfile.supportsConnectionScripts">
              <a-menu-item key="new-query"><template #icon><FileTextOutlined /></template>{{ $t('tree.new_query') }}</a-menu-item>
              <a-menu-item key="open-scripts"><template #icon><FolderOpenOutlined /></template>{{ $t('tree.open_scripts') }}</a-menu-item>
              <a-menu-divider />
              <a-menu-item v-if="supportProfile.supportsBackupRestore" key="backup-database"><template #icon><DownloadOutlined /></template>{{ $t('tree.backup_database') }}</a-menu-item>
              <a-menu-item v-if="supportProfile.supportsBackupRestore" key="restore-database"><template #icon><UploadOutlined /></template>{{ $t('tree.restore_database') }}</a-menu-item>
              <a-menu-divider v-if="supportProfile.supportsBackupRestore" />
            </template>
            <a-menu-item key="refresh"><template #icon><ReloadOutlined /></template>{{ $t('tree.refresh_db') }}</a-menu-item>
          </template>
          
          <template v-else-if="['schema', 'tables', 'views', 'schemas', 'functions', 'procedures', 'schema-tables', 'schema-views', 'schema-functions', 'schema-procedures', 'schema-indexes'].includes(selectedNode?.type || '')">
            <a-menu-item key="refresh"><template #icon><ReloadOutlined /></template>{{ $t('common.refresh') }}</a-menu-item>
          </template>
          
          <template v-if="selectedNode?.type === 'table'">
            <a-menu-item v-if="supportProfile.supportsTableDataView" key="view-data"><template #icon><TableOutlined /></template>{{ $t('tree.view_data') }}</a-menu-item>
            <a-menu-item key="view-ddl"><template #icon><CodeOutlined /></template>{{ $t('tree.view_ddl') }}</a-menu-item>
            <a-menu-item v-if="supportProfile.supportsTableDesign" key="design-table"><template #icon><EditOutlined /></template>{{ $t('tree.design_table') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="refresh"><template #icon><ReloadOutlined /></template>{{ $t('common.refresh') }}</a-menu-item>
          </template>

          <a-menu-item key="copy-name"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_name') }}</a-menu-item>
        </a-menu>
      </div>
    </div>

    <!-- DDL 预览弹窗 -->
    <a-modal v-model:open="showDdlModal" :title="`DDL: ${selectedNode?.title}`" width="800px" :footer="null">
      <div ref="ddlEditorContainer" style="height: 500px; border: 1px solid #d9d9d9"></div>
    </a-modal>

    <!-- 脚本列表弹窗 -->
    <a-modal v-model:open="showScriptsModal" :title="$t('tree.open_scripts')" :footer="null" width="500px">
      <a-list :data-source="savedScripts" :loading="loadingScripts" size="small">
        <template #renderItem="{ item }">
          <a-list-item @click="openSavedScript(item)" class="script-item">
            <a-list-item-meta :title="item.name">
              <template #description>{{ new Date(item.last_modified * 1000).toLocaleString() }}</template>
            </a-list-item-meta>
          </a-list-item>
        </template>
      </a-list>
    </a-modal>

    <BackupDatabaseDialog
      v-model="showBackupDialog"
      :connection-id="props.connectionId || ''"
      :database="activeDatabaseName"
      @backed="handleDatabaseBacked"
    />

    <RestoreDatabaseDialog
      v-model="showRestoreDialog"
      :connection-id="props.connectionId || ''"
      :database="activeDatabaseName"
      @restored="handleDatabaseRestored"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  TableOutlined, ReloadOutlined, CopyOutlined,
  FolderOpenOutlined, EditOutlined,
  FileTextOutlined, CodeOutlined, DownloadOutlined, UploadOutlined
} from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { metadataApi, workspaceApi, utilsApi } from '@/api'
import { getErrorMessage } from '@/utils/errorHandler'
import { useConnectionStore } from '@/stores/connection'
import TreeNodeItem from './TreeNodeItem.vue'
import BackupDatabaseDialog from './BackupDatabaseDialog.vue'
import RestoreDatabaseDialog from './RestoreDatabaseDialog.vue'
import { useMonacoEditor } from '@/composables/useMonacoEditor'
import { useContextMenu } from '@/composables/useContextMenu'
import { getDatabaseSupportProfile } from '@/utils/databaseSupport'
import { writeClipboardText } from '@/utils/clipboard'

interface TreeNode {
  key: string; title: string; type: string; children?: TreeNode[];
  isLeaf?: boolean; metadata?: any; isAutoExpanded?: boolean;
}

const { t } = useI18n()
const props = defineProps<{ connectionId: string | null; dbType?: string; searchValue?: string; }>()
const emit = defineEmits(['table-selected', 'database-selected', 'new-query', 'design-table', 'view-structure', 'open-scripts'])
const connectionStore = useConnectionStore()
const supportProfile = computed(() => getDatabaseSupportProfile(props.dbType || null))

const loading = ref(false), treeData = ref<TreeNode[]>([]), expandedKeys = ref<string[]>([]), selectedKeys = ref<string[]>([]), loadingNodes = ref<Set<string>>(new Set())
const { contextMenuVisible, contextMenuX, contextMenuY, showContextMenu, hideContextMenu } = useContextMenu()
const selectedNode = ref<TreeNode | null>(null)

const showDdlModal = ref(false), ddlEditorContainer = ref<HTMLElement>()
const { setValue: setDdlValue, createEditor: createDdlEditor, dispose: disposeDdlEditor } = useMonacoEditor(ddlEditorContainer, {
  language: 'sql',
  readOnly: true,
})

const filteredTreeData = computed(() => {
  if (!props.searchValue) return treeData.value
  const search = props.searchValue.toLowerCase()
  const filter = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.reduce((acc, node) => {
      const children = node.children ? filter(node.children) : []
      if (node.title.toLowerCase().includes(search) || children.length > 0) {
        acc.push({ ...node, children, isAutoExpanded: children.length > 0 })
      }
      return acc
    }, [] as TreeNode[])
  }
  return filter(treeData.value)
})

async function loadDatabases() {
  if (!props.connectionId) return
  loading.value = true
  try {
    if (props.dbType === 'sqlite') {
      treeData.value = [{ key: 'db-main', title: 'main', type: 'database', isLeaf: false, metadata: { name: 'main', database: 'main' } }]
    } else {
      const dbs = await metadataApi.getDatabases(props.connectionId)
      const isLeafDatabase = !supportProfile.value.supportsDatabaseTreeChildren
      treeData.value = dbs.map(db => ({
        key: `db-${db.name}`,
        title: db.name,
        type: 'database',
        isLeaf: isLeafDatabase,
        metadata: { ...db, database: db.name }
      }))
    }
  } catch (e: unknown) { message.error(getErrorMessage(e)) } finally { loading.value = false }
}

async function handleRefreshNode(node: TreeNode) {
  expandedKeys.value = expandedKeys.value.filter(k => k !== node.key)
  updateNodeInTree(treeData.value, node.key, (target) => { target.children = undefined })
  treeData.value = [...treeData.value]
  message.success(t('common.refresh'))
}

function updateNodeInTree(nodes: TreeNode[], targetKey: string, updater: (node: TreeNode) => void): boolean {
  for (const node of nodes) {
    if (node.key === targetKey) { updater(node); return true }
    if (node.children && updateNodeInTree(node.children, targetKey, updater)) return true
  }
  return false
}

async function onLoadData(treeNode: TreeNode) {
  if (treeNode.children && treeNode.children.length > 0) return
  const connId = props.connectionId
  if (!connId) return

  if (treeNode.type === 'database') {
    if (!supportProfile.value.supportsDatabaseTreeChildren) return

    const dbName = treeNode.metadata.name
    let children: TreeNode[] = []
    if (props.dbType === 'postgresql') {
      children = [
        { key: `${treeNode.key}-schemas`, title: 'Schemas', type: 'schemas', isLeaf: false, metadata: { database: dbName } },
        { key: `${treeNode.key}-extensions`, title: t('tree.extensions'), type: 'database-extensions', isLeaf: false, metadata: { database: dbName } }
      ]
    } else if (props.dbType === 'mysql') {
      children = [
        { key: `${treeNode.key}-tables`, title: t('tree.tables'), type: 'tables', isLeaf: false, metadata: { database: dbName } },
        { key: `${treeNode.key}-views`, title: t('tree.views'), type: 'views', isLeaf: false, metadata: { database: dbName } },
        { key: `${treeNode.key}-functions`, title: t('tree.functions'), type: 'functions', isLeaf: false, metadata: { database: dbName, schema: dbName } },
        { key: `${treeNode.key}-procedures`, title: t('tree.procedures'), type: 'procedures', isLeaf: false, metadata: { database: dbName, schema: dbName } }
      ]
    } else {
      children = [
        { key: `${treeNode.key}-tables`, title: t('tree.tables'), type: 'tables', isLeaf: false, metadata: { database: dbName } },
        { key: `${treeNode.key}-views`, title: t('tree.views'), type: 'views', isLeaf: false, metadata: { database: dbName } }
      ]
    }
    updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children)
    treeData.value = [...treeData.value]
  }
  else if (treeNode.type === 'schemas') {
    try {
      const res = await metadataApi.getSchemas(connId, treeNode.metadata.database)
      const children = res.map(s => ({ key: `${treeNode.key}-${s.name}`, title: s.name, type: 'schema', isLeaf: false, metadata: { database: treeNode.metadata.database, name: s.name } }))
      updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children)
      treeData.value = [...treeData.value]
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }
  else if (treeNode.type === 'schema') {
    const db = treeNode.metadata.database, schema = treeNode.metadata.name
    const children = [
      { key: `${treeNode.key}-tables`, title: t('tree.tables'), type: 'schema-tables', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-views`, title: t('tree.views'), type: 'schema-views', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-indexes`, title: t('tree.indexes'), type: 'schema-indexes', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-functions`, title: t('tree.functions'), type: 'schema-functions', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-procedures`, title: t('tree.procedures'), type: 'schema-procedures', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-aggregates`, title: t('tree.aggregates'), type: 'schema-aggregates', isLeaf: false, metadata: { database: db, schema } }
    ]
    updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children)
    treeData.value = [...treeData.value]
  }
  else if (['schema-tables', 'schema-views', 'tables', 'views'].includes(treeNode.type)) {
    const isSchema = treeNode.type.startsWith('schema-'), isViews = treeNode.type.includes('views')
    try {
      let res: any[]
      if (isViews) {
        res = await metadataApi.getViews(connId, treeNode.metadata.database)
      } else if (isSchema) {
        res = await metadataApi.getSchemaTables(connId, treeNode.metadata.database, treeNode.metadata.schema)
      } else {
        res = await metadataApi.getTables(connId, treeNode.metadata.database)
      }
      const children = res.map(t => ({ key: `${treeNode.key}-${t.name}`, title: t.name, type: isViews ? 'view' : 'table', isLeaf: false, metadata: { ...t, database: treeNode.metadata.database, schema: treeNode.metadata.schema } }))
      updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children.length ? children : [{ key: `${treeNode.key}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }])
      treeData.value = [...treeData.value]
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }
  else if (['schema-indexes', 'schema-functions', 'schema-procedures', 'schema-aggregates', 'database-extensions', 'functions', 'procedures'].includes(treeNode.type)) {
    const isFunction = treeNode.type === 'schema-functions' || treeNode.type === 'functions'
    const isProcedure = treeNode.type === 'schema-procedures' || treeNode.type === 'procedures'
    const isAggregate = treeNode.type === 'schema-aggregates'
    const isIndex = treeNode.type === 'schema-indexes'

    try {
      let res: any[]
      if (isIndex) {
        res = await metadataApi.getSchemaIndexes(connId, treeNode.metadata.database, treeNode.metadata.schema)
      } else if (isFunction) {
        res = await metadataApi.getSchemaFunctions(connId, treeNode.metadata.database, treeNode.metadata.schema || treeNode.metadata.database)
      } else if (isProcedure) {
        res = await metadataApi.getSchemaProcedures(connId, treeNode.metadata.database, treeNode.metadata.schema || treeNode.metadata.database)
      } else if (isAggregate) {
        res = await metadataApi.getSchemaAggregateFunctions(connId, treeNode.metadata.database, treeNode.metadata.schema)
      } else {
        res = await metadataApi.getDatabaseExtensions(connId, treeNode.metadata.database)
      }
      const children = res.map(item => {
        let title = item.name || item.index_name

        // 针对函数和聚合函数，拼接参数列表
        if ((isFunction || isProcedure || isAggregate) && item.arguments) {
          title = `${item.name}(${item.arguments})`
        }
        // 针对索引类型，拼接关联列名
        else if (isIndex && item.columns && item.columns.length > 0) {
          title = `${item.name} (${item.columns.join(', ')})`
        }

        return {
          key: `${treeNode.key}-${item.name || item.index_name}`,
          title,
          type: isFunction ? 'function' : isProcedure ? 'procedure' : 'leaf',
          isLeaf: true,
          metadata: { ...item, database: treeNode.metadata.database, schema: treeNode.metadata.schema }
        }
      })
      updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children.length ? children : [{ key: `${treeNode.key}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }])
      treeData.value = [...treeData.value]
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }
  else if (['table', 'view'].includes(treeNode.type)) {
    try {
      const res = await metadataApi.getTableStructure({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, database: treeNode.metadata.database, schema: treeNode.metadata.schema })
      const children = res.map(c => ({ key: `${treeNode.key}-col-${c.name}`, title: `${c.name}${c.data_type ? ' : ' + c.data_type : ''}${c.is_primary_key ? ' [PK]' : ''}`, type: 'column', isLeaf: true, metadata: { ...c, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema } }))
      updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children.length ? children : [{ key: `${treeNode.key}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }])
      treeData.value = [...treeData.value]
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }
}

async function handleToggle(node: TreeNode) {
  if (!expandedKeys.value.includes(node.key)) {
    expandedKeys.value = [...expandedKeys.value, node.key]
    if (!node.children || node.children.length === 0) {
      loadingNodes.value.add(node.key); loadingNodes.value = new Set(loadingNodes.value)
      try { await onLoadData(node) } finally { loadingNodes.value.delete(node.key); loadingNodes.value = new Set(loadingNodes.value) }
    }
  } else { expandedKeys.value = expandedKeys.value.filter(k => k !== node.key) }
}

function handleSelect(node: TreeNode) { selectedKeys.value = [node.key]; if (node.type === 'database') emit('database-selected', node.metadata); }
async function handleDoubleClick(node: TreeNode) {
  if (node.type === 'database' && !supportProfile.value.supportsDatabaseTreeChildren) return
  if (['database', 'schema', 'schemas', 'tables', 'views', 'schema-tables', 'schema-views', 'schema-indexes'].includes(node.type)) handleToggle(node)
  else if (['table', 'view'].includes(node.type) && supportProfile.value.supportsTableDataView) { emit('table-selected', { database: node.metadata.database, table: node.metadata.name || node.title, schema: node.metadata.schema, metadata: node.metadata }) }
}

function onRightClick({ event, node }: { event: MouseEvent; node: TreeNode }) {
  selectedNode.value = node; showContextMenu(event);
}

const showScriptsModal = ref(false), savedScripts = ref<import('@/types/database').ScriptInfo[]>([]), loadingScripts = ref(false)
const showBackupDialog = ref(false)
const showRestoreDialog = ref(false)
const activeDatabaseName = ref('')

function getNodeDatabaseName(node: TreeNode) {
  return node.metadata?.name || node.metadata?.database || ''
}

async function refreshDatabaseNode(databaseName: string) {
  const node = treeData.value.find(item => item.type === 'database' && getNodeDatabaseName(item) === databaseName)
  if (!node) {
    await loadDatabases()
    return
  }

  const wasExpanded = expandedKeys.value.includes(node.key)
  await handleRefreshNode(node)

  if (wasExpanded) {
    await handleToggle(node)
  }
}

async function handleMenuClick({ key }: { key: string | number }) {
  hideContextMenu(); if (!selectedNode.value) return
  if (key === 'new-query') emit('new-query', { database: selectedNode.value.metadata.name || selectedNode.value.metadata.database, connectionId: props.connectionId })
  else if (key === 'open-scripts') { showScriptsModal.value = true; loadingScripts.value = true; try { savedScripts.value = await workspaceApi.listDbScripts(props.connectionId!, selectedNode.value.metadata.name || selectedNode.value.metadata.database) } finally { loadingScripts.value = false } }
  else if (key === 'backup-database') {
    activeDatabaseName.value = getNodeDatabaseName(selectedNode.value)
    showBackupDialog.value = true
  }
  else if (key === 'restore-database') {
    activeDatabaseName.value = getNodeDatabaseName(selectedNode.value)
    showRestoreDialog.value = true
  }
  else if (key === 'refresh') handleRefreshNode(selectedNode.value)
  else if (key === 'copy-name') { await writeClipboardText(selectedNode.value.title); message.success(t('common.copy')) }
  else if (key === 'view-data') {
    emit('table-selected', { 
      database: selectedNode.value.metadata.database, 
      table: selectedNode.value.metadata.name || selectedNode.value.title, 
      schema: selectedNode.value.metadata.schema, 
      metadata: selectedNode.value.metadata 
    })
  }
  else if (key === 'design-table') {
    emit('design-table', { 
      database: selectedNode.value.metadata.database, 
      table: selectedNode.value.metadata.name || selectedNode.value.title, 
      schema: selectedNode.value.metadata.schema 
    })
  }
  else if (key === 'view-ddl') {
    try {
      const ddl = await metadataApi.getCreateTableDdl({
        connectionId: props.connectionId!,
        table: selectedNode.value.metadata.name || selectedNode.value.title,
        database: selectedNode.value.metadata.database,
        schema: selectedNode.value.metadata.schema
      })
      showDdlModal.value = true
      await nextTick()
      if (ddlEditorContainer.value) {
        disposeDdlEditor()
        await createDdlEditor()
        setDdlValue(ddl)
      }
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }
}

function handleDatabaseBacked() {
  showBackupDialog.value = false
}

async function handleDatabaseRestored() {
  showRestoreDialog.value = false
  if (activeDatabaseName.value) {
    await refreshDatabaseNode(activeDatabaseName.value)
  }
}

async function openSavedScript(s: { path: string; name: string }) { try { const content = await utilsApi.readFile(s.path); emit('new-query', { database: selectedNode.value?.metadata?.database || selectedNode.value?.title, connectionId: props.connectionId, content, filePath: s.path, title: s.name }); showScriptsModal.value = false } catch (e: unknown) { message.error(getErrorMessage(e)) } }

watch(() => props.connectionId, (id) => { if (id) loadDatabases(); else treeData.value = []; }, { immediate: true })
watch(() => connectionStore.getConnectionStatus(props.connectionId || ''), (s) => { if (s === 'connected' && treeData.value.length === 0 && !loading.value) loadDatabases(); })
defineExpose({ refresh: loadDatabases })
</script>

<style scoped>
.database-tree { height: 100%; overflow: visible; padding: 0; user-select: none; }
.custom-tree { width: 100%; }
.context-menu-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; }
.context-menu { position: absolute; background: #fff; border-radius: 4px; border: 1px solid #d9d9d9; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 10000; min-width: 120px; }
.dark-mode .context-menu { background: #1f1f1f; border-color: #303030; }
.script-item { cursor: pointer; transition: background 0.2s; }
.script-item:hover { background: #f5f5f5; }
</style>
