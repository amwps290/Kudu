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
      <a-empty v-if="!loading && filteredTreeData.length === 0" :description="props.searchOptions?.text ? $t('tree.no_data') : '请选择连接'" :image-style="{ height: '60px' }" />
    </a-spin>

    <!-- 右键菜单 -->
    <div v-if="contextMenuVisible" class="app-context-menu-overlay context-menu-overlay" @click="hideContextMenu()">
      <div ref="contextMenuRef" class="app-context-menu app-context-menu--scrollable context-menu" :style="contextMenuStyle" @click.stop>
        <a-menu @click="handleMenuClick" size="small" mode="inline" :inline-indent="8">
          <!-- 数据库节点 -->
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
            <a-menu-divider />
          </template>

          <!-- 表节点（完整菜单） -->
          <template v-else-if="selectedNode?.type === 'table'">
            <a-menu-item v-if="supportProfile.supportsTableDataView" key="view-data"><template #icon><TableOutlined /></template>{{ $t('tree.view_data') }}</a-menu-item>
            <a-menu-item key="view-ddl"><template #icon><CodeOutlined /></template>{{ $t('tree.view_ddl') }}</a-menu-item>
            <a-menu-item v-if="supportProfile.supportsTableDesign" key="design-table"><template #icon><EditOutlined /></template>{{ $t('tree.design_table') }}</a-menu-item>
            <a-menu-divider />
            <a-sub-menu key="sub-stats">
              <template #icon><NumberOutlined /></template>
              <template #title>{{ $t('tree.submenu_stats') }}</template>
              <a-menu-item key="row-count">{{ $t('tree.row_count') }}</a-menu-item>
            </a-sub-menu>
            <a-sub-menu key="sub-gen-sql">
              <template #icon><FileTextOutlined /></template>
              <template #title>{{ $t('tree.submenu_gen_sql') }}</template>
              <a-menu-item key="gen-select">{{ $t('tree.gen_select') }}</a-menu-item>
              <a-menu-item key="gen-insert">{{ $t('tree.gen_insert') }}</a-menu-item>
              <a-menu-item key="gen-update">{{ $t('tree.gen_update') }}</a-menu-item>
              <a-menu-item key="gen-delete">{{ $t('tree.gen_delete') }}</a-menu-item>
            </a-sub-menu>
            <a-menu-divider />
            <a-menu-item key="copy-columns"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_columns') }}</a-menu-item>
            <a-menu-item key="rename-table"><template #icon><EditOutlined /></template>{{ $t('tree.rename_table') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="truncate-table" danger><template #icon><DeleteOutlined /></template>{{ $t('tree.truncate_table') }}</a-menu-item>
            <a-menu-item key="drop-table" danger><template #icon><DeleteOutlined /></template>{{ selectedTableNodes.length > 1 ? $t('tree.drop_table_batch', { count: selectedTableNodes.length }) : $t('tree.drop_table') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="refresh"><template #icon><ReloadOutlined /></template>{{ $t('common.refresh') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <!-- 视图节点 -->
          <template v-else-if="selectedNode?.type === 'view'">
            <a-menu-item v-if="supportProfile.supportsTableDataView" key="view-data"><template #icon><TableOutlined /></template>{{ $t('tree.view_data') }}</a-menu-item>
            <a-menu-item key="view-ddl"><template #icon><CodeOutlined /></template>{{ $t('tree.view_definition') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="gen-select"><template #icon><FileTextOutlined /></template>{{ $t('tree.gen_select') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="drop-table" danger><template #icon><DeleteOutlined /></template>{{ $t('tree.drop_view') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="refresh"><template #icon><ReloadOutlined /></template>{{ $t('common.refresh') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <!-- 可查看定义的元数据节点 -->
          <template v-else-if="hasDefinitionNode">
            <a-menu-item key="view-definition"><template #icon><CodeOutlined /></template>{{ $t('tree.view_definition') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <!-- 其他可刷新节点（schema/tables组等） -->
          <template v-else-if="isRefreshableNode">
            <a-menu-item key="refresh"><template #icon><ReloadOutlined /></template>{{ $t('common.refresh') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <a-menu-item key="copy-name"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_name') }}</a-menu-item>
        </a-menu>
      </div>
    </div>

    <a-modal v-model:open="showRenameModal" :title="$t('tree.rename_table')" @ok="submitRename" :confirm-loading="renameSubmitting">
      <a-input v-model:value="renameValue" :placeholder="$t('tree.rename_placeholder')" @pressEnter="submitRename" />
    </a-modal>

    <!-- DDL 预览弹窗 -->
    <a-modal v-model:open="showDdlModal" :title="`DDL: ${selectedNode?.title}`" width="800px" :footer="null">
      <div ref="ddlEditorContainer" class="ddl-preview-editor"></div>
    </a-modal>

    <!-- 脚本列表弹窗 -->
    <a-modal v-model:open="showScriptsModal" :title="$t('tree.open_scripts')" :footer="null" width="500px">
      <a-list :data-source="savedScripts" :loading="loadingScripts" size="small">
        <template #renderItem="{ item }">
          <a-list-item @click="openSavedScript(item)" class="interactive-row interactive-row--soft script-item">>
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
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  TableOutlined, ReloadOutlined, CopyOutlined,
  FolderOpenOutlined, EditOutlined, NumberOutlined,
  FileTextOutlined, CodeOutlined, DownloadOutlined, UploadOutlined, DeleteOutlined
} from '@ant-design/icons-vue'
import { message, Modal } from '@/ui/antd'
import { metadataApi, workspaceApi, utilsApi, queryApi } from '@/api'
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
  isLeaf?: boolean; metadata?: any; isAutoExpanded?: boolean; highlight?: boolean;
}

