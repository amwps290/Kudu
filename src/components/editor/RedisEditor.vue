<template>
  <div class="redis-editor-container">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <a-space>
        <a-button
          type="primary"
          :icon="h(CaretRightOutlined)"
          @click="executeCommand"
          :loading="executing"
          :disabled="!hasActiveConnection"
        >
          {{ $t('redis.execute') }}
        </a-button>
        <a-button
          :icon="h(ClearOutlined)"
          @click="clearEditor"
        >
          {{ $t('common.clear') }}
        </a-button>
        <a-divider type="vertical" />
        <a-button :icon="h(HistoryOutlined)" @click="showHistory = true">
          {{ $t('common.history') }}
        </a-button>
        <a-button :icon="h(InfoCircleOutlined)" @click="showInfo = true">
          {{ $t('redis.server_info') }}
        </a-button>
        <a-divider type="vertical" />
        <a-select
          :value="selectedDatabase"
          :placeholder="$t('redis.select_database')"
          class="database-selector"
          :disabled="!hasActiveConnection"
          @change="handleDatabaseChange"
        >
          <a-select-option
            v-for="i in 16"
            :key="i - 1"
            :value="`db${i - 1}`"
          >
            db{{ i - 1 }}
          </a-select-option>
        </a-select>
        <a-divider type="vertical" />
        <a-input-search
          v-model:value="keyInput"
          :placeholder="$t('redis.key_name_placeholder')"
          :disabled="!hasActiveConnection"
          class="key-search"
          @search="openKeyViewer"
        />
        <a-button
          :disabled="!hasActiveConnection || !activeKeyName"
          @click="refreshKeyViewer"
        >
          {{ $t('common.refresh') }}
        </a-button>
        <a-button
          v-if="activeKeyName"
          @click="clearKeyViewer"
        >
          {{ $t('redis.close_key_viewer') }}
        </a-button>
      </a-space>
      <div class="editor-info">
        <a-tag v-if="connectionInfo" color="red">
          <DatabaseOutlined /> {{ connectionInfo.name }}
        </a-tag>
        <a-tag v-if="selectedDatabase" color="orange">
          {{ selectedDatabase }}
        </a-tag>
        <span class="cursor-position">{{ $t('redis.line_col', { line: cursorLine, col: cursorColumn }) }}</span>
      </div>
    </div>

    <!-- 命令输入编辑器 -->
    <RedisCommandInput
      ref="commandInputRef"
      @execute="executeCommand"
      @cursor-change="handleCursorChange"
    />

    <div class="redis-workspace">
      <div class="redis-results-panel" :class="{ 'with-key-viewer': !!activeKeyName }">
        <RedisResultPanel
          ref="resultPanelRef"
          :results="commandResults"
          :messages="messages"
        />
      </div>
      <div v-if="activeKeyName" class="redis-key-panel">
        <div class="key-panel-header">
          <div class="key-panel-title">
            {{ $t('redis.key_viewer.panel_title') }}
          </div>
          <a-tag color="blue">{{ activeKeyName }}</a-tag>
        </div>
        <RedisKeyViewer
          :key="`${selectedDatabase}-${viewerRefreshKey}-${activeKeyName}`"
          :connection-id="connectionStore.activeConnectionId!"
          :key-name="activeKeyName"
          @deleted="handleKeyDeleted"
          @updated="handleKeyUpdated"
        />
      </div>
    </div>

    <!-- 历史记录对话框 -->
    <a-modal
      v-model:open="showHistory"
      :title="$t('redis.command_history')"
      :width="800"
      :footer="null"
    >
      <a-list :data-source="commandHistory" size="small">
        <template #renderItem="{ item }">
          <a-list-item>
            <template #actions>
              <a @click="loadFromHistory(item)">{{ $t('redis.load') }}</a>
              <a @click="removeFromHistory(item)">{{ $t('common.delete') }}</a>
            </template>
            <a-list-item-meta>
              <template #title>
                <code>{{ item.command }}</code>
              </template>
              <template #description>
                {{ new Date(item.timestamp).toLocaleString() }} •
                {{ item.database || $t('redis.default_db') }}
              </template>
            </a-list-item-meta>
          </a-list-item>
        </template>
      </a-list>
    </a-modal>

    <!-- 服务器信息对话框 -->
    <RedisServerInfo
      v-model:open="showInfo"
      :connection-id="connectionStore.activeConnectionId"
    />
  </div>
</template>

<script setup lang="ts">
import { h, onMounted, onUnmounted, watch, ref, computed } from 'vue'
import {
  CaretRightOutlined,
  ClearOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  DatabaseOutlined,
} from '@ant-design/icons-vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { redisApi } from '@/api'
import { useConnectionStore } from '@/stores/connection'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '@/utils/storageService'
import RedisCommandInput from './RedisCommandInput.vue'
import RedisKeyViewer from './RedisKeyViewer.vue'
import RedisResultPanel from './RedisResultPanel.vue'
import type { RedisMessage } from './RedisResultPanel.vue'
import RedisServerInfo from './RedisServerInfo.vue'

