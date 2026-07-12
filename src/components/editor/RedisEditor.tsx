import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Divider, Input, List, Modal as AntModal, Select, Space, Tag } from 'antd'
import {
  CaretRightOutlined, ClearOutlined, DatabaseOutlined, HistoryOutlined, InfoCircleOutlined,
} from '@ant-design/icons'
import { message } from '../../ui/antd'
import { redisApi } from '@/api'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '@/utils/storageService'
import { useConnectionStore } from '../../stores/connectionStore'
import { parseRedisCommandInput } from '../../utils/redisCommand'
import RedisCommandInput, { type RedisCommandInputHandle } from './RedisCommandInput'
import RedisResultPanel, { type RedisCommandResult, type RedisMessage, type RedisResultPanelHandle } from './RedisResultPanel'
import RedisKeyViewer from './RedisKeyViewer'
import RedisServerInfo from './RedisServerInfo'
import styles from './RedisEditor.module.css'

/**
 * Redis 工作区（对等 Vue 版 RedisEditor.vue）。
 * 命令解析走 utils/redisCommand 纯函数（含单测）；30s PING 保活；db0-15 切换；
 * 历史 localStorage `redis_command_history`（上限 100，红线 1）；SELECT 命令回写库状态。
 */

export interface RedisEditorHandle {
  switchDatabase(dbName: string): Promise<void>
}

interface CommandHistoryItem {
  command: string
  timestamp: number
  database?: string
}

