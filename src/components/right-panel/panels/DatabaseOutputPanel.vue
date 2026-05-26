<template>
  <div class="panel-shell">
    <div class="panel-header">
      <div>
        <div class="panel-title">{{ $t('right_panel.output.title') }}</div>
        <div class="panel-subtitle">{{ $t('right_panel.output.subtitle', { count: dbMessages.length }) }}</div>
      </div>
      <a-button size="small" type="text" :disabled="dbMessages.length === 0" @click="rightPanelStore.clearDbMessages()">
        {{ $t('common.clear') }}
      </a-button>
    </div>

    <div v-if="dbMessages.length > 0" class="message-table-wrap">
      <div class="message-table">
        <div class="message-row message-row--head">
          <div>{{ $t('right_panel.fields.time') }}</div>
          <div>{{ $t('right_panel.fields.level') }}</div>
          <div>{{ $t('right_panel.fields.scope') }}</div>
          <div>{{ $t('right_panel.fields.message') }}</div>
        </div>
        <div v-for="(msg, index) in dbMessages" :key="index" class="message-row">
          <div class="message-cell message-cell--mono">{{ formatTime(msg.time) }}</div>
          <div class="message-cell">
            <span class="severity-pill" :class="`severity-pill--${severityTone(msg.severity)}`">{{ msg.severity || 'info' }}</span>
          </div>
          <div class="message-cell message-cell--scope">{{ formatScope(msg.connectionName, msg.database) }}</div>
          <div class="message-cell message-cell--text">{{ msg.text }}</div>
        </div>
      </div>
    </div>

    <a-empty v-else :description="$t('editor.messages_hint')" />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useRightPanelStore } from '@/stores/rightPanel'

const rightPanelStore = useRightPanelStore()
const { dbMessages } = storeToRefs(rightPanelStore)

function severityTone(severity?: string) {
  const normalized = String(severity || '').toLowerCase()
  if (normalized.includes('error')) return 'error'
  if (normalized.includes('warn')) return 'warning'
  if (normalized.includes('notice')) return 'notice'
  if (normalized.includes('debug')) return 'debug'
  return 'info'
}

function formatTime(value: number) {
  const date = new Date(value)
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  const ms = date.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function formatScope(connectionName?: string, database?: string) {
  return [connectionName, database].filter(Boolean).join(' / ')
}
</script>

<style scoped>
.panel-shell { display: grid; gap: 12px; align-content: start; }
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.panel-title { font-size: 15px; font-weight: 600; color: var(--app-text); }
.panel-subtitle { margin-top: 4px; font-size: 12px; color: var(--app-text-subtle); }
.message-table-wrap {
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
  border-radius: 10px;
  background: var(--surface);
}
.message-table {
  min-width: 720px;
}
.message-row {
  display: grid;
  grid-template-columns: 110px 92px 180px minmax(280px, 1fr);
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
}
.message-row:last-child { border-bottom: 0; }
.message-row--head {
  background: color-mix(in srgb, var(--surface-hover) 65%, white 10%);
  color: var(--app-text-subtle);
  font-size: 12px;
  font-weight: 600;
}
.message-row--head > div,
.message-cell {
  padding: 9px 12px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.message-cell {
  color: var(--app-text);
  font-size: 12px;
}
.message-cell--mono {
  font-family: var(--editor-font-family, "JetBrains Mono", monospace);
}
.message-cell--scope {
  color: var(--app-text-subtle);
}
.message-cell--text {
  white-space: pre-wrap;
  overflow: visible;
  text-overflow: unset;
  user-select: text !important;
  -webkit-user-select: text !important;
}
.severity-pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.severity-pill--error {
  color: #b42318;
  background: #fef3f2;
  border-color: #fecdca;
}
.severity-pill--warning {
  color: #b54708;
  background: #fffaeb;
  border-color: #fedf89;
}
.severity-pill--notice {
  color: #175cd3;
  background: #eff8ff;
  border-color: #b2ddff;
}
.severity-pill--debug {
  color: var(--app-text-subtle);
  background: color-mix(in srgb, var(--surface-hover) 72%, white 8%);
  border-color: color-mix(in srgb, var(--border-color) 72%, transparent);
}
.severity-pill--info {
  color: #027a48;
  background: #ecfdf3;
  border-color: #abefc6;
}
.panel-title,
.panel-subtitle,
.message-row--head,
.message-cell {
  user-select: text !important;
  -webkit-user-select: text !important;
}
</style>