const { t } = useI18n()
interface SearchOptions {
  text: string
  caseSensitive: boolean
  regex: boolean
  searchColumns: boolean
}

const props = defineProps<{ connectionId: string | null; dbType?: string; searchOptions?: SearchOptions }>()
const emit = defineEmits(['table-selected', 'database-selected', 'new-query', 'design-table', 'view-structure', 'open-scripts', 'generate-sql', 'updateMatchesCount'])
const connectionStore = useConnectionStore()
const supportProfile = computed(() => getDatabaseSupportProfile(props.dbType || null))

const REFRESHABLE_NODE_TYPES = ['schema', 'tables', 'views', 'schemas', 'functions', 'procedures', 'schema-tables', 'schema-views', 'schema-functions', 'schema-procedures']
const isRefreshableNode = computed(() => REFRESHABLE_NODE_TYPES.includes(selectedNode.value?.type || ''))
const TABLE_OBJECT_GROUP_NODE_TYPES = [
  'table-columns',
  'view-columns',
  'table-indexes',
  'table-foreign-keys',
  'table-triggers',
  'table-rules',
  'table-uniques',
  'table-checks',
  'table-excludes'
]

const loading = ref(false), treeData = ref<TreeNode[]>([]), expandedKeys = ref<string[]>([]), selectedKeys = ref<string[]>([]), loadingNodes = ref<Set<string>>(new Set())
const { contextMenuVisible, contextMenuX, contextMenuY, showContextMenu, hideContextMenu } = useContextMenu()
const selectedNode = ref<TreeNode | null>(null)
const selectedNodes = ref<TreeNode[]>([])
const contextMenuRef = ref<HTMLElement>()
const contextMenuStyle = computed(() => {
  const margin = 8
  const top = contextMenuTop.value
  let maxH: number
  if (menuOpenUpward.value) {
    maxH = contextMenuY.value - top - margin
  } else {
    maxH = window.innerHeight - top - margin
  }
  return {
    left: `${contextMenuLeft.value}px`,
    top: `${top}px`,
    maxHeight: `${Math.max(120, maxH)}px`,
  }
})
const contextMenuLeft = ref(0)
const contextMenuTop = ref(0)
const menuOpenUpward = ref(false)
let contextMenuResizeObserver: ResizeObserver | null = null

const showDdlModal = ref(false), ddlEditorContainer = ref<HTMLElement>()
const hasDefinitionNode = computed(() => Boolean(selectedNode.value?.metadata?.definition))
const showRenameModal = ref(false)
const renameValue = ref('')
const renameSubmitting = ref(false)
const { setValue: setDdlValue, createEditor: createDdlEditor, dispose: disposeDdlEditor } = useMonacoEditor(ddlEditorContainer, {
  language: 'sql',
  readOnly: true,
})