const RedisEditor = forwardRef<RedisEditorHandle>(function RedisEditor(_props, ref) {
  const { t } = useTranslation()

  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const hasActiveConnection = Boolean(activeConnectionId)
  const connectionInfo = activeConnectionId
    ? connections.find((c) => c.id === activeConnectionId) || null
    : null

  const commandInputRef = useRef<RedisCommandInputHandle>(null)
  const resultPanelRef = useRef<RedisResultPanelHandle>(null)

  const [executing, setExecuting] = useState(false)
  const [commandResults, setCommandResults] = useState<RedisCommandResult[]>([])
  const [messages, setMessages] = useState<RedisMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [cursorLine, setCursorLine] = useState(1)
  const [cursorColumn, setCursorColumn] = useState(1)
  const [selectedDatabase, setSelectedDatabase] = useState('db0')
  const [keyInput, setKeyInput] = useState('')
  const [activeKeyName, setActiveKeyName] = useState('')
  const [viewerRefreshKey, setViewerRefreshKey] = useState(0)
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([])

  const keepAliveTimerRef = useRef<number | null>(null)
  const latestRef = useRef({ selectedDatabase, activeKeyName, hasActiveConnection })
  latestRef.current = { selectedDatabase, activeKeyName, hasActiveConnection }

  function addMessage(type: RedisMessage['type'], text: string) {
    setMessages((prev) => [{ type, text, time: new Date().toLocaleTimeString() }, ...prev])
  }

  function syncDatabaseState(dbName: string) {
    setSelectedDatabase(dbName)
    if (latestRef.current.activeKeyName) {
      setViewerRefreshKey((v) => v + 1)
    }
  }

  async function switchRedisDatabase(dbName: string, options?: { showSuccessMessage?: boolean }) {
    if (!useConnectionStore.getState().activeConnectionId) {
      message.warning(t('redis.no_connection'))
      return
    }

    const normalizedDb = /^db\d+$/.test(dbName) ? dbName : `db${dbName.replace(/^db/, '') || '0'}`
    const dbNum = normalizedDb.replace('db', '')

    await redisApi.executeCommand(useConnectionStore.getState().activeConnectionId!, 'SELECT', [dbNum])

    syncDatabaseState(normalizedDb)
    addMessage('info', t('redis.switched_db', { db: normalizedDb }))

    if (options?.showSuccessMessage !== false) {
      message.success(t('redis.switched_db', { db: normalizedDb }))
    }
  }

  async function handleDatabaseChange(database: unknown) {
    try {
      await switchRedisDatabase(String(database || 'db0'))
    } catch (error: unknown) {
      message.error(t('redis.switch_fail', { error: String(error) }))
    }
  }

  // ── key viewer ──

  function openKeyViewer() {
    const keyName = keyInput.trim()
    if (!latestRef.current.hasActiveConnection) {
      message.warning(t('redis.no_connection'))
      return
    }
    if (!keyName) {
      message.warning(t('redis.input_key_name'))
      return
    }
    setActiveKeyName(keyName)
    setViewerRefreshKey((v) => v + 1)
  }

  function refreshKeyViewer() {
    if (!latestRef.current.activeKeyName) return
    setViewerRefreshKey((v) => v + 1)
  }

  function clearKeyViewer() {
    setActiveKeyName('')
    setKeyInput('')
  }

  function handleKeyDeleted() {
    message.success(t('redis.key_viewer.delete_success'))
    clearKeyViewer()
  }

  // ── 执行 ──

  async function executeCommand() {
    if (!useConnectionStore.getState().activeConnectionId) {
      message.warning(t('redis.no_connection'))
      return
    }

    const command = commandInputRef.current?.getValue() || ''
    if (!command) {
      message.warning(t('redis.input_command'))
      return
    }

    const parsedCommand = parseRedisCommandInput(command)
    if (!parsedCommand) {
      message.warning(t('redis.input_command'))
      return
    }

    setExecuting(true)
    resultPanelRef.current?.setActiveKey('result')

    const dbInfo = latestRef.current.selectedDatabase ? ` (${latestRef.current.selectedDatabase})` : ''
    addMessage('info', `${t('redis.executing')}${dbInfo}`)

    try {
      const startedAt = performance.now()
      const rawResult = await redisApi.executeCommand(
        useConnectionStore.getState().activeConnectionId!,
        parsedCommand.command,
        parsedCommand.args,
      )
      const result: RedisCommandResult = {
        success: true,
        result: rawResult,
        error: null,
        execution_time_ms: Math.round(performance.now() - startedAt),
      }

      setCommandResults((prev) => [...prev, result])
      const selectDbArg = parsedCommand.command === 'SELECT' ? parsedCommand.args[0] : null
      if (selectDbArg && /^\d+$/.test(selectDbArg)) {
        syncDatabaseState(`db${selectDbArg}`)
      }

      addMessage('success', `${t('redis.exec_success', { time: result.execution_time_ms })}${dbInfo}`)
      saveToHistory(parsedCommand.displayText)
    } catch (error: unknown) {
      setCommandResults((prev) => [...prev, {
        success: false,
        result: null,
        error: String(error),
        execution_time_ms: 0,
      }])
      addMessage('error', `${t('redis.exec_fail')}${dbInfo}: ${error}`)
      message.error(`${t('redis.exec_fail')}: ${error}`)
    } finally {
      setExecuting(false)
    }
  }

  function clearEditor() {
    commandInputRef.current?.setValue('')
    setCommandResults([])
    setMessages([])
  }

  // ── 历史 ──

  function saveToHistory(command: string) {
    setCommandHistory((prev) => {
      let next = [{ command, timestamp: Date.now(), database: latestRef.current.selectedDatabase }, ...prev]
      if (next.length > 100) next = next.slice(0, 100)
      setStorageItem(STORAGE_KEYS.REDIS_HISTORY, next)
      return next
    })
  }

  function loadFromHistory(item: CommandHistoryItem) {
    commandInputRef.current?.setValue(item.command)
    setShowHistory(false)
    message.success(t('redis.history_loaded'))
  }

  function removeFromHistory(item: CommandHistoryItem) {
    setCommandHistory((prev) => {
      const next = prev.filter((h) => h.timestamp !== item.timestamp)
      setStorageItem(STORAGE_KEYS.REDIS_HISTORY, next)
      return next
    })
  }

  // ── 30s PING 保活 ──

  function stopKeepAlive() {
    if (keepAliveTimerRef.current !== null) {
      clearInterval(keepAliveTimerRef.current)
      keepAliveTimerRef.current = null
    }
  }

  function startKeepAlive() {
    stopKeepAlive()
    keepAliveTimerRef.current = window.setInterval(async () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (!connId) {
        stopKeepAlive()
        return
      }
      try {
        await redisApi.executeCommand(connId, 'PING', [])
        console.log('Redis keepalive: PING OK')
      } catch (error) {
        console.error('Redis keepalive failed:', error)
        message.warning(t('redis.keepalive_fail'))
        stopKeepAlive()
      }
    }, 30000)
  }

  // 挂载：加载历史 + 启动保活；卸载停止（对等 onMounted/onUnmounted）
  useEffect(() => {
    setCommandHistory(getStorageItem<CommandHistoryItem[]>(STORAGE_KEYS.REDIS_HISTORY, []))
    if (useConnectionStore.getState().activeConnectionId) {
      startKeepAlive()
    }
    return stopKeepAlive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 连接变化：重置状态（对等 watch(activeConnectionId)）
  const isFirstConnWatchRef = useRef(true)
  useEffect(() => {
    if (isFirstConnWatchRef.current) {
      isFirstConnWatchRef.current = false
      return
    }
    setCommandResults([])
    setMessages([])
    setSelectedDatabase('db0')
    setKeyInput('')
    setActiveKeyName('')
    setViewerRefreshKey(0)
    if (activeConnectionId) {
      startKeepAlive()
    } else {
      stopKeepAlive()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnectionId])

  useImperativeHandle(ref, () => ({
    switchDatabase: async (dbName: string) => {
      try {
        await switchRedisDatabase(dbName, { showSuccessMessage: false })
      } catch (error: unknown) {
        console.error('Failed to switch database:', error)
        throw error
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  return (
    <div className={styles.redisEditorContainer}>
      <div className={`panel-toolbar ${styles.editorToolbar}`}>
        <Space wrap>
          <Button
            type="primary"
            icon={<CaretRightOutlined />}
            onClick={() => void executeCommand()}
            loading={executing}
            disabled={!hasActiveConnection}
          >
            {t('redis.execute')}
          </Button>
          <Button icon={<ClearOutlined />} onClick={clearEditor}>
            {t('common.clear')}
          </Button>
          <Divider type="vertical" />
          <Button icon={<HistoryOutlined />} onClick={() => setShowHistory(true)}>
            {t('common.history')}
          </Button>
          <Button icon={<InfoCircleOutlined />} onClick={() => setShowInfo(true)}>
            {t('redis.server_info')}
          </Button>
          <Divider type="vertical" />
          <Select
            value={selectedDatabase}
            placeholder={t('redis.select_database')}
            className={styles.databaseSelector}
            disabled={!hasActiveConnection}
            onChange={(v) => void handleDatabaseChange(v)}
            options={Array.from({ length: 16 }, (_, i) => ({ value: `db${i}`, label: `db${i}` }))}
          />
          <Divider type="vertical" />
          <Input.Search
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={t('redis.key_name_placeholder')}
            disabled={!hasActiveConnection}
            className={styles.keySearch}
            onSearch={openKeyViewer}
          />
          <Button disabled={!hasActiveConnection || !activeKeyName} onClick={refreshKeyViewer}>
            {t('common.refresh')}
          </Button>
          {activeKeyName && (
            <Button onClick={clearKeyViewer}>
              {t('redis.close_key_viewer')}
            </Button>
          )}
        </Space>
        <div className={styles.editorInfo}>
          {connectionInfo && (
            <Tag color="red"><DatabaseOutlined /> {connectionInfo.name}</Tag>
          )}
          {selectedDatabase && <Tag color="orange">{selectedDatabase}</Tag>}
          <span className={`text-caption ${styles.cursorPosition}`}>
            {t('redis.line_col', { line: cursorLine, col: cursorColumn })}
          </span>
        </div>
      </div>

      <RedisCommandInput
        ref={commandInputRef}
        onExecute={() => void executeCommand()}
        onCursorChange={(line, column) => { setCursorLine(line); setCursorColumn(column) }}
      />

      <div className={styles.redisWorkspace}>
        <div className={styles.redisResultsPanel}>
          <RedisResultPanel ref={resultPanelRef} results={commandResults} messages={messages} />
        </div>
        {activeKeyName && (
          <div className={styles.redisKeyPanel}>
            <div className={styles.keyPanelHeader}>
              <div className={styles.keyPanelTitle}>{t('redis.key_viewer.panel_title')}</div>
              <Tag color="blue">{activeKeyName}</Tag>
            </div>
            <RedisKeyViewer
              connectionId={activeConnectionId!}
              keyName={activeKeyName}
              refreshToken={viewerRefreshKey}
              onDeleted={handleKeyDeleted}
              onUpdated={() => setViewerRefreshKey((v) => v + 1)}
            />
          </div>
        )}
      </div>

      <AntModal
        open={showHistory}
        title={t('redis.command_history')}
        width={800}
        footer={null}
        onCancel={() => setShowHistory(false)}
      >
        <List
          dataSource={commandHistory}
          size="small"
          renderItem={(item) => (
            <List.Item
              actions={[
                <a key="load" onClick={() => loadFromHistory(item)}>{t('redis.load')}</a>,
                <a key="delete" onClick={() => removeFromHistory(item)}>{t('common.delete')}</a>,
              ]}
            >
              <List.Item.Meta
                title={<code>{item.command}</code>}
                description={`${new Date(item.timestamp).toLocaleString()} • ${item.database || t('redis.default_db')}`}
              />
            </List.Item>
          )}
        />
      </AntModal>

      <RedisServerInfo
        open={showInfo}
        connectionId={activeConnectionId}
        onClose={() => setShowInfo(false)}
      />
    </div>
  )
})

export default RedisEditor
