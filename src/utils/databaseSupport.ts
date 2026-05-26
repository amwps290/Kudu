import type { DatabaseType } from '@/types/database'

export type DatabaseSupportLevel = 'stable' | 'limited' | 'experimental'

export interface DatabaseSupportProfile {
  dbType: DatabaseType
  level: DatabaseSupportLevel
  supportsSqlWorkspace: boolean
  supportsQueryBuilder: boolean
  supportsDataCompare: boolean
  supportsErDiagram: boolean
  supportsConnectionScripts: boolean
  supportsBackupRestore: boolean
  supportsDatabaseTreeChildren: boolean
  supportsTableDataView: boolean
  supportsTableDesign: boolean
}

const DATABASE_SUPPORT_PROFILES: Record<DatabaseType, DatabaseSupportProfile> = {
  mysql: {
    dbType: 'mysql',
    level: 'stable',
    supportsSqlWorkspace: true,
    supportsQueryBuilder: true,
    supportsDataCompare: true,
    supportsErDiagram: true,
    supportsConnectionScripts: true,
    supportsBackupRestore: true,
    supportsDatabaseTreeChildren: true,
    supportsTableDataView: true,
    supportsTableDesign: true,
  },
  postgresql: {
    dbType: 'postgresql',
    level: 'stable',
    supportsSqlWorkspace: true,
    supportsQueryBuilder: true,
    supportsDataCompare: true,
    supportsErDiagram: true,
    supportsConnectionScripts: true,
    supportsBackupRestore: true,
    supportsDatabaseTreeChildren: true,
    supportsTableDataView: true,
    supportsTableDesign: true,
  },
  sqlite: {
    dbType: 'sqlite',
    level: 'stable',
    supportsSqlWorkspace: true,
    supportsQueryBuilder: true,
    supportsDataCompare: true,
    supportsErDiagram: true,
    supportsConnectionScripts: true,
    supportsBackupRestore: true,
    supportsDatabaseTreeChildren: true,
    supportsTableDataView: true,
    supportsTableDesign: true,
  },
  redis: {
    dbType: 'redis',
    level: 'limited',
    supportsSqlWorkspace: false,
    supportsQueryBuilder: false,
    supportsDataCompare: false,
    supportsErDiagram: false,
    supportsConnectionScripts: false,
    supportsBackupRestore: false,
    supportsDatabaseTreeChildren: false,
    supportsTableDataView: false,
    supportsTableDesign: false,
  },
  mongodb: {
    dbType: 'mongodb',
    level: 'experimental',
    supportsSqlWorkspace: false,
    supportsQueryBuilder: false,
    supportsDataCompare: false,
    supportsErDiagram: false,
    supportsConnectionScripts: false,
    supportsBackupRestore: false,
    supportsDatabaseTreeChildren: false,
    supportsTableDataView: false,
    supportsTableDesign: false,
  },
}

function normalizeDatabaseType(dbType?: DatabaseType | string | null): DatabaseType {
  if (dbType === 'postgres') return 'postgresql'
  if (dbType === 'mongo') return 'mongodb'
  if (dbType === 'mysql' || dbType === 'postgresql' || dbType === 'sqlite' || dbType === 'redis' || dbType === 'mongodb') {
    return dbType
  }
  return 'mongodb'
}

export function getDatabaseSupportProfile(dbType?: DatabaseType | string | null): DatabaseSupportProfile {
  return DATABASE_SUPPORT_PROFILES[normalizeDatabaseType(dbType)]
}

export function supportsSqlWorkspace(dbType?: DatabaseType | string | null): boolean {
  return getDatabaseSupportProfile(dbType).supportsSqlWorkspace
}

export function supportsQueryBuilder(dbType?: DatabaseType | string | null): boolean {
  return getDatabaseSupportProfile(dbType).supportsQueryBuilder
}

export function supportsDataCompare(dbType?: DatabaseType | string | null): boolean {
  return getDatabaseSupportProfile(dbType).supportsDataCompare
}

export function supportsErDiagram(dbType?: DatabaseType | string | null): boolean {
  return getDatabaseSupportProfile(dbType).supportsErDiagram
}
