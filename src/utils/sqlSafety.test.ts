import { describe, expect, it } from 'vitest'
import { analyzeSqlSafety, analyzeSqlWrites } from './sqlSafety'

describe('analyzeSqlWrites', () => {
  it('识别九类写前缀语句', () => {
    const statements = [
      'SELECT * FROM t',
      'INSERT INTO t VALUES (1)',
      'update t set a = 1 where id = 1',
      'Delete from t where id = 1',
      'TRUNCATE TABLE t',
      'DROP TABLE t',
      'ALTER TABLE t ADD c INT',
      'CREATE TABLE x (id INT)',
      'REPLACE INTO t VALUES (1)',
      'MERGE INTO t USING s ON 1=1',
    ]
    const { writeStatements, hasWrites } = analyzeSqlWrites(statements)
    expect(hasWrites).toBe(true)
    expect(writeStatements).toHaveLength(9)
    expect(writeStatements).not.toContain('SELECT * FROM t')
  })

  it('纯查询无写语句', () => {
    expect(analyzeSqlWrites(['SELECT 1', 'EXPLAIN SELECT 1'])).toEqual({ writeStatements: [], hasWrites: false })
  })

  it('前导注释被剥离后再判定；纯注释语句忽略', () => {
    const { writeStatements } = analyzeSqlWrites([
      '-- comment\nUPDATE t SET a = 1 WHERE id = 1',
      '/* block */ DELETE FROM t WHERE id = 1',
      '-- only a comment',
      '/* unterminated block',
    ])
    expect(writeStatements).toHaveLength(2)
  })
})

describe('analyzeSqlSafety（危险 SQL 五类规则）', () => {
  it('无 WHERE 的 UPDATE/DELETE 触发确认', () => {
    const { issues, requiresConfirmation } = analyzeSqlSafety(['UPDATE t SET a = 1'])
    expect(requiresConfirmation).toBe(true)
    expect(issues).toEqual([{ type: 'update_without_where', statement: 'UPDATE t SET a = 1' }])

    expect(analyzeSqlSafety(['DELETE FROM t']).issues[0].type).toBe('delete_without_where')
  })

  it('带 WHERE 的 UPDATE/DELETE 不触发', () => {
    expect(analyzeSqlSafety(['UPDATE t SET a = 1 WHERE id = 1']).issues).toEqual([])
    expect(analyzeSqlSafety(['DELETE FROM t WHERE id = 1']).issues).toEqual([])
  })

  it('注释中的 WHERE 不算数（注释先被剔除再判定）', () => {
    const { issues } = analyzeSqlSafety(['UPDATE t SET a = 1 -- where id = 1'])
    expect(issues.map((i) => i.type)).toEqual(['update_without_where'])
  })

  it('TRUNCATE / DROP 恒触发', () => {
    expect(analyzeSqlSafety(['TRUNCATE TABLE t']).issues[0].type).toBe('truncate')
    expect(analyzeSqlSafety(['drop table t']).issues[0].type).toBe('drop')
  })

  it('多条写语句追加 batch_write（statement 为前 3 条拼接）', () => {
    const { issues } = analyzeSqlSafety([
      'INSERT INTO t VALUES (1)',
      'INSERT INTO t VALUES (2)',
      'SELECT 1',
    ])
    expect(issues).toEqual([{
      type: 'batch_write',
      statement: 'INSERT INTO t VALUES (1)\n\nINSERT INTO t VALUES (2)',
    }])
  })

  it('单条安全写语句不触发任何确认', () => {
    expect(analyzeSqlSafety(['INSERT INTO t VALUES (1)']).requiresConfirmation).toBe(false)
  })
})
