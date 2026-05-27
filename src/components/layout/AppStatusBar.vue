<template>
  <footer class="status-bar">
    <div class="status-group status-group--left">
      <span class="status-item">
        <span class="status-label">{{ $t('status_bar.connection') }}</span>
        <span class="status-value">{{ connectionName }}</span>
      </span>
      <span class="status-divider"></span>
      <span class="status-item">
        <span class="status-label">{{ $t('status_bar.database') }}</span>
        <span class="status-value">{{ databaseName }}</span>
      </span>
      <span class="status-divider"></span>
      <span class="status-item">
        <span class="status-label">{{ $t('status_bar.schema') }}</span>
        <span class="status-value">{{ schemaName }}</span>
      </span>
      <span v-if="readOnly" class="status-badge status-badge--readonly">
        {{ $t('status_bar.read_only') }}
      </span>
    </div>

    <div class="status-group status-group--right">
      <button
        type="button"
        class="status-toggle status-toggle--icon"
        :title="rightPanelStore.collapsed ? $t('right_panel.show') : $t('right_panel.hide')"
        @click="rightPanelStore.toggleCollapsed()"
      >
        i
      </button>
      <span class="status-divider"></span>
      <span class="status-item">
        <span class="status-label">{{ $t('status_bar.connection_status') }}</span>
        <span class="status-badge" :class="connectionStatusClass">{{ connectionStatusLabel }}</span>
      </span>
      <span class="status-divider"></span>
      <span class="status-item">
        <span class="status-label">{{ $t('status_bar.task_status') }}</span>
        <span class="status-value">{{ taskStatusLabel }}</span>
      </span>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ConnectionStatus } from '@/types/database'
import type { SqlExecutionState } from '@/types/sqlExecution'
import { useI18n } from 'vue-i18n'
import { useRightPanelStore } from '@/stores/rightPanel'

const props = defineProps<{
  connectionName: string
  databaseName: string
  schemaName: string
  readOnly: boolean
  connectionStatus: ConnectionStatus
  executionState: SqlExecutionState | null
}>()

const { t } = useI18n()
const rightPanelStore = useRightPanelStore()

const connectionStatusLabel = computed(() => {
  switch (props.connectionStatus) {
    case 'connected':
      return t('status_bar.connected')
    case 'connecting':
      return t('status_bar.connecting')
    case 'error':
      return t('status_bar.error')
    default:
      return t('status_bar.disconnected')
  }
})

const connectionStatusClass = computed(() => `status-badge--${props.connectionStatus}`)

const taskStatusLabel = computed(() => {
  const state = props.executionState
  if (!state || state.status === 'idle') return t('status_bar.idle')
  if (state.status === 'running') return state.summary || t('status_bar.running')
  if (state.status === 'success') return state.summary || t('status_bar.completed')
  if (state.status === 'partial_success') return state.summary || t('status_bar.completed_with_warnings')
  if (state.status === 'cancelled') return state.summary || t('status_bar.cancelled')
  return state.summary || t('status_bar.failed')
})
</script>

<style scoped>
.status-bar {
  height: 34px;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--surface-secondary, #f7f8fa);
  color: var(--app-text-subtle);
  font-size: 12px;
  line-height: 1.25;
}

.status-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.status-group--left {
  flex: 1 1 auto;
  min-width: 0;
}

.status-group--right {
  flex: 0 0 auto;
}

.status-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.status-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-subtle);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s, color 0.15s;
}

.status-toggle--icon {
  width: 24px;
  min-width: 24px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 13px;
  line-height: 1.1;
}

.status-toggle:hover {
  background: var(--surface-hover);
  color: var(--app-text);
}

.status-label {
  color: var(--app-text-muted);
  white-space: nowrap;
}

.status-value {
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.status-divider {
  width: 1px;
  height: 12px;
  background: var(--border-color);
  opacity: 0.8;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--app-text);
  white-space: nowrap;
  line-height: 1.2;
}

.status-badge--readonly {
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning-text, #8a5a00);
}

.status-badge--connected {
  background: color-mix(in srgb, var(--color-success) 14%, transparent);
  color: var(--color-success-text, #1f7a3d);
}

.status-badge--connecting {
  background: color-mix(in srgb, var(--color-info, #1677ff) 14%, transparent);
  color: var(--color-info, #1677ff);
}

.status-badge--disconnected,
.status-badge--error {
  background: color-mix(in srgb, var(--color-danger) 14%, transparent);
  color: var(--color-danger);
}

@media (max-width: 960px) {
  .status-bar {
    height: auto;
    min-height: 34px;
    padding: 6px 12px;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .status-group {
    width: 100%;
    flex-wrap: wrap;
    gap: 8px;
  }

  .status-value {
    max-width: 160px;
  }
}
</style>