const filteredTreeData = computed(() => {
  const opts = props.searchOptions
  if (!opts?.text) return treeData.value

  // 构造匹配函数
  let matcher: (text: string) => boolean
  if (opts.regex) {
    try {
      const flags = opts.caseSensitive ? '' : 'i'
      const regex = new RegExp(opts.text, flags)
      matcher = (text: string) => regex.test(text)
    } catch {
      matcher = () => false
    }
  } else {
    const search = opts.caseSensitive ? opts.text : opts.text.toLowerCase()
    matcher = (text: string) => {
      const target = opts.caseSensitive ? text : text.toLowerCase()
      return target.includes(search)
    }
  }

  let totalMatches = 0

  const filterNode = (node: TreeNode): { node: TreeNode; count: number } | null => {
    // 递归子节点
    let matchedChildren: TreeNode[] = []
    let childCount = 0
    if (node.children) {
      for (const child of node.children) {
        const result = filterNode(child)
        if (result) {
          matchedChildren.push(result.node)
          childCount += result.count
        }
      }
    }

    // 当前节点标题匹配
    const titleMatch = matcher(node.title)

    // 搜索列名模式：表/视图节点下检查列节点
    let columnMatch = false
    if (opts.searchColumns && (node.type === 'table' || node.type === 'view') && node.children) {
      const hasMatchingColumn = (nodes: TreeNode[]): boolean => nodes.some(child =>
        child.type === 'column'
          ? matcher(child.title)
          : Array.isArray(child.children) && child.children.length > 0
            ? hasMatchingColumn(child.children)
            : false
      )
      columnMatch = hasMatchingColumn(node.children)
    }

    const nodeMatches = titleMatch || columnMatch
    if (nodeMatches || matchedChildren.length > 0) {
      totalMatches += nodeMatches ? 1 : 0
      return {
        node: {
          ...node,
          children: matchedChildren.length > 0 ? matchedChildren : node.children,
          isAutoExpanded: matchedChildren.length > 0,
          highlight: nodeMatches || titleMatch ? true : undefined,
        },
        count: (nodeMatches ? 1 : 0) + childCount,
      }
    }
    return null
  }

  const filtered = treeData.value.reduce<TreeNode[]>((acc, node) => {
    const result = filterNode(node)
    if (result) acc.push(result.node)
    return acc
  }, [])

  // 通知父组件匹配结果数（通过 nextTick 避免连续更新）
  if (totalMatches !== lastEmittedMatches) {
    lastEmittedMatches = totalMatches
    setTimeout(() => emit('updateMatchesCount', totalMatches), 0)
  }

  return filtered
})

let lastEmittedMatches = -1

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
  const currentNode = findNodeInTree(treeData.value, node.key) || node
  const staleExpandedKeys = collectSubtreeKeys(currentNode)
  expandedKeys.value = expandedKeys.value.filter(key => !staleExpandedKeys.has(key))
  updateNodeInTree(treeData.value, node.key, (target) => { target.children = undefined })
  treeData.value = [...treeData.value]
  message.success(t('common.refresh'))
}

function collectSubtreeKeys(node: TreeNode): Set<string> {
  const keys = new Set<string>([node.key])
  const visit = (children?: TreeNode[]) => {
    if (!children) return
    for (const child of children) {
      keys.add(child.key)
      visit(child.children)
    }
  }
  visit(node.children)
  return keys
}