const { t } = useI18n()
const connectionStore = useConnectionStore()

const commandInputRef = ref<InstanceType<typeof RedisCommandInput>>()
const resultPanelRef = ref<InstanceType<typeof RedisResultPanel>>()

const executing = ref(false)
const commandResults = ref<Record<string, unknown>[]>([])
const showHistory = ref(false)
const showInfo = ref(false)
const cursorLine = ref(1)
const cursorColumn = ref(1)
const selectedDatabase = ref('db0')
const keyInput = ref('')
const activeKeyName = ref('')
const viewerRefreshKey = ref(0)
let keepAliveTimer: number | null = null

const messages = ref<RedisMessage[]>([])

interface CommandHistoryItem {
  command: string
  timestamp: number
  database?: string
}

const commandHistory = ref<CommandHistoryItem[]>([])

// 连接信息
const connectionInfo = computed(() => {
  const activeId = connectionStore.activeConnectionId
  if (!activeId) return null
  return connectionStore.connections.find((c) => c.id === activeId)
})

const hasActiveConnection = computed(() => !!connectionStore.activeConnectionId)

function handleCursorChange(line: number, column: number) {
  cursorLine.value = line
  cursorColumn.value = column
}

function tokenizeRedisCommand(line: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of line) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === '\'') {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escaping) {
    current += '\\'
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function parseRedisCommandInput(input: string) {
  const executableLine = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#'))

  if (!executableLine) {
    return null
  }

  const parts = tokenizeRedisCommand(executableLine)
  if (parts.length === 0) {
    return null
  }

  const [command, ...args] = parts
  return {
    command: command.toUpperCase(),
    args,
    displayText: parts.join(' '),
  }
}

function syncDatabaseState(dbName: string) {
  selectedDatabase.value = dbName
  if (activeKeyName.value) {
    viewerRefreshKey.value++
  }
}

async function switchRedisDatabase(dbName: string, options?: { showSuccessMessage?: boolean }) {
  if (!hasActiveConnection.value) {
    message.warning(t('redis.no_connection'))
    return
  }

  const normalizedDb = /^db\d+$/.test(dbName) ? dbName : `db${dbName.replace(/^db/, '') || '0'}`
  const dbNum = normalizedDb.replace('db', '')

  await redisApi.executeCommand(
    connectionStore.activeConnectionId!,
    'SELECT',
    [dbNum],
  )

  syncDatabaseState(normalizedDb)
  addMessage('info', t('redis.switched_db', { db: normalizedDb }))

  if (options?.showSuccessMessage !== false) {
    message.success(t('redis.switched_db', { db: normalizedDb }))
  }
}

function openKeyViewer() {
  const keyName = keyInput.value.trim()
  if (!hasActiveConnection.value) {
    message.warning(t('redis.no_connection'))
    return
  }
  if (!keyName) {
    message.warning(t('redis.input_key_name'))
    return
  }
  activeKeyName.value = keyName
  viewerRefreshKey.value++
}

function refreshKeyViewer() {
  if (!activeKeyName.value) return
  viewerRefreshKey.value++
}

function clearKeyViewer() {
  activeKeyName.value = ''
  keyInput.value = ''
}

function handleKeyDeleted() {
  message.success(t('redis.key_viewer.delete_success'))
  clearKeyViewer()
}

function handleKeyUpdated() {
  viewerRefreshKey.value++
}

// 初始化
onMounted(() => {
  loadHistory()
  if (connectionStore.activeConnectionId) {
    startKeepAlive()
  }
})

onUnmounted(() => {
  stopKeepAlive()
})

// 监听连接变化
watch(
  () => connectionStore.activeConnectionId,
  (newId) => {
    commandResults.value = []
    messages.value = []
    selectedDatabase.value = 'db0'
    keyInput.value = ''
    activeKeyName.value = ''
    viewerRefreshKey.value = 0
    if (newId) {
      startKeepAlive()
    } else {
      stopKeepAlive()
    }
  }
)

// 执行 Redis 命令
async function executeCommand() {
  if (!hasActiveConnection.value) {
    message.warning(t('redis.no_connection'))
    return
  }

  const command = commandInputRef.value?.getValue() || ''
  if (!command) {
    message.warning(t('redis.input_command'))
    return
  }

  const parsedCommand = parseRedisCommandInput(command)
  if (!parsedCommand) {
    message.warning(t('redis.input_command'))
    return
  }

  executing.value = true
  resultPanelRef.value?.setActiveKey('result')

  const dbInfo = selectedDatabase.value ? ` (${selectedDatabase.value})` : ''
  addMessage('info', `${t('redis.executing')}${dbInfo}`)

  try {
    const startedAt = performance.now()
    const rawResult = await redisApi.executeCommand(
      connectionStore.activeConnectionId!,
      parsedCommand.command,
      parsedCommand.args,
    )
    const result = {
      success: true,
      result: rawResult,
      error: null,
      execution_time_ms: Math.round(performance.now() - startedAt),
    }

    commandResults.value.push(result)
    const selectDbArg = parsedCommand.command === 'SELECT' ? parsedCommand.args[0] : null
    if (selectDbArg && /^\d+$/.test(selectDbArg)) {
      syncDatabaseState(`db${selectDbArg}`)
    }

    addMessage('success', `${t('redis.exec_success', { time: result.execution_time_ms })}${dbInfo}`)
    saveToHistory(parsedCommand.displayText)
  } catch (error: unknown) {
    commandResults.value.push({
      success: false,
      result: null,
      error: String(error),
      execution_time_ms: 0,
    })
    addMessage('error', `${t('redis.exec_fail')}${dbInfo}: ${error}`)
    message.error(`${t('redis.exec_fail')}: ${error}`)
  } finally {
    executing.value = false
  }
}

// 清空编辑器
function clearEditor() {
  commandInputRef.value?.setValue('')
  commandResults.value = []
  messages.value = []
}

// 切换数据库
async function handleDatabaseChange(database: unknown) {
  try {
    await switchRedisDatabase(String(database || 'db0'))
  } catch (error: unknown) {
    message.error(t('redis.switch_fail', { error: String(error) }))
  }
}

// 添加消息
function addMessage(type: RedisMessage['type'], text: string) {
  messages.value.unshift({
    type,
    text,
    time: new Date().toLocaleTimeString(),
  })
}

// 保存到历史
function saveToHistory(command: string) {
  commandHistory.value.unshift({
    command,
    timestamp: Date.now(),
    database: selectedDatabase.value,
  })
  if (commandHistory.value.length > 100) {
    commandHistory.value = commandHistory.value.slice(0, 100)
  }
  setStorageItem(STORAGE_KEYS.REDIS_HISTORY, commandHistory.value)
}

// 加载历史
function loadHistory() {
  commandHistory.value = getStorageItem<CommandHistoryItem[]>(STORAGE_KEYS.REDIS_HISTORY, [])
}

// 从历史加载
function loadFromHistory(item: CommandHistoryItem) {
  commandInputRef.value?.setValue(item.command)
  showHistory.value = false
  message.success(t('redis.history_loaded'))
}

// 从历史删除
function removeFromHistory(item: CommandHistoryItem) {
  commandHistory.value = commandHistory.value.filter((h) => h.timestamp !== item.timestamp)
  setStorageItem(STORAGE_KEYS.REDIS_HISTORY, commandHistory.value)
}

// 切换数据库（供外部调用）
async function switchDatabase(dbName: string) {
  try {
    await switchRedisDatabase(dbName, { showSuccessMessage: false })
  } catch (error: unknown) {
    console.error('Failed to switch database:', error)
    throw error
  }
}

// 启动保活定时器（每30秒发送一次PING）
function startKeepAlive() {
  stopKeepAlive()

  keepAliveTimer = window.setInterval(async () => {
    if (!connectionStore.activeConnectionId) {
      stopKeepAlive()
      return
    }

    try {
      await redisApi.executeCommand(
        connectionStore.activeConnectionId!,
        'PING',
        [],
      )
      console.log('Redis keepalive: PING OK')
    } catch (error) {
      console.error('Redis keepalive failed:', error)
      message.warning(t('redis.keepalive_fail'))
      stopKeepAlive()
    }
  }, 30000)
}

// 停止保活定时器
function stopKeepAlive() {
  if (keepAliveTimer !== null) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
}

// 暴露方法供父组件调用
defineExpose({
  switchDatabase,
})
</script>

<style scoped>
.redis-editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--surface-muted);
}

.editor-info {
  display: flex;
  gap: 12px;
  align-items: center;
}

.database-selector {
  width: 150px;
}

.cursor-position {
  font-size: 12px;
  color: var(--app-text-subtle);
}

.key-search {
  width: 240px;
}

.redis-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.redis-results-panel {
  flex: 1;
  min-width: 0;
}

.redis-key-panel {
  width: 380px;
  border-left: 1px solid var(--border-color);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  min-width: 320px;
}

.key-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color-muted);
}

.key-panel-title {
  font-size: 13px;
  font-weight: 600;
}

@media (max-width: 1080px) {
  .editor-toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .key-search {
    width: 220px;
  }

  .redis-workspace {
    flex-direction: column;
  }

  .redis-key-panel {
    width: 100%;
    min-width: 0;
    min-height: 280px;
    border-left: none;
    border-top: 1px solid var(--border-color);
  }
}
</style>
