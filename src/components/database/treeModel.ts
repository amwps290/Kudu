/**
 * 数据库树数据模型与纯函数（对等 Vue 版 DatabaseTree.vue 的 TreeNode 与树操作辅助）。
 *
 * 合约红线（迁移计划 R3）：TreeNode 的 key 编码规则原样保留——key 是字符串切割
 * 解析的（`db-${name}`、`${parent}-tables`、`${parent}-col-${name}` 等），严禁重构结构。
 * `isAutoExpanded` 字段无消费者（Vue 版即如此），搜索命中不自动展开——保持现状。
 */

export interface TreeNode {
  key: string
  title: string
  type: string
  children?: TreeNode[]
  isLeaf?: boolean
  metadata?: any
  isAutoExpanded?: boolean
  highlight?: boolean
}

export interface TreeSearchOptions {
  text: string
  caseSensitive: boolean
  regex: boolean
  searchColumns: boolean
}

export const TABLE_OBJECT_GROUP_NODE_TYPES = [
  'table-columns',
  'view-columns',
  'table-indexes',
  'table-foreign-keys',
  'table-triggers',
  'table-rules',
  'table-uniques',
  'table-checks',
  'table-excludes',
  'table-partitions',
]

export const VIRTUAL_GROUP_NODE_TYPES = [...TABLE_OBJECT_GROUP_NODE_TYPES, 'empty']

export function findNodeInTree(nodes: TreeNode[], targetKey: string): TreeNode | null {
  for (const node of nodes) {
    if (node.key === targetKey) return node
    if (node.children) {
      const found = findNodeInTree(node.children, targetKey)
      if (found) return found
    }
  }
  return null
}

export function updateNodeInTree(nodes: TreeNode[], targetKey: string, updater: (node: TreeNode) => void): boolean {
  for (const node of nodes) {
    if (node.key === targetKey) { updater(node); return true }
    if (node.children && updateNodeInTree(node.children, targetKey, updater)) return true
  }
  return false
}

export function collectSubtreeKeys(node: TreeNode): Set<string> {
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

/**
 * 搜索过滤（逻辑照抄 Vue 版 filteredTreeData computed）：
 * 正则/大小写/列名三开关；命中节点 highlight，命中子树保留；返回总命中数供计数上报。
 */
export function filterTreeData(
  treeData: TreeNode[],
  opts: TreeSearchOptions | undefined,
): { nodes: TreeNode[]; totalMatches: number } {
  if (!opts?.text) return { nodes: treeData, totalMatches: 0 }

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
    const matchedChildren: TreeNode[] = []
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

    const titleMatch = matcher(node.title)

    // 搜索列名模式：表/视图节点下检查列节点
    let columnMatch = false
    if (opts.searchColumns && (node.type === 'table' || node.type === 'view' || node.type === 'materialized-view') && node.children) {
      const hasMatchingColumn = (nodes: TreeNode[]): boolean => nodes.some((child) =>
        child.type === 'column'
          ? matcher(child.title)
          : Array.isArray(child.children) && child.children.length > 0
            ? hasMatchingColumn(child.children)
            : false,
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

  const nodes = treeData.reduce<TreeNode[]>((acc, node) => {
    const result = filterNode(node)
    if (result) acc.push(result.node)
    return acc
  }, [])

  return { nodes, totalMatches }
}
