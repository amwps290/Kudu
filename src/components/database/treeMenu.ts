import type { MenuProps } from 'antd'
import type { TreeNode } from './treeModel'

/**
 * 树右键菜单项构建（Slice 15，按子批增量填充）。
 * 子批①：refresh / new-query / view-data / view-ddl / view-definition / copy-name。
 * 子批②：SQL 生成（stats/gen SQL 子菜单、copy-columns、schema 建表建视图模板、
 *        函数/过程/聚合四项、copy-*-definition 系列）。
 * 其余菜单项（结构操作 / 危险操作 / PG 专有）随子批③-⑤ 逐步加入。
 *
 * 说明：Vue 版模板用大量 v-if 分支按 selectedNode.type 渲染；这里改为按类型返回 items 数组。
 * 未迁移的菜单项暂不出现（不是隐藏，是尚未加入）——每子批验收时逐项打勾。
 */

const REFRESHABLE_NODE_TYPES = [
  'schema', 'tables', 'views', 'schemas', 'functions', 'procedures',
  'schema-tables', 'schema-views', 'schema-materialized-views', 'schema-functions',
  'schema-procedures', 'schema-sequences', 'schema-enum-types', 'schema-domain-types', 'schema-composite-types',
]

const ENUM_LABEL_NODE_TYPES = ['enum-label']
const DOMAIN_DETAIL_NODE_TYPES = ['domain-detail', 'domain-constraint']
const TABLE_CHILD_OBJECT_NODE_TYPES = ['index', 'foreign-key', 'trigger', 'rule', 'unique-constraint', 'check-constraint', 'exclude-constraint']

export interface TreeMenuContext {
  supportsTableDataView: boolean
  supportsConnectionScripts: boolean
  supportsTableDesign: boolean
  supportsBackupRestore: boolean
  isPgLike: boolean
  /** 只读连接：结构/写操作禁用（照抄 isSelectedNodeReadOnly） */
  isReadOnly: boolean
  /** Ctrl 多选的表节点数（批量 drop 标签用） */
  selectedTableCount: number
  t: (key: string, options?: Record<string, unknown>) => string
}

type MenuItem = NonNullable<MenuProps['items']>[number]

