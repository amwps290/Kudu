<template>
  <div class="panel-shell">
    <template v-if="viewer">
      <div class="panel-card panel-card--header">
        <div>
          <div class="panel-eyebrow">{{ viewer.objectName || $t('right_panel.cell_viewer.default_target') }}</div>
          <div class="panel-title">{{ viewer.columnTitle }}</div>
        </div>
        <a-tag :color="viewer.isNull ? 'default' : 'processing'">{{ viewer.field }}</a-tag>
      </div>

      <div class="panel-card panel-card--actions">
        <a-space wrap :size="[8, 8]">
          <a-button size="small" @click="viewer.onFormatJson?.()">{{ $t('data.format_json') }}</a-button>
          <a-button size="small" @click="viewer.onCopyCell?.()">{{ $t('data.copy_content') }}</a-button>
          <a-button size="small" @click="viewer.onCopyRowJson?.()">{{ $t('data.copy_row_json') }}</a-button>
          <a-button size="small" @click="viewer.onCopyRowInsert?.()">{{ $t('data.copy_row_insert_sql') }}</a-button>
        </a-space>
      </div>

      <div class="panel-card panel-card--editor">
        <div class="editor-toolbar">
          <span class="meta-text">{{ viewer.rowLabel || $t('right_panel.cell_viewer.no_row_label') }}</span>
          <a-checkbox
            :checked="viewer.isNull"
            :disabled="viewer.readOnly"
            @update:checked="handleToggleNull"
          >
            {{ $t('data.set_null') }}
          </a-checkbox>
        </div>
        <a-textarea
          :value="viewer.value"
          :rows="18"
          :readonly="viewer.readOnly || viewer.isNull"
          class="viewer-textarea"
          @update:value="handleValueChange"
        />
      </div>
    </template>

    <a-empty v-else :description="$t('right_panel.cell_viewer.empty')" />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRightPanelStore } from '@/stores/rightPanel'

const rightPanelStore = useRightPanelStore()
const { cellViewer } = storeToRefs(rightPanelStore)
const viewer = computed(() => cellViewer.value)

function handleToggleNull(checked: boolean) {
  viewer.value?.onToggleNull?.(checked)
}

function handleValueChange(value: string) {
  viewer.value?.onChange?.(value)
}
</script>

<style scoped>
.panel-shell { display: grid; gap: 12px; }
.panel-card { background: var(--surface); border: 1px solid var(--border-color); border-radius: 10px; }
.panel-card--header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px; }
.panel-card--actions { padding: 10px 12px; }
.panel-card--editor { padding: 12px; }
.panel-eyebrow { font-size: 12px; color: var(--app-text-subtle); margin-bottom: 4px; }
.panel-title { font-size: 15px; font-weight: 600; color: var(--app-text); word-break: break-word; }
.meta-text { font-size: 12px; color: var(--app-text-subtle); }
.editor-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.viewer-textarea :deep(textarea) {
  font-family: var(--editor-font-family, "JetBrains Mono", monospace);
  user-select: text !important;
  -webkit-user-select: text !important;
}
</style>
