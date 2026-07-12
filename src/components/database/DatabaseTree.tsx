import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Empty, Input, InputNumber, Menu, Modal as AntModal, Select, Spin } from 'antd'
import { message, Modal } from '../../ui/antd'
import { metadataApi, queryApi } from '@/api'
import { getErrorMessage } from '@/utils/errorHandler'
import { escapeSqlLiteral } from '@/utils/sqlHelpers'
import { getDatabaseSupportProfile } from '@/utils/databaseSupport'
import { writeClipboardText } from '@/utils/clipboard'
import { useConnectionStore } from '../../stores/connectionStore'
import { useContextMenu } from '../../hooks/useContextMenu'
import TreeNodeItem from './TreeNodeItem'
import DdlPreviewModal from './DdlPreviewModal'
import BackupDatabaseDialog from './BackupDatabaseDialog'
import RestoreDatabaseDialog from './RestoreDatabaseDialog'
import { buildTreeMenuItems } from './treeMenu'
import {
  quoteIdentFor,
  buildTableCrudSql,
  buildRoutineSignature,
  buildRoutineCallSql,
  buildDropTriggerSql,
  buildDropRuleSql,
  buildDropConstraintSql,
  formatColumnDefinition,
  formatObjectDefinition,
} from './treeObjectSql'
import {
  filterTreeData,
  findNodeInTree,
  collectSubtreeKeys,
  updateNodeInTree,
  TABLE_OBJECT_GROUP_NODE_TYPES,
  VIRTUAL_GROUP_NODE_TYPES,
  type TreeNode,
  type TreeSearchOptions,
} from './treeModel'
import { loadNodeChildren, type TreeLoaderContext } from './treeLoaders'
import { buildInspectionSql, type InspectionKind } from './treeInspectionSql'
import type { SequenceStateInfo } from '@/types/database'
import styles from './DatabaseTree.module.css'

/**
 * 数据库对象树（Slice 14 基础浏览 + Slice 15 右键菜单按子批填充）。
 * 子批①已迁：菜单基础设施（定位/上翻/ResizeObserver 限位）、refresh / new-query /
 * view-data / view-ddl / view-definition / copy-name；子批②-⑤（SQL 生成/结构操作/
 * 危险操作/PG 专有）逐批加入 treeMenu.ts 与 handleMenuClick。
 *
 * 树内 in-place 更新（updateNodeInTree + 整树浅拷贝触发渲染）照抄 Vue 版策略——
 * treeData 引用每次替换，React 渲染语义等价 Vue 的 deep 响应。
 */

export interface DatabaseTreeProps {
  connectionId: string | null
  dbType?: string
  searchOptions?: TreeSearchOptions
  onUpdateMatchesCount?: (count: number) => void
  onTableSelected?: (data: { database: string; table: string; schema?: string; metadata?: any }) => void
  onDatabaseSelected?: (data: any) => void
  onObjectSelected?: (data: { type: string; title: string; metadata: Record<string, unknown> }) => void
  onNewQuery?: (data: { database?: string; connectionId?: string | null }) => void
  onGenerateSql?: (data: { sql: string; database?: string; connectionId?: string | null; title?: string; autoExecuteNonce?: string }) => void
  onDesignTable?: (data: {
    database: string
    table: string
    schema?: string
    designTab?: 'columns' | 'indexes' | 'foreign_keys' | 'ddl'
    designAction?: 'add_column' | 'add_index' | 'add_foreign_key'
  }) => void
  onOpenErDiagram?: (data: { database?: string; table: string; schema?: string; metadata?: any }) => void
}

function metaStr(node: TreeNode, key: string): string {
  return String((node.metadata as Record<string, unknown>)?.[key] || '')
}

function sameTableScope(a: TreeNode, b: TreeNode) {
  return metaStr(a, 'database') === metaStr(b, 'database') && metaStr(a, 'schema') === metaStr(b, 'schema')
}

