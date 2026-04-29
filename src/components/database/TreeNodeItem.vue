<template>
  <div class="tree-node" :class="{ 'is-connection': node.type === 'connection' }">
    <div
      :class="['tree-node-content', { selected: isSelected }]"
      :style="{ paddingLeft: (level * 15 + 8) + 'px' }"
      @click="handleClick"
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
        <span v-else style="display: inline-block; width: 16px;"></span>
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
      
      <span class="tree-node-title" :class="{ 'bold': node.type === 'connection', 'search-highlight': node.highlight }">
        {{ node.title }}
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
const emit = defineEmits(['toggle', 'select', 'dblclick', 'contextmenu'])

const isExpanded = computed(() => props.expandedKeys.includes(props.node.key))
const isSelected = computed(() => props.selectedKeys.includes(props.node.key))
const isLoading = computed(() => props.loadingNodes.has(props.node.key))
const hasChildren = computed(() => !props.node.isLeaf && props.node.type !== 'empty')

const handleToggle = (e: Event) => { e.stopPropagation(); if (hasChildren.value) emit('toggle', props.node); }
const handleClick = () => emit('select', props.node)
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
    return { icon: 'ph:database-duotone', color: '#1890ff' }
  }

  if (type === 'column') {
    if (metadata.is_primary_key) return { icon: 'ph:key-duotone', color: '#faad14' }
    const dataType = (metadata.data_type || '').toLowerCase()
    if (dataType.includes('int') || dataType.includes('num') || dataType.includes('float') || dataType.includes('double') || dataType.includes('decimal') || dataType.includes('serial')) return { icon: 'ph:hash-bold', color: '#1890ff' }
    if (dataType.includes('date') || dataType.includes('time') || dataType.includes('interval')) return { icon: 'ph:calendar-blank-duotone', color: '#722ed1' }
    if (dataType.includes('bool')) return { icon: 'ph:toggle-left-duotone', color: '#52c41a' }
    if (dataType.includes('json') || dataType.includes('xml')) return { icon: 'ph:brackets-curly-bold', color: '#fa8c16' }
    if (dataType.includes('uuid') || dataType.includes('guid')) return { icon: 'ph:id-badge-duotone', color: '#607d8b' }
    if (dataType.includes('geometry') || dataType.includes('geography') || dataType.includes('point')) return { icon: 'ph:map-trifold-duotone', color: '#43a047' }
    if (dataType.includes('blob') || dataType.includes('binary') || dataType.includes('bytea')) return { icon: 'ph:file-zip-duotone', color: '#795548' }
    if (dataType.includes('[]') || dataType.includes('array')) return { icon: 'ph:list-dashes-bold', color: '#00bcd4' }
    return { icon: 'ph:text-t-bold', color: '#8c8c8c' }
  }

  const configMap: Record<string, any> = {
    database: { icon: 'ph:database-duotone', color: '#fa8c16' },
    schemas: { icon: 'ph:folders-duotone', color: '#8c8c8c' },
    schema: { icon: 'ph:tree-structure-duotone', color: '#722ed1' },
    'schema-tables': { icon: 'ph:table-duotone', color: '#52c41a' },
    tables: { icon: 'ph:table-duotone', color: '#52c41a' },
    table: { icon: 'ph:table-duotone', color: '#52c41a' },
    'schema-views': { icon: 'ph:eye-duotone', color: '#13c2c2' },
    views: { icon: 'ph:eye-duotone', color: '#13c2c2' },
    view: { icon: 'ph:eye-duotone', color: '#13c2c2' },
    'schema-functions': { icon: 'ph:function-duotone', color: '#eb2f96' },
    functions: { icon: 'ph:function-duotone', color: '#eb2f96' },
    function: { icon: 'ph:function-duotone', color: '#eb2f96' },
    'schema-procedures': { icon: 'ph:terminal-window-duotone', color: '#13c2c2' },
    procedures: { icon: 'ph:terminal-window-duotone', color: '#13c2c2' },
    procedure: { icon: 'ph:terminal-window-duotone', color: '#13c2c2' },
    'schema-aggregates': { icon: 'ph:function-duotone', color: '#722ed1' },
    aggregates: { icon: 'ph:function-duotone', color: '#722ed1' },
    'schema-indexes': { icon: 'ph:list-numbers-duotone', color: '#fa8c16' },
    index: { icon: 'ph:list-numbers-duotone', color: '#fa8c16' },
    'database-extensions': { icon: 'ph:puzzle-piece-duotone', color: '#1890ff' },
    extension: { icon: 'ph:puzzle-piece-duotone', color: '#1890ff' },
    'empty': { icon: 'ph:info-duotone', color: '#bfbfbf' },
    'leaf': { icon: 'ph:file-text-duotone', color: '#8c8c8c' }
  }

  // 针对 leaf 类型的特殊处理（索引、函数、聚合函数、扩展）
  if (type === 'leaf') {
    const key = node.key.toLowerCase()
    if (key.includes('-indexes') || key.includes('-index')) return { icon: 'ph:list-numbers-duotone', color: '#fa8c16' }
    if (key.includes('-aggregates')) return { icon: 'ph:function-duotone', color: '#722ed1' }
    if (key.includes('-procedures') || key.includes('-procedure')) return { icon: 'ph:terminal-window-duotone', color: '#13c2c2' }
    if (key.includes('-functions') || key.includes('-function')) return { icon: 'ph:function-duotone', color: '#eb2f96' }
    if (key.includes('-extensions') || key.includes('-extension')) return { icon: 'ph:puzzle-piece-duotone', color: '#1890ff' }
  }

  return configMap[type] || { icon: 'ph:file-text-duotone', color: '#8c8c8c' }
}
</script>

