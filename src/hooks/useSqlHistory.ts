import { useCallback, useMemo, useRef, useState } from 'react'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '@/utils/storageService'

/** SQL 历史记录 hook（对等 Vue 版 useSqlHistory；localStorage key `sql_history`，上限 100） */

export interface SqlHistoryEntry {
  sql: string
  timestamp: number
  database?: string
}

function normalizeHistoryText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function buildHistoryDateKeywords(timestamp: number) {
  const date = new Date(timestamp)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1)
  const day = String(date.getDate())
  const monthPadded = month.padStart(2, '0')
  const dayPadded = day.padStart(2, '0')

  return [
    `${year}/${month}/${day}`,
    `${year}/${monthPadded}/${dayPadded}`,
    `${year}-${month}-${day}`,
    `${year}-${monthPadded}-${dayPadded}`,
    `${year}${monthPadded}${dayPadded}`,
    `${month}/${day}`,
    `${monthPadded}/${dayPadded}`,
    `${month}-${day}`,
    `${monthPadded}-${dayPadded}`,
  ]
}

export function useSqlHistory() {
  const [history, setHistory] = useState<SqlHistoryEntry[]>([])
  const [searchText, setSearchText] = useState('')
  const historyRef = useRef<SqlHistoryEntry[]>([])

  const filteredHistory = useMemo(() => {
    const keyword = normalizeHistoryText(searchText)
    if (!keyword) return history
    return history.filter((item) => {
      const haystack = [
        item.sql,
        item.database || '',
        new Date(item.timestamp).toLocaleString(),
        ...buildHistoryDateKeywords(item.timestamp),
      ]
        .map((text) => normalizeHistoryText(text))
        .join(' ')
      return haystack.includes(keyword)
    })
  }, [history, searchText])

  const load = useCallback(() => {
    historyRef.current = getStorageItem<SqlHistoryEntry[]>(STORAGE_KEYS.SQL_HISTORY, [])
    setHistory(historyRef.current)
  }, [])

  const add = useCallback((sql: string, database?: string) => {
    const next = [{ sql, timestamp: Date.now(), database }, ...historyRef.current]
    if (next.length > 100) next.pop()
    historyRef.current = next
    setHistory(next)
    setStorageItem(STORAGE_KEYS.SQL_HISTORY, next)
  }, [])

  const getPreview = useCallback((sql: string) => {
    return sql.substring(0, 100) + (sql.length > 100 ? '...' : '')
  }, [])

  const formatMeta = useCallback((item: SqlHistoryEntry) => {
    const db = item.database || 'Default'
    return `${new Date(item.timestamp).toLocaleString()} • ${db}`
  }, [])

  return {
    history,
    searchText,
    setSearchText,
    filteredHistory,
    load,
    add,
    getPreview,
    formatMeta,
  }
}
