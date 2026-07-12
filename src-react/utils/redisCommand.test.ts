import { describe, expect, it } from 'vitest'
import { parseRedisCommandInput, tokenizeRedisCommand } from './redisCommand'

describe('tokenizeRedisCommand', () => {
  it('按空白分词', () => {
    expect(tokenizeRedisCommand('SET key value')).toEqual(['SET', 'key', 'value'])
    expect(tokenizeRedisCommand('  GET   key  ')).toEqual(['GET', 'key'])
  })

  it('双引号/单引号包裹保留空格', () => {
    expect(tokenizeRedisCommand('SET key "hello world"')).toEqual(['SET', 'key', 'hello world'])
    expect(tokenizeRedisCommand("SET key 'a b c'")).toEqual(['SET', 'key', 'a b c'])
  })

  it('引号内包含另一种引号', () => {
    expect(tokenizeRedisCommand(`SET key "it's ok"`)).toEqual(['SET', 'key', "it's ok"])
  })

  it('反斜杠转义（含转义引号与末尾悬挂反斜杠）', () => {
    expect(tokenizeRedisCommand('SET key "a\\"b"')).toEqual(['SET', 'key', 'a"b'])
    expect(tokenizeRedisCommand('SET key a\\ b')).toEqual(['SET', 'key', 'a b'])
    expect(tokenizeRedisCommand('SET key value\\')).toEqual(['SET', 'key', 'value\\'])
  })

  it('空串与纯空白返回空数组', () => {
    expect(tokenizeRedisCommand('')).toEqual([])
    expect(tokenizeRedisCommand('   ')).toEqual([])
  })
})

describe('parseRedisCommandInput', () => {
  it('取首个可执行行并大写命令名', () => {
    const parsed = parseRedisCommandInput('get mykey')
    expect(parsed).toEqual({ command: 'GET', args: ['mykey'], displayText: 'get mykey' })
  })

  it('跳过注释行与空行', () => {
    const parsed = parseRedisCommandInput('# comment\n\n  SET k v\nGET k')
    expect(parsed?.command).toBe('SET')
    expect(parsed?.args).toEqual(['k', 'v'])
  })

  it('全部为注释/空行时返回 null', () => {
    expect(parseRedisCommandInput('# only comment\n\n')).toBeNull()
    expect(parseRedisCommandInput('')).toBeNull()
  })
})
