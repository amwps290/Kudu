<template>
  <div class="tree-node" :class="{ 'is-connection': node.type === 'connection' }">
    <div
      :class="['interactive-row', 'tree-node-content', { selected: isSelected }]"
      :style="{ paddingLeft: (level * 15 + 8) + 'px' }"
      @click="handleClick($event)"
      @dblclick="handleDblClick"
      @contextmenu="handleContextMenu"
    >
      <!-- 垂直引导线：修正起始位置为 16px -->
      <div 
        v-for="i in (level + (isExpanded && hasChildren ? 1 : 0))" 
        :key="i"
        class="tree-line"
        :class="{ 'is-current': i === level + 1 }"
        :style="{ left: ((i-1) * 15 + 16) + 'px' }"
      ></div>

      <!-- 展开/折叠箭头 -->
      <span class="tree-node-expand" @click="handleToggle">
        <Icon v-if="hasChildren && isExpanded" icon="fluent:chevron-down-12-filled" class="arrow-icon" />
        <Icon v-else-if="hasChildren" icon="fluent:chevron-right-12-filled" class="arrow-icon" />
        <span v-else class="tree-node-expand-placeholder"></span>
      </span>
      
      <!-- 动态图标 -->
      <span class="tree-node-icon">
        <Icon v-if="isLoading" icon="line-md:loading-twotone-loop" class="loading-icon" />
        <template v-else>
          <Icon 
            :icon="getIconConfig(node).icon" 
            :class="['type-icon', getIconConfig(node).class]"
            :style="{ color: isSelected ? 'inherit' : getIconConfig(node).color }"
          />
        </template>
      </span>
      
      <span class="tree-node-main">
        <span class="tree-node-title" :class="{ 'bold': node.type === 'connection', 'search-highlight': node.highlight }">
          {{ displayTitle }}
        </span>
        <span v-if="sizeBadge" class="tree-node-size-badge">{{ sizeBadge }}</span>
      </span>
    </div>
    
    <div v-if="isExpanded && node.children" class="tree-node-children">
      <TreeNodeItem
        v-for="child in node.children"
        :key="child.key"
        :node="child"
        :level="level + 1"
        :expanded-keys="expandedKeys"
        :selected-keys="selectedKeys"
        :loading-nodes="loadingNodes"
        @toggle="$emit('toggle', $event)"
        @select="$emit('select', $event)"
        @dblclick="$emit('dblclick', $event)"
        @contextmenu="$emit('contextmenu', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

interface TreeNode { key: string; title: string; type: string; isLeaf?: boolean; children?: TreeNode[]; metadata?: any; highlight?: boolean; }
const props = defineProps<{ node: TreeNode; level: number; expandedKeys: string[]; selectedKeys: string[]; loadingNodes: Set<string>; }>()

const displayTitle = computed(() => {
  const title = props.node.title || ''
  const separator = ' · '
  const idx = title.lastIndexOf(separator)
  return idx > -1 ? title.slice(0, idx) : title
})

const sizeBadge = computed(() => {
  const title = props.node.title || ''
  const separator = ' · '
  const idx = title.lastIndexOf(separator)
  return idx > -1 ? title.slice(idx + separator.length) : ''
})
const emit = defineEmits(['toggle', 'select', 'dblclick', 'contextmenu'])

const isExpanded = computed(() => props.expandedKeys.includes(props.node.key))
const isSelected = computed(() => props.selectedKeys.includes(props.node.key))
const isLoading = computed(() => props.loadingNodes.has(props.node.key))
const hasChildren = computed(() => !props.node.isLeaf && props.node.type !== 'empty')

const handleToggle = (e: Event) => { e.stopPropagation(); if (hasChildren.value) emit('toggle', props.node); }
const handleClick = (e: MouseEvent) => emit('select', { node: props.node, event: e })
const handleDblClick = () => emit('dblclick', props.node)
const handleContextMenu = (e: MouseEvent) => emit('contextmenu', { event: e, node: props.node })

