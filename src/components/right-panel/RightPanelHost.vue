<template>
  <div v-if="!rightPanelStore.collapsed" class="right-panel-host" :style="{ width: rightPanelStore.width + 'px' }">
    <div class="right-panel-resizer" @pointerdown="startResize"></div>

    <div class="right-panel-shell">
      <div class="panel-toolbar panel-toolbar--muted-border right-panel-toolbar">
        <span class="panel-toolbar__title">{{ $t('right_panel.title') }}</span>
      </div>

      <a-tabs
        :active-key="rightPanelStore.activePanelId"
        size="small"
        class="right-panel-tabs"
        @update:activeKey="handleActiveKeyChange"
      >
        <a-tab-pane
          v-for="panel in visiblePanels"
          :key="panel.id"
          :tab="$t(panel.titleKey)"
        >
          <div class="right-panel-content">
            <component :is="panel.component" :context="rightPanelStore.context" />
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRightPanelStore } from '@/stores/rightPanel'
import { rightPanelRegistry } from '@/components/right-panel/panelRegistry'
import type { RightPanelId } from '@/types/rightPanel'

const rightPanelStore = useRightPanelStore()

const visiblePanels = computed(() => {
  const context = rightPanelStore.context
  return rightPanelRegistry
    .filter(panel => rightPanelStore.openedPanelIds.includes(panel.id))
    .filter(panel => (panel.visibleWhen ? panel.visibleWhen(context) : true))
    .sort((left, right) => left.order - right.order)
})

function handleActiveKeyChange(key: string | number) {
  rightPanelStore.setActivePanel(String(key) as RightPanelId)
}

function startResize(event: PointerEvent) {
  const startX = event.clientX
  const startWidth = rightPanelStore.width

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const delta = startX - moveEvent.clientX
    rightPanelStore.setWidth(startWidth + delta)
  }

  const handlePointerUp = () => {
    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', handlePointerUp)
  }

  document.addEventListener('pointermove', handlePointerMove)
  document.addEventListener('pointerup', handlePointerUp)
}
</script>

<style scoped>
.right-panel-host { display: flex; height: 100%; flex-shrink: 0; min-width: 0; }
.right-panel-resizer { width: 1px; cursor: col-resize; background: var(--border-color); transition: background-color 0.2s; flex-shrink: 0; position: relative; touch-action: none; }
.right-panel-resizer::before { content: ''; position: absolute; top: 0; bottom: 0; left: -4px; right: -4px; cursor: col-resize; }
.right-panel-resizer:hover { background: var(--color-primary); }
.right-panel-shell { display: flex; flex: 1; min-width: 0; flex-direction: column; background: var(--sidebar-bg); border-left: 1px solid var(--border-color); }
.right-panel-toolbar { flex-shrink: 0; }
.right-panel-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.right-panel-tabs :deep(.ant-tabs-nav) { margin-bottom: 0; padding: 0 8px; background: var(--tabbar-bg); border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.right-panel-tabs :deep(.ant-tabs-content-holder) { flex: 1; min-height: 0; }
.right-panel-tabs :deep(.ant-tabs-content) { height: 100%; }
.right-panel-tabs :deep(.ant-tabs-tabpane) { height: 100%; }
.right-panel-content { height: 100%; overflow: auto; padding: 10px 12px 12px; }
.right-panel-content :deep(.panel-shell),
.right-panel-content :deep(.panel-shell .panel-title),
.right-panel-content :deep(.panel-shell .panel-subtitle),
.right-panel-content :deep(.panel-shell .panel-eyebrow),
.right-panel-content :deep(.panel-shell .info-label),
.right-panel-content :deep(.panel-shell .info-value),
.right-panel-content :deep(.panel-shell .message-time),
.right-panel-content :deep(.panel-shell .message-card__body),
.right-panel-content :deep(.panel-shell .message-card__scope),
.right-panel-content :deep(.panel-shell .definition-block),
.right-panel-content :deep(.panel-shell .comment-block),
.right-panel-content :deep(.panel-shell .meta-text),
.right-panel-content :deep(.panel-shell .tag-item) {
  user-select: text !important;
  -webkit-user-select: text !important;
}
</style>