export default function DatabaseTree({
  connectionId,
  dbType,
  searchOptions,
  onUpdateMatchesCount,
  onTableSelected,
  onDatabaseSelected,
  onObjectSelected,
  onNewQuery,
  onGenerateSql,
  onDesignTable,
  onOpenErDiagram,
}: DatabaseTreeProps) {
  const { t } = useTranslation()

  const supportProfile = getDatabaseSupportProfile(dbType || null)
  const normalizedDbType = supportProfile.dbType
  const isPgLike = normalizedDbType === 'postgresql' || normalizedDbType === 'opengauss' || normalizedDbType === 'gaussdb'

  const [loading, setLoading] = useState(false)
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const treeDataRef = useRef<TreeNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const expandedKeysRef = useRef<string[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set())
  const selectedNodesRef = useRef<TreeNode[]>([])
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)

  // ── 右键菜单（定位/上翻/尺寸限位，照抄 Vue 版 adjustContextMenuPosition + ResizeObserver）──
  const { contextMenuVisible, contextMenuX, contextMenuY, showContextMenu, hideContextMenu } = useContextMenu()
  const [contextMenuLeft, setContextMenuLeft] = useState(0)
  const [contextMenuTop, setContextMenuTop] = useState(0)
  const [menuOpenUpward, setMenuOpenUpward] = useState(false)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // ── DDL 预览弹窗 ──
  const [showDdlModal, setShowDdlModal] = useState(false)
  const [ddlText, setDdlText] = useState('')

  // ── 重命名/建 schema 弹窗（子批④）──
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameMode, setRenameMode] = useState<'table' | 'column' | 'schema' | 'create-schema'>('table')
  const [renameValue, setRenameValue] = useState('')
  const [renameComment, setRenameComment] = useState('')
  const [renameSubmitting, setRenameSubmitting] = useState(false)

  // ── 序列状态/设值弹窗与扩展安装弹窗（子批⑤）──
  const [showSequenceStateModal, setShowSequenceStateModal] = useState(false)
  const [sequenceState, setSequenceState] = useState<SequenceStateInfo | null>(null)
  const [showSequenceValueModal, setShowSequenceValueModal] = useState(false)
  const [sequenceValueInput, setSequenceValueInput] = useState<number | undefined>(undefined)
  const [sequenceValueSubmitting, setSequenceValueSubmitting] = useState(false)
  const [showInstallExtensionModal, setShowInstallExtensionModal] = useState(false)
  const [installExtensionName, setInstallExtensionName] = useState('')
  const [installExtensionSchema, setInstallExtensionSchema] = useState('')
  const [installExtensionSubmitting, setInstallExtensionSubmitting] = useState(false)
  const [availableExtensionOptions, setAvailableExtensionOptions] = useState<Array<{ label: string; value: string; disabled?: boolean }>>([])
  const [installExtensionSchemaOptions, setInstallExtensionSchemaOptions] = useState<Array<{ label: string; value: string }>>([])

  // ── 备份/还原对话框（Slice 25）──
  const [showBackupDialog, setShowBackupDialog] = useState(false)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [activeDatabaseName, setActiveDatabaseName] = useState('')

  const latestRef = useRef({ connectionId, dbType, onTableSelected, onDatabaseSelected, onObjectSelected, onNewQuery, onGenerateSql, onDesignTable, onOpenErDiagram })
  latestRef.current = { connectionId, dbType, onTableSelected, onDatabaseSelected, onObjectSelected, onNewQuery, onGenerateSql, onDesignTable, onOpenErDiagram }

  /** 标识符引用（方言随 props.dbType，照抄 Vue quoteIdent） */
  const quoteIdent = (name: string) => quoteIdentFor(latestRef.current.dbType, name)

  function applyTreeData(next: TreeNode[]) {
    treeDataRef.current = next
    setTreeData(next)
  }

  function applyExpandedKeys(next: string[]) {
    expandedKeysRef.current = next
    setExpandedKeys(next)
  }

  const loadDatabases = useCallback(async () => {
    const connId = latestRef.current.connectionId
    if (!connId) return
    setLoading(true)
    try {
      if (latestRef.current.dbType === 'sqlite') {
        applyTreeData([{ key: 'db-main', title: 'main', type: 'database', isLeaf: false, metadata: { name: 'main', database: 'main' } }])
      } else {
        const dbs = await metadataApi.getDatabases(connId)
        const isLeafDatabase = !getDatabaseSupportProfile(latestRef.current.dbType || null).supportsDatabaseTreeChildren
        applyTreeData(dbs.map((db) => ({
          key: `db-${db.name}`,
          title: db.name,
          type: 'database',
          isLeaf: isLeafDatabase,
          metadata: { ...db, database: db.name },
        })))
      }
    } catch (e: unknown) {
      message.error(getErrorMessage(e))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runNodeLoad(node: TreeNode) {
    if (node.children && node.children.length > 0) return
    const connId = latestRef.current.connectionId
    if (!connId) return
    const ctx: TreeLoaderContext = {
      connectionId: connId,
      normalizedDbType,
      isPgLike,
      supportsDatabaseTreeChildren: supportProfile.supportsDatabaseTreeChildren,
      t: (key, options) => t(key, options ?? {}) as string,
    }
    try {
      const children = await loadNodeChildren(ctx, node)
      if (children) {
        updateNodeInTree(treeDataRef.current, node.key, (target) => { target.children = children })
        applyTreeData([...treeDataRef.current])
      }
    } catch (e: unknown) {
      message.error(getErrorMessage(e))
    }
  }

  async function handleToggle(node: TreeNode) {
    if (!expandedKeysRef.current.includes(node.key)) {
      applyExpandedKeys([...expandedKeysRef.current, node.key])
      const currentNode = findNodeInTree(treeDataRef.current, node.key) || node
      if (!currentNode.children || currentNode.children.length === 0) {
        setLoadingNodes((prev) => new Set(prev).add(node.key))
        try {
          await runNodeLoad(currentNode)
        } finally {
          setLoadingNodes((prev) => {
            const next = new Set(prev)
            next.delete(node.key)
            return next
          })
        }
      }
    } else {
      applyExpandedKeys(expandedKeysRef.current.filter((k) => k !== node.key))
    }
  }

  function handleSelect(payload: { node: TreeNode; event?: React.MouseEvent }) {
    const node = payload.node
    const event = payload.event
    const appendSelection = Boolean(event && (event.ctrlKey || event.metaKey))

    if (appendSelection && node.type === 'table') {
      const exists = selectedNodesRef.current.some((item) => item.key === node.key)
      selectedNodesRef.current = exists
        ? selectedNodesRef.current.filter((item) => item.key !== node.key)
        : [...selectedNodesRef.current.filter((item) => item.type === 'table' && sameTableScope(item, node)), node]
      setSelectedKeys(selectedNodesRef.current.map((item) => item.key))
    } else {
      selectedNodesRef.current = [node]
      setSelectedKeys([node.key])
    }

    if (!VIRTUAL_GROUP_NODE_TYPES.includes(node.type)) {
      latestRef.current.onObjectSelected?.({
        type: node.type,
        title: node.title,
        metadata: node.metadata || {},
      })
    }

    if (node.type === 'database') latestRef.current.onDatabaseSelected?.(node.metadata)
  }

  async function handleDoubleClick(node: TreeNode) {
    if (node.type === 'database' && !supportProfile.supportsDatabaseTreeChildren) return
    if (['database', 'schema', 'schemas', 'tables', 'views', 'schema-tables', 'schema-views', 'schema-materialized-views', 'schema-enum-types', 'schema-domain-types', 'schema-composite-types', ...TABLE_OBJECT_GROUP_NODE_TYPES].includes(node.type)) {
      void handleToggle(node)
      return
    }
    // 双击类型节点查看定义（对等 Vue handleDoubleClick 的 enum/domain/composite 分支）
    if (node.type === 'enum-type') { setSelectedNode(node); await viewFetchedDefinition(node, fetchEnumDefinition); return }
    if (node.type === 'domain-type') { setSelectedNode(node); await viewFetchedDefinition(node, fetchDomainDefinition); return }
    if (node.type === 'composite-type') { setSelectedNode(node); await viewFetchedDefinition(node, fetchCompositeDefinition); return }
    if (node.metadata?.definition) {
      showMetadataDefinition(node)
      return
    }
    if (['table', 'view', 'materialized-view'].includes(node.type) && supportProfile.supportsTableDataView) {
      latestRef.current.onTableSelected?.({
        database: node.metadata.database,
        table: node.metadata.name || node.title,
        schema: node.metadata.schema,
        metadata: node.metadata,
      })
    }
  }

  function handleContextMenu(payload: { event: React.MouseEvent; node: TreeNode }) {
    if (VIRTUAL_GROUP_NODE_TYPES.includes(payload.node.type)) {
      payload.event.preventDefault()
      return
    }
    if (!selectedNodesRef.current.some((item) => item.key === payload.node.key)) {
      selectedNodesRef.current = [payload.node]
      setSelectedKeys([payload.node.key])
    }
    setSelectedNode(payload.node)
    showContextMenu(payload.event)
  }

  // 菜单打开后定位（对等 Vue 的 nextTick adjust + ResizeObserver 限位）
  useEffect(() => {
    if (!contextMenuVisible) return

    const margin = 8
    const MIN_COMFORT_HEIGHT = 200
    let upward = false
    let top: number

    setContextMenuLeft(contextMenuX)
    const spaceAbove = contextMenuY - margin
    const spaceBelow = window.innerHeight - contextMenuY - margin
    if (spaceBelow >= MIN_COMFORT_HEIGHT) {
      upward = false
      top = contextMenuY
    } else if (spaceAbove >= MIN_COMFORT_HEIGHT) {
      upward = true
      const estHeight = Math.min(400, spaceAbove)
      top = Math.max(margin, contextMenuY - estHeight)
    } else if (spaceAbove > spaceBelow) {
      upward = true
      top = Math.max(margin, contextMenuY - spaceAbove)
    } else {
      upward = false
      top = contextMenuY
    }
    setMenuOpenUpward(upward)
    setContextMenuTop(top)

    if (typeof ResizeObserver === 'undefined' || !contextMenuRef.current) return
    const observer = new ResizeObserver(() => {
      const el = contextMenuRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const maxLeft = window.innerWidth - rect.width - margin
      setContextMenuLeft((prev) => Math.max(margin, Math.min(prev, maxLeft)))
      if (upward) {
        setContextMenuTop(Math.max(margin, contextMenuY - rect.height - margin))
      } else {
        const maxTop = window.innerHeight - rect.height - margin
        setContextMenuTop(Math.max(margin, Math.min(contextMenuY, maxTop)))
      }
    })
    observer.observe(contextMenuRef.current)
    return () => observer.disconnect()
  }, [contextMenuVisible, contextMenuX, contextMenuY])

  const contextMenuMaxHeight = (() => {
    const margin = 8
    const maxH = menuOpenUpward
      ? contextMenuY - contextMenuTop - margin
      : window.innerHeight - contextMenuTop - margin
    return Math.max(120, maxH)
  })()

  // ── DDL 预览 ──
  function showMetadataDefinition(node: TreeNode) {
    setSelectedNode(node)
    setDdlText(String(node.metadata?.definition || ''))
    setShowDdlModal(true)
  }

  async function handleViewDdl(node: TreeNode) {
    const isView = node.type === 'view' || node.type === 'materialized-view'
    try {
      const name = metaStr(node, 'name') || node.title
      const db = metaStr(node, 'database')
      const schema = metaStr(node, 'schema')
      let ddl: string
      if (isView) {
        ddl = await metadataApi.getViewDefinition({
          connectionId: latestRef.current.connectionId!,
          view: name,
          database: db,
          schema: schema || undefined,
        })
      } else {
        ddl = await metadataApi.getCreateTableDdl({
          connectionId: latestRef.current.connectionId!,
          table: name,
          database: db || undefined,
          schema: schema || undefined,
        })
      }
      setDdlText(ddl)
      setShowDdlModal(true)
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  // ── 子批②：SQL 生成与复制类动作 ──

  async function handleRowCount(node: TreeNode) {
    const table = metaStr(node, 'name') || node.title
    const schema = metaStr(node, 'schema')
    const db = metaStr(node, 'database')
    try {
      const sql = schema
        ? `SELECT COUNT(*) AS cnt FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
        : `SELECT COUNT(*) AS cnt FROM ${quoteIdent(table)}`
      const results = await queryApi.executeQuery(latestRef.current.connectionId!, sql, db || null)
      const row = results[0]?.rows?.[0] as Record<string, unknown> | undefined
      const count = row?.cnt ?? row?.['COUNT(*)'] ?? '?'
      message.success(`${table}: ${count} ${t('tree.rows')}`)
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  async function handleGenerateSql(node: TreeNode, type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE') {
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
      let colNames: string[] = []
      // 尝试获取列信息（视图可能没有列详情，失败时 SELECT *）
      try {
        const columns = await metadataApi.getTableStructure({
          connectionId: latestRef.current.connectionId!,
          table: name,
          database: db || undefined,
          schema: schema || undefined,
        })
        colNames = columns.map((c) => c.name)
      } catch { /* 列信息获取失败时使用 SELECT * */ }

      const sql = buildTableCrudSql(type, fullName, colNames, quoteIdent)
      latestRef.current.onGenerateSql?.({ sql, database: db, connectionId: latestRef.current.connectionId })
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  function handleGenerateSchemaSql(node: TreeNode, kind: 'table' | 'view') {
    if (node.type !== 'schema') return
    const schema = metaStr(node, 'name')
    const database = metaStr(node, 'database')
    const objectName = kind === 'table' ? 'new_table' : 'new_view'
    const qualifiedName = latestRef.current.dbType === 'postgresql'
      ? `${quoteIdent(schema)}.${quoteIdent(objectName)}`
      : quoteIdent(objectName)
    const sql = kind === 'table'
      ? `CREATE TABLE ${qualifiedName} (\n  id INTEGER PRIMARY KEY\n);`
      : `CREATE VIEW ${qualifiedName} AS\nSELECT 1 AS sample;`
    latestRef.current.onGenerateSql?.({ sql, database, connectionId: latestRef.current.connectionId })
  }

  async function handleCopyColumns(node: TreeNode) {
    const table = metaStr(node, 'name') || node.title
    const schema = metaStr(node, 'schema')
    const db = metaStr(node, 'database')
    try {
      const columns = await metadataApi.getTableStructure({
        connectionId: latestRef.current.connectionId!,
        table,
        database: db || undefined,
        schema: schema || undefined,
      })
      const colList = columns.map((c) => c.name).join(', ')
      await writeClipboardText(colList)
      message.success(`${t('tree.copy_columns')}: ${columns.length} ${t('tree.columns')}`)
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  async function handleCopyViewDefinition(node: TreeNode) {
    if (!['view', 'materialized-view'].includes(node.type)) return
    try {
      const ddl = await metadataApi.getViewDefinition({
        connectionId: latestRef.current.connectionId!,
        view: metaStr(node, 'name') || node.title,
        database: metaStr(node, 'database'),
        schema: metaStr(node, 'schema') || undefined,
      })
      await writeClipboardText(ddl)
      message.success(t('common.copy'))
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
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
      connectionId: latestRef.current.connectionId!,
      name: metaStr(node, 'name') || node.title,
      routineType: node.type,
      identityArguments: identityArguments || undefined,
      oid,
      database: metaStr(node, 'database') || undefined,
      schema: metaStr(node, 'schema') || undefined,
    })
  }

  async function handleViewRoutineDefinition(node: TreeNode) {
    if (!['function', 'procedure', 'aggregate'].includes(node.type)) return
    try {
      const definition = await fetchRoutineDefinition(node)
      showMetadataDefinition({ ...node, metadata: { ...node.metadata, definition } })
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  async function handleCopyRoutineDefinition(node: TreeNode) {
    if (!['function', 'procedure', 'aggregate'].includes(node.type)) return
    try {
      const definition = await fetchRoutineDefinition(node)
      await writeClipboardText(definition)
      message.success(t('common.copy'))
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  async function handleCopyObjectDefinition(node: TreeNode) {
    try {
      if (node.type === 'index') {
        const definition = await metadataApi.getIndexDefinition({
          connectionId: latestRef.current.connectionId!,
          index: metaStr(node, 'name') || node.title,
          database: metaStr(node, 'database') || undefined,
          schema: metaStr(node, 'schema') || undefined,
        })
        await writeClipboardText(definition)
      } else {
        // sequence/enum/domain/composite 分支随子批⑤迁入（当前菜单未对这些类型提供本动作）
        await writeClipboardText(formatObjectDefinition(node, quoteIdent, isPgLike))
      }
      message.success(t('common.copy'))
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  // ── 子批③：结构操作（打开设计器定位 / 物化视图刷新）──

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

  function openNodeTableDesigner(
    node: TreeNode,
    initialTab?: 'columns' | 'indexes' | 'foreign_keys' | 'ddl',
    initialAction?: 'add_column' | 'add_index' | 'add_foreign_key',
  ) {
    const payload = getTableNodePayload(node)
    if (!payload.table) return
    const target = initialTab ? { initialTab, initialAction } : resolveDesignerTarget(node)
    latestRef.current.onDesignTable?.({
      ...payload,
      designTab: target.initialTab,
      designAction: initialAction || target.initialAction,
    })
  }

  function handleRefreshMaterializedView(node: TreeNode) {
    if (node.type !== 'materialized-view') return
    const viewName = metaStr(node, 'name') || node.title
    Modal.confirm({
      title: t('tree.refresh_materialized_view'),
      content: t('tree.refresh_materialized_view_confirm', { name: viewName }),
      okText: t('common.ok'),
      async onOk() {
        try {
          const schema = metaStr(node, 'schema')
          const sql = `REFRESH MATERIALIZED VIEW ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(viewName)}`
          await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(node, 'database') || null)
          message.success(t('tree.refresh_materialized_view_success', { name: viewName }))
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  // ── 子批④：危险操作（truncate/drop 系列 + rename/create-schema）──
  // 每个危险操作都有 Modal.confirm（红线 5）；SQL 拼接为前端拼串现状（已知业务问题 1 不修）。

  function findNodeByTitle(nodes: TreeNode[], title: string): TreeNode | null {
    for (const node of nodes) {
      if ((metaStr(node, 'name') || node.title) === title) return node
    }
    return null
  }

  async function refreshDatabaseNode(databaseName: string) {
    const node = treeDataRef.current.find((item) => item.type === 'database' && (metaStr(item, 'name') || metaStr(item, 'database')) === databaseName)
    if (!node) {
      await loadDatabases()
      return
    }
    const wasExpanded = expandedKeysRef.current.includes(node.key)
    await handleRefreshNode(node)
    if (wasExpanded) {
      await handleToggle(node)
    }
  }

  async function refreshSchemaParent(node: TreeNode, targetSchemaName?: string) {
    const parentNode = node.type === 'schemas'
      ? node
      : findNodeInTree(treeDataRef.current, node.key.substring(0, node.key.lastIndexOf('-')))
    if (!parentNode) {
      await refreshDatabaseNode(metaStr(node, 'database'))
      return
    }

    updateNodeInTree(treeDataRef.current, parentNode.key, (current) => { current.children = [] })
    applyTreeData([...treeDataRef.current])
    await handleRefreshNode(parentNode)

    if (targetSchemaName) {
      const refreshedParent = findNodeInTree(treeDataRef.current, parentNode.key)
      const targetNode = findNodeByTitle(refreshedParent?.children || [], targetSchemaName)
      if (targetNode) {
        setSelectedNode(targetNode)
        setSelectedKeys([targetNode.key])
        if (!expandedKeysRef.current.includes(parentNode.key)) {
          applyExpandedKeys([...expandedKeysRef.current, parentNode.key])
        }
      }
    }
  }

  /** 刷新目标节点的父节点（drop 表/索引等之后按 key 前缀回溯） */
  async function refreshParentByKey(parentKey: string) {
    const parentNode = findNodeInTree(treeDataRef.current, parentKey)
    if (parentNode) await handleRefreshNode(parentNode)
  }

  function handleTruncateTable(node: TreeNode) {
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
          await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(node, 'database') || null)
          message.success(t('tree.truncate_success', { table }))
          await refreshDatabaseNode(metaStr(node, 'database'))
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  function handleDropTable(node: TreeNode) {
    const selectedTables = selectedNodesRef.current.filter((item) => item.type === 'table')
    const nodes = selectedTables.length > 0 ? selectedTables : [node]

    const hasView = nodes.some((item) => item.type === 'view')
    if (nodes.length > 1 && hasView) {
      message.warning(t('tree.multi_drop_tables_only'))
      return
    }

    if (nodes.length === 1) {
      const target = nodes[0].type === 'table' || nodes[0].type === 'view' ? nodes[0] : node
      const isView = target.type === 'view'
      const name = metaStr(target, 'name') || target.title
      const objType = isView ? 'VIEW' : 'TABLE'
      const titleKey = isView ? 'tree.drop_view' : 'tree.drop_table'
      const confirmKey = isView ? 'tree.drop_view_confirm' : 'tree.drop_confirm'
      const successKey = isView ? 'tree.drop_view_success' : 'tree.drop_success'
      Modal.confirm({
        title: t(titleKey),
        content: t(confirmKey, { name, table: name }),
        okText: t('common.delete'),
        okType: 'danger',
        async onOk() {
          try {
            const schema = metaStr(target, 'schema')
            const sql = `DROP ${objType} ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(name)}`
            await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(target, 'database') || null)
            message.success(t(successKey, { name, table: name }))
            await refreshParentByKey(target.key.substring(0, target.key.lastIndexOf('-')))
          } catch (e: unknown) { message.error(getErrorMessage(e)) }
        },
      })
      return
    }

    const names = nodes.map((item) => metaStr(item, 'name') || item.title)
    Modal.confirm({
      title: t('tree.drop_table_batch', { count: nodes.length }),
      content: t('tree.drop_batch_confirm', { count: nodes.length, names: names.slice(0, 5).join(', ') }),
      okText: t('common.delete'),
      okType: 'danger',
      async onOk() {
        const failed: string[] = []
        for (const item of nodes) {
          try {
            const tableName = metaStr(item, 'name') || item.title
            const schema = metaStr(item, 'schema')
            const sql = `DROP TABLE ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(tableName)}`
            await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(item, 'database') || null)
          } catch {
            failed.push(metaStr(item, 'name') || item.title)
          }
        }
        if (failed.length === 0) message.success(t('tree.drop_batch_success', { count: nodes.length }))
        else message.warning(t('tree.drop_batch_partial', { success: nodes.length - failed.length, failed: failed.length, names: failed.join(', ') }))
        const first = nodes[0]
        await refreshParentByKey(first.key.substring(0, first.key.lastIndexOf('-')))
        selectedNodesRef.current = []
        setSelectedKeys([])
      },
    })
  }

  function handleDropColumn(node: TreeNode) {
    if (node.type !== 'column') return
    const columnName = metaStr(node, 'name')
    Modal.confirm({
      title: t('tree.drop_column'),
      content: t('tree.drop_column_confirm', { name: columnName }),
      okText: t('common.delete'),
      okType: 'danger',
      async onOk() {
        try {
          await queryApi.alterTableStructure({
            connectionId: latestRef.current.connectionId!,
            database: metaStr(node, 'database'),
            table: metaStr(node, 'table'),
            schema: metaStr(node, 'schema') || null,
            changes: [{ type: 'drop_column', data: columnName }],
          })
          message.success(t('tree.drop_column_success', { name: columnName }))
          await refreshParentByKey(node.key.split('-col-')[0])
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  function handleDropIndex(node: TreeNode) {
    if (node.type !== 'index') return
    const indexName = metaStr(node, 'name')
    Modal.confirm({
      title: t('tree.drop_index'),
      content: t('tree.drop_index_confirm', { name: indexName }),
      okText: t('common.delete'),
      okType: 'danger',
      async onOk() {
        try {
          await queryApi.alterTableStructure({
            connectionId: latestRef.current.connectionId!,
            database: metaStr(node, 'database'),
            table: metaStr(node, 'table'),
            schema: metaStr(node, 'schema') || null,
            changes: [{ type: 'drop_index', data: indexName }],
          })
          message.success(t('tree.drop_index_success', { name: indexName }))
          await refreshParentByKey(node.key.split('-idx-')[0])
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  function handleDropForeignKey(node: TreeNode) {
    if (node.type !== 'foreign-key') return
    const fkName = metaStr(node, 'name')
    Modal.confirm({
      title: t('tree.drop_foreign_key'),
      content: t('tree.drop_foreign_key_confirm', { name: fkName }),
      okText: t('common.delete'),
      okType: 'danger',
      async onOk() {
        try {
          await queryApi.alterTableStructure({
            connectionId: latestRef.current.connectionId!,
            database: metaStr(node, 'database'),
            table: metaStr(node, 'table'),
            schema: metaStr(node, 'schema') || null,
            changes: [{ type: 'drop_foreign_key', data: fkName }],
          })
          message.success(t('tree.drop_foreign_key_success', { name: fkName }))
          await refreshParentByKey(node.key.split('-fk-')[0])
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  function makeDropByStatement(
    node: TreeNode,
    titleKey: string,
    confirmKey: string,
    successKey: string,
    buildSql: () => string,
    parentKey: string,
  ) {
    const name = metaStr(node, 'name')
    Modal.confirm({
      title: t(titleKey),
      content: t(confirmKey, { name }),
      okText: t('common.delete'),
      okType: 'danger',
      async onOk() {
        try {
          const sql = buildSql()
          await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(node, 'database') || null)
          message.success(t(successKey, { name }))
          await refreshParentByKey(parentKey)
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  function handleDropSchema(node: TreeNode, cascade: boolean) {
    if (node.type !== 'schema') return
    if (!isPgLike) {
      message.warning(t('tree.schema_ddl_unsupported'))
      return
    }
    const schemaName = metaStr(node, 'name') || node.title
    Modal.confirm({
      title: cascade ? t('tree.drop_schema_cascade') : t('tree.drop_schema'),
      content: t(cascade ? 'tree.drop_schema_cascade_confirm' : 'tree.drop_schema_confirm', { name: schemaName }),
      okText: t('common.delete'),
      okType: 'danger',
      async onOk() {
        try {
          const sql = `DROP SCHEMA ${quoteIdent(schemaName)}${cascade ? ' CASCADE' : ''}`
          await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(node, 'database') || null)
          message.success(t(cascade ? 'tree.drop_schema_cascade_success' : 'tree.drop_schema_success', { name: schemaName }))
          await refreshSchemaParent(node)
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  // ── 重命名/建 schema ──

  function openRenameModal(node: TreeNode, mode: 'table' | 'column' | 'schema' | 'create-schema' = 'table') {
    if (mode === 'table' && !['table', 'view', 'sequence'].includes(node.type)) return
    if (mode === 'column' && node.type !== 'column') return
    if (mode === 'schema' && node.type !== 'schema') return
    if (mode === 'create-schema' && !['database', 'schemas', 'schema'].includes(node.type)) return
    setRenameMode(mode)
    setRenameValue(mode === 'create-schema'
      ? ''
      : mode === 'column'
        ? metaStr(node, 'name')
        : (metaStr(node, 'name') || node.title))
    setRenameComment('')
    setShowRenameModal(true)
  }

  const renameModalTitle = (() => {
    if (renameMode === 'create-schema') return t('tree.create_schema')
    if (renameMode === 'schema') return t('tree.rename_schema')
    if (renameMode === 'column') return t('tree.rename_column')
    if (selectedNode?.type === 'sequence') return t('tree.rename_sequence')
    return t('tree.rename_table')
  })()

  async function renameTableLike(node: TreeNode, oldName: string, newName: string) {
    const schema = metaStr(node, 'schema')
    const database = metaStr(node, 'database') || null
    let sql = ''
    if (latestRef.current.dbType === 'mysql') {
      if (node.type !== 'table') throw new Error(t('tree.rename_unsupported'))
      sql = `RENAME TABLE ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(oldName)} TO ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(newName)}`
    } else if (isPgLike) {
      const objectType = node.type === 'view' ? 'ALTER VIEW' : node.type === 'sequence' ? 'ALTER SEQUENCE' : 'ALTER TABLE'
      sql = `${objectType} ${schema ? `${quoteIdent(schema)}.` : ''}${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`
    } else if (latestRef.current.dbType === 'sqlite') {
      if (node.type !== 'table') throw new Error(t('tree.rename_unsupported'))
      sql = `ALTER TABLE ${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`
    } else {
      throw new Error(t('tree.rename_unsupported'))
    }
    await queryApi.executeQuery(latestRef.current.connectionId!, sql, database)
  }

  async function createSchema(node: TreeNode, schemaName: string, comment?: string) {
    if (!isPgLike) throw new Error(t('tree.schema_ddl_unsupported'))
    const database = metaStr(node, 'database') || metaStr(node, 'name') || null
    const statements = [`CREATE SCHEMA ${quoteIdent(schemaName)}`]
    if (comment) {
      statements.push(`COMMENT ON SCHEMA ${quoteIdent(schemaName)} IS ${escapeSqlLiteral(comment)}`)
    }
    await queryApi.executeQuery(latestRef.current.connectionId!, statements.join(';\n'), database)
  }

  async function renameSchema(node: TreeNode, oldName: string, newName: string) {
    if (!isPgLike) throw new Error(t('tree.schema_ddl_unsupported'))
    const database = metaStr(node, 'database') || null
    const sql = `ALTER SCHEMA ${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`
    await queryApi.executeQuery(latestRef.current.connectionId!, sql, database)
  }

  async function renameColumn(node: TreeNode, oldName: string, newName: string) {
    await queryApi.alterTableStructure({
      connectionId: latestRef.current.connectionId!,
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
          },
        },
      }],
    })
  }

  async function submitRename() {
    const node = selectedNode
    if (!node) return
    const oldName = renameMode === 'column'
      ? metaStr(node, 'name')
      : renameMode === 'create-schema'
        ? ''
        : (metaStr(node, 'name') || node.title)
    const newName = renameValue.trim()
    if (!newName) { message.warning(t('tree.rename_empty')); return }
    if (renameMode !== 'create-schema' && newName === oldName) { message.warning(t('tree.rename_same')); return }

    setRenameSubmitting(true)
    try {
      if (renameMode === 'column') {
        await renameColumn(node, oldName, newName)
      } else if (renameMode === 'schema') {
        await renameSchema(node, oldName, newName)
      } else if (renameMode === 'create-schema') {
        await createSchema(node, newName, renameComment.trim())
      } else {
        await renameTableLike(node, oldName, newName)
      }
      setShowRenameModal(false)
      if (renameMode === 'create-schema') {
        message.success(t('tree.create_schema_success', { name: newName }))
        await refreshSchemaParent(node, newName)
      } else {
        message.success(t('tree.rename_success', { oldName, newName }))
        if (renameMode === 'schema') {
          await refreshSchemaParent(node, newName)
        } else {
          const parentKey = renameMode === 'column'
            ? node.key.split('-col-')[0]
            : node.key.substring(0, node.key.lastIndexOf('-'))
          await refreshParentByKey(parentKey)
        }
      }
    } catch (e: unknown) {
      message.error(getErrorMessage(e))
    } finally {
      setRenameSubmitting(false)
    }
  }

  // ── 子批⑤：PG 专有（sequence 全套 / 类型定义 / extension / 运维 / 巡检）──

  function nodeOid(node: TreeNode): number | null {
    const oidRaw = node.metadata?.oid
    return typeof oidRaw === 'number' ? oidRaw : Number.isFinite(Number(oidRaw)) ? Number(oidRaw) : null
  }

  function definitionFetchParams(node: TreeNode) {
    return {
      connectionId: latestRef.current.connectionId!,
      name: metaStr(node, 'name') || node.title,
      oid: nodeOid(node),
      database: metaStr(node, 'database') || undefined,
      schema: metaStr(node, 'schema') || undefined,
    }
  }

  const fetchSequenceDefinition = (node: TreeNode) => metadataApi.getSequenceDefinition(definitionFetchParams(node))
  const fetchSequenceState = (node: TreeNode) => metadataApi.getSequenceState(definitionFetchParams(node))
  const fetchEnumDefinition = (node: TreeNode) => metadataApi.getEnumDefinition(definitionFetchParams(node))
  const fetchDomainDefinition = (node: TreeNode) => metadataApi.getDomainDefinition(definitionFetchParams(node))
  const fetchCompositeDefinition = (node: TreeNode) => metadataApi.getCompositeDefinition(definitionFetchParams(node))

  async function viewFetchedDefinition(node: TreeNode, fetcher: (n: TreeNode) => Promise<string>) {
    try {
      const definition = await fetcher(node)
      showMetadataDefinition({ ...node, metadata: { ...node.metadata, definition } })
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  async function copyFetchedDefinition(node: TreeNode, fetcher: (n: TreeNode) => Promise<string>) {
    try {
      await writeClipboardText(await fetcher(node))
      message.success(t('common.copy'))
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  function buildSequenceQualifiedName(node: TreeNode) {
    const name = metaStr(node, 'name') || node.title
    const schema = metaStr(node, 'schema')
    return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name)
  }

  async function handleViewSequenceState(node: TreeNode) {
    if (node.type !== 'sequence') return
    try {
      setSequenceState(await fetchSequenceState(node))
      setShowSequenceStateModal(true)
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  async function openSetSequenceValueModal(node: TreeNode) {
    if (node.type !== 'sequence') return
    try {
      const state = await fetchSequenceState(node)
      setSequenceState(state)
      setSequenceValueInput(state.next_value ?? state.last_value ?? state.start_value ?? 1)
      setShowSequenceValueModal(true)
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  async function submitSequenceValue() {
    const node = selectedNode
    if (!node || node.type !== 'sequence') return
    const nextValue = sequenceValueInput
    if (nextValue === undefined || !Number.isFinite(nextValue)) {
      message.warning(t('tree.sequence_value_invalid'))
      return
    }
    setSequenceValueSubmitting(true)
    try {
      const sql = `SELECT setval(${escapeSqlLiteral(buildSequenceQualifiedName(node))}, ${Math.trunc(nextValue)}, false);`
      await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(node, 'database') || null)
      setShowSequenceValueModal(false)
      message.success(t('tree.set_sequence_value_success'))
      setSequenceState(await fetchSequenceState(node))
    } catch (e: unknown) {
      message.error(getErrorMessage(e))
    } finally {
      setSequenceValueSubmitting(false)
    }
  }

  async function handleRestartSequence(node: TreeNode) {
    if (node.type !== 'sequence') return
    try {
      const state = sequenceState ?? await fetchSequenceState(node)
      const restartWith = state.start_value ?? 1
      Modal.confirm({
        title: t('tree.restart_sequence'),
        content: t('tree.restart_sequence_confirm', { value: restartWith }),
        okText: t('common.ok'),
        async onOk() {
          const sql = `ALTER SEQUENCE ${buildSequenceQualifiedName(node)} RESTART WITH ${Math.trunc(restartWith)};`
          await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(node, 'database') || null)
          message.success(t('tree.restart_sequence_success'))
          setSequenceState(await fetchSequenceState(node))
        },
      })
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  function handleDropSequence(node: TreeNode) {
    if (node.type !== 'sequence') return
    const sequenceName = metaStr(node, 'name') || node.title
    Modal.confirm({
      title: t('tree.drop_sequence'),
      content: t('tree.drop_sequence_confirm', { name: sequenceName }),
      okText: t('common.delete'),
      okType: 'danger',
      async onOk() {
        try {
          const sql = `DROP SEQUENCE ${buildSequenceQualifiedName(node)}`
          await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(node, 'database') || null)
          message.success(t('tree.drop_sequence_success', { name: sequenceName }))
          await refreshParentByKey(node.key.substring(0, node.key.lastIndexOf('-')))
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  // ── extension ──

  async function refreshDatabaseChildNode(databaseName: string, childType: string) {
    const node = treeDataRef.current.find((item) => item.type === 'database' && (metaStr(item, 'name') || metaStr(item, 'database')) === databaseName)
    if (!node) {
      await refreshDatabaseNode(databaseName)
      return
    }
    const childNode = node.children?.find((item) => item.type === childType)
    if (!childNode) {
      await refreshDatabaseNode(databaseName)
      return
    }
    const wasExpanded = expandedKeysRef.current.includes(childNode.key)
    await handleRefreshNode(childNode)
    if (wasExpanded) {
      await handleToggle(childNode)
    }
  }

  async function openInstallExtensionModal(node: TreeNode) {
    if (node.type !== 'database' || !isPgLike || !latestRef.current.connectionId) return
    setInstallExtensionName('')
    setInstallExtensionSchema('')
    setAvailableExtensionOptions([])
    setInstallExtensionSchemaOptions([])
    setShowInstallExtensionModal(true)
    try {
      const database = metaStr(node, 'name') || metaStr(node, 'database') || ''
      const [extensions, schemas, installedExtensions] = await Promise.all([
        metadataApi.getAvailableExtensions(latestRef.current.connectionId, database),
        metadataApi.getSchemas(latestRef.current.connectionId, database),
        metadataApi.getDatabaseExtensions(latestRef.current.connectionId, database),
      ])
      const installedNames = new Set(installedExtensions.map((item) => item.name))
      setAvailableExtensionOptions(extensions.map((item: string) => ({
        label: installedNames.has(item) ? `${item} (${t('tree.installed')})` : item,
        value: item,
        disabled: installedNames.has(item),
      })))
      setInstallExtensionSchemaOptions(schemas.map((item) => ({ label: item.name, value: item.name })))
      setInstallExtensionSchema(schemas.find((item) => item.name === 'public')?.name || schemas[0]?.name || '')
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  async function submitInstallExtension() {
    const node = selectedNode
    if (!node || node.type !== 'database' || !isPgLike) return
    const extensionName = installExtensionName.trim()
    const targetSchema = installExtensionSchema.trim()
    if (!extensionName) {
      message.warning(t('tree.install_extension_empty'))
      return
    }
    setInstallExtensionSubmitting(true)
    try {
      const sql = targetSchema
        ? `CREATE EXTENSION ${quoteIdent(extensionName)} SCHEMA ${quoteIdent(targetSchema)}`
        : `CREATE EXTENSION ${quoteIdent(extensionName)}`
      await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(node, 'name') || metaStr(node, 'database') || null)
      setShowInstallExtensionModal(false)
      message.success(t('tree.install_extension_success', { name: extensionName }))
      await refreshDatabaseChildNode(metaStr(node, 'name') || metaStr(node, 'database'), 'database-extensions')
    } catch (e: unknown) {
      message.error(getErrorMessage(e))
    } finally {
      setInstallExtensionSubmitting(false)
    }
  }

  function handleUninstallExtension(node: TreeNode) {
    if (node.type !== 'extension' || !isPgLike) return
    const extensionName = metaStr(node, 'name') || node.title
    Modal.confirm({
      title: t('tree.uninstall_extension'),
      content: t('tree.uninstall_extension_confirm', { name: extensionName }),
      okText: t('common.delete'),
      okType: 'danger',
      async onOk() {
        try {
          const sql = `DROP EXTENSION ${quoteIdent(extensionName)}`
          await queryApi.executeQuery(latestRef.current.connectionId!, sql, metaStr(node, 'database') || null)
          message.success(t('tree.uninstall_extension_success', { name: extensionName }))
          await refreshDatabaseChildNode(metaStr(node, 'database'), 'database-extensions')
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  async function handleCopyExtensionInfo(node: TreeNode) {
    if (node.type !== 'extension') return
    const name = metaStr(node, 'name') || node.title
    const version = metaStr(node, 'version')
    const schema = metaStr(node, 'schema')
    const info = [name, version ? `v${version}` : '', schema ? `schema=${schema}` : ''].filter(Boolean).join(' ')
    await writeClipboardText(info)
    message.success(t('common.copy'))
  }

  // ── 运维与巡检 ──

  function handleMaintenanceAction(node: TreeNode, action: 'vacuum' | 'analyze' | 'reindex') {
    if (node.type !== 'database' || !isPgLike) return
    const databaseName = metaStr(node, 'name') || metaStr(node, 'database')
    const sql = action === 'vacuum'
      ? 'VACUUM;'
      : action === 'analyze'
        ? 'ANALYZE;'
        : `REINDEX DATABASE ${quoteIdent(databaseName)};`
    const titleKey = action === 'vacuum' ? 'tree.vacuum_database' : action === 'analyze' ? 'tree.analyze_database' : 'tree.reindex_database'
    const confirmKey = action === 'vacuum' ? 'tree.vacuum_database_confirm' : action === 'analyze' ? 'tree.analyze_database_confirm' : 'tree.reindex_database_confirm'
    const successKey = action === 'vacuum' ? 'tree.vacuum_database_success' : action === 'analyze' ? 'tree.analyze_database_success' : 'tree.reindex_database_success'

    Modal.confirm({
      title: t(titleKey),
      content: t(confirmKey, { name: databaseName }),
      okText: t('common.ok'),
      async onOk() {
        try {
          await queryApi.executeQuery(latestRef.current.connectionId!, sql, databaseName || null)
          message.success(t(successKey, { name: databaseName }))
        } catch (e: unknown) { message.error(getErrorMessage(e)) }
      },
    })
  }

  function getInspectionTitle(kind: InspectionKind, node: TreeNode) {
    if (kind === 'roles') return t('right_panel.inspect.roles')
    if (kind === 'sessions') return t('right_panel.inspect.sessions')
    if (kind === 'locks') return t('right_panel.inspect.locks')
    if (kind === 'blocking') return t('right_panel.inspect.blocking')
    return `${t('right_panel.inspect.grants')} · ${metaStr(node, 'name') || node.title}`
  }

  function openInspectionQuery(node: TreeNode, kind: InspectionKind) {
    if (!isPgLike) return
    const database = metaStr(node, 'database') || metaStr(node, 'name') || ''
    const useOpenGaussCompat = normalizedDbType === 'opengauss' || normalizedDbType === 'gaussdb'
    const sql = buildInspectionSql(kind, node, useOpenGaussCompat)
    if (!sql) return
    latestRef.current.onGenerateSql?.({
      sql,
      database,
      connectionId: latestRef.current.connectionId,
      title: getInspectionTitle(kind, node),
      autoExecuteNonce: `${kind}:${node.key}:${Date.now()}`,
    })
  }

  // ── 菜单分发（子批①-⑤全量）──
  async function handleMenuClick({ key }: { key: string }) {
    hideContextMenu()
    const node = selectedNode
    if (!node) return
    if (key === 'new-query') {
      latestRef.current.onNewQuery?.({
        database: node.metadata.name || node.metadata.database,
        connectionId: latestRef.current.connectionId,
      })
    } else if (key === 'refresh') {
      void handleRefreshNode(node)
    } else if (key === 'copy-name') {
      await writeClipboardText(node.title)
      message.success(t('common.copy'))
    } else if (key === 'view-definition') {
      showMetadataDefinition(node)
    } else if (key === 'view-data') {
      latestRef.current.onTableSelected?.({
        database: node.metadata.database,
        table: node.metadata.name || node.title,
        schema: node.metadata.schema,
        metadata: node.metadata,
      })
    } else if (key === 'view-ddl') {
      await handleViewDdl(node)
    } else if (key === 'view-er-diagram') {
      latestRef.current.onOpenErDiagram?.({
        database: node.metadata.database,
        table: node.metadata.name || node.title,
        schema: node.metadata.schema,
        metadata: node.metadata,
      })
    } else if (key === 'row-count') {
      await handleRowCount(node)
    } else if (key === 'gen-select') {
      await handleGenerateSql(node, 'SELECT')
    } else if (key === 'gen-insert') {
      await handleGenerateSql(node, 'INSERT')
    } else if (key === 'gen-update') {
      await handleGenerateSql(node, 'UPDATE')
    } else if (key === 'gen-delete') {
      await handleGenerateSql(node, 'DELETE')
    } else if (key === 'gen-create-table') {
      handleGenerateSchemaSql(node, 'table')
    } else if (key === 'gen-create-view') {
      handleGenerateSchemaSql(node, 'view')
    } else if (key === 'copy-columns') {
      await handleCopyColumns(node)
    } else if (key === 'copy-column-definition') {
      if (node.type === 'column') {
        await writeClipboardText(formatColumnDefinition(node))
        message.success(t('common.copy'))
      }
    } else if (key === 'copy-view-definition') {
      await handleCopyViewDefinition(node)
    } else if (key === 'view-routine-definition') {
      await handleViewRoutineDefinition(node)
    } else if (key === 'copy-routine-definition') {
      await handleCopyRoutineDefinition(node)
    } else if (key === 'gen-call-sql') {
      if (['function', 'procedure', 'aggregate'].includes(node.type)) {
        latestRef.current.onGenerateSql?.({
          sql: buildRoutineCallSql(node, quoteIdent),
          database: metaStr(node, 'database'),
          connectionId: latestRef.current.connectionId,
        })
      }
    } else if (key === 'copy-signature') {
      if (['function', 'procedure', 'aggregate'].includes(node.type)) {
        await writeClipboardText(buildRoutineSignature(node))
        message.success(t('common.copy'))
      }
    } else if (key === 'copy-object-definition') {
      await handleCopyObjectDefinition(node)
    } else if (key === 'design-table') {
      const payload = getTableNodePayload(node)
      if (payload.table) latestRef.current.onDesignTable?.(payload)
    } else if (key === 'add-column') {
      openNodeTableDesigner(node, 'columns', 'add_column')
    } else if (key === 'add-index') {
      openNodeTableDesigner(node, 'indexes', 'add_index')
    } else if (key === 'add-foreign-key') {
      openNodeTableDesigner(node, 'foreign_keys', 'add_foreign_key')
    } else if (key === 'open-column-designer') {
      openNodeTableDesigner(node)
    } else if (key === 'refresh-materialized-view') {
      handleRefreshMaterializedView(node)
    } else if (key === 'truncate-table') {
      handleTruncateTable(node)
    } else if (key === 'drop-table') {
      handleDropTable(node)
    } else if (key === 'drop-column') {
      handleDropColumn(node)
    } else if (key === 'drop-index') {
      handleDropIndex(node)
    } else if (key === 'drop-foreign-key') {
      handleDropForeignKey(node)
    } else if (key === 'drop-trigger') {
      if (node.type === 'trigger') {
        makeDropByStatement(
          node, 'tree.drop_trigger', 'tree.drop_trigger_confirm', 'tree.drop_trigger_success',
          () => buildDropTriggerSql(node, quoteIdent, { isPgLike, dbType: latestRef.current.dbType, unsupportedMessage: t('tree.drop_unsupported') }),
          node.key.split('-trigger-')[0],
        )
      }
    } else if (key === 'drop-rule') {
      if (node.type === 'rule') {
        makeDropByStatement(
          node, 'tree.drop_rule', 'tree.drop_rule_confirm', 'tree.drop_rule_success',
          () => buildDropRuleSql(node, quoteIdent, { isPgLike, unsupportedMessage: t('tree.drop_unsupported') }),
          node.key.split('-rule-')[0],
        )
      }
    } else if (key === 'drop-constraint') {
      if (['unique-constraint', 'check-constraint', 'exclude-constraint'].includes(node.type)) {
        makeDropByStatement(
          node, 'tree.drop_constraint', 'tree.drop_constraint_confirm', 'tree.drop_constraint_success',
          () => buildDropConstraintSql(node, quoteIdent, { isPgLike, unsupportedMessage: t('tree.drop_unsupported') }),
          node.key.replace(/-(unique|check|exclude)-constraint-.+$/, ''),
        )
      }
    } else if (key === 'drop-schema') {
      handleDropSchema(node, false)
    } else if (key === 'drop-schema-cascade') {
      handleDropSchema(node, true)
    } else if (key === 'rename-table' || key === 'rename-sequence') {
      openRenameModal(node)
    } else if (key === 'rename-column') {
      openRenameModal(node, 'column')
    } else if (key === 'rename-schema') {
      openRenameModal(node, 'schema')
    } else if (key === 'create-schema') {
      openRenameModal(node, 'create-schema')
    } else if (key === 'view-sequence-definition') {
      await viewFetchedDefinition(node, fetchSequenceDefinition)
    } else if (key === 'copy-sequence-definition') {
      await copyFetchedDefinition(node, fetchSequenceDefinition)
    } else if (key === 'view-sequence-state') {
      await handleViewSequenceState(node)
    } else if (key === 'set-sequence-value') {
      await openSetSequenceValueModal(node)
    } else if (key === 'restart-sequence') {
      await handleRestartSequence(node)
    } else if (key === 'drop-sequence') {
      handleDropSequence(node)
    } else if (key === 'view-enum-definition') {
      await viewFetchedDefinition(node, fetchEnumDefinition)
    } else if (key === 'copy-enum-definition') {
      await copyFetchedDefinition(node, fetchEnumDefinition)
    } else if (key === 'view-domain-definition') {
      await viewFetchedDefinition(node, fetchDomainDefinition)
    } else if (key === 'copy-domain-definition') {
      await copyFetchedDefinition(node, fetchDomainDefinition)
    } else if (key === 'view-composite-definition') {
      await viewFetchedDefinition(node, fetchCompositeDefinition)
    } else if (key === 'copy-composite-definition') {
      await copyFetchedDefinition(node, fetchCompositeDefinition)
    } else if (key === 'install-extension') {
      await openInstallExtensionModal(node)
    } else if (key === 'uninstall-extension') {
      handleUninstallExtension(node)
    } else if (key === 'copy-extension-info') {
      await handleCopyExtensionInfo(node)
    } else if (key === 'vacuum-database') {
      handleMaintenanceAction(node, 'vacuum')
    } else if (key === 'analyze-database') {
      handleMaintenanceAction(node, 'analyze')
    } else if (key === 'reindex-database') {
      handleMaintenanceAction(node, 'reindex')
    } else if (key === 'inspect-roles') {
      openInspectionQuery(node, 'roles')
    } else if (key === 'inspect-sessions') {
      openInspectionQuery(node, 'sessions')
    } else if (key === 'inspect-locks') {
      openInspectionQuery(node, 'locks')
    } else if (key === 'inspect-blocking') {
      openInspectionQuery(node, 'blocking')
    } else if (key === 'inspect-object-grants') {
      openInspectionQuery(node, 'object-grants')
    } else if (key === 'backup-database') {
      setActiveDatabaseName(metaStr(node, 'name') || metaStr(node, 'database'))
      setShowBackupDialog(true)
    } else if (key === 'restore-database') {
      setActiveDatabaseName(metaStr(node, 'name') || metaStr(node, 'database'))
      setShowRestoreDialog(true)
    }
  }

  /** 刷新节点：清空子树并保留展开态语义（照抄 Vue 版 handleRefreshNode，供 Slice 15 菜单复用） */
  async function handleRefreshNode(node: TreeNode) {
    const currentNode = findNodeInTree(treeDataRef.current, node.key) || node
    const staleExpandedKeys = collectSubtreeKeys(currentNode)
    applyExpandedKeys(expandedKeysRef.current.filter((key) => !staleExpandedKeys.has(key)))
    updateNodeInTree(treeDataRef.current, node.key, (target) => { target.children = undefined })
    applyTreeData([...treeDataRef.current])
    message.success(t('common.refresh'))
  }

  // 连接切换：加载/清空（对等 Vue watch immediate）
  useEffect(() => {
    if (connectionId) void loadDatabases()
    else applyTreeData([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, loadDatabases])

  // 连接恢复后补加载（对等 Vue watch(getConnectionStatus)）
  const connectionStatus = useConnectionStore((s) => (connectionId ? s.connectionStatuses.get(connectionId) || null : null))
  const isReadOnly = useConnectionStore((s) => Boolean(
    connectionId ? s.connections.find((c) => c.id === connectionId)?.read_only : false,
  ))
  useEffect(() => {
    if (connectionStatus === 'connected' && treeDataRef.current.length === 0 && !loading) {
      void loadDatabases()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus])

  // 搜索过滤 + 匹配计数上报
  const { nodes: filteredTreeNodes, totalMatches } = useMemo(
    () => filterTreeData(treeData, searchOptions),
    [treeData, searchOptions],
  )
  const onUpdateMatchesCountRef = useRef(onUpdateMatchesCount)
  onUpdateMatchesCountRef.current = onUpdateMatchesCount
  useEffect(() => {
    onUpdateMatchesCountRef.current?.(searchOptions?.text ? totalMatches : 0)
  }, [totalMatches, searchOptions?.text])

  return (
    <div className={styles.databaseTree}>
      <Spin spinning={loading} tip={t('common.loading')}>
        <div className={styles.customTree}>
          {filteredTreeNodes.map((node) => (
            <TreeNodeItem
              key={node.key}
              node={node}
              level={0}
              expandedKeys={expandedKeys}
              selectedKeys={selectedKeys}
              loadingNodes={loadingNodes}
              onToggle={(n) => void handleToggle(n)}
              onSelect={handleSelect}
              onDoubleClick={(n) => void handleDoubleClick(n)}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
        {!loading && filteredTreeNodes.length === 0 && (
          <Empty
            description={searchOptions?.text ? t('tree.no_data') : t('tree.select_connection')}
            imageStyle={{ height: 60 }}
          />
        )}
      </Spin>

      {contextMenuVisible && selectedNode && (
        <div className="app-context-menu-overlay" onClick={() => hideContextMenu()}>
          <div
            ref={contextMenuRef}
            className="app-context-menu app-context-menu--scrollable"
            style={{ left: contextMenuLeft, top: contextMenuTop, maxHeight: contextMenuMaxHeight }}
            onClick={(e) => e.stopPropagation()}
          >
            <Menu
              onClick={({ key }) => void handleMenuClick({ key: String(key) })}
              selectable={false}
              mode="inline"
              inlineIndent={8}
              items={buildTreeMenuItems(selectedNode, {
                supportsTableDataView: supportProfile.supportsTableDataView,
                supportsConnectionScripts: supportProfile.supportsConnectionScripts,
                supportsTableDesign: supportProfile.supportsTableDesign,
                supportsBackupRestore: supportProfile.supportsBackupRestore,
                isPgLike,
                isReadOnly,
                selectedTableCount: selectedNodesRef.current.filter((item) => item.type === 'table').length,
                t: (key, options) => t(key, options ?? {}) as string,
              })}
            />
          </div>
        </div>
      )}

      <DdlPreviewModal
        open={showDdlModal}
        title={t('tree.ddl_preview_title', { name: selectedNode?.title || '' })}
        ddl={ddlText}
        onClose={() => setShowDdlModal(false)}
      />

      <AntModal
        open={showRenameModal}
        title={renameModalTitle}
        onOk={() => void submitRename()}
        onCancel={() => setShowRenameModal(false)}
        confirmLoading={renameSubmitting}
      >
        <div className={styles.renameForm}>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder={t('tree.rename_placeholder')}
            onPressEnter={() => void submitRename()}
          />
          {renameMode === 'create-schema' && (
            <Input.TextArea
              value={renameComment}
              onChange={(e) => setRenameComment(e.target.value)}
              placeholder={t('tree.schema_comment_placeholder')}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          )}
        </div>
      </AntModal>

      <AntModal
        open={showSequenceStateModal}
        title={t('tree.sequence_state')}
        footer={null}
        width="520px"
        onCancel={() => setShowSequenceStateModal(false)}
      >
        {sequenceState && (
          <div className={styles.sequenceStatePanel}>
            <div className={styles.sequenceStateRow}><span>{t('tree.sequence_last_value')}</span><strong>{sequenceState.last_value ?? '-'}</strong></div>
            <div className={styles.sequenceStateRow}><span>{t('tree.sequence_next_value')}</span><strong>{sequenceState.next_value ?? '-'}</strong></div>
            <div className={styles.sequenceStateRow}><span>{t('tree.sequence_start_value')}</span><strong>{sequenceState.start_value ?? '-'}</strong></div>
            <div className={styles.sequenceStateRow}><span>{t('tree.sequence_increment_by')}</span><strong>{sequenceState.increment_by ?? '-'}</strong></div>
            <div className={styles.sequenceStateRow}><span>{t('tree.sequence_is_called')}</span><strong>{sequenceState.is_called ? t('common.yes') : t('common.no')}</strong></div>
          </div>
        )}
      </AntModal>

      <AntModal
        open={showSequenceValueModal}
        title={t('tree.set_sequence_value')}
        onOk={() => void submitSequenceValue()}
        onCancel={() => setShowSequenceValueModal(false)}
        confirmLoading={sequenceValueSubmitting}
      >
        <InputNumber
          value={sequenceValueInput}
          onChange={(v) => setSequenceValueInput(v ?? undefined)}
          min={1}
          precision={0}
          style={{ width: '100%' }}
        />
        <div className={styles.sequenceValueHint}>{t('tree.set_sequence_value_hint')}</div>
      </AntModal>

      <AntModal
        open={showInstallExtensionModal}
        title={t('tree.install_extension')}
        onOk={() => void submitInstallExtension()}
        onCancel={() => setShowInstallExtensionModal(false)}
        confirmLoading={installExtensionSubmitting}
      >
        <div className={styles.renameForm}>
          <Select
            value={installExtensionName || undefined}
            onChange={(v) => setInstallExtensionName(String(v ?? ''))}
            showSearch
            options={availableExtensionOptions}
            placeholder={t('tree.install_extension_placeholder')}
            optionFilterProp="label"
          />
          <Select
            value={installExtensionSchema || undefined}
            onChange={(v) => setInstallExtensionSchema(String(v ?? ''))}
            allowClear
            showSearch
            options={installExtensionSchemaOptions}
            placeholder={t('tree.install_extension_schema_placeholder')}
            optionFilterProp="label"
          />
        </div>
      </AntModal>

      <BackupDatabaseDialog
        open={showBackupDialog}
        connectionId={connectionId || ''}
        database={activeDatabaseName}
        onClose={() => setShowBackupDialog(false)}
        onBacked={() => setShowBackupDialog(false)}
      />

      <RestoreDatabaseDialog
        open={showRestoreDialog}
        connectionId={connectionId || ''}
        database={activeDatabaseName}
        onClose={() => setShowRestoreDialog(false)}
        onRestored={() => {
          setShowRestoreDialog(false)
          if (activeDatabaseName) void refreshDatabaseNode(activeDatabaseName)
        }}
      />
    </div>
  )
}
