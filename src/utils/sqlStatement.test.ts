import { describe, expect, it } from 'vitest'
import { findCurrentStatementInText } from './sqlStatement'

describe('findCurrentStatementInText', () => {
  it('空文本返回 null', () => {
    expect(findCurrentStatementInText('', 0)).toBeNull()
    expect(findCurrentStatementInText('   \n  ', 2)).toBeNull()
  })

  it('多语句按分号分割，返回光标所在语句（去首尾空白）', () => {
    const text = 'SELECT 1;\nSELECT 2;\nSELECT 3;'
    // 光标在第二句中间（offset 14 位于 "SELECT 2" 内）
    const stmt = findCurrentStatementInText(text, 14)
    expect(stmt?.sql).toBe('SELECT 2;')
    expect(text.slice(stmt!.startOffset, stmt!.endOffset)).toBe('SELECT 2;')
  })

  it('光标在语句起点/终点边界时命中该语句', () => {
    const text = 'SELECT 1; SELECT 2;'
    expect(findCurrentStatementInText(text, 0)?.sql).toBe('SELECT 1;')
    // offset 9 = 第一句结束（endOffset 含边界）
    expect(findCurrentStatementInText(text, 9)?.sql).toBe('SELECT 1;')
    expect(findCurrentStatementInText(text, 12)?.sql).toBe('SELECT 2;')
  })

  it('字符串字面量内的分号不分割', () => {
    const text = "SELECT 'a;b' AS x;\nSELECT 2;"
    const stmt = findCurrentStatementInText(text, 5)
    expect(stmt?.sql).toBe("SELECT 'a;b' AS x;")
  })

  it('行注释与块注释内的分号不分割', () => {
    const line = 'SELECT 1 -- comment; still first\n, 2;\nSELECT 3;'
    expect(findCurrentStatementInText(line, 0)?.sql).toBe('SELECT 1 -- comment; still first\n, 2;')

    const block = 'SELECT /* a;b */ 1;\nSELECT 2;'
    expect(findCurrentStatementInText(block, 3)?.sql).toBe('SELECT /* a;b */ 1;')
  })

  it('PostgreSQL $$（含 $tag$）内的分号不分割', () => {
    const text = "CREATE FUNCTION f() RETURNS void AS $$ BEGIN SELECT 1; END $$ LANGUAGE plpgsql;\nSELECT 2;"
    const stmt = findCurrentStatementInText(text, 10)
    expect(stmt?.sql).toContain('LANGUAGE plpgsql;')
    expect(stmt?.sql).not.toContain('SELECT 2')

    const tagged = 'DO $fn$ SELECT 1; $fn$;\nSELECT 2;'
    expect(findCurrentStatementInText(tagged, 3)?.sql).toBe('DO $fn$ SELECT 1; $fn$;')
  })

  it('无分号的多语句按关键字行分割', () => {
    const text = 'SELECT 1\nFROM t\nUPDATE t SET a = 1'
    // 光标在第一句
    expect(findCurrentStatementInText(text, 4)?.sql).toBe('SELECT 1\nFROM t')
    // 光标在 UPDATE 行
    expect(findCurrentStatementInText(text, text.indexOf('UPDATE') + 2)?.sql).toBe('UPDATE t SET a = 1')
  })

  it('单语句时返回整句（关键字分割路径的偏移不收缩空白——保持 Vue 版原行为）', () => {
    const text = '  SELECT * FROM users  '
    const stmt = findCurrentStatementInText(text, 5)
    expect(stmt?.sql).toBe('SELECT * FROM users')
    expect(stmt).toMatchObject({ startOffset: 0, endOffset: text.length })
  })

  it('末段无分号也可命中', () => {
    const text = 'SELECT 1;\nSELECT 2'
    expect(findCurrentStatementInText(text, text.length)?.sql).toBe('SELECT 2')
  })
})
