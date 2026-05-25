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
      <a-empty v-if="!loading && filteredTreeData.length === 0" :description="props.searchOptions?.text ? $t('tree.no_data') : $t('tree.select_connection')" :image-style="{ height: '60px' }" />
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
            <a-menu-item v-if="supportProfile.supportsTableDesign" key="design-table" :disabled="isSelectedNodeReadOnly"><template #icon><EditOutlined /></template>{{ $t('tree.design_table') }}</a-menu-item>
            <a-menu-divider />
            <a-sub-menu v-if="supportProfile.supportsTableDesign" key="sub-alter-table" :disabled="isSelectedNodeReadOnly">
              <template #icon><EditOutlined /></template>
              <template #title>{{ $t('tree.submenu_alter_table') }}</template>
              <a-menu-item key="add-column">{{ $t('tree.add_column') }}</a-menu-item>
              <a-menu-item key="add-index">{{ $t('tree.add_index') }}</a-menu-item>
              <a-menu-item key="add-foreign-key">{{ $t('tree.add_foreign_key') }}</a-menu-item>
            </a-sub-menu>
            <a-menu-divider v-if="supportProfile.supportsTableDesign" />
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
            <a-menu-item key="rename-table" :disabled="isSelectedNodeReadOnly"><template #icon><EditOutlined /></template>{{ $t('tree.rename_table') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="truncate-table" danger :disabled="isSelectedNodeReadOnly"><template #icon><DeleteOutlined /></template>{{ $t('tree.truncate_table') }}</a-menu-item>
            <a-menu-item key="drop-table" danger :disabled="isSelectedNodeReadOnly"><template #icon><DeleteOutlined /></template>{{ selectedTableNodes.length > 1 ? $t('tree.drop_table_batch', { count: selectedTableNodes.length }) : $t('tree.drop_table') }}</a-menu-item>
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
            <a-menu-item key="copy-view-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <a-menu-item key="rename-table" :disabled="isSelectedNodeReadOnly || !supportsViewRename"><template #icon><EditOutlined /></template>{{ $t('tree.rename_view') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="drop-table" danger><template #icon><DeleteOutlined /></template>{{ $t('tree.drop_view') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="refresh"><template #icon><ReloadOutlined /></template>{{ $t('common.refresh') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="selectedNode?.type === 'materialized-view'">
            <a-menu-item v-if="supportProfile.supportsTableDataView" key="view-data"><template #icon><TableOutlined /></template>{{ $t('tree.view_data') }}</a-menu-item>
            <a-menu-item key="view-ddl"><template #icon><CodeOutlined /></template>{{ $t('tree.view_definition') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="gen-select"><template #icon><FileTextOutlined /></template>{{ $t('tree.gen_select') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="copy-view-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <a-menu-item key="refresh-materialized-view"><template #icon><ReloadOutlined /></template>{{ $t('tree.refresh_materialized_view') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="selectedNode?.type === 'column'">
            <a-menu-item key="copy-column-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <template v-if="selectedNode?.metadata?.object_type === 'table'">
              <a-menu-item key="rename-column" :disabled="isSelectedNodeReadOnly"><template #icon><EditOutlined /></template>{{ $t('tree.rename_column') }}</a-menu-item>
              <a-menu-item key="open-column-designer" :disabled="isSelectedNodeReadOnly"><template #icon><EditOutlined /></template>{{ $t('tree.open_table_designer') }}</a-menu-item>
              <a-menu-divider />
              <a-menu-item key="drop-column" danger :disabled="isSelectedNodeReadOnly"><template #icon><DeleteOutlined /></template>{{ $t('tree.drop_column') }}</a-menu-item>
            </template>
            <a-menu-divider />
          </template>

          <template v-else-if="selectedNode?.type === 'index'">
            <a-menu-item key="copy-object-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <a-menu-item key="open-column-designer" :disabled="isSelectedNodeReadOnly"><template #icon><EditOutlined /></template>{{ $t('tree.open_table_designer') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="drop-index" danger :disabled="isSelectedNodeReadOnly"><template #icon><DeleteOutlined /></template>{{ $t('tree.drop_index') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="selectedNode?.type === 'foreign-key'">
            <a-menu-item key="copy-object-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <a-menu-item key="open-column-designer" :disabled="isSelectedNodeReadOnly"><template #icon><EditOutlined /></template>{{ $t('tree.open_table_designer') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="drop-foreign-key" danger :disabled="isSelectedNodeReadOnly"><template #icon><DeleteOutlined /></template>{{ $t('tree.drop_foreign_key') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="['function', 'procedure', 'aggregate'].includes(selectedNode?.type || '')">
            <a-menu-item key="view-routine-definition"><template #icon><CodeOutlined /></template>{{ $t('tree.view_definition') }}</a-menu-item>
            <a-menu-item key="copy-routine-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <a-menu-item key="gen-call-sql"><template #icon><FileTextOutlined /></template>{{ $t('tree.gen_call_sql') }}</a-menu-item>
            <a-menu-item key="copy-signature"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_signature') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="selectedNode?.type === 'sequence'">
            <a-menu-item key="view-sequence-definition"><template #icon><CodeOutlined /></template>{{ $t('tree.view_definition') }}</a-menu-item>
            <a-menu-item key="view-sequence-state"><template #icon><NumberOutlined /></template>{{ $t('tree.sequence_state') }}</a-menu-item>
            <a-menu-item key="set-sequence-value"><template #icon><EditOutlined /></template>{{ $t('tree.set_sequence_value') }}</a-menu-item>
            <a-menu-item key="restart-sequence"><template #icon><ReloadOutlined /></template>{{ $t('tree.restart_sequence') }}</a-menu-item>
            <a-menu-item key="copy-sequence-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <a-menu-item key="rename-sequence" :disabled="isSelectedNodeReadOnly"><template #icon><EditOutlined /></template>{{ $t('tree.rename_sequence') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="drop-sequence" danger :disabled="isSelectedNodeReadOnly"><template #icon><DeleteOutlined /></template>{{ $t('tree.drop_sequence') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="selectedNode?.type === 'enum-type'">
            <a-menu-item key="view-enum-definition"><template #icon><CodeOutlined /></template>{{ $t('tree.view_definition') }}</a-menu-item>
            <a-menu-item key="copy-enum-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="selectedNode?.type === 'domain-type'">
            <a-menu-item key="view-domain-definition"><template #icon><CodeOutlined /></template>{{ $t('tree.view_definition') }}</a-menu-item>
            <a-menu-item key="copy-domain-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="selectedNode?.type === 'extension'">
            <a-menu-item key="copy-extension-info"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_extension_info') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="isTableChildObjectNode">
            <a-menu-item v-if="hasDefinitionNode" key="view-definition"><template #icon><CodeOutlined /></template>{{ $t('tree.view_definition') }}</a-menu-item>
            <a-menu-item key="copy-object-definition"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_definition') }}</a-menu-item>
            <a-menu-item key="open-column-designer" :disabled="isSelectedNodeReadOnly"><template #icon><EditOutlined /></template>{{ $t('tree.open_table_designer') }}</a-menu-item>
            <a-menu-divider v-if="isDroppableTableChildNode" />
            <a-menu-item v-if="selectedNode?.type === 'trigger'" key="drop-trigger" danger :disabled="isSelectedNodeReadOnly"><template #icon><DeleteOutlined /></template>{{ $t('tree.drop_trigger') }}</a-menu-item>
            <a-menu-item v-else-if="selectedNode?.type === 'rule'" key="drop-rule" danger :disabled="isSelectedNodeReadOnly"><template #icon><DeleteOutlined /></template>{{ $t('tree.drop_rule') }}</a-menu-item>
            <a-menu-item v-else-if="isConstraintNode" key="drop-constraint" danger :disabled="isSelectedNodeReadOnly"><template #icon><DeleteOutlined /></template>{{ $t('tree.drop_constraint') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <!-- 可查看定义的元数据节点 -->
          <template v-else-if="hasDefinitionNode">
            <a-menu-item key="view-definition"><template #icon><CodeOutlined /></template>{{ $t('tree.view_definition') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="selectedNode?.type === 'schema'">
            <a-menu-item key="new-query"><template #icon><FileTextOutlined /></template>{{ $t('tree.new_query') }}</a-menu-item>
            <a-menu-item key="gen-create-table"><template #icon><FileTextOutlined /></template>{{ $t('tree.gen_create_table') }}</a-menu-item>
            <a-menu-item key="gen-create-view"><template #icon><FileTextOutlined /></template>{{ $t('tree.gen_create_view') }}</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="refresh"><template #icon><ReloadOutlined /></template>{{ $t('common.refresh') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <template v-else-if="isEnumLabelNode || isDomainDetailNode">
            <a-menu-item key="copy-name"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_name') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <!-- 其他可刷新节点（schema/tables组等） -->
          <template v-else-if="isRefreshableNode">
            <a-menu-item key="refresh"><template #icon><ReloadOutlined /></template>{{ $t('common.refresh') }}</a-menu-item>
            <a-menu-divider />
          </template>

          <a-menu-item v-if="!isEnumLabelNode && !isDomainDetailNode" key="copy-name"><template #icon><CopyOutlined /></template>{{ $t('tree.copy_name') }}</a-menu-item>
        </a-menu>
      </div>
    </div>

    <a-modal v-model:open="showRenameModal" :title="renameModalTitle" @ok="submitRename" :confirm-loading="renameSubmitting">
      <a-input v-model:value="renameValue" :placeholder="$t('tree.rename_placeholder')" @pressEnter="submitRename" />
    </a-modal>

    <!-- DDL 预览弹窗 -->
    <a-modal v-model:open="showDdlModal" :title="$t('tree.ddl_preview_title', { name: selectedNode?.title || '' })" width="800px" :footer="null">
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

    <a-modal v-model:open="showSequenceStateModal" :title="$t('tree.sequence_state')" :footer="null" width="520px">
      <div v-if="sequenceState" class="sequence-state-panel">
        <div class="sequence-state-row"><span>{{ $t('tree.sequence_last_value') }}</span><strong>{{ formatOptionalNumber(sequenceState.last_value) }}</strong></div>
        <div class="sequence-state-row"><span>{{ $t('tree.sequence_next_value') }}</span><strong>{{ formatOptionalNumber(sequenceState.next_value) }}</strong></div>
        <div class="sequence-state-row"><span>{{ $t('tree.sequence_start_value') }}</span><strong>{{ formatOptionalNumber(sequenceState.start_value) }}</strong></div>
        <div class="sequence-state-row"><span>{{ $t('tree.sequence_increment_by') }}</span><strong>{{ formatOptionalNumber(sequenceState.increment_by) }}</strong></div>
        <div class="sequence-state-row"><span>{{ $t('tree.sequence_is_called') }}</span><strong>{{ sequenceState.is_called ? $t('common.yes') : $t('common.no') }}</strong></div>
      </div>
    </a-modal>

    <a-modal v-model:open="showSequenceValueModal" :title="$t('tree.set_sequence_value')" @ok="submitSequenceValue" :confirm-loading="sequenceValueSubmitting">
      <a-input-number v-model:value="sequenceValueInput" :min="1" :precision="0" style="width: 100%" />
      <div class="sequence-value-hint">{{ $t('tree.set_sequence_value_hint') }}</div>
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
import { escapeSqlLiteral } from '@/utils/sqlHelpers'
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
const currentConnection = computed(() => props.connectionId ? connectionStore.connections.find(connection => connection.id === props.connectionId) || null : null)