function getIconConfig(node: TreeNode) {
  const type = node.type
  const metadata = node.metadata || {}
  
  if (type === 'connection') {
    const dbType = (metadata.db_type || '').toLowerCase()
    if (dbType.includes('postgres')) return { icon: 'logos:postgresql', class: 'brand-icon' }
    if (dbType.includes('mysql')) return { icon: 'logos:mysql', class: 'brand-icon' }
    if (dbType.includes('redis')) return { icon: 'logos:redis', class: 'brand-icon' }
    if (dbType.includes('sqlite')) return { icon: 'logos:sqlite', class: 'brand-icon' }
    if (dbType.includes('mongo')) return { icon: 'logos:mongodb-icon', class: 'brand-icon' }
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

  const configMap: Record<string, any> = {
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
    'schema-aggregates': { icon: 'ph:function-duotone', color: 'var(--icon-color-purple)' },
    aggregates: { icon: 'ph:function-duotone', color: 'var(--icon-color-purple)' },
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
    'empty': { icon: 'ph:info-duotone', color: 'var(--icon-color-muted)' },
    'leaf': { icon: 'ph:file-text-duotone', color: 'var(--icon-color-gray)' }
  }

  // 针对 leaf 类型的特殊处理（索引、函数、聚合函数、扩展）
  if (type === 'leaf') {
    const key = node.key.toLowerCase()
    if (key.includes('-indexes') || key.includes('-index')) return { icon: 'ph:list-numbers-duotone', color: 'var(--icon-color-orange)' }
    if (key.includes('-triggers') || key.includes('-trigger')) return { icon: 'ph:lightning-duotone', color: 'var(--icon-color-yellow)' }
    if (key.includes('-rules') || key.includes('-rule')) return { icon: 'ph:scroll-duotone', color: 'var(--icon-color-purple)' }
    if (key.includes('-uniques') || key.includes('-unique')) return { icon: 'ph:seal-check-duotone', color: 'var(--icon-color-green)' }
    if (key.includes('-checks') || key.includes('-check')) return { icon: 'ph:check-square-duotone', color: 'var(--icon-color-blue)' }
    if (key.includes('-excludes') || key.includes('-exclude')) return { icon: 'ph:prohibit-duotone', color: 'var(--icon-color-pink)' }
    if (key.includes('-aggregates')) return { icon: 'ph:function-duotone', color: 'var(--icon-color-purple)' }
    if (key.includes('-materialized-views') || key.includes('-materialized-view')) return { icon: 'ph:stack-duotone', color: 'var(--icon-color-sky)' }
    if (key.includes('-sequences') || key.includes('-sequence')) return { icon: 'ph:rows-duotone', color: 'var(--icon-color-cyan)' }
    if (key.includes('-enum-types') || key.includes('-enum-type') || key.includes('-enum-label')) return { icon: 'ph:list-bullets-duotone', color: 'var(--icon-color-orange)' }
    if (key.includes('-procedures') || key.includes('-procedure')) return { icon: 'ph:terminal-window-duotone', color: 'var(--icon-color-teal)' }
    if (key.includes('-functions') || key.includes('-function')) return { icon: 'ph:function-duotone', color: 'var(--icon-color-pink)' }
    if (key.includes('-extensions') || key.includes('-extension')) return { icon: 'ph:puzzle-piece-duotone', color: 'var(--icon-color-blue)' }
  }

  return configMap[type] || { icon: 'ph:file-text-duotone', color: 'var(--icon-color-gray)' }
}
</script>

<style scoped>
.tree-node { width: 100%; position: relative; }
.tree-node-content { display: flex; align-items: center; padding: 2px 4px; user-select: none; border-radius: var(--radius-sm); height: 26px; position: relative; }
.tree-node-content.selected { color: var(--color-primary); }
.tree-node-content.selected .tree-node-main { background-color: var(--surface-active); border-radius: var(--radius-sm); }
.tree-node-content.selected .tree-node-expand,
.tree-node-content.selected .tree-node-icon { color: var(--color-primary); }

.tree-node-content.interactive-row:hover,
.tree-node-content.interactive-row--soft:hover,
.tree-node-content.interactive-row--active {
  background-color: transparent;
}

.tree-line { position: absolute; top: 0; bottom: 0; width: 1px; background-color: var(--border-color-muted); pointer-events: none; }
.tree-line.is-current { top: 13px; }

.tree-node-expand { display: inline-flex; align-items: center; justify-content: center; width: 16px; margin-right: 4px; z-index: 2; color: var(--app-text-subtle); transition: all 0.2s; }
.tree-node-expand:hover { color: var(--color-primary); transform: scale(1.2); }
.tree-node-expand-placeholder { display: inline-block; width: 16px; }

.arrow-icon { font-size: 11px; }

.tree-node-icon { display: inline-flex; align-items: center; justify-content: center; margin-right: 8px; font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; z-index: 2; }
.loading-icon { color: var(--color-primary); font-size: 16px; }
.brand-icon { font-size: 16px; }
.type-icon { transition: transform 0.2s; }

.tree-node-main { flex: 0 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: 6px; padding: 0 6px; }
.tree-node-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--app-text-muted); }
.tree-node-title.bold { font-weight: 600; color: var(--app-text); }
.selected .tree-node-title { color: inherit; }

.tree-node-size-badge { flex-shrink: 0; display: inline-flex; align-items: center; padding: 0 8px; height: 18px; border-radius: 999px; font-size: 11px; line-height: 18px; color: var(--app-text-subtle); background: var(--surface-secondary); border: 1px solid var(--border-color-muted); }
.selected .tree-node-size-badge { color: inherit; border-color: currentColor; background: transparent; opacity: 0.9; }

.tree-node-title.search-highlight { background-color: var(--color-warning-soft-bg); color: var(--app-text); border-radius: 2px; padding: 0 2px; }
</style>
