import { escapeSqlLiteral } from '@/utils/sqlHelpers'
import type { TreeNode } from './treeModel'

/**
 * PG 系巡检查询 SQL（对等 Vue 版 buildInspectionSql，逐行平移）。
 * openGauss/gaussdb 无 wait_event 列与 pg_blocking_pids，走兼容分支。
 */

export type InspectionKind = 'roles' | 'sessions' | 'locks' | 'blocking' | 'object-grants'

function metaStr(node: TreeNode, key: string): string {
  return String((node.metadata as Record<string, unknown>)?.[key] || '')
}

export function buildInspectionSql(kind: InspectionKind, node: TreeNode, useOpenGaussCompat: boolean): string {
  if (kind === 'roles') {
    return [
      'SELECT',
      '  rolname AS role_name,',
      '  rolsuper AS is_superuser,',
      '  rolinherit AS inherit,',
      '  rolcreaterole AS can_create_role,',
      '  rolcreatedb AS can_create_db,',
      '  rolcanlogin AS can_login,',
      '  rolreplication AS replication,',
      '  rolconnlimit AS connection_limit',
      'FROM pg_roles',
      'ORDER BY rolname;',
    ].join('\n')
  }

  if (kind === 'sessions') {
    return [
      'SELECT',
      '  pid,',
      '  usename,',
      '  datname,',
      '  application_name,',
      '  client_addr,',
      '  state,',
      ...(useOpenGaussCompat
        ? ['  NULL::text AS wait_event_type,', '  NULL::text AS wait_event,']
        : ['  wait_event_type,', '  wait_event,']),
      '  backend_start,',
      '  xact_start,',
      '  query_start,',
      '  LEFT(query, 500) AS query',
      'FROM pg_stat_activity',
      'WHERE pid <> pg_backend_pid()',
      'ORDER BY query_start DESC NULLS LAST;',
    ].join('\n')
  }

  if (kind === 'locks') {
    return [
      'SELECT',
      '  a.pid,',
      '  a.usename,',
      '  a.datname,',
      '  l.locktype,',
      '  l.mode,',
      '  l.granted,',
      '  l.relation::regclass AS relation_name,',
      '  l.page,',
      '  l.tuple,',
      '  l.virtualtransaction,',
      '  l.transactionid,',
      ...(useOpenGaussCompat
        ? ['  NULL::text AS wait_event_type,', '  NULL::text AS wait_event,']
        : ['  a.wait_event_type,', '  a.wait_event,']),
      '  LEFT(a.query, 300) AS query',
      'FROM pg_locks l',
      'LEFT JOIN pg_stat_activity a ON a.pid = l.pid',
      'ORDER BY l.granted ASC, a.query_start DESC NULLS LAST;',
    ].join('\n')
  }

  if (kind === 'blocking') {
    if (useOpenGaussCompat) {
      return [
        'SELECT',
        '  blocked.pid AS blocked_pid,',
        '  blocked.usename AS blocked_user,',
        '  blocker.pid AS blocking_pid,',
        '  blocker.usename AS blocking_user,',
        '  NULL::text AS wait_event_type,',
        '  NULL::text AS wait_event,',
        '  LEFT(blocked.query, 300) AS blocked_query,',
        '  LEFT(blocker.query, 300) AS blocking_query',
        'FROM pg_locks bl',
        'JOIN pg_stat_activity blocked ON blocked.pid = bl.pid',
        'JOIN pg_locks kl ON kl.locktype = bl.locktype',
        '  AND kl.database IS NOT DISTINCT FROM bl.database',
        '  AND kl.relation IS NOT DISTINCT FROM bl.relation',
        '  AND kl.page IS NOT DISTINCT FROM bl.page',
        '  AND kl.tuple IS NOT DISTINCT FROM bl.tuple',
        '  AND kl.virtualxid IS NOT DISTINCT FROM bl.virtualxid',
        '  AND kl.transactionid IS NOT DISTINCT FROM bl.transactionid',
        '  AND kl.classid IS NOT DISTINCT FROM bl.classid',
        '  AND kl.objid IS NOT DISTINCT FROM bl.objid',
        '  AND kl.objsubid IS NOT DISTINCT FROM bl.objsubid',
        '  AND kl.pid <> bl.pid',
        'JOIN pg_stat_activity blocker ON blocker.pid = kl.pid',
        'WHERE NOT bl.granted',
        '  AND kl.granted',
        'ORDER BY blocked.pid;',
      ].join('\n')
    }
    return [
      'SELECT',
      '  blocked.pid AS blocked_pid,',
      '  blocked.usename AS blocked_user,',
      '  blocker.pid AS blocking_pid,',
      '  blocker.usename AS blocking_user,',
      '  blocked.wait_event_type,',
      '  blocked.wait_event,',
      '  LEFT(blocked.query, 300) AS blocked_query,',
      '  LEFT(blocker.query, 300) AS blocking_query',
      'FROM pg_stat_activity blocked',
      'JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS blocking_pid(pid) ON true',
      'JOIN pg_stat_activity blocker ON blocker.pid = blocking_pid.pid',
      'ORDER BY blocked.pid;',
    ].join('\n')
  }

  // object-grants
  if (node.type === 'schema') {
    const schemaName = metaStr(node, 'name') || node.title
    return [
      'SELECT',
      `  COALESCE(NULLIF(pg_get_userbyid(acl.grantee), ''), 'PUBLIC') AS grantee,`,
      '  pg_get_userbyid(acl.grantor) AS grantor,',
      '  acl.privilege_type,',
      '  acl.is_grantable',
      `FROM aclexplode(COALESCE((SELECT nspacl FROM pg_namespace WHERE nspname = ${escapeSqlLiteral(schemaName)}), ARRAY[]::aclitem[])) AS acl`,
      'ORDER BY grantee, acl.privilege_type;',
    ].join('\n')
  }
  const objectName = metaStr(node, 'name') || node.title
  const schemaName = metaStr(node, 'schema')
  const qualifiedName = schemaName ? `${schemaName}.${objectName}` : objectName
  return [
    'SELECT',
    `  COALESCE(NULLIF(pg_get_userbyid(acl.grantee), ''), 'PUBLIC') AS grantee,`,
    '  pg_get_userbyid(acl.grantor) AS grantor,',
    '  acl.privilege_type,',
    '  acl.is_grantable',
    `FROM aclexplode(COALESCE((SELECT relacl FROM pg_class WHERE oid = ${escapeSqlLiteral(qualifiedName)}::regclass), ARRAY[]::aclitem[])) AS acl`,
    'ORDER BY grantee, acl.privilege_type;',
  ].join('\n')
}
