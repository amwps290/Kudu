<template>
  <div class="result-tabs">
    <a-tabs class="result-tabs-nav" v-model:activeKey="activeKey">
      <a-tab-pane key="result" :tab="$t('editor.result')">
        <div class="result-content">
          <div v-if="results.length > 0" class="result-info">
            <a-space>
              <a-tag color="success">
                {{ $t('common.success') }}
              </a-tag>
              <a-tag color="processing">
                {{ results[results.length - 1]?.execution_time_ms || 0 }} ms
              </a-tag>
            </a-space>
          </div>
          <div v-if="lastResult" class="result-display">
            <a-alert
              v-if="lastResult.error"
              type="error"
              :message="lastResult.error"
              show-icon
            />
            <div v-else class="result-content-wrapper">
              <!-- 字符串结果 - 保留换行符 -->
              <pre
                v-if="typeof lastResult.result === 'string'"
                class="result-text"
                v-html="formatResult(lastResult.result)"
              ></pre>
              <!-- JSON 结果 -->
              <pre v-else class="result-json">{{ formatResult(lastResult.result) }}</pre>
            </div>
          </div>
          <a-empty v-else :description="$t('editor.no_result')" />
        </div>
      </a-tab-pane>
      <a-tab-pane key="messages" :tab="$t('editor.messages')">
        <div class="messages-content">
          <a-timeline>
            <a-timeline-item
              v-for="(msg, index) in messages"
              :key="index"
              :color="msg.type === 'success' ? 'green' : msg.type === 'error' ? 'red' : 'blue'"
            >
              <span class="message-time">{{ msg.time }}</span>
              <span class="message-text">{{ msg.text }}</span>
            </a-timeline-item>
          </a-timeline>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

export interface RedisMessage {
  type: 'success' | 'error' | 'info'
  text: string
  time: string
}

const props = defineProps<{
  results: any[]
  messages: RedisMessage[]
}>()

const activeKey = ref('result')

const lastResult = computed(() => {
  return props.results.length > 0
    ? props.results[props.results.length - 1]
    : null
})

function formatResult(result: any): string {
  if (result === null || result === undefined) {
    return 'null'
  }

  if (typeof result === 'string') {
    const escaped = result
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    return escaped
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
  }

  return JSON.stringify(result, null, 2)
}

function setActiveKey(key: string) {
  activeKey.value = key
}

defineExpose({ setActiveKey })
</script>

<style scoped>
.result-tabs {
  height: 450px;
  overflow: hidden;
}

.result-tabs-nav {
  margin-left: 12px;
}

.result-tabs :deep(.ant-tabs-content) {
  height: calc(100% - 46px);
}

.result-content,
.messages-content {
  height: 100%;
  overflow: auto;
  padding: 12px;
}

.result-info {
  margin-bottom: 12px;
}

.result-display {
  background: var(--surface-muted);
  padding: 12px;
  border-radius: var(--radius-sm);
}

.result-content-wrapper {
  max-height: 500px;
  overflow: auto;
}

.result-json,
.result-text {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
}

.result-text {
  color: var(--app-text);
}

.message-time {
  color: var(--app-text-subtle);
  margin-right: 8px;
}

.message-text {
  font-family: monospace;
}
</style>
