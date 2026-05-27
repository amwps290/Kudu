/// MySQL 标识符转义：使用反引号包裹，内部反引号双写
pub fn escape_mysql_id(name: &str) -> String {
    format!("`{}`", name.replace('`', "``"))
}

/// PostgreSQL 标识符转义：使用双引号包裹，内部双引号双写
pub fn escape_pg_id(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// openGauss 标识符转义：使用双引号包裹，内部双引号双写
/// 与 PostgreSQL 规则相同
pub fn escape_opengauss_id(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// SQLite 标识符转义：使用双引号包裹，内部双引号双写
pub fn escape_sqlite_id(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// 字符串字面量转义：使用单引号包裹，内部单引号双写
pub fn escape_string_literal(val: &str) -> String {
    format!("'{}'", val.replace('\'', "''"))
}

/// 验证 SQL 标识符：仅允许字母、数字、下划线、点、连字符
pub fn validate_sql_identifier(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("标识符不能为空".to_string());
    }
    if name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '.' || c == '-') {
        Ok(())
    } else {
        Err(format!("标识符包含非法字符: {}", name))
    }
}