export function buildTreeMenuItems(node: TreeNode, ctx: TreeMenuContext): MenuProps['items'] {
  const { t } = ctx
  const items: MenuItem[] = []
  const divider: MenuItem = { type: 'divider' }
  const type = node.type

  const isEnumLabel = ENUM_LABEL_NODE_TYPES.includes(type)
  const isDomainDetail = DOMAIN_DETAIL_NODE_TYPES.includes(type)
  const isTableChild = TABLE_CHILD_OBJECT_NODE_TYPES.includes(type)
  const isRoutine = ['function', 'procedure', 'aggregate'].includes(type)
  const hasDefinition = Boolean(node.metadata?.definition)
  const isRefreshable = REFRESHABLE_NODE_TYPES.includes(type)

  if (type === 'database') {
    if (ctx.supportsConnectionScripts) {
      items.push({ key: 'new-query', label: t('tree.new_query') })
      items.push(divider)
      if (ctx.supportsBackupRestore) {
        items.push({ key: 'backup-database', label: t('tree.backup_database') })
        items.push({ key: 'restore-database', label: t('tree.restore_database') })
        items.push(divider)
      }
    }
    if (ctx.isPgLike) {
      items.push({
        key: 'sub-postgres-admin',
        disabled: ctx.isReadOnly,
        label: t('tree.database_admin'),
        children: [
          { key: 'install-extension', label: t('tree.install_extension') },
          { type: 'divider' },
          { key: 'vacuum-database', label: t('tree.vacuum_database') },
          { key: 'analyze-database', label: t('tree.analyze_database') },
          { key: 'reindex-database', label: t('tree.reindex_database') },
        ],
      })
      items.push({
        key: 'sub-postgres-inspect',
        label: t('tree.database_inspect'),
        children: [
          { key: 'inspect-roles', label: t('tree.inspect_roles') },
          { key: 'inspect-sessions', label: t('tree.inspect_sessions') },
          { key: 'inspect-locks', label: t('tree.inspect_locks') },
          { key: 'inspect-blocking', label: t('tree.inspect_blocking') },
        ],
      })
      items.push(divider)
    }
    items.push({ key: 'refresh', label: t('tree.refresh_db') })
    items.push(divider)
  } else if (type === 'table') {
    if (ctx.supportsTableDataView) items.push({ key: 'view-data', label: t('tree.view_data') })
    items.push({ key: 'view-er-diagram', label: t('tree.view_er_diagram') })
    items.push({ key: 'view-ddl', label: t('tree.view_ddl') })
    if (ctx.supportsTableDesign) items.push({ key: 'design-table', disabled: ctx.isReadOnly, label: t('tree.design_table') })
    items.push(divider)
    if (ctx.supportsTableDesign) {
      items.push({
        key: 'sub-alter-table',
        disabled: ctx.isReadOnly,
        label: t('tree.submenu_alter_table'),
        children: [
          { key: 'add-column', label: t('tree.add_column') },
          { key: 'add-index', label: t('tree.add_index') },
          { key: 'add-foreign-key', label: t('tree.add_foreign_key') },
        ],
      })
      items.push(divider)
    }
    items.push({
      key: 'sub-stats',
      label: t('tree.submenu_stats'),
      children: [{ key: 'row-count', label: t('tree.row_count') }],
    })
    items.push({
      key: 'sub-gen-sql',
      label: t('tree.submenu_gen_sql'),
      children: [
        { key: 'gen-select', label: t('tree.gen_select') },
        { key: 'gen-insert', label: t('tree.gen_insert') },
        { key: 'gen-update', label: t('tree.gen_update') },
        { key: 'gen-delete', label: t('tree.gen_delete') },
      ],
    })
    if (ctx.isPgLike) {
      items.push({
        key: 'sub-object-inspect',
        label: t('tree.database_inspect'),
        children: [{ key: 'inspect-object-grants', label: t('tree.inspect_object_grants') }],
      })
    }
    items.push(divider)
    items.push({ key: 'copy-columns', label: t('tree.copy_columns') })
    items.push({ key: 'rename-table', disabled: ctx.isReadOnly, label: t('tree.rename_table') })
    items.push(divider)
    items.push({ key: 'truncate-table', danger: true, disabled: ctx.isReadOnly, label: t('tree.truncate_table') })
    items.push({
      key: 'drop-table',
      danger: true,
      disabled: ctx.isReadOnly,
      label: ctx.selectedTableCount > 1
        ? t('tree.drop_table_batch', { count: ctx.selectedTableCount })
        : t('tree.drop_table'),
    })
    items.push(divider)
    items.push({ key: 'refresh', label: t('common.refresh') })
    items.push(divider)
  } else if (type === 'view' || type === 'materialized-view') {
    if (ctx.supportsTableDataView) items.push({ key: 'view-data', label: t('tree.view_data') })
    items.push({ key: 'view-ddl', label: t('tree.view_definition') })
    items.push(divider)
    items.push({ key: 'gen-select', label: t('tree.gen_select') })
    if (type === 'materialized-view' || ctx.isPgLike) {
      items.push({ key: 'inspect-object-grants', label: t('tree.inspect_object_grants') })
    }
    items.push(divider)
    items.push({ key: 'copy-view-definition', label: t('tree.copy_definition') })
    if (type === 'view') {
      items.push({ key: 'rename-table', disabled: ctx.isReadOnly || !ctx.isPgLike, label: t('tree.rename_view') })
      items.push(divider)
      // 注意：Vue 版视图 drop-table 项未加只读禁用（原样保留该怪癖）
      items.push({ key: 'drop-table', danger: true, label: t('tree.drop_view') })
      items.push(divider)
      items.push({ key: 'refresh', label: t('common.refresh') })
      items.push(divider)
    } else {
      items.push({ key: 'refresh-materialized-view', label: t('tree.refresh_materialized_view') })
      items.push(divider)
    }
  } else if (isRoutine) {
    items.push({ key: 'view-routine-definition', label: t('tree.view_definition') })
    items.push({ key: 'copy-routine-definition', label: t('tree.copy_definition') })
    items.push({ key: 'gen-call-sql', label: t('tree.gen_call_sql') })
    items.push({ key: 'copy-signature', label: t('tree.copy_signature') })
    items.push(divider)
  } else if (type === 'column') {
    items.push({ key: 'copy-column-definition', label: t('tree.copy_definition') })
    if (node.metadata?.object_type === 'table') {
      items.push({ key: 'rename-column', disabled: ctx.isReadOnly, label: t('tree.rename_column') })
      items.push({ key: 'open-column-designer', disabled: ctx.isReadOnly, label: t('tree.open_table_designer') })
      items.push(divider)
      items.push({ key: 'drop-column', danger: true, disabled: ctx.isReadOnly, label: t('tree.drop_column') })
    }
    items.push(divider)
  } else if (isTableChild) {
    if (hasDefinition) items.push({ key: 'view-definition', label: t('tree.view_definition') })
    items.push({ key: 'copy-object-definition', label: t('tree.copy_definition') })
    items.push({ key: 'open-column-designer', disabled: ctx.isReadOnly, label: t('tree.open_table_designer') })
    items.push(divider)
    if (type === 'index') items.push({ key: 'drop-index', danger: true, disabled: ctx.isReadOnly, label: t('tree.drop_index') })
    else if (type === 'foreign-key') items.push({ key: 'drop-foreign-key', danger: true, disabled: ctx.isReadOnly, label: t('tree.drop_foreign_key') })
    else if (type === 'trigger') items.push({ key: 'drop-trigger', danger: true, disabled: ctx.isReadOnly, label: t('tree.drop_trigger') })
    else if (type === 'rule') items.push({ key: 'drop-rule', danger: true, disabled: ctx.isReadOnly, label: t('tree.drop_rule') })
    else if (['unique-constraint', 'check-constraint', 'exclude-constraint'].includes(type)) {
      items.push({ key: 'drop-constraint', danger: true, disabled: ctx.isReadOnly, label: t('tree.drop_constraint') })
    }
    items.push(divider)
  } else if (type === 'sequence') {
    items.push({ key: 'view-sequence-definition', label: t('tree.view_definition') })
    items.push({ key: 'view-sequence-state', label: t('tree.sequence_state') })
    items.push({ key: 'set-sequence-value', label: t('tree.set_sequence_value') })
    items.push({ key: 'restart-sequence', label: t('tree.restart_sequence') })
    items.push({ key: 'inspect-object-grants', label: t('tree.inspect_object_grants') })
    items.push({ key: 'copy-sequence-definition', label: t('tree.copy_definition') })
    items.push({ key: 'rename-sequence', disabled: ctx.isReadOnly, label: t('tree.rename_sequence') })
    items.push(divider)
    items.push({ key: 'drop-sequence', danger: true, disabled: ctx.isReadOnly, label: t('tree.drop_sequence') })
    items.push(divider)
  } else if (type === 'enum-type') {
    items.push({ key: 'view-enum-definition', label: t('tree.view_definition') })
    items.push({ key: 'copy-enum-definition', label: t('tree.copy_definition') })
    items.push(divider)
  } else if (type === 'domain-type') {
    items.push({ key: 'view-domain-definition', label: t('tree.view_definition') })
    items.push({ key: 'copy-domain-definition', label: t('tree.copy_definition') })
    items.push(divider)
  } else if (type === 'composite-type') {
    items.push({ key: 'view-composite-definition', label: t('tree.view_definition') })
    items.push({ key: 'copy-composite-definition', label: t('tree.copy_definition') })
    items.push(divider)
  } else if (type === 'extension') {
    items.push({ key: 'copy-extension-info', label: t('tree.copy_extension_info') })
    items.push({ key: 'uninstall-extension', danger: true, disabled: ctx.isReadOnly, label: t('tree.uninstall_extension') })
    items.push(divider)
  } else if (isEnumLabel || isDomainDetail) {
    items.push({ key: 'copy-name', label: t('tree.copy_name') })
    items.push(divider)
  } else if (hasDefinition) {
    items.push({ key: 'view-definition', label: t('tree.view_definition') })
    items.push(divider)
  } else if (type === 'schema') {
    items.push({ key: 'new-query', label: t('tree.new_query') })
    if (ctx.isPgLike) {
      items.push({ key: 'create-schema', disabled: ctx.isReadOnly, label: t('tree.create_schema') })
      items.push({ key: 'rename-schema', disabled: ctx.isReadOnly, label: t('tree.rename_schema') })
      items.push({ key: 'inspect-object-grants', label: t('tree.inspect_object_grants') })
      items.push({ key: 'drop-schema', danger: true, disabled: ctx.isReadOnly, label: t('tree.drop_schema') })
      items.push({ key: 'drop-schema-cascade', danger: true, disabled: ctx.isReadOnly, label: t('tree.drop_schema_cascade') })
      items.push(divider)
    }
    items.push({ key: 'gen-create-table', label: t('tree.gen_create_table') })
    items.push({ key: 'gen-create-view', label: t('tree.gen_create_view') })
    items.push(divider)
    items.push({ key: 'refresh', label: t('common.refresh') })
    items.push(divider)
  } else if (type === 'schemas' && ctx.isPgLike) {
    items.push({ key: 'create-schema', disabled: ctx.isReadOnly, label: t('tree.create_schema') })
    items.push(divider)
    items.push({ key: 'refresh', label: t('common.refresh') })
    items.push(divider)
  } else if (isRefreshable) {
    items.push({ key: 'refresh', label: t('common.refresh') })
    items.push(divider)
  }

  // 通用 copy-name（enum-label/domain-detail 已单列，不重复）
  if (!isEnumLabel && !isDomainDetail) {
    items.push({ key: 'copy-name', label: t('tree.copy_name') })
  }

  return items
}
