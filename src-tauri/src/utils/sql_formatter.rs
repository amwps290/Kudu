use crate::database::DatabaseType;
use sqlformat::{format, FormatOptions, Indent, QueryParams};

/// SQL 格式化工具
pub struct SqlFormatter;

impl SqlFormatter {
    /// 美化 SQL 代码
    pub fn beautify(sql: &str, _db_type: &DatabaseType) -> String {
        let options = FormatOptions {
            indent: Indent::Spaces(2),
            uppercase: true,
            lines_between_queries: 2,
        };

        // sqlformat 0.2.x 版本目前采用统一的标准格式化逻辑
        format(sql, &QueryParams::None, options)
    }

    /// 格式化 SELECT 语句 (用于自动生成)
    pub fn format_select(
        db_type: &DatabaseType,
        database: &str,
        table: &str,
        schema: Option<&str>,
        columns: &str,
        where_clause: Option<&str>,
        limit: Option<u64>,
    ) -> String {
        let table_ref = Self::format_table_ref(db_type, database, table, schema);
        let mut sql = format!("SELECT {} FROM {}", columns, table_ref);
        
        if let Some(where_cond) = where_clause {
            sql.push_str(&format!(" WHERE {}", where_cond));
        }
        
        if let Some(lim) = limit {
            sql.push_str(&format!(" LIMIT {}", lim));
        }
        
        // 自动生成的 SQL 也可以跑一遍美化
        Self::beautify(&sql, db_type)
    }
    
    /// 格式化 UPDATE 语句
    pub fn format_update(
        db_type: &DatabaseType,
        database: &str,
        table: &str,
        schema: Option<&str>,
        column: &str,
        value: Option<&str>,
        where_clause: &str,
    ) -> String {
        let table_ref = Self::format_table_ref(db_type, database, table, schema);
        let column_ref = Self::quote_identifier(db_type, column);
        let value_str = if let Some(v) = value {
            format!("'{}'", v.replace("'", "''"))
        } else {
            "NULL".to_string()
        };
        
        let sql = format!(
            "UPDATE {} SET {} = {} WHERE {}",
            table_ref, column_ref, value_str, where_clause
        );
        Self::beautify(&sql, db_type)
    }
    
    /// 格式化 INSERT 语句
    pub fn format_insert(
        db_type: &DatabaseType,
        database: &str,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        values: &[String],
    ) -> String {
        let table_ref = Self::format_table_ref(db_type, database, table, schema);
        let quoted_columns: Vec<String> = columns
            .iter()
            .map(|col| Self::quote_identifier(db_type, col))
            .collect();
        
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            table_ref,
            quoted_columns.join(", "),
            values.join(", ")
        );
        Self::beautify(&sql, db_type)
    }
    
    /// 格式化 DELETE 语句
    pub fn format_delete(
        db_type: &DatabaseType,
        database: &str,
        table: &str,
        schema: Option<&str>,
        where_clause: &str,
    ) -> String {
        let table_ref = Self::format_table_ref(db_type, database, table, schema);
        let sql = format!("DELETE FROM {} WHERE {}", table_ref, where_clause);
        Self::beautify(&sql, db_type)
    }
    
    /// 格式化表引用（database.table 或 table）
    fn format_table_ref(db_type: &DatabaseType, database: &str, table: &str, schema: Option<&str>) -> String {
        match db_type {
            DatabaseType::SQLite => {
                Self::quote_identifier(db_type, table)
            }
            DatabaseType::MySQL => {
                format!(
                    "{}.{}",
                    Self::quote_identifier(db_type, database),
                    Self::quote_identifier(db_type, table)
                )
            }
            DatabaseType::PostgreSQL | DatabaseType::OpenGauss | DatabaseType::GaussDB => {
                let schema_name = schema.unwrap_or("public");
                format!(
                    "{}.{}",
                    Self::quote_identifier(db_type, schema_name),
                    Self::quote_identifier(db_type, table)
                )
            }
            _ => {
                format!(
                    "{}.{}",
                    Self::quote_identifier(db_type, database),
                    Self::quote_identifier(db_type, table)
                )
            }
        }
    }
    
    /// 根据数据库类型引用标识符（列名、表名等）
    pub fn quote_identifier(db_type: &DatabaseType, identifier: &str) -> String {
        match db_type {
            DatabaseType::SQLite | DatabaseType::PostgreSQL | DatabaseType::OpenGauss | DatabaseType::GaussDB => {
                format!("\"{}\"", identifier)
            }
            DatabaseType::MySQL => {
                format!("`{}`", identifier)
            }
            _ => {
                format!("`{}`", identifier)
            }
        }
    }
}