const REFRESHABLE_NODE_TYPES = ['schema', 'tables', 'views', 'schemas', 'functions', 'procedures', 'schema-tables', 'schema-views', 'schema-materialized-views', 'schema-functions', 'schema-procedures', 'schema-sequences', 'schema-enum-types', 'schema-domain-types']
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
  'table-excludes',
  'table-partitions'
]
const TABLE_CHILD_OBJECT_NODE_TYPES = ['index', 'foreign-key', 'trigger', 'rule', 'unique-constraint', 'check-constraint', 'exclude-constraint']
const ENUM_LABEL_NODE_TYPES = ['enum-label']
const DOMAIN_DETAIL_NODE_TYPES = ['domain-detail', 'domain-constraint']
const VIRTUAL_GROUP_NODE_TYPES = [...TABLE_OBJECT_GROUP_NODE_TYPES, 'empty']

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
const showSequenceStateModal = ref(false)
const sequenceState = ref<import('@/types/database').SequenceStateInfo | null>(null)
const showSequenceValueModal = ref(false)
const sequenceValueInput = ref<number | undefined>(undefined)
const sequenceValueSubmitting = ref(false)
const hasDefinitionNode = computed(() => Boolean(selectedNode.value?.metadata?.definition))
const showRenameModal = ref(false)
const renameValue = ref('')
const renameSubmitting = ref(false)
const renameMode = ref<'table' | 'column'>('table')
const { setValue: setDdlValue, createEditor: createDdlEditor, dispose: disposeDdlEditor } = useMonacoEditor(ddlEditorContainer, {
  language: 'sql',
  readOnly: true,
})
const renameModalTitle = computed(() => {
  if (renameMode.value === 'column') return t('tree.rename_column')
  if (selectedNode.value?.type === 'sequence') return t('tree.rename_sequence')
  return t('tree.rename_table')
})
const isTableChildObjectNode = computed(() => TABLE_CHILD_OBJECT_NODE_TYPES.includes(selectedNode.value?.type || ''))
const isConstraintNode = computed(() => ['unique-constraint', 'check-constraint', 'exclude-constraint'].includes(selectedNode.value?.type || ''))
const isDroppableTableChildNode = computed(() => ['trigger', 'rule', 'unique-constraint', 'check-constraint', 'exclude-constraint'].includes(selectedNode.value?.type || ''))
const isSelectedNodeReadOnly = computed(() => Boolean(currentConnection.value?.read_only))
const supportsViewRename = computed(() => props.dbType === 'postgresql')
const isEnumLabelNode = computed(() => ENUM_LABEL_NODE_TYPES.includes(selectedNode.value?.type || ''))
const isDomainDetailNode = computed(() => DOMAIN_DETAIL_NODE_TYPES.includes(selectedNode.value?.type || ''))

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
    if (opts.searchColumns && (node.type === 'table' || node.type === 'view' || node.type === 'materialized-view') && node.children) {
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
    } else if (props.dbType === 'postgresql') {
      children = [
        { key: `${treeNode.key}-schemas`, title: 'Schemas', type: 'schemas', isLeaf: false, metadata: { database: dbName } },
        { key: `${treeNode.key}-extensions`, title: t('tree.extensions'), type: 'database-extensions', isLeaf: false, metadata: { database: dbName } }
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
      { key: `${treeNode.key}-materialized-views`, title: t('tree.materialized_views'), type: 'schema-materialized-views', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-functions`, title: t('tree.functions'), type: 'schema-functions', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-sequences`, title: t('tree.sequences'), type: 'schema-sequences', isLeaf: false, metadata: { database: db, schema } },
      ...(props.dbType === 'postgresql' ? [{ key: `${treeNode.key}-enum-types`, title: t('tree.enum_types'), type: 'schema-enum-types', isLeaf: false, metadata: { database: db, schema } }] : []),
      ...(props.dbType === 'postgresql' ? [{ key: `${treeNode.key}-domain-types`, title: t('tree.domain_types'), type: 'schema-domain-types', isLeaf: false, metadata: { database: db, schema } }] : []),
      ...(props.dbType === 'mysql' ? [{ key: `${treeNode.key}-procedures`, title: t('tree.procedures'), type: 'schema-procedures', isLeaf: false, metadata: { database: db, schema } }] : []),
      { key: `${treeNode.key}-aggregates`, title: t('tree.aggregates'), type: 'schema-aggregates', isLeaf: false, metadata: { database: db, schema } }
    ]
    updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children)
    treeData.value = [...treeData.value]
  }
  else if (['schema-tables', 'schema-views', 'schema-materialized-views', 'tables', 'views'].includes(treeNode.type)) {
    const isSchema = treeNode.type.startsWith('schema-')
    const isMaterializedViews = treeNode.type === 'schema-materialized-views'
    const isViews = treeNode.type.includes('views') && !isMaterializedViews
    try {
      let res: any[]
      if (isMaterializedViews) {
        res = await metadataApi.getSchemaMaterializedViews(connId, treeNode.metadata.database, treeNode.metadata.schema)
      } else if (isViews) {
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
          title: formatTableNodeTitle(t, sizeLabel),
          type: isMaterializedViews ? 'materialized-view' : isViews ? 'view' : 'table',
          isLeaf: false,
          metadata: { ...t, database: treeNode.metadata.database, schema: treeNode.metadata.schema }
        }
      })
      updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children.length ? children : [{ key: `${treeNode.key}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }])
      treeData.value = [...treeData.value]
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }
  else if (['schema-functions', 'schema-procedures', 'schema-aggregates', 'schema-sequences', 'schema-enum-types', 'schema-domain-types', 'database-extensions', 'functions', 'procedures'].includes(treeNode.type)) {
    const isFunction = treeNode.type === 'schema-functions' || treeNode.type === 'functions'
    const isProcedure = treeNode.type === 'schema-procedures' || treeNode.type === 'procedures'
    const isAggregate = treeNode.type === 'schema-aggregates'
    const isSequence = treeNode.type === 'schema-sequences'
    const isEnumType = treeNode.type === 'schema-enum-types'
    const isDomainType = treeNode.type === 'schema-domain-types'

    try {
      let res: any[]
      if (isFunction) {
        res = await metadataApi.getSchemaFunctions(connId, treeNode.metadata.database, treeNode.metadata.schema || treeNode.metadata.database)
      } else if (isProcedure) {
        res = await metadataApi.getSchemaProcedures(connId, treeNode.metadata.database, treeNode.metadata.schema || treeNode.metadata.database)
      } else if (isAggregate) {
        res = await metadataApi.getSchemaAggregateFunctions(connId, treeNode.metadata.database, treeNode.metadata.schema)
      } else if (isSequence) {
        res = await metadataApi.getSchemaSequences(connId, treeNode.metadata.database, treeNode.metadata.schema)
      } else if (isEnumType) {
        res = await metadataApi.getSchemaEnumTypes(connId, treeNode.metadata.database, treeNode.metadata.schema)
      } else if (isDomainType) {
        res = await metadataApi.getSchemaDomainTypes(connId, treeNode.metadata.database, treeNode.metadata.schema)
      } else {
        res = await metadataApi.getDatabaseExtensions(connId, treeNode.metadata.database)
      }
      const children = res.map(item => {
        let title = item.name || item.index_name
        const routineKeyPart = item.oid != null ? `oid-${item.oid}` : `${item.name || item.index_name}-${item.identity_arguments || item.arguments || ''}`

        if ((isFunction || isProcedure || isAggregate) && item.arguments) {
          title = `${item.name}(${item.arguments})`
        }

        if (isEnumType) {
          const labelChildren = Array.isArray(item.labels)
            ? item.labels.map((label: string, index: number) => ({
                key: `${treeNode.key}-oid-${item.oid ?? item.name}-label-${index}`,
                title: label,
                type: 'enum-label',
                isLeaf: true,
                metadata: { label, database: treeNode.metadata.database, schema: treeNode.metadata.schema, enum_name: item.name, oid: item.oid }
              }))
            : []
          return {
            key: `${treeNode.key}-oid-${item.oid ?? item.name}`,
            title,
            type: 'enum-type',
            isLeaf: false,
            children: labelChildren.length ? labelChildren : [{ key: `${treeNode.key}-oid-${item.oid ?? item.name}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }],
            metadata: { ...item, database: treeNode.metadata.database, schema: treeNode.metadata.schema }
          }
        }

        if (isDomainType) {
          const detailChildren = [
            {
              key: `${treeNode.key}-oid-${item.oid ?? item.name}-detail-base-type`,
              title: `${t('common.type')}: ${item.base_type}`,
              type: 'domain-detail',
              isLeaf: true,
              metadata: { label: t('common.type'), value: item.base_type, database: treeNode.metadata.database, schema: treeNode.metadata.schema, domain_name: item.name, oid: item.oid }
            },
            {
              key: `${treeNode.key}-oid-${item.oid ?? item.name}-detail-default`,
              title: `${t('designer.default_value')}: ${item.default_value ?? 'NULL'}`,
              type: 'domain-detail',
              isLeaf: true,
              metadata: { label: t('designer.default_value'), value: item.default_value ?? 'NULL', database: treeNode.metadata.database, schema: treeNode.metadata.schema, domain_name: item.name, oid: item.oid }
            },
            {
              key: `${treeNode.key}-oid-${item.oid ?? item.name}-detail-nullable`,
              title: `${t('designer.nullable')}: ${item.nullable ? t('common.yes') : t('common.no')}`,
              type: 'domain-detail',
              isLeaf: true,
              metadata: { label: t('designer.nullable'), value: item.nullable ? t('common.yes') : t('common.no'), database: treeNode.metadata.database, schema: treeNode.metadata.schema, domain_name: item.name, oid: item.oid }
            },
            ...(Array.isArray(item.constraints)
              ? item.constraints.map((constraint: any, index: number) => ({
                  key: `${treeNode.key}-oid-${item.oid ?? item.name}-constraint-${index}`,
                  title: `${constraint.name}${constraint.definition ? `: ${constraint.definition}` : ''}`,
                  type: 'domain-constraint',
                  isLeaf: true,
                  metadata: { ...constraint, database: treeNode.metadata.database, schema: treeNode.metadata.schema, domain_name: item.name, oid: item.oid }
                }))
              : [])
          ]
          return {
            key: `${treeNode.key}-oid-${item.oid ?? item.name}`,
            title: `${title} : ${item.base_type}`,
            type: 'domain-type',
            isLeaf: false,
            children: detailChildren.length ? detailChildren : [{ key: `${treeNode.key}-oid-${item.oid ?? item.name}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }],
            metadata: { ...item, database: treeNode.metadata.database, schema: treeNode.metadata.schema }
          }
        }

        return {
          key: `${treeNode.key}-${routineKeyPart}`,
          title,
          type: isFunction ? 'function' : isProcedure ? 'procedure' : isAggregate ? 'aggregate' : isSequence ? 'sequence' : 'extension',
          isLeaf: true,
          metadata: { ...item, database: treeNode.metadata.database, schema: treeNode.metadata.schema }
        }
      })
      updateNodeInTree(treeData.value, treeNode.key, (n) => n.children = children.length ? children : [{ key: `${treeNode.key}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }])
      treeData.value = [...treeData.value]
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }
  else if (['table', 'view', 'materialized-view'].includes(treeNode.type)) {
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
        metadata: { ...c, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema, object_type: treeNode.type }
      }))

      const indexChildren = indexes.map(index => {
        const indexFlags = [
          index.is_primary ? 'PRIMARY' : '',
          !index.is_primary && index.is_unique ? 'UNIQUE' : ''
        ].filter(Boolean)
        const indexBadge = indexFlags.length ? ` [${indexFlags.join(', ')}]` : ''
        const indexColumns = index.columns?.length ? ` (${index.columns.join(', ')})` : ''
        const includeColumns = index.include_columns?.length ? ` INCLUDE (${index.include_columns.join(', ')})` : ''
        const predicate = index.predicate ? ` WHERE ${index.predicate}` : ''

        const sizeLabel = formatStorageSize(index.size_bytes)

        return {
          key: `${treeNode.key}-idx-${index.name}`,
          title: `${index.name}${indexBadge}${indexColumns}${includeColumns}${predicate}${sizeLabel ? ` · ${sizeLabel}` : ''}`,
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

      const partitionInfoChildren: TreeNode[] = []
      if (treeNode.metadata?.partition_key) {
        partitionInfoChildren.push({
          key: `${treeNode.key}-partition-key`,
          title: `${t('tree.partition_key')}: ${treeNode.metadata.partition_key}`,
          type: 'partition-key',
          isLeaf: true,
          metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema, partition_key: treeNode.metadata.partition_key }
        })
      }
      const partitionChildren = (treeNode.metadata?.partitions || []).map((partition: any) => ({
        key: `${treeNode.key}-partition-${partition.schema || treeNode.metadata.schema || ''}-${partition.name}`,
        title: partition.bound ? `${partition.name} · ${partition.bound}` : partition.name,
        type: 'table',
        isLeaf: false,
        metadata: {
          ...partition,
          database: treeNode.metadata.database,
          schema: partition.schema || treeNode.metadata.schema,
          table_type: 'PARTITION',
          partition_parent: `${treeNode.metadata.schema ? `${treeNode.metadata.schema}.` : ''}${treeNode.metadata.name}`,
        }
      }))

      const groupNodes: TreeNode[] = [
        {
          key: `${treeNode.key}-columns`,
          title: t('tree.columns'),
          type: ['view', 'materialized-view'].includes(treeNode.type) ? 'view-columns' : 'table-columns',
          isLeaf: false,
          metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
          children: columnChildren.length ? columnChildren : [{ key: `${treeNode.key}-columns-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }]
        }
      ]

      if (treeNode.type === 'table') {
        if (treeNode.metadata?.is_partitioned || treeNode.metadata?.partition_key || partitionChildren.length) {
          groupNodes.push({
            key: `${treeNode.key}-partitions`,
            title: t('tree.partitions'),
            type: 'table-partitions',
            isLeaf: false,
            metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
            children: [...partitionInfoChildren, ...partitionChildren].length
              ? [...partitionInfoChildren, ...partitionChildren]
              : [{ key: `${treeNode.key}-partitions-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }]
          })
        }

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
  if (['database', 'schema', 'schemas', 'tables', 'views', 'schema-tables', 'schema-views', 'schema-materialized-views', 'schema-enum-types', 'schema-domain-types', ...TABLE_OBJECT_GROUP_NODE_TYPES].includes(node.type)) handleToggle(node)
  else if (node.type === 'enum-type') { selectedNode.value = node; await handleViewEnumDefinition() }
  else if (node.type === 'domain-type') { selectedNode.value = node; await handleViewDomainDefinition() }
  else if (node.metadata?.definition) showMetadataDefinition(node)
  else if (['table', 'view', 'materialized-view'].includes(node.type) && supportProfile.value.supportsTableDataView) { emit('table-selected', { database: node.metadata.database, table: node.metadata.name || node.title, schema: node.metadata.schema, metadata: node.metadata }) }
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
  if (VIRTUAL_GROUP_NODE_TYPES.includes(node.type)) return
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

function formatTableNodeTitle(table: any, sizeLabel = ''): string {
  const badges = []
  if (table.is_partitioned) badges.push(t('tree.partitioned_table'))
  else if (table.partition_parent) badges.push(t('tree.partition'))

  const details = [...badges]
  if (sizeLabel) details.push(sizeLabel)
  return details.length ? `${table.name} · ${details.join(' · ')}` : table.name
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
  else if (key === 'gen-create-table') { await handleGenerateSchemaSql('table') }
  else if (key === 'gen-create-view') { await handleGenerateSchemaSql('view') }
  else if (key === 'add-column') { openNodeTableDesigner('columns', 'add_column') }
  else if (key === 'add-index') { openNodeTableDesigner('indexes', 'add_index') }
  else if (key === 'add-foreign-key') { openNodeTableDesigner('foreign_keys', 'add_foreign_key') }
  else if (key === 'copy-columns') { await handleCopyColumns() }
  else if (key === 'rename-table') { openRenameModal() }
  else if (key === 'rename-sequence') { openRenameModal() }
  else if (key === 'copy-column-definition') { await handleCopyColumnDefinition() }
  else if (key === 'copy-view-definition') { await handleCopyViewDefinition() }
  else if (key === 'refresh-materialized-view') { await handleRefreshMaterializedView() }
  else if (key === 'view-sequence-definition') { await handleViewSequenceDefinition() }
  else if (key === 'view-sequence-state') { await handleViewSequenceState() }
  else if (key === 'set-sequence-value') { await openSetSequenceValueModal() }
  else if (key === 'restart-sequence') { await handleRestartSequence() }
  else if (key === 'copy-sequence-definition') { await handleCopySequenceDefinition() }
  else if (key === 'view-enum-definition') { await handleViewEnumDefinition() }
  else if (key === 'copy-enum-definition') { await handleCopyEnumDefinition() }
  else if (key === 'view-domain-definition') { await handleViewDomainDefinition() }
  else if (key === 'copy-domain-definition') { await handleCopyDomainDefinition() }
  else if (key === 'view-routine-definition') { await handleViewRoutineDefinition() }
  else if (key === 'copy-routine-definition') { await handleCopyRoutineDefinition() }
  else if (key === 'gen-call-sql') { await handleGenerateCallSql() }
  else if (key === 'copy-signature') { await handleCopySignature() }
  else if (key === 'copy-extension-info') { await handleCopyExtensionInfo() }
  else if (key === 'rename-column') { openRenameModal('column') }
  else if (key === 'drop-column') { await handleDropColumn() }
  else if (key === 'copy-object-definition') { await handleCopyObjectDefinition() }
  else if (key === 'drop-index') { await handleDropIndex() }
  else if (key === 'drop-foreign-key') { await handleDropForeignKey() }
  else if (key === 'drop-trigger') { await handleDropTrigger() }
  else if (key === 'drop-rule') { await handleDropRule() }
  else if (key === 'drop-constraint') { await handleDropConstraint() }
  else if (key === 'open-column-designer') { openNodeTableDesigner() }
  else if (key === 'truncate-table') { await handleTruncateTable() }
  else if (key === 'drop-table') { await handleDropTable() }
  else if (key === 'drop-sequence') { await handleDropSequence() }
  else if (key === 'view-ddl') {
    const node = selectedNode.value!
    const isView = node.type === 'view' || node.type === 'materialized-view'
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

async function handleGenerateSchemaSql(kind: 'table' | 'view') {
  const node = selectedNode.value
  if (!node || node.type !== 'schema') return
  const schema = metaStr(node, 'name')
  const database = metaStr(node, 'database')
  const objectName = kind === 'table' ? 'new_table' : 'new_view'
  const qualifiedName = props.dbType === 'postgresql'
    ? `${quoteIdent(schema)}.${quoteIdent(objectName)}`
    : quoteIdent(objectName)
  const sql = kind === 'table'
    ? `CREATE TABLE ${qualifiedName} (\n  id INTEGER PRIMARY KEY\n);`
    : `CREATE VIEW ${qualifiedName} AS\nSELECT 1 AS sample;`
  emit('generate-sql', { sql, database, connectionId: props.connectionId })
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

function getTableNodePayload(node: TreeNode) {
  return {
    database: metaStr(node, 'database'),
    table: metaStr(node, 'table') || metaStr(node, 'name') || node.title,
    schema: metaStr(node, 'schema'),
  }
}

function resolveDesignerTarget(node: TreeNode) {
  if (node.type === 'index') {
    return { initialTab: 'indexes' as const, initialAction: undefined }
  }
  if (node.type === 'foreign-key') {
    return { initialTab: 'foreign_keys' as const, initialAction: undefined }
  }
  return { initialTab: 'columns' as const, initialAction: undefined }
}

function openNodeTableDesigner(initialTab?: 'columns' | 'indexes' | 'foreign_keys' | 'ddl', initialAction?: 'add_column' | 'add_index' | 'add_foreign_key') {
  const node = selectedNode.value
  if (!node) return
  const payload = getTableNodePayload(node)
  if (!payload.table) return
  const target = initialTab ? { initialTab, initialAction } : resolveDesignerTarget(node)
  emit('design-table', {
    ...payload,
    designTab: target.initialTab,
    designAction: initialAction || target.initialAction,
  })
}

function openRenameModal(mode: 'table' | 'column' = 'table') {
  const node = selectedNode.value
  if (!node) return
  if (mode === 'table' && !['table', 'view', 'sequence'].includes(node.type)) return
  if (mode === 'column' && node.type !== 'column') return
  renameMode.value = mode
  renameValue.value = mode === 'column' ? metaStr(node, 'name') : (metaStr(node, 'name') || node.title)
  showRenameModal.value = true
}

async function submitRename() {
  const node = selectedNode.value
  if (!node) return
  const oldName = renameMode.value === 'column' ? metaStr(node, 'name') : (metaStr(node, 'name') || node.title)
  const newName = renameValue.value.trim()
  if (!newName) return message.warning(t('tree.rename_empty'))
  if (newName === oldName) return message.warning(t('tree.rename_same'))

  renameSubmitting.value = true
  try {
    if (renameMode.value === 'column') {
      await renameColumn(node, oldName, newName)
    } else {
      await renameTableLike(node, oldName, newName)
    }
    showRenameModal.value = false
    message.success(t('tree.rename_success', { oldName, newName }))
    const parentKey = renameMode.value === 'column'
      ? node.key.split('-col-')[0]
      : node.key.substring(0, node.key.lastIndexOf('-'))
    const parentNode = findNodeByKey(treeData.value, parentKey)
    if (parentNode) await handleRefreshNode(parentNode)
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  } finally {
    renameSubmitting.value = false
  }
}

async function renameTableLike(node: TreeNode, oldName: string, newName: string) {
  const schema = metaStr(node, 'schema')
  const database = metaStr(node, 'database') || null
  let sql = ''
  if (props.dbType === 'mysql') {
    if (node.type !== 'table') throw new Error(t('tree.rename_unsupported'))
    sql = `RENAME TABLE ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(oldName)} TO ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(newName)}`
  } else if (props.dbType === 'postgresql') {
    const objectType = node.type === 'view' ? 'ALTER VIEW' : node.type === 'sequence' ? 'ALTER SEQUENCE' : 'ALTER TABLE'
    sql = `${objectType} ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`
  } else if (props.dbType === 'sqlite') {
    if (node.type !== 'table') throw new Error(t('tree.rename_unsupported'))
    sql = `ALTER TABLE ${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`
  } else {
    throw new Error(t('tree.rename_unsupported'))
  }
  await queryApi.executeQuery(props.connectionId!, sql, database)
}

async function renameColumn(node: TreeNode, oldName: string, newName: string) {
  await queryApi.alterTableStructure({
    connectionId: props.connectionId!,
    database: metaStr(node, 'database'),
    table: metaStr(node, 'table'),
    schema: metaStr(node, 'schema') || null,
    changes: [{
      type: 'modify_column',
      data: {
        old_name: oldName,
        new_column: {
          name: newName,
          data_type: node.metadata.data_type,
          nullable: node.metadata.nullable,
          default_value: node.metadata.default_value || null,
          is_primary_key: node.metadata.is_primary_key,
          is_auto_increment: node.metadata.is_auto_increment,
          comment: node.metadata.comment || null,
          character_maximum_length: node.metadata.character_maximum_length ?? null,
          numeric_precision: node.metadata.numeric_precision ?? null,
          numeric_scale: node.metadata.numeric_scale ?? null,
        }
      }
    }]
  })
}

function quoteIdent(name: string): string {
  const dbType = props.dbType || 'mysql'
  if (dbType === 'sqlite' || dbType === 'postgresql') return `"${name.replace(/"/g, '""')}"`
  return `\`${name.replace(/`/g, '``')}\``
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

function formatColumnDefinition(node: TreeNode) {
  const parts = [metaStr(node, 'name'), metaStr(node, 'data_type')]
  if (!node.metadata?.nullable) parts.push('NOT NULL')
  if (node.metadata?.default_value !== undefined && node.metadata?.default_value !== null && String(node.metadata.default_value) !== '') {
    parts.push(`DEFAULT ${String(node.metadata.default_value)}`)
  }
  if (node.metadata?.is_primary_key) parts.push('PRIMARY KEY')
  if (node.metadata?.is_auto_increment) parts.push('AUTO_INCREMENT')
  if (node.metadata?.comment) parts.push(`COMMENT ${String(node.metadata.comment)}`)
  return parts.filter(Boolean).join(' ')
}

function formatOptionalNumber(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : String(value)
}

async function handleCopyColumnDefinition() {
  const node = selectedNode.value
  if (!node || node.type !== 'column') return
  await writeClipboardText(formatColumnDefinition(node))
  message.success(t('common.copy'))
}

async function handleCopyViewDefinition() {
  const node = selectedNode.value
  if (!node || !['view', 'materialized-view'].includes(node.type)) return
  try {
    const ddl = await metadataApi.getViewDefinition({
      connectionId: props.connectionId!,
      view: metaStr(node, 'name') || node.title,
      database: metaStr(node, 'database'),
      schema: metaStr(node, 'schema') || undefined,
    })
    await writeClipboardText(ddl)
    message.success(t('common.copy'))
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function handleRefreshMaterializedView() {
  const node = selectedNode.value
  if (!node || node.type !== 'materialized-view') return
  const viewName = metaStr(node, 'name') || node.title
  Modal.confirm({
    title: t('tree.refresh_materialized_view'),
    content: t('tree.refresh_materialized_view_confirm', { name: viewName }),
    okText: t('common.ok'),
    async onOk() {
      try {
        const schema = metaStr(node, 'schema')
        const sql = `REFRESH MATERIALIZED VIEW ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(viewName)}`
        await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
        message.success(t('tree.refresh_materialized_view_success', { name: viewName }))
      } catch (e: unknown) {
        message.error(getErrorMessage(e))
      }
    }
  })
}

async function fetchSequenceDefinition(node: TreeNode) {
  const oidRaw = node.metadata?.oid
  const oid = typeof oidRaw === 'number' ? oidRaw : Number.isFinite(Number(oidRaw)) ? Number(oidRaw) : null
  return metadataApi.getSequenceDefinition({
    connectionId: props.connectionId!,
    name: metaStr(node, 'name') || node.title,
    oid,
    database: metaStr(node, 'database') || undefined,
    schema: metaStr(node, 'schema') || undefined,
  })
}

async function fetchSequenceState(node: TreeNode) {
  const oidRaw = node.metadata?.oid
  const oid = typeof oidRaw === 'number' ? oidRaw : Number.isFinite(Number(oidRaw)) ? Number(oidRaw) : null
  return metadataApi.getSequenceState({
    connectionId: props.connectionId!,
    name: metaStr(node, 'name') || node.title,
    oid,
    database: metaStr(node, 'database') || undefined,
    schema: metaStr(node, 'schema') || undefined,
  })
}

async function handleViewSequenceDefinition() {
  const node = selectedNode.value
  if (!node || node.type !== 'sequence') return
  try {
    const definition = await fetchSequenceDefinition(node)
    selectedNode.value = {
      ...node,
      metadata: {
        ...node.metadata,
        definition,
      }
    }
    await showMetadataDefinition(selectedNode.value)
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function handleCopySequenceDefinition() {
  const node = selectedNode.value
  if (!node || node.type !== 'sequence') return
  try {
    const definition = await fetchSequenceDefinition(node)
    await writeClipboardText(definition)
    message.success(t('common.copy'))
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function handleViewSequenceState() {
  const node = selectedNode.value
  if (!node || node.type !== 'sequence') return
  try {
    sequenceState.value = await fetchSequenceState(node)
    showSequenceStateModal.value = true
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

function buildSequenceQualifiedName(node: TreeNode) {
  const name = metaStr(node, 'name') || node.title
  const schema = metaStr(node, 'schema')
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name)
}

async function openSetSequenceValueModal() {
  const node = selectedNode.value
  if (!node || node.type !== 'sequence') return
  try {
    const state = await fetchSequenceState(node)
    sequenceState.value = state
    sequenceValueInput.value = state.next_value ?? state.last_value ?? state.start_value ?? 1
    showSequenceValueModal.value = true
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function submitSequenceValue() {
  const node = selectedNode.value
  if (!node || node.type !== 'sequence') return
  const nextValue = sequenceValueInput.value
  if (nextValue === undefined || !Number.isFinite(nextValue)) {
    message.warning(t('tree.sequence_value_invalid'))
    return
  }

  sequenceValueSubmitting.value = true
  try {
    const sql = `SELECT setval(${escapeSqlLiteral(buildSequenceQualifiedName(node))}, ${Math.trunc(nextValue)}, false);`
    await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
    showSequenceValueModal.value = false
    message.success(t('tree.set_sequence_value_success'))
    sequenceState.value = await fetchSequenceState(node)
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  } finally {
    sequenceValueSubmitting.value = false
  }
}

async function handleRestartSequence() {
  const node = selectedNode.value
  if (!node || node.type !== 'sequence') return
  try {
    const state = sequenceState.value ?? await fetchSequenceState(node)
    const restartWith = state.start_value ?? 1
    Modal.confirm({
      title: t('tree.restart_sequence'),
      content: t('tree.restart_sequence_confirm', { value: restartWith }),
      okText: t('common.ok'),
      async onOk() {
        const sql = `ALTER SEQUENCE ${buildSequenceQualifiedName(node)} RESTART WITH ${Math.trunc(restartWith)};`
        await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
        message.success(t('tree.restart_sequence_success'))
        sequenceState.value = await fetchSequenceState(node)
      }
    })
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function handleDropSequence() {
  const node = selectedNode.value
  if (!node || node.type !== 'sequence') return
  const sequenceName = metaStr(node, 'name') || node.title
  Modal.confirm({
    title: t('tree.drop_sequence'),
    content: t('tree.drop_sequence_confirm', { name: sequenceName }),
    okText: t('common.delete'),
    okType: 'danger',
    async onOk() {
      try {
        const sql = `DROP SEQUENCE ${buildSequenceQualifiedName(node)}`
        await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
        message.success(t('tree.drop_sequence_success', { name: sequenceName }))
        const parentKey = node.key.substring(0, node.key.lastIndexOf('-'))
        const parentNode = findNodeByKey(treeData.value, parentKey)
        if (parentNode) await handleRefreshNode(parentNode)
      } catch (e: unknown) {
        message.error(getErrorMessage(e))
      }
    }
  })
}

async function fetchEnumDefinition(node: TreeNode) {
  const oidRaw = node.metadata?.oid
  const oid = typeof oidRaw === 'number' ? oidRaw : Number.isFinite(Number(oidRaw)) ? Number(oidRaw) : null
  return metadataApi.getEnumDefinition({
    connectionId: props.connectionId!,
    name: metaStr(node, 'name') || node.title,
    oid,
    database: metaStr(node, 'database') || undefined,
    schema: metaStr(node, 'schema') || undefined,
  })
}

async function handleViewEnumDefinition() {
  const node = selectedNode.value
  if (!node || node.type !== 'enum-type') return
  try {
    const definition = await fetchEnumDefinition(node)
    selectedNode.value = {
      ...node,
      metadata: {
        ...node.metadata,
        definition,
      }
    }
    await showMetadataDefinition(selectedNode.value)
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function handleCopyEnumDefinition() {
  const node = selectedNode.value
  if (!node || node.type !== 'enum-type') return
  try {
    const definition = await fetchEnumDefinition(node)
    await writeClipboardText(definition)
    message.success(t('common.copy'))
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function fetchDomainDefinition(node: TreeNode) {
  const oidRaw = node.metadata?.oid
  const oid = typeof oidRaw === 'number' ? oidRaw : Number.isFinite(Number(oidRaw)) ? Number(oidRaw) : null
  return metadataApi.getDomainDefinition({
    connectionId: props.connectionId!,
    name: metaStr(node, 'name') || node.title,
    oid,
    database: metaStr(node, 'database') || undefined,
    schema: metaStr(node, 'schema') || undefined,
  })
}

async function handleViewDomainDefinition() {
  const node = selectedNode.value
  if (!node || node.type !== 'domain-type') return
  try {
    const definition = await fetchDomainDefinition(node)
    selectedNode.value = {
      ...node,
      metadata: {
        ...node.metadata,
        definition,
      }
    }
    await showMetadataDefinition(selectedNode.value)
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function handleCopyDomainDefinition() {
  const node = selectedNode.value
  if (!node || node.type !== 'domain-type') return
  try {
    const definition = await fetchDomainDefinition(node)
    await writeClipboardText(definition)
    message.success(t('common.copy'))
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function fetchRoutineDefinition(node: TreeNode) {
  const identityArguments = metaStr(node, 'identity_arguments') || metaStr(node, 'arguments')
  const oidRaw = node.metadata?.oid
  const oid = typeof oidRaw === 'number' ? oidRaw : Number.isFinite(Number(oidRaw)) ? Number(oidRaw) : null
  console.info('[DatabaseTree] fetch routine definition', {
    name: metaStr(node, 'name') || node.title,
    routineType: node.type,
    database: metaStr(node, 'database') || null,
    schema: metaStr(node, 'schema') || null,
    identityArguments: identityArguments || null,
    oid,
  })
  return metadataApi.getRoutineDefinition({
    connectionId: props.connectionId!,
    name: metaStr(node, 'name') || node.title,
    routineType: node.type,
    identityArguments: identityArguments || undefined,
    oid,
    database: metaStr(node, 'database') || undefined,
    schema: metaStr(node, 'schema') || undefined,
  })
}

async function handleViewRoutineDefinition() {
  const node = selectedNode.value
  if (!node || !['function', 'procedure', 'aggregate'].includes(node.type)) return
  try {
    const definition = await fetchRoutineDefinition(node)
    selectedNode.value = {
      ...node,
      metadata: {
        ...node.metadata,
        definition,
      }
    }
    await showMetadataDefinition(selectedNode.value)
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function handleCopyRoutineDefinition() {
  const node = selectedNode.value
  if (!node || !['function', 'procedure', 'aggregate'].includes(node.type)) return
  try {
    const definition = await fetchRoutineDefinition(node)
    await writeClipboardText(definition)
    message.success(t('common.copy'))
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

function buildRoutineSignature(node: TreeNode) {
  const name = metaStr(node, 'name') || node.title
  const args = metaStr(node, 'arguments')
  return `${name}(${args})`
}

function buildRoutinePlaceholders(node: TreeNode) {
  const args = metaStr(node, 'arguments') || metaStr(node, 'identity_arguments')
  if (!args) return ''

  return args
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const parts = item.split(/\s+/).filter(Boolean)
      const filtered = parts.filter(part => !['in', 'out', 'inout', 'variadic'].includes(part.toLowerCase()))
      const candidate = filtered[0] || parts[0] || `arg${index + 1}`
      const looksLikeTypeOnly = /^(bigint|smallint|integer|int|int2|int4|int8|numeric|decimal|real|double|precision|text|varchar|character|char|boolean|bool|date|time|timestamp|interval|json|jsonb|uuid|bytea|geometry|geography)$/i.test(candidate)
      const name = looksLikeTypeOnly ? `arg${index + 1}` : candidate
      return `/* ${name} */`
    })
    .join(', ')
}

async function handleCopySignature() {
  const node = selectedNode.value
  if (!node || !['function', 'procedure', 'aggregate'].includes(node.type)) return
  await writeClipboardText(buildRoutineSignature(node))
  message.success(t('common.copy'))
}

async function handleGenerateCallSql() {
  const node = selectedNode.value
  if (!node || !['function', 'procedure', 'aggregate'].includes(node.type)) return
  const name = metaStr(node, 'name') || node.title
  const schema = metaStr(node, 'schema')
  const db = metaStr(node, 'database')
  const qualifiedName = schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name)
  const placeholders = buildRoutinePlaceholders(node)
  const returnType = metaStr(node, 'return_type').toLowerCase()

  let sql = ''
  if (node.type === 'procedure') {
    sql = `CALL ${qualifiedName}(${placeholders});`
  } else if (node.type === 'aggregate') {
    const aggregateArgs = placeholders || '/* expression */'
    sql = `SELECT ${qualifiedName}(${aggregateArgs})\nFROM /* source */;`
  } else if (returnType.startsWith('setof ') || returnType.startsWith('table(')) {
    sql = `SELECT * FROM ${qualifiedName}(${placeholders});`
  } else {
    sql = `SELECT ${qualifiedName}(${placeholders});`
  }

  emit('generate-sql', { sql, database: db, connectionId: props.connectionId })
}

async function handleCopyExtensionInfo() {
  const node = selectedNode.value
  if (!node || node.type !== 'extension') return
  const name = metaStr(node, 'name') || node.title
  const version = metaStr(node, 'version')
  const schema = metaStr(node, 'schema')
  const info = [name, version ? `v${version}` : '', schema ? `schema=${schema}` : ''].filter(Boolean).join(' ')
  await writeClipboardText(info)
  message.success(t('common.copy'))
}

function formatObjectDefinition(node: TreeNode) {
  if (node.type === 'index') {
    const name = metaStr(node, 'name')
    const table = metaStr(node, 'table')
    const schema = metaStr(node, 'schema')
    const columns = Array.isArray(node.metadata?.columns)
      ? node.metadata.columns.map((column: string) => quoteIdent(column)).join(', ')
      : ''
    const qualifiedTable = schema ? `${quoteIdent(schema)}.${quoteIdent(table)}` : quoteIdent(table)

    if (node.metadata?.is_primary) {
      return props.dbType === 'postgresql'
        ? `ALTER TABLE ${qualifiedTable} ADD CONSTRAINT ${quoteIdent(name)} PRIMARY KEY (${columns})`
        : `ALTER TABLE ${qualifiedTable} ADD PRIMARY KEY (${columns})`
    }

    const indexKeyword = node.metadata?.is_unique ? 'UNIQUE INDEX' : 'INDEX'
    const usingClause = props.dbType === 'postgresql' && metaStr(node, 'index_type')
      ? ` USING ${metaStr(node, 'index_type')}`
      : ''
    return `CREATE ${indexKeyword} ${quoteIdent(name)} ON ${qualifiedTable}${usingClause} (${columns})`
  }

  if (node.type === 'foreign-key') {
    return `${metaStr(node, 'name')} FOREIGN KEY (${metaStr(node, 'column_name')}) REFERENCES ${metaStr(node, 'referenced_table_name')} (${metaStr(node, 'referenced_column_name')})`
  }

  if (node.metadata?.definition) {
    return String(node.metadata.definition)
  }

  return metaStr(node, 'name') || node.title
}

async function handleCopyObjectDefinition() {
  const node = selectedNode.value
  if (!node) return
  try {
    if (node.type === 'index') {
      const definition = await metadataApi.getIndexDefinition({
        connectionId: props.connectionId!,
        index: metaStr(node, 'name') || node.title,
        database: metaStr(node, 'database') || undefined,
        schema: metaStr(node, 'schema') || undefined,
      })
      await writeClipboardText(definition)
    } else if (node.type === 'sequence') {
      const definition = await fetchSequenceDefinition(node)
      await writeClipboardText(definition)
    } else if (node.type === 'enum-type') {
      const definition = await fetchEnumDefinition(node)
      await writeClipboardText(definition)
    } else if (node.type === 'domain-type') {
      const definition = await fetchDomainDefinition(node)
      await writeClipboardText(definition)
    } else {
      await writeClipboardText(formatObjectDefinition(node))
    }
    message.success(t('common.copy'))
  } catch (e: unknown) {
    message.error(getErrorMessage(e))
  }
}

async function handleDropColumn() {
  const node = selectedNode.value
  if (!node || node.type !== 'column') return
  const columnName = metaStr(node, 'name')
  Modal.confirm({
    title: t('tree.drop_column'),
    content: t('tree.drop_column_confirm', { name: columnName }),
    okText: t('common.delete'),
    okType: 'danger',
    async onOk() {
      try {
        await queryApi.alterTableStructure({
          connectionId: props.connectionId!,
          database: metaStr(node, 'database'),
          table: metaStr(node, 'table'),
          schema: metaStr(node, 'schema') || null,
          changes: [{ type: 'drop_column', data: columnName }]
        })
        message.success(t('tree.drop_column_success', { name: columnName }))
        const tableNode = findNodeByKey(treeData.value, node.key.split('-col-')[0])
        if (tableNode) await handleRefreshNode(tableNode)
      } catch (e: unknown) {
        message.error(getErrorMessage(e))
      }
    }
  })
}

async function handleDropIndex() {
  const node = selectedNode.value
  if (!node || node.type !== 'index') return
  const indexName = metaStr(node, 'name')
  Modal.confirm({
    title: t('tree.drop_index'),
    content: t('tree.drop_index_confirm', { name: indexName }),
    okText: t('common.delete'),
    okType: 'danger',
    async onOk() {
      try {
        await queryApi.alterTableStructure({
          connectionId: props.connectionId!,
          database: metaStr(node, 'database'),
          table: metaStr(node, 'table'),
          schema: metaStr(node, 'schema') || null,
          changes: [{ type: 'drop_index', data: indexName }]
        })
        message.success(t('tree.drop_index_success', { name: indexName }))
        const tableNode = findNodeByKey(treeData.value, node.key.split('-idx-')[0])
        if (tableNode) await handleRefreshNode(tableNode)
      } catch (e: unknown) {
        message.error(getErrorMessage(e))
      }
    }
  })
}

async function handleDropForeignKey() {
  const node = selectedNode.value
  if (!node || node.type !== 'foreign-key') return
  const fkName = metaStr(node, 'name')
  Modal.confirm({
    title: t('tree.drop_foreign_key'),
    content: t('tree.drop_foreign_key_confirm', { name: fkName }),
    okText: t('common.delete'),
    okType: 'danger',
    async onOk() {
      try {
        await queryApi.alterTableStructure({
          connectionId: props.connectionId!,
          database: metaStr(node, 'database'),
          table: metaStr(node, 'table'),
          schema: metaStr(node, 'schema') || null,
          changes: [{ type: 'drop_foreign_key', data: fkName }]
        })
        message.success(t('tree.drop_foreign_key_success', { name: fkName }))
        const tableNode = findNodeByKey(treeData.value, node.key.split('-fk-')[0])
        if (tableNode) await handleRefreshNode(tableNode)
      } catch (e: unknown) {
        message.error(getErrorMessage(e))
      }
    }
  })
}

async function handleDropTrigger() {
  const node = selectedNode.value
  if (!node || node.type !== 'trigger') return
  const triggerName = metaStr(node, 'name')
  Modal.confirm({
    title: t('tree.drop_trigger'),
    content: t('tree.drop_trigger_confirm', { name: triggerName }),
    okText: t('common.delete'),
    okType: 'danger',
    async onOk() {
      try {
        const sql = buildDropTriggerSql(node)
        await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
        message.success(t('tree.drop_trigger_success', { name: triggerName }))
        const tableNode = findNodeByKey(treeData.value, node.key.split('-trigger-')[0])
        if (tableNode) await handleRefreshNode(tableNode)
      } catch (e: unknown) {
        message.error(getErrorMessage(e))
      }
    }
  })
}

async function handleDropRule() {
  const node = selectedNode.value
  if (!node || node.type !== 'rule') return
  const ruleName = metaStr(node, 'name')
  Modal.confirm({
    title: t('tree.drop_rule'),
    content: t('tree.drop_rule_confirm', { name: ruleName }),
    okText: t('common.delete'),
    okType: 'danger',
    async onOk() {
      try {
        const sql = buildDropRuleSql(node)
        await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
        message.success(t('tree.drop_rule_success', { name: ruleName }))
        const tableNode = findNodeByKey(treeData.value, node.key.split('-rule-')[0])
        if (tableNode) await handleRefreshNode(tableNode)
      } catch (e: unknown) {
        message.error(getErrorMessage(e))
      }
    }
  })
}

async function handleDropConstraint() {
  const node = selectedNode.value
  if (!node || !['unique-constraint', 'check-constraint', 'exclude-constraint'].includes(node.type)) return
  const constraintName = metaStr(node, 'name')
  Modal.confirm({
    title: t('tree.drop_constraint'),
    content: t('tree.drop_constraint_confirm', { name: constraintName }),
    okText: t('common.delete'),
    okType: 'danger',
    async onOk() {
      try {
        const sql = buildDropConstraintSql(node)
        await queryApi.executeQuery(props.connectionId!, sql, metaStr(node, 'database') || null)
        message.success(t('tree.drop_constraint_success', { name: constraintName }))
        const tableNode = findNodeByKey(treeData.value, node.key.replace(/-(unique|check|exclude)-constraint-.+$/, ''))
        if (tableNode) await handleRefreshNode(tableNode)
      } catch (e: unknown) {
        message.error(getErrorMessage(e))
      }
    }
  })
}

function buildDropTriggerSql(node: TreeNode) {
  const triggerName = metaStr(node, 'name')
  const tableName = metaStr(node, 'table')
  const schema = metaStr(node, 'schema')
  if (props.dbType === 'postgresql') {
    const tableIdent = `${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(tableName)}`
    return `DROP TRIGGER ${quoteIdent(triggerName)} ON ${tableIdent}`
  }
  if (props.dbType === 'mysql') {
    return `DROP TRIGGER ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(triggerName)}`
  }
  if (props.dbType === 'sqlite') {
    return `DROP TRIGGER ${quoteIdent(triggerName)}`
  }
  throw new Error(t('tree.drop_unsupported'))
}

function buildDropRuleSql(node: TreeNode) {
  if (props.dbType !== 'postgresql') {
    throw new Error(t('tree.drop_unsupported'))
  }
  const ruleName = metaStr(node, 'name')
  const tableName = metaStr(node, 'table')
  const schema = metaStr(node, 'schema')
  return `DROP RULE ${quoteIdent(ruleName)} ON ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(tableName)}`
}

function buildDropConstraintSql(node: TreeNode) {
  if (props.dbType !== 'postgresql') {
    throw new Error(t('tree.drop_unsupported'))
  }
  const constraintName = metaStr(node, 'name')
  const tableName = metaStr(node, 'table')
  const schema = metaStr(node, 'schema')
  return `ALTER TABLE ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(tableName)} DROP CONSTRAINT ${quoteIdent(constraintName)}`
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
.sequence-state-panel { display: grid; gap: 10px; }
.sequence-state-row { display: flex; justify-content: space-between; gap: 16px; padding: 10px 12px; border: 1px solid var(--border-color-muted); border-radius: var(--radius-sm); background: var(--surface-secondary); }
.sequence-state-row span { color: var(--app-text-subtle); }
.sequence-state-row strong { font-variant-numeric: tabular-nums; }
.sequence-value-hint { margin-top: 10px; color: var(--app-text-subtle); font-size: 12px; }
</style>
