import { computed, ref } from 'vue'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '@/utils/storageService'

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
  const history = ref<SqlHistoryEntry[]>([])
  const searchText = ref('')
  const normalizedSearch = computed(() => normalizeHistoryText(searchText.value))

  const filteredHistory = computed(() => {
    const keyword = normalizedSearch.value
    if (!keyword) return history.value
    return history.value.filter((item) => {
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
  })

  function load() {
    history.value = getStorageItem<SqlHistoryEntry[]>(STORAGE_KEYS.SQL_HISTORY, [])
  }

  function add(sql: string, database?: string) {
    history.value.unshift({ sql, timestamp: Date.now(), database })
    if (history.value.length > 100) {
      history.value.pop()
    }
    setStorageItem(STORAGE_KEYS.SQL_HISTORY, history.value)
  }

  function getPreview(sql: string) {
    return sql.substring(0, 100) + (sql.length > 100 ? '...' : '')
  }

  function formatMeta(item: SqlHistoryEntry) {
    const db = item.database || 'Default'
    return `${new Date(item.timestamp).toLocaleString()} • ${db}`
  }

  return {
    history,
    searchText,
    filteredHistory,
    load,
    add,
    getPreview,
    formatMeta,
  }
}
