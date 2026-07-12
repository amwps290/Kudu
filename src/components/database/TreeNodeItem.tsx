import { Icon } from '@iconify/react'
import type { TreeNode } from './treeModel'
import styles from './TreeNodeItem.module.css'

/**
 * 树节点（对等 Vue 版 TreeNodeItem.vue；Vue 的隐式递归组件改为显式递归函数组件）。
 * 图标映射 getIconConfig 逐行平移（@iconify 图标名字符串不变）。
 */

export interface TreeNodeItemEvents {
  onToggle: (node: TreeNode) => void
  onSelect: (payload: { node: TreeNode; event: React.MouseEvent }) => void
  onDoubleClick: (node: TreeNode) => void
  onContextMenu: (payload: { event: React.MouseEvent; node: TreeNode }) => void
}

interface TreeNodeItemProps extends TreeNodeItemEvents {
  node: TreeNode
  level: number
  expandedKeys: string[]
  selectedKeys: string[]
  loadingNodes: Set<string>
}

function getIconConfig(node: TreeNode): { icon: string; color?: string; className?: string } {
  const type = node.type
  const metadata = node.metadata || {}

  if (type === 'connection') {
    const dbType = (metadata.db_type || '').toLowerCase()
    if (dbType.includes('postgres')) return { icon: 'logos:postgresql', className: styles.brandIcon }
    if (dbType.includes('mysql')) return { icon: 'logos:mysql', className: styles.brandIcon }
    if (dbType.includes('redis')) return { icon: 'logos:redis', className: styles.brandIcon }
    if (dbType.includes('sqlite')) return { icon: 'logos:sqlite', className: styles.brandIcon }
    if (dbType.includes('mongo')) return { icon: 'logos:mongodb-icon', className: styles.brandIcon }
    return { icon: 'ph:database-duotone', color: 'var(--icon-color-blue)' }
  }

  if (type === 'column') {
    if (metadata.is_primary_key) return { icon: 'ph:key-duotone', color: 'var(--icon-color-yellow)' }
    const dataType = (metadata.data_type || '').toLowerCase()
    if (dataType.includes('int') || dataType.includes('num') || dataType.includes('float') || dataType.includes('double') || dataType.includes('decimal') || dataType.includes('serial')) return { icon: 'ph:hash-bold', color: 'var(--icon-color-blue)' }
    if (dataType.includes('date') || dataType.includes('time') || dataType.includes('interval')) return { icon: 'ph:calendar-blank-duotone', color: 'var(--icon-color-purple)' }
    if (dataType.includes('bool')) return { icon: 'ph:toggle-left-duotone', color: 'var(--icon-color-green)' }
    if (dataType.includes('json') || dataType.includes('xml')) return { icon: 'ph:brackets-curly-bold', color: 'var(--icon-color-orange)' }
    if (dataType.includes('uuid') || dataType.includes('guid')) return { icon: 'ph:id-badge-duotone', color: 'var(--icon-color-slate)' }
    if (dataType.includes('geometry') || dataType.includes('geography') || dataType.includes('point')) return { icon: 'ph:map-trifold-duotone', color: 'var(--icon-color-emerald)' }
    if (dataType.includes('blob') || dataType.includes('binary') || dataType.includes('bytea')) return { icon: 'ph:file-zip-duotone', color: 'var(--icon-color-brown)' }
    if (dataType.includes('[]') || dataType.includes('array')) return { icon: 'ph:list-dashes-bold', color: 'var(--icon-color-cyan)' }
    return { icon: 'ph:text-t-bold', color: 'var(--icon-color-gray)' }
  }

  if (type === 'table' && metadata.is_partitioned) return { icon: 'ph:git-branch-duotone', color: 'var(--icon-color-purple)' }
  if (type === 'table' && metadata.partition_parent) return { icon: 'ph:tree-structure-duotone', color: 'var(--icon-color-cyan)' }

  const configMap: Record<string, { icon: string; color?: string }> = {
    database: { icon: 'ph:database-duotone', color: 'var(--icon-color-orange)' },
    schemas: { icon: 'ph:folders-duotone', color: 'var(--icon-color-gray)' },
    schema: { icon: 'ph:tree-structure-duotone', color: 'var(--icon-color-purple)' },
    'schema-tables': { icon: 'ph:table-duotone', color: 'var(--icon-color-green)' },
    'table-columns': { icon: 'ph:columns-duotone', color: 'var(--icon-color-gray)' },
    'view-columns': { icon: 'ph:columns-duotone', color: 'var(--icon-color-gray)' },
    'table-indexes': { icon: 'ph:list-numbers-duotone', color: 'var(--icon-color-orange)' },
    'table-foreign-keys': { icon: 'ph:link-duotone', color: 'var(--icon-color-teal)' },
    'table-triggers': { icon: 'ph:lightning-duotone', color: 'var(--icon-color-yellow)' },
    'table-rules': { icon: 'ph:scroll-duotone', color: 'var(--icon-color-purple)' },
    'table-uniques': { icon: 'ph:seal-check-duotone', color: 'var(--icon-color-green)' },
    'table-checks': { icon: 'ph:check-square-duotone', color: 'var(--icon-color-blue)' },
    'table-excludes': { icon: 'ph:prohibit-duotone', color: 'var(--icon-color-pink)' },
    'table-partitions': { icon: 'ph:git-branch-duotone', color: 'var(--icon-color-purple)' },
    'partition-key': { icon: 'ph:key-duotone', color: 'var(--icon-color-yellow)' },
    tables: { icon: 'ph:table-duotone', color: 'var(--icon-color-green)' },
    table: { icon: 'ph:table-duotone', color: 'var(--icon-color-green)' },
    'schema-views': { icon: 'ph:eye-duotone', color: 'var(--icon-color-teal)' },
    'schema-materialized-views': { icon: 'ph:stack-duotone', color: 'var(--icon-color-sky)' },
    views: { icon: 'ph:eye-duotone', color: 'var(--icon-color-teal)' },
    view: { icon: 'ph:eye-duotone', color: 'var(--icon-color-teal)' },
    'materialized-view': { icon: 'ph:stack-duotone', color: 'var(--icon-color-sky)' },
    'schema-functions': { icon: 'ph:function-duotone', color: 'var(--icon-color-pink)' },
    functions: { icon: 'ph:function-duotone', color: 'var(--icon-color-pink)' },
    function: { icon: 'ph:function-duotone', color: 'var(--icon-color-pink)' },
    'schema-procedures': { icon: 'ph:terminal-window-duotone', color: 'var(--icon-color-teal)' },
    procedures: { icon: 'ph:terminal-window-duotone', color: 'var(--icon-color-teal)' },
    procedure: { icon: 'ph:terminal-window-duotone', color: 'var(--icon-color-teal)' },
    'schema-sequences': { icon: 'ph:rows-duotone', color: 'var(--icon-color-cyan)' },
    sequence: { icon: 'ph:rows-duotone', color: 'var(--icon-color-cyan)' },
    'schema-enum-types': { icon: 'ph:list-bullets-duotone', color: 'var(--icon-color-orange)' },
    'enum-type': { icon: 'ph:list-bullets-duotone', color: 'var(--icon-color-orange)' },
    'enum-label': { icon: 'ph:text-t-bold', color: 'var(--icon-color-gray)' },
    'schema-domain-types': { icon: 'ph:shield-checkered-duotone', color: 'var(--icon-color-purple)' },
    'domain-type': { icon: 'ph:shield-checkered-duotone', color: 'var(--icon-color-purple)' },
    'domain-detail': { icon: 'ph:info-duotone', color: 'var(--icon-color-gray)' },
    'domain-constraint': { icon: 'ph:check-square-duotone', color: 'var(--icon-color-blue)' },
    'schema-composite-types': { icon: 'ph:stack-simple-duotone', color: 'var(--icon-color-cyan)' },
    'composite-type': { icon: 'ph:stack-simple-duotone', color: 'var(--icon-color-cyan)' },
    'composite-field': { icon: 'ph:text-t-bold', color: 'var(--icon-color-gray)' },
    'schema-aggregates': { icon: 'ph:function-duotone', color: 'var(--icon-color-purple)' },
    aggregates: { icon: 'ph:function-duotone', color: 'var(--icon-color-purple)' },
    aggregate: { icon: 'ph:function-duotone', color: 'var(--icon-color-purple)' },
    'schema-indexes': { icon: 'ph:list-numbers-duotone', color: 'var(--icon-color-orange)' },
    index: { icon: 'ph:list-numbers-duotone', color: 'var(--icon-color-orange)' },
    'foreign-key': { icon: 'ph:link-duotone', color: 'var(--icon-color-teal)' },
    trigger: { icon: 'ph:lightning-duotone', color: 'var(--icon-color-yellow)' },
    rule: { icon: 'ph:scroll-duotone', color: 'var(--icon-color-purple)' },
    'unique-constraint': { icon: 'ph:seal-check-duotone', color: 'var(--icon-color-green)' },
    'check-constraint': { icon: 'ph:check-square-duotone', color: 'var(--icon-color-blue)' },
    'exclude-constraint': { icon: 'ph:prohibit-duotone', color: 'var(--icon-color-pink)' },
    'database-extensions': { icon: 'ph:puzzle-piece-duotone', color: 'var(--icon-color-blue)' },
    extension: { icon: 'ph:puzzle-piece-duotone', color: 'var(--icon-color-blue)' },
    empty: { icon: 'ph:info-duotone', color: 'var(--icon-color-muted)' },
    leaf: { icon: 'ph:file-text-duotone', color: 'var(--icon-color-gray)' },
  }

  return configMap[type] || { icon: 'ph:file-text-duotone', color: 'var(--icon-color-gray)' }
}

