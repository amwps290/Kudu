<template>
  <div class="er-shell">
    <div class="er-toolbar">
      <div class="er-toolbar__meta">
        <div class="er-title">{{ $t('tools.er_diagram.title') }}</div>
        <div class="er-subtitle">
          {{ focusLabel }} · {{ $t('tools.er_diagram.summary', { tables: nodes.length, relations: edges.length }) }}
        </div>
      </div>
      <div class="er-toolbar__actions">
        <a-button size="small" @click="fitToViewport">{{ $t('tools.er_diagram.fit_view') }}</a-button>
        <a-button size="small" @click="loadDiagram" :loading="loading">{{ $t('common.refresh') }}</a-button>
      </div>
    </div>

    <div ref="viewportRef" class="er-viewport" @pointerdown="startPan" @wheel.prevent="handleWheel">
      <div v-if="loading" class="er-state">{{ $t('common.loading') }}</div>
      <div v-else-if="errorText" class="er-state er-state--error">{{ errorText }}</div>
      <div v-else-if="nodes.length === 0" class="er-state">{{ $t('tools.er_diagram.empty') }}</div>

      <div
        v-else
        class="er-canvas"
        :style="{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }"
      >
        <svg class="er-links" :width="canvasSize.width" :height="canvasSize.height">
          <g v-for="edge in edges" :key="edge.key" class="er-link">
            <path :d="buildEdgePath(edge)" class="er-link__path" />
            <text :x="edgeLabelPosition(edge).x" :y="edgeLabelPosition(edge).y" class="er-link__label">
              {{ edge.sourceColumn }} → {{ edge.targetColumn }}
            </text>
          </g>
        </svg>

        <div
          v-for="node in nodes"
          :key="node.key"
          class="er-node"
          :style="{
            width: `${NODE_WIDTH}px`,
            left: `${node.x}px`,
            top: `${node.y}px`,
          }"
        >
          <div class="er-node__header" @pointerdown.stop="startDragNode($event, node)">
            <div class="er-node__title">{{ node.name }}</div>
            <div class="er-node__schema">{{ node.schema || '-' }}</div>
          </div>
          <div class="er-node__body">
            <div
              v-for="column in node.columns"
              :key="`${node.key}-${column.name}`"
              class="er-column"
              :class="{
                'er-column--pk': column.is_primary_key,
                'er-column--fk': foreignKeyColumnMap.has(`${node.key}.${column.name}`),
              }"
            >
              <span class="er-column__name">{{ column.name }}</span>
              <span class="er-column__type">{{ column.data_type }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { metadataApi } from '@/api'
import { getErrorMessage } from '@/utils/errorHandler'
import type { ColumnInfo, ForeignKeyInfo } from '@/types/database'

const NODE_WIDTH = 280
const NODE_HEADER_HEIGHT = 54
const NODE_ROW_HEIGHT = 24
const GRID_GAP_X = 84
const GRID_GAP_Y = 48

interface DiagramNode {
  key: string
  name: string
  schema?: string
  x: number
  y: number
  columns: ColumnInfo[]
}

interface DiagramEdge {
  key: string
  sourceKey: string
  targetKey: string
  sourceTable: string
  sourceSchema?: string
  sourceColumn: string
  targetTable: string
  targetSchema?: string
  targetColumn: string
}

const props = defineProps<{
  connectionId: string | null
  database: string | null
  table: string | null
  schema: string | null
}>()

const viewportRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const errorText = ref('')
const nodes = ref<DiagramNode[]>([])
const edges = ref<DiagramEdge[]>([])
const scale = ref(1)
const offset = ref({ x: 48, y: 48 })

const focusLabel = computed(() => {
  const location = [props.database || '-', props.schema || ''].filter(Boolean).join(' / ')
  return [location, props.table || '-'].filter(Boolean).join(' / ')
})

const foreignKeyColumnMap = computed(() => {
  const set = new Set<string>()
  for (const edge of edges.value) {
    set.add(`${edge.sourceKey}.${edge.sourceColumn}`)
  }
  return set
})

const canvasSize = computed(() => {
  const maxRight = Math.max(...nodes.value.map(node => node.x + NODE_WIDTH), 1200)
  const maxBottom = Math.max(...nodes.value.map(node => node.y + nodeHeight(node)), 900)
  return { width: maxRight + 200, height: maxBottom + 200 }
})

function nodeHeight(node: DiagramNode) {
  return NODE_HEADER_HEIGHT + Math.max(node.columns.length, 1) * NODE_ROW_HEIGHT + 14
}

function buildNodeKey(name: string, schema?: string | null) {
  return `${schema || ''}.${name}`
}

function resolveReferencedKey(
  referencedTableName: string,
  sourceSchema: string | undefined,
  tableKeys: Set<string>,
  schemaByName: Map<string, string[]>
) {
  const sameSchemaKey = buildNodeKey(referencedTableName, sourceSchema)
  if (tableKeys.has(sameSchemaKey)) return sameSchemaKey
  const schemas = schemaByName.get(referencedTableName) || []
  if (schemas.length > 0) return buildNodeKey(referencedTableName, schemas[0])
  return buildNodeKey(referencedTableName)
}

function buildGridPosition(index: number) {
  const columns = 4
  const col = index % columns
  const row = Math.floor(index / columns)
  return {
    x: 40 + col * (NODE_WIDTH + GRID_GAP_X),
    y: 40 + row * (320 + GRID_GAP_Y),
  }
}

async function loadDiagram() {
  if (!props.connectionId || !props.table) return
  loading.value = true
  errorText.value = ''
  try {
    const tables = await metadataApi.getTables(props.connectionId, props.database)
    const tableNodes = tables.filter(table => {
      const tableType = String(table.table_type || '').toUpperCase()
      return tableType.includes('TABLE') && !tableType.includes('VIEW')
    })
    const allTableKeys = new Set(tableNodes.map(table => buildNodeKey(table.name, table.schema)))
    const schemaByName = new Map<string, string[]>()
    for (const table of tableNodes) {
      const current = schemaByName.get(table.name) || []
      current.push(table.schema || '')
      schemaByName.set(table.name, current)
    }

    const focusKey = buildNodeKey(props.table, props.schema)
    if (!allTableKeys.has(focusKey)) {
      nodes.value = []
      edges.value = []
      return
    }

    const fkPayloads = await Promise.all(tableNodes.map(async (table) => ({
      table,
      foreignKeys: await metadataApi.getTableForeignKeys({
        connectionId: props.connectionId!,
        table: table.name,
        schema: table.schema,
      }),
    })))

    const relatedKeys = new Set<string>([focusKey])
    for (const payload of fkPayloads) {
      const sourceKey = buildNodeKey(payload.table.name, payload.table.schema)
      for (const fk of payload.foreignKeys) {
        const targetKey = resolveReferencedKey(fk.referenced_table_name, payload.table.schema, allTableKeys, schemaByName)
        if (sourceKey === focusKey) relatedKeys.add(targetKey)
        if (targetKey === focusKey) relatedKeys.add(sourceKey)
      }
    }

    const payloads = await Promise.all(fkPayloads
      .filter(({ table }) => relatedKeys.has(buildNodeKey(table.name, table.schema)))
      .map(async ({ table, foreignKeys }, index) => {
        const columns = await metadataApi.getTableStructure({
          connectionId: props.connectionId!,
          table: table.name,
          database: props.database,
          schema: table.schema,
        })

        return {
          node: {
            key: buildNodeKey(table.name, table.schema),
            name: table.name,
            schema: table.schema,
            ...buildGridPosition(index),
            columns,
          } satisfies DiagramNode,
          foreignKeys,
        }
      }))

    nodes.value = payloads.map(item => item.node)
    const nodeKeySet = new Set(nodes.value.map(node => node.key))
    edges.value = payloads.flatMap(item => item.foreignKeys.map((fk: ForeignKeyInfo) => {
      const sourceKey = item.node.key
      const targetKey = resolveReferencedKey(fk.referenced_table_name, item.node.schema, nodeKeySet, schemaByName)

      return {
        key: `${item.node.key}-${fk.name}-${fk.column_name}`,
        sourceKey,
        targetKey,
        sourceTable: item.node.name,
        sourceSchema: item.node.schema,
        sourceColumn: fk.column_name,
        targetTable: fk.referenced_table_name,
        targetSchema: targetKey.split('.').slice(0, -1).join('.') || undefined,
        targetColumn: fk.referenced_column_name,
      } satisfies DiagramEdge
    })).filter(edge => nodeKeySet.has(edge.targetKey))

    fitToViewport()
  } catch (error: unknown) {
    errorText.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function findNodeByKey(key: string) {
  return nodes.value.find(node => node.key === key)
}

function buildEdgePath(edge: DiagramEdge) {
  const source = findNodeByKey(edge.sourceKey)
  const target = findNodeByKey(edge.targetKey)
  if (!source || !target) return ''

  const startX = source.x + NODE_WIDTH
  const startY = source.y + NODE_HEADER_HEIGHT + Math.max(source.columns.findIndex(column => column.name === edge.sourceColumn), 0) * NODE_ROW_HEIGHT + 22
  const endX = target.x
  const endY = target.y + NODE_HEADER_HEIGHT + Math.max(target.columns.findIndex(column => column.name === edge.targetColumn), 0) * NODE_ROW_HEIGHT + 22
  const midX = startX + (endX - startX) / 2

  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
}

function edgeLabelPosition(edge: DiagramEdge) {
  const source = findNodeByKey(edge.sourceKey)
  const target = findNodeByKey(edge.targetKey)
  if (!source || !target) return { x: 0, y: 0 }
  return {
    x: source.x + NODE_WIDTH + (target.x - (source.x + NODE_WIDTH)) / 2,
    y: source.y + 16,
  }
}

function applyScaleAt(nextScale: number, clientX: number, clientY: number) {
  const viewport = viewportRef.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  const pointX = clientX - rect.left
  const pointY = clientY - rect.top
  const worldX = (pointX - offset.value.x) / scale.value
  const worldY = (pointY - offset.value.y) / scale.value

  scale.value = nextScale
  offset.value = {
    x: pointX - worldX * nextScale,
    y: pointY - worldY * nextScale,
  }
}

function handleWheel(event: WheelEvent) {
  const delta = event.deltaY < 0 ? 0.12 : -0.12
  const nextScale = Math.max(0.45, Math.min(1.8, scale.value + delta))
  if (nextScale === scale.value) return
  applyScaleAt(nextScale, event.clientX, event.clientY)
}

function fitToViewport() {
  const viewport = viewportRef.value
  if (!viewport || nodes.value.length === 0) return
  const minX = Math.min(...nodes.value.map(node => node.x))
  const minY = Math.min(...nodes.value.map(node => node.y))
  const maxX = Math.max(...nodes.value.map(node => node.x + NODE_WIDTH))
  const maxY = Math.max(...nodes.value.map(node => node.y + nodeHeight(node)))
  const contentWidth = maxX - minX + 80
  const contentHeight = maxY - minY + 80
  const nextScale = Math.max(0.45, Math.min(1, Math.min(viewport.clientWidth / contentWidth, viewport.clientHeight / contentHeight)))
  scale.value = nextScale
  offset.value = {
    x: (viewport.clientWidth - contentWidth * nextScale) / 2 - minX * nextScale,
    y: (viewport.clientHeight - contentHeight * nextScale) / 2 - minY * nextScale,
  }
}

function startPan(event: PointerEvent) {
  if ((event.target as HTMLElement)?.closest('.er-node')) return
  event.preventDefault()
  const start = { x: event.clientX, y: event.clientY }
  const initial = { ...offset.value }
  const move = (moveEvent: PointerEvent) => {
    offset.value = {
      x: initial.x + (moveEvent.clientX - start.x),
      y: initial.y + (moveEvent.clientY - start.y),
    }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function startDragNode(event: PointerEvent, node: DiagramNode) {
  event.preventDefault()
  const start = { x: event.clientX, y: event.clientY }
  const initial = { x: node.x, y: node.y }
  const move = (moveEvent: PointerEvent) => {
    const dx = (moveEvent.clientX - start.x) / scale.value
    const dy = (moveEvent.clientY - start.y) / scale.value
    node.x = initial.x + dx
    node.y = initial.y + dy
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

onMounted(() => {
  void loadDiagram()
})

watch(() => [props.connectionId, props.database, props.schema, props.table], () => {
  void loadDiagram()
})
</script>

<style scoped>
.er-shell {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  min-height: 0;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--color-primary) 6%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-hover) 66%, white 6%), var(--surface));
}
.er-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
}
.er-toolbar__meta {
  min-width: 0;
}
.er-title {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}
.er-subtitle {
  margin-top: 3px;
  color: var(--app-text-subtle);
  font-size: 12px;
}
.er-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.er-viewport {
  position: relative;
  overflow: hidden;
  min-height: 0;
  cursor: grab;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--border-color) 38%, transparent) 1px, transparent 1px),
    linear-gradient(180deg, color-mix(in srgb, var(--border-color) 38%, transparent) 1px, transparent 1px);
  background-size: 24px 24px;
}
.er-viewport:active {
  cursor: grabbing;
}
.er-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--app-text-subtle);
  font-size: 13px;
}
.er-state--error {
  color: var(--color-danger);
}
.er-canvas {
  position: absolute;
  inset: 0 auto auto 0;
  transform-origin: 0 0;
}
.er-links {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}
.er-link__path {
  fill: none;
  stroke: color-mix(in srgb, var(--color-primary) 48%, var(--border-color));
  stroke-width: 2;
  opacity: 0.85;
}
.er-link__label {
  fill: var(--app-text-subtle);
  font-size: 11px;
  text-anchor: middle;
}
.er-node {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--border-color) 84%, transparent);
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface) 92%, white 8%);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  user-select: none;
}
.er-node--dimmed {
  opacity: 0.28;
}
.er-node__header {
  display: grid;
  gap: 2px;
  padding: 12px 14px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 16%, white 84%), color-mix(in srgb, var(--surface-hover) 78%, white 10%));
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
  cursor: move;
}
.er-node__title {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}
.er-node__schema {
  color: var(--app-text-subtle);
  font-size: 11px;
}
.er-node__body {
  padding: 8px 0;
}
.er-column {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 0 14px;
  min-height: 24px;
  color: var(--app-text);
  font-size: 12px;
}
.er-column--pk .er-column__name {
  color: #b54708;
  font-weight: 600;
}
.er-column--fk .er-column__name {
  color: #175cd3;
}
.er-column__name,
.er-column__type {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.er-column__type {
  color: var(--app-text-subtle);
  font-size: 11px;
}
</style>
