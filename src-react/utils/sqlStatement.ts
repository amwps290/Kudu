/**
 * SQL 当前语句检测（对等 Vue 版 SqlEditor.vue 的 findCurrentStatement/splitByKeywords，
 * 迁出为纯函数并补单测——迁移计划 D11）。
 *
 * 与 Monaco 解耦：输入 (全文, 光标偏移)，输出去除首尾空白后的语句与偏移区间；
 * SqlEditor 侧再经 model.getOffsetAt/getPositionAt 与 Monaco 互转。
 * 分割规则逐行平移：分号分隔，正确跳过行注释/块注释/字符串/PG $$（含 $tag$）；
 * 全文无分号且只有一段时按语句关键字行分割。
 */

export interface StatementSegment {
  sql: string
  startOffset: number
  endOffset: number
}

const STATEMENT_KEYWORDS = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|WITH|EXPLAIN|GRANT|REVOKE|TRUNCATE|BEGIN|COMMIT|ROLLBACK|DECLARE|DO|CALL|COPY|LOCK|UNLOCK|REINDEX|REFRESH|VACUUM|ANALYZE|CLUSTER|COMMENT|LISTEN|NOTIFY|MOVE|FETCH|CLOSE|PREPARE|EXECUTE|DEALLOCATE|DISCARD|REASSIGN|CHECKPOINT)\b/i

export function findCurrentStatementInText(fullText: string, cursorOffset: number): StatementSegment | null {
  if (!fullText.trim()) return null

  // 按分号分割 (处理注释、字符串、$$ 内的分号)
  const segments: StatementSegment[] = []
  let current = ''
  let segStart = 0
  let inString = false
  let stringChar = ''
  let inLineComment = false
  let inBlockComment = false
  let dollarTag = ''

  for (let i = 0; i < fullText.length; i++) {
    const ch = fullText[i]
    const next = fullText[i + 1] || ''

    // 行注释
    if (!inString && !inBlockComment && !dollarTag && ch === '-' && next === '-') {
      inLineComment = true
      current += ch + next
      i++
      continue
    }
    if (inLineComment && (ch === '\n' || ch === '\r')) {
      inLineComment = false
      current += ch
      continue
    }
    if (inLineComment) { current += ch; continue }

    // 块注释
    if (!inString && !inLineComment && !dollarTag && ch === '/' && next === '*') {
      inBlockComment = true
      current += ch + next
      i++
      continue
    }
    if (inBlockComment && ch === '*' && next === '/') {
      inBlockComment = false
      current += ch + next
      i++
      continue
    }
    if (inBlockComment) { current += ch; continue }

    // $$ 引用 (PostgreSQL)
    if (!inString && !inLineComment && !inBlockComment) {
      if (dollarTag) {
        // 在 $$ 内部，找结束标记
        current += ch
        if (fullText.substring(i - dollarTag.length + 1, i + 1) === dollarTag) {
          dollarTag = ''
        }
        continue
      }
      // 检测 $$ 开始 (支持 $tag$ 格式)
      if (ch === '$') {
        const dollarMatch = fullText.substring(i).match(/^(\$[a-zA-Z_\x80-\xff]?[a-zA-Z0-9_\x80-\xff]*\$)/)
        if (dollarMatch) {
          dollarTag = dollarMatch[1]
          current += dollarTag
          i += dollarTag.length - 1
          continue
        }
      }
    }

    // 字符串
    if (!inLineComment && !inBlockComment && !dollarTag && (ch === "'" || ch === '"')) {
      if (!inString) {
        inString = true
        stringChar = ch
      } else if (ch === stringChar && (i === 0 || fullText[i - 1] !== '\\')) {
        inString = false
      }
    }

    // 分号分隔
    if (!inString && !inLineComment && !inBlockComment && !dollarTag && ch === ';') {
      current += ch
      segments.push({ sql: current, startOffset: segStart, endOffset: i + 1 })
      current = ''
      segStart = i + 1
      continue
    }

    if (current === '') segStart = i
    current += ch
  }

  // 最后一段
  if (current.trim()) {
    segments.push({ sql: current, startOffset: segStart, endOffset: fullText.length })
  }

  // 找光标所在段
  let targetSegment: StatementSegment | null = null
  for (const seg of segments) {
    if (cursorOffset >= seg.startOffset && cursorOffset <= seg.endOffset) {
      targetSegment = seg
      break
    }
  }

  // 如果只有一个段且没有分号，尝试按关键字分割
  if (segments.length === 1 && !fullText.includes(';')) {
    targetSegment = splitByKeywords(fullText, cursorOffset)
  }

  if (!targetSegment || !targetSegment.sql.trim()) return null

  // 计算去除首尾空白后的实际偏移
  const trimmedSql = targetSegment.sql.trim()
  const leadTrim = targetSegment.sql.length - targetSegment.sql.trimStart().length
  const trailTrim = targetSegment.sql.length - targetSegment.sql.trimEnd().length

  return {
    sql: trimmedSql,
    startOffset: targetSegment.startOffset + leadTrim,
    endOffset: targetSegment.endOffset - trailTrim,
  }
}

function splitByKeywords(fullText: string, cursorOffset: number): StatementSegment | null {
  const lines = fullText.split('\n')
  const keywordLines: number[] = []

  for (let i = 0; i < lines.length; i++) {
    if (STATEMENT_KEYWORDS.test(lines[i].trimStart())) {
      keywordLines.push(i)
    }
  }

  if (keywordLines.length === 0) return null

  // 计算光标所在行
  let cursorLine = 0
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length + 1 // +1 for newline
    if (cursorOffset >= offset && cursorOffset < offset + lineLen) {
      cursorLine = i
      break
    }
    offset += lineLen
  }

  // 找光标所在的语句边界
  let startLine = keywordLines[0]
  let endLine = lines.length

  for (let i = 0; i < keywordLines.length; i++) {
    if (keywordLines[i] <= cursorLine) {
      startLine = keywordLines[i]
    }
    if (keywordLines[i] > cursorLine) {
      endLine = keywordLines[i]
      break
    }
  }

  // 计算偏移
  let startOffset = 0
  for (let i = 0; i < startLine; i++) startOffset += lines[i].length + 1

  let endOffset = 0
  for (let i = 0; i < endLine; i++) endOffset += lines[i].length + 1
  endOffset = Math.min(endOffset, fullText.length)

  const sql = fullText.substring(startOffset, endOffset).trim()
  if (!sql) return null

  return { sql, startOffset, endOffset }
}