function findNodeInTree(nodes: TreeNode[], targetKey: string): TreeNode | null {
  for (const node of nodes) {
    if (node.key === targetKey) return node
    if (node.children) {
      const found = findNodeInTree(node.children, targetKey)
      if (found) return found
    }
  }
  return null
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
      const children = res.map(t => {
        const sizeLabel = typeof t.size_mb === 'number' ? formatStorageSize(Math.max(0, t.size_mb * 1024 * 1024)) : ''
        return {
          key: `${treeNode.key}-${t.name}`,
          title: sizeLabel ? `${t.name} · ${sizeLabel}` : t.name,
          type: isViews ? 'view' : 'table',
          isLeaf: false,
          metadata: { ...t, database: treeNode.metadata.database, schema: treeNode.metadata.schema }
        }
      })
      updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children.length ? children : [{ key: `${treeNode.key}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }])
      treeData.value = [...treeData.value]
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }
  else if (['schema-functions', 'schema-procedures', 'schema-aggregates', 'database-extensions', 'functions', 'procedures'].includes(treeNode.type)) {
    const isFunction = treeNode.type === 'schema-functions' || treeNode.type === 'functions'
    const isProcedure = treeNode.type === 'schema-procedures' || treeNode.type === 'procedures'
    const isAggregate = treeNode.type === 'schema-aggregates'

    try {
      let res: any[]
      if (isFunction) {
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
      const [columns, indexes, foreignKeys, triggers, constraints, rules] = await Promise.all([
        metadataApi.getTableStructure({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, database: treeNode.metadata.database, schema: treeNode.metadata.schema }),
        treeNode.type === 'table'
          ? metadataApi.getTableIndexes({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, schema: treeNode.metadata.schema })
          : Promise.resolve([]),
        treeNode.type === 'table'
          ? metadataApi.getTableForeignKeys({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, schema: treeNode.metadata.schema })
          : Promise.resolve([]),
        treeNode.type === 'table'
          ? metadataApi.getTableTriggers({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, database: treeNode.metadata.database, schema: treeNode.metadata.schema })
          : Promise.resolve([]),
        treeNode.type === 'table'
          ? metadataApi.getTableConstraints({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, database: treeNode.metadata.database, schema: treeNode.metadata.schema })
          : Promise.resolve([]),
        treeNode.type === 'table'
          ? metadataApi.getTableRules({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, database: treeNode.metadata.database, schema: treeNode.metadata.schema })
          : Promise.resolve([])
      ])

      const columnChildren = columns.map(c => ({
        key: `${treeNode.key}-col-${c.name}`,
        title: `${c.name}${c.data_type ? ' : ' + c.data_type : ''}${c.is_primary_key ? ' [PK]' : ''}`,
        type: 'column',
        isLeaf: true,
        metadata: { ...c, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema }
      }))

      const indexChildren = indexes.map(index => {
        const indexFlags = [
          index.is_primary ? 'PRIMARY' : '',
          !index.is_primary && index.is_unique ? 'UNIQUE' : ''
        ].filter(Boolean)
        const indexBadge = indexFlags.length ? ` [${indexFlags.join(', ')}]` : ''
        const indexColumns = index.columns?.length ? ` (${index.columns.join(', ')})` : ''

        const sizeLabel = formatStorageSize(index.size_bytes)

        return {
          key: `${treeNode.key}-idx-${index.name}`,
          title: `${index.name}${indexBadge}${indexColumns}${sizeLabel ? ` · ${sizeLabel}` : ''}`,
          type: 'index',
          isLeaf: true,
          metadata: { ...index, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema }
        }
      })

      const foreignKeyChildren = foreignKeys.map(fk => ({
        key: `${treeNode.key}-fk-${fk.name}`,
        title: `${fk.name} (${fk.column_name} → ${fk.referenced_table_name}.${fk.referenced_column_name})`,
        type: 'foreign-key',
        isLeaf: true,
        metadata: { ...fk, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema }
      }))

      const triggerChildren = triggers.map(trigger => {
        const triggerParts = [trigger.timing, trigger.event].filter(Boolean).join(' ')
        const triggerBadge = triggerParts ? ` [${triggerParts}]` : ''
        const disabledBadge = trigger.enabled === false ? ' [DISABLED]' : ''

        return {
          key: `${treeNode.key}-trigger-${trigger.name}`,
          title: `${trigger.name}${triggerBadge}${disabledBadge}`,
          type: 'trigger',
          isLeaf: true,
          metadata: { ...trigger, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema }
        }
      })

      const makeConstraintChildren = (constraintType: string, nodeType: string) => constraints
        .filter(constraint => constraint.constraint_type === constraintType)
        .map(constraint => {
          const columns = constraint.columns?.length ? ` (${constraint.columns.join(', ')})` : ''
          return {
            key: `${treeNode.key}-${nodeType}-${constraint.name}`,
            title: `${constraint.name}${columns}`,
            type: nodeType,
            isLeaf: true,
            metadata: { ...constraint, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema }
          }
        })

      const uniqueChildren = makeConstraintChildren('UNIQUE', 'unique-constraint')
      const checkChildren = makeConstraintChildren('CHECK', 'check-constraint')
      const excludeChildren = makeConstraintChildren('EXCLUDE', 'exclude-constraint')
      const ruleChildren = rules.map(rule => {
        const ruleParts = [rule.is_instead ? 'INSTEAD' : '', rule.event].filter(Boolean).join(' ')
        const ruleBadge = ruleParts ? ` [${ruleParts}]` : ''
        return {
          key: `${treeNode.key}-rule-${rule.name}`,
          title: `${rule.name}${ruleBadge}`,
          type: 'rule',
          isLeaf: true,
          metadata: { ...rule, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema }
        }
      })

      const groupNodes: TreeNode[] = [
        {
          key: `${treeNode.key}-columns`,
          title: t('tree.columns'),
          type: treeNode.type === 'view' ? 'view-columns' : 'table-columns',
          isLeaf: false,
          metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
          children: columnChildren.length ? columnChildren : [{ key: `${treeNode.key}-columns-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }]
        }
      ]

      if (treeNode.type === 'table') {
        groupNodes.push(
          {
            key: `${treeNode.key}-indexes`,
            title: t('tree.indexes'),
            type: 'table-indexes',
            isLeaf: false,
            metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
            children: indexChildren.length ? indexChildren : [{ key: `${treeNode.key}-indexes-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }]
          },
          {
            key: `${treeNode.key}-foreign-keys`,
            title: t('tree.foreign_keys'),
            type: 'table-foreign-keys',
            isLeaf: false,
            metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
            children: foreignKeyChildren.length ? foreignKeyChildren : [{ key: `${treeNode.key}-foreign-keys-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }]
          },
          {
            key: `${treeNode.key}-triggers`,
            title: t('tree.triggers'),
            type: 'table-triggers',
            isLeaf: false,
            metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
            children: triggerChildren.length ? triggerChildren : [{ key: `${treeNode.key}-triggers-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }]
          }
        )

        if (uniqueChildren.length) {
          groupNodes.push({
            key: `${treeNode.key}-uniques`,
            title: t('tree.uniques'),
            type: 'table-uniques',
            isLeaf: false,
            metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
            children: uniqueChildren
          })
        }

        if (checkChildren.length) {
          groupNodes.push({
            key: `${treeNode.key}-checks`,
            title: t('tree.checks'),
            type: 'table-checks',
            isLeaf: false,
            metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
            children: checkChildren
          })
        }

        if (excludeChildren.length) {
          groupNodes.push({
            key: `${treeNode.key}-excludes`,
            title: t('tree.excludes'),
            type: 'table-excludes',
            isLeaf: false,
            metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
            children: excludeChildren
          })
        }

        if (ruleChildren.length) {
          groupNodes.push({
            key: `${treeNode.key}-rules`,
            title: t('tree.rules'),
            type: 'table-rules',
            isLeaf: false,
            metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
            children: ruleChildren
          })
        }
      }

      updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = groupNodes)
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

function handleSelect(payload: TreeNode | { node: TreeNode; event?: MouseEvent }) {
  const node = 'node' in payload ? payload.node : payload
  const event = 'node' in payload ? payload.event : undefined
  const appendSelection = Boolean(event && (event.ctrlKey || event.metaKey))

  if (appendSelection && node.type === 'table') {
    const exists = selectedNodes.value.some(item => item.key === node.key)
    selectedNodes.value = exists
      ? selectedNodes.value.filter(item => item.key !== node.key)
      : [...selectedNodes.value.filter(item => item.type === 'table' && sameTableScope(item, node)), node]
    selectedKeys.value = selectedNodes.value.map(item => item.key)
  } else {
    selectedNodes.value = [node]
    selectedKeys.value = [node.key]
  }

  if (node.type === 'database') emit('database-selected', node.metadata)
}
async function handleDoubleClick(node: TreeNode) {
  if (node.type === 'database' && !supportProfile.value.supportsDatabaseTreeChildren) return
  if (['database', 'schema', 'schemas', 'tables', 'views', 'schema-tables', 'schema-views', ...TABLE_OBJECT_GROUP_NODE_TYPES].includes(node.type)) handleToggle(node)
  else if (node.metadata?.definition) showMetadataDefinition(node)
  else if (['table', 'view'].includes(node.type) && supportProfile.value.supportsTableDataView) { emit('table-selected', { database: node.metadata.database, table: node.metadata.name || node.title, schema: node.metadata.schema, metadata: node.metadata }) }
}

async function showMetadataDefinition(node: TreeNode) {
  selectedNode.value = node
  showDdlModal.value = true
  await nextTick()
  if (ddlEditorContainer.value) {
    disposeDdlEditor()
    await createDdlEditor()
    setDdlValue(String(node.metadata?.definition || ''))
  }
}

function onRightClick({ event, node }: { event: MouseEvent; node: TreeNode }) {
  if (!selectedNodes.value.some(item => item.key === node.key)) {
    selectedNodes.value = [node]
    selectedKeys.value = [node.key]
  }
  selectedNode.value = node
  showContextMenu(event)
  nextTick(() => adjustContextMenuPosition())
}

const showScriptsModal = ref(false), savedScripts = ref<import('@/types/database').ScriptInfo[]>([]), loadingScripts = ref(false)
const showBackupDialog = ref(false)
const showRestoreDialog = ref(false)
const activeDatabaseName = ref('')

function getNodeDatabaseName(node: TreeNode) {
  return node.metadata?.name || node.metadata?.database || ''
}

/** 安全地从节点 metadata 中提取字符串值 */
function metaStr(node: TreeNode, key: string): string {
  return String((node.metadata as Record<string, unknown>)?.[key] || '')
}

function formatStorageSize(sizeInBytes?: number | null): string {
  if (!sizeInBytes || sizeInBytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = sizeInBytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
  return `${displayValue}${units[unitIndex]}`
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
  else if (key === 'view-definition') { await showMetadataDefinition(selectedNode.value) }
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
  else if (key === 'row-count') { await handleRowCount() }
  else if (key === 'gen-select') { await handleGenerateSql('SELECT') }
  else if (key === 'gen-insert') { await handleGenerateSql('INSERT') }
  else if (key === 'gen-update') { await handleGenerateSql('UPDATE') }
  else if (key === 'gen-delete') { await handleGenerateSql('DELETE') }
  else if (key === 'copy-columns') { await handleCopyColumns() }
  else if (key === 'rename-table') { openRenameModal() }
  else if (key === 'truncate-table') { await handleTruncateTable() }
  else if (key === 'drop-table') { await handleDropTable() }
  else if (key === 'view-ddl') {
    const node = selectedNode.value!
    const isView = node.type === 'view'
    try {
      const name = metaStr(node, 'name') || node.title
      const db = metaStr(node, 'database')
      const schema = metaStr(node, 'schema')
      let ddl: string
      if (isView) {
        ddl = await metadataApi.getViewDefinition({
          connectionId: props.connectionId!,
          view: name,
          database: db,
          schema: schema || undefined,
        })
      } else {
        ddl = await metadataApi.getCreateTableDdl({
          connectionId: props.connectionId!,
          table: name,
          database: db || undefined,
          schema: schema || undefined,
        })
      }
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

// ── 新增功能：行数统计 ──
async function handleRowCount() {
  const node = selectedNode.value!
  const table = metaStr(node, 'name') || node.title
  const schema = metaStr(node, 'schema')
  const db = metaStr(node, 'database')
  try {
    const sql = schema
      ? `SELECT COUNT(*) AS cnt FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
      : `SELECT COUNT(*) AS cnt FROM ${quoteIdent(table)}`
    const results = await queryApi.executeQuery(props.connectionId!, sql, db || null)
    const row = results[0]?.rows?.[0] as Record<string, unknown> | undefined
    const count = row?.cnt ?? row?.['COUNT(*)'] ?? '?'
    message.success(`${table}: ${count} ${t('tree.rows')}`)
  } catch (e: unknown) { message.error(getErrorMessage(e)) }
}

// ── 新增功能：生成 SQL 模板 ──
async function handleGenerateSql(type: string) {
  const node = selectedNode.value!
  const isView = node.type === 'view'
  const name = metaStr(node, 'name') || node.title
  const schema = metaStr(node, 'schema')
  const db = metaStr(node, 'database')
  const fullName = schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name)
  
  // 视图只支持 SELECT
  if (isView && type !== 'SELECT') {
    message.warning(t('tree.view_only_select'))
    return
  }

  try {
    let colList = '*'
    let colNames: string[] = []
    
    // 尝试获取列信息（视图可能没有列详情）
    try {
      const columns = await metadataApi.getTableStructure({
        connectionId: props.connectionId!,
        table: name,
        database: db || undefined,
        schema: schema || undefined,
      })
      colNames = columns.map(c => c.name)
      colList = colNames.map(c => quoteIdent(c)).join(', ')
    } catch { /* 列信息获取失败时使用 SELECT * */ }

    let sql = ''
    switch (type) {
      case 'SELECT':
        sql = `SELECT ${colList}\nFROM ${fullName}\nWHERE /* condition */;`
        break
      case 'INSERT':
        sql = `INSERT INTO ${fullName} (${colList})\nVALUES (${colNames.map(() => '/* value */').join(', ')});`
        break
      case 'UPDATE':
        sql = `UPDATE ${fullName}\nSET ${colNames.map(c => `${quoteIdent(c)} = /* value */`).join(',\n    ')}\nWHERE /* condition */;`
        break
      case 'DELETE':
        sql = `DELETE FROM ${fullName}\nWHERE /* condition */;`
        break
    }
    emit('generate-sql', { sql, database: db, connectionId: props.connectionId })
  } catch (e: unknown) { message.error(getErrorMessage(e)) }
}

// ── 新增功能：清空表 ──
async function handleTruncateTable() {
  const node = selectedNode.value!
  const table = metaStr(node, 'name') || node.title
  Modal.confirm({
    title: t('tree.truncate_table'),
    content: t('tree.truncate_confirm', { table }),
    okText: t('common.ok'),
    okType: 'danger',
    async onOk() {
      try {
        const schema = metaStr(node, 'schema')
        const sql = `TRUNCATE TABLE ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(table)}`
        await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
        message.success(t('tree.truncate_success', { table }))
        await refreshDatabaseNode(metaStr(node, 'database'))
      } catch (e: unknown) { message.error(getErrorMessage(e)) }
    }
  })
}

// ── 新增功能：删除表/视图 ──
async function handleDropTable() {
  const nodes = selectedTableNodes.value.length > 0 ? selectedTableNodes.value : (selectedNode.value ? [selectedNode.value] : [])
  if (nodes.length === 0) return

  const hasView = nodes.some(node => node.type === 'view')
  if (nodes.length > 1 && hasView) {
    message.warning(t('tree.multi_drop_tables_only'))
    return
  }

  if (nodes.length === 1) {
    const node = nodes[0]
    const isView = node.type === 'view'
    const name = metaStr(node, 'name') || node.title
    const objType = isView ? 'VIEW' : 'TABLE'
    const titleKey = isView ? 'tree.drop_view' : 'tree.drop_table'
    const confirmKey = isView ? 'tree.drop_view_confirm' : 'tree.drop_confirm'
    const successKey = isView ? 'tree.drop_view_success' : 'tree.drop_success'
    Modal.confirm({
      title: t(titleKey),
      content: t(confirmKey, { name, table: name } as Record<string, unknown>),
      okText: t('common.delete'),
      okType: 'danger',
      async onOk() {
        try {
          const schema = metaStr(node, 'schema')
          const sql = `DROP ${objType} ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(name)}`
          await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
          message.success(t(successKey, { name, table: name } as Record<string, unknown>))
          const parentKey = node.key.substring(0, node.key.lastIndexOf('-'))
          const parentNode = findNodeByKey(treeData.value, parentKey)
          if (parentNode) await handleRefreshNode(parentNode)
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      }
    })
    return
  }

  const names = nodes.map(node => metaStr(node, 'name') || node.title)
  Modal.confirm({
    title: t('tree.drop_table_batch', { count: nodes.length }),
    content: t('tree.drop_batch_confirm', { count: nodes.length, names: names.slice(0, 5).join(', ') }),
    okText: t('common.delete'),
    okType: 'danger',
    async onOk() {
      const failed: string[] = []
      for (const node of nodes) {
        try {
          const tableName = metaStr(node, 'name') || node.title
          const schema = metaStr(node, 'schema')
          const sql = `DROP TABLE ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(tableName)}`
          await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
        } catch {
          failed.push(metaStr(node, 'name') || node.title)
        }
      }
      if (failed.length === 0) message.success(t('tree.drop_batch_success', { count: nodes.length }))
      else message.warning(t('tree.drop_batch_partial', { success: nodes.length - failed.length, failed: failed.length, names: failed.join(', ') }))
      const first = nodes[0]
      const parentKey = first.key.substring(0, first.key.lastIndexOf('-'))
      const parentNode = findNodeByKey(treeData.value, parentKey)
      if (parentNode) await handleRefreshNode(parentNode)
      selectedNodes.value = []
      selectedKeys.value = []
    }
  })
}

function findNodeByKey(nodes: TreeNode[], key: string): TreeNode | null {
  for (const n of nodes) {
    if (n.key === key) return n
    if (n.children) {
      const found = findNodeByKey(n.children, key)
      if (found) return found
    }
  }
  return null
}

const selectedTableNodes = computed(() => selectedNodes.value.filter(node => node.type === 'table'))

function sameTableScope(a: TreeNode, b: TreeNode) {
  return metaStr(a, 'database') === metaStr(b, 'database') && metaStr(a, 'schema') === metaStr(b, 'schema')
}

function adjustContextMenuPosition() {
  const margin = 8
  const MIN_COMFORT_HEIGHT = 200

  contextMenuLeft.value = contextMenuX.value

  const spaceAbove = contextMenuY.value - margin
  const spaceBelow = window.innerHeight - contextMenuY.value - margin

  if (spaceBelow >= MIN_COMFORT_HEIGHT) {
    menuOpenUpward.value = false
    contextMenuTop.value = contextMenuY.value
  } else if (spaceAbove >= MIN_COMFORT_HEIGHT) {
    menuOpenUpward.value = true
    const estHeight = Math.min(400, spaceAbove)
    contextMenuTop.value = Math.max(margin, contextMenuY.value - estHeight)
  } else {
    if (spaceAbove > spaceBelow) {
      menuOpenUpward.value = true
      contextMenuTop.value = Math.max(margin, contextMenuY.value - spaceAbove)
    } else {
      menuOpenUpward.value = false
      contextMenuTop.value = contextMenuY.value
    }
  }
}

function bindContextMenuObserver() {
  contextMenuResizeObserver?.disconnect()
  if (!contextMenuRef.value || typeof ResizeObserver === 'undefined') return
  contextMenuResizeObserver = new ResizeObserver(() => {
    const margin = 8
    if (!contextMenuRef.value) return
    const rect = contextMenuRef.value.getBoundingClientRect()

    const maxLeft = window.innerWidth - rect.width - margin
    contextMenuLeft.value = Math.max(margin, Math.min(contextMenuLeft.value, maxLeft))

    if (menuOpenUpward.value) {
      const idealTop = contextMenuY.value - rect.height - margin
      contextMenuTop.value = Math.max(margin, idealTop)
    } else {
      const maxTop = window.innerHeight - rect.height - margin
      contextMenuTop.value = Math.max(margin, Math.min(contextMenuY.value, maxTop))
    }
  })
  contextMenuResizeObserver.observe(contextMenuRef.value)
}

function openRenameModal() {
  const node = selectedNode.value
  if (!node || !['table', 'view'].includes(node.type)) return
  renameValue.value = metaStr(node, 'name') || node.title
  showRenameModal.value = true
}

async function submitRename() {
  const node = selectedNode.value
  if (!node) return
  const oldName = metaStr(node, 'name') || node.title
  const newName = renameValue.value.trim()
  if (!newName) return message.warning(t('tree.rename_empty'))
  if (newName === oldName) return message.warning(t('tree.rename_same'))

  const schema = metaStr(node, 'schema')
  const database = metaStr(node, 'database') || null
  let sql = ''
  if (props.dbType === 'mysql') {
    if (node.type !== 'table') return message.warning(t('tree.rename_unsupported'))
    sql = `RENAME TABLE ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(oldName)} TO ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(newName)}`
  } else if (props.dbType === 'postgresql') {
    sql = `${node.type === 'view' ? 'ALTER VIEW' : 'ALTER TABLE'} ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`
  } else if (props.dbType === 'sqlite') {
    if (node.type !== 'table') return message.warning(t('tree.rename_unsupported'))
    sql = `ALTER TABLE ${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`
  } else {
    return message.warning(t('tree.rename_unsupported'))
  }

  renameSubmitting.value = true
  try {
    await queryApi.executeQuery(props.connectionId!, sql, database)
    showRenameModal.value = false
    message.success(t('tree.rename_success', { oldName, newName }))
    const parentKey = node.key.substring(0, node.key.lastIndexOf('-'))
    const parentNode = findNodeByKey(treeData.value, parentKey)
    if (parentNode) await handleRefreshNode(parentNode)
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  } finally {
    renameSubmitting.value = false
  }
}

function quoteIdent(name: string): string {
  const dbType = props.dbType || 'mysql'
  if (dbType === 'sqlite' || dbType === 'postgresql') return `"${name}"`
  return `\`${name}\``
}

// ── 新增功能：复制列名列表 ──
async function handleCopyColumns() {
  const node = selectedNode.value!
  const table = metaStr(node, 'name') || node.title
  const schema = metaStr(node, 'schema')
  const db = metaStr(node, 'database')
  try {
    const columns = await metadataApi.getTableStructure({
      connectionId: props.connectionId!,
      table,
      database: db || undefined,
      schema: schema || undefined,
    })
    const colList = columns.map(c => c.name).join(', ')
    await writeClipboardText(colList)
    message.success(`${t('tree.copy_columns')}: ${columns.length} ${t('tree.columns')}`)
  } catch (e: unknown) { message.error(getErrorMessage(e)) }
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
watch(contextMenuVisible, (visible) => {
  if (visible) {
    nextTick(() => {
      adjustContextMenuPosition()
      bindContextMenuObserver()
    })
  } else {
    contextMenuResizeObserver?.disconnect()
    contextMenuResizeObserver = null
  }
})
onBeforeUnmount(() => {
  contextMenuResizeObserver?.disconnect()
  contextMenuResizeObserver = null
})
defineExpose({ refresh: loadDatabases })
</script>

<style scoped>
.database-tree { height: 100%; overflow: visible; padding: 0; user-select: none; }
.custom-tree { width: 100%; }
.script-item { }
.ddl-preview-editor { height: 500px; border: 1px solid var(--border-color-strong); border-radius: var(--radius-sm); }
</style>
