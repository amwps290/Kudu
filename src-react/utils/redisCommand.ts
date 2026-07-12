/**
 * Redis 命令行解析纯函数（对等 Vue 版 RedisEditor 内的 tokenizeRedisCommand/
 * parseRedisCommandInput，迁出为纯函数并补单测——迁移计划 D11）。
 * 规则：引号（单/双）包裹保留空格、反斜杠转义、# 开头行为注释、取首个可执行行。
 */

export function tokenizeRedisCommand(line: string): string[] {
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

export interface ParsedRedisCommand {
  command: string
  args: string[]
  displayText: string
}

export function parseRedisCommandInput(input: string): ParsedRedisCommand | null {
  const executableLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'))

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