export default function TreeNodeItem({
  node, level, expandedKeys, selectedKeys, loadingNodes,
  onToggle, onSelect, onDoubleClick, onContextMenu,
}: TreeNodeItemProps) {
  const title = node.title || ''
  const separator = ' · '
  const separatorIndex = title.lastIndexOf(separator)
  const displayTitle = separatorIndex > -1 ? title.slice(0, separatorIndex) : title
  const sizeBadge = separatorIndex > -1 ? title.slice(separatorIndex + separator.length) : ''

  const isExpanded = expandedKeys.includes(node.key)
  const isSelected = selectedKeys.includes(node.key)
  const isLoading = loadingNodes.has(node.key)
  const hasChildren = !node.isLeaf && node.type !== 'empty'

  const iconConfig = getIconConfig(node)
  const guideCount = level + (isExpanded && hasChildren ? 1 : 0)

  return (
    <div className={styles.treeNode}>
      <div
        className={`interactive-row ${styles.treeNodeContent} ${isSelected ? styles.selected : ''}`}
        style={{ paddingLeft: `${level * 15 + 8}px` }}
        onClick={(e) => onSelect({ node, event: e })}
        onDoubleClick={() => onDoubleClick(node)}
        onContextMenu={(e) => onContextMenu({ event: e, node })}
      >
        {Array.from({ length: guideCount }, (_, i) => i + 1).map((i) => (
          <div
            key={i}
            className={`${styles.treeLine} ${i === level + 1 ? styles.treeLineCurrent : ''}`}
            style={{ left: `${(i - 1) * 15 + 16}px` }}
          />
        ))}

        <span
          className={styles.treeNodeExpand}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(node) }}
        >
          {hasChildren && isExpanded && <Icon icon="fluent:chevron-down-12-filled" className={styles.arrowIcon} />}
          {hasChildren && !isExpanded && <Icon icon="fluent:chevron-right-12-filled" className={styles.arrowIcon} />}
          {!hasChildren && <span className={styles.treeNodeExpandPlaceholder} />}
        </span>

        <span className={styles.treeNodeIcon}>
          {isLoading ? (
            <Icon icon="line-md:loading-twotone-loop" className={styles.loadingIcon} />
          ) : (
            <Icon
              icon={iconConfig.icon}
              className={`${styles.typeIcon} ${iconConfig.className || ''}`}
              style={{ color: isSelected ? 'inherit' : iconConfig.color }}
            />
          )}
        </span>

        <span className={styles.treeNodeMain}>
          <span className={`${styles.treeNodeTitle} ${node.highlight ? styles.searchHighlight : ''}`}>
            {displayTitle}
          </span>
          {sizeBadge && <span className={styles.treeNodeSizeBadge}>{sizeBadge}</span>}
        </span>
      </div>

      {isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.key}
              node={child}
              level={level + 1}
              expandedKeys={expandedKeys}
              selectedKeys={selectedKeys}
              loadingNodes={loadingNodes}
              onToggle={onToggle}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}