<style scoped>
.tree-node { width: 100%; position: relative; }
.tree-node-content { display: flex; align-items: center; padding: 2px 4px; cursor: pointer; user-select: none; border-radius: 2px; height: 26px; position: relative; }
.tree-node-content:hover { background-color: rgba(0, 0, 0, 0.04); }
.dark-mode .tree-node-content:hover { background-color: rgba(255, 255, 255, 0.05); }
.tree-node-content.selected { background-color: #e6f7ff; color: #1890ff; }
.dark-mode .tree-node-content.selected { background-color: #111b26; color: #177ddc; }

.tree-line { position: absolute; top: 0; bottom: 0; width: 1px; background-color: #f0f0f0; pointer-events: none; }
.tree-line.is-current { top: 13px; }
.dark-mode .tree-line { background-color: #303030; }

.tree-node-expand { display: inline-flex; align-items: center; justify-content: center; width: 16px; margin-right: 4px; z-index: 2; color: #8c8c8c; transition: all 0.2s; }
.dark-mode .tree-node-expand { color: #bfbfbf; }
.tree-node-expand:hover { color: #1890ff; transform: scale(1.2); }

.arrow-icon { font-size: 11px; }

.tree-node-icon { display: inline-flex; align-items: center; justify-content: center; margin-right: 8px; font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; z-index: 2; }
.loading-icon { color: #1890ff; font-size: 16px; }
.brand-icon { font-size: 16px; }
.type-icon { transition: transform 0.2s; }

.tree-node-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: #595959; }
.dark-mode .tree-node-title { color: #d9d9d9; }
.tree-node-title.bold { font-weight: 600; color: #262626; }
.dark-mode .tree-node-title.bold { color: #ffffff; }
.selected .tree-node-title { color: inherit; }

.tree-node-title.search-highlight { background-color: #fff3cd; color: #856404; border-radius: 2px; padding: 0 2px; }
.dark-mode .tree-node-title.search-highlight { background-color: #664d00; color: #ffd700; }
</style>
