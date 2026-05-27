use crate::database::DatabaseType;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedSqlStatement {
    pub sql: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum CompoundMode {
    MysqlRoutine,
    SqliteTrigger,
}

#[derive(Debug, Clone)]
struct SqlScriptParser<'a> {
    source: &'a str,
    db_type: &'a DatabaseType,
    position: usize,
    delimiter: String,
    current: String,
    statements: Vec<ParsedSqlStatement>,
    statement_tokens: Vec<String>,
    current_token: String,
    compound_mode: Option<CompoundMode>,
    compound_depth: usize,
}

impl<'a> SqlScriptParser<'a> {
    fn new(source: &'a str, db_type: &'a DatabaseType) -> Self {
        Self {
            source,
            db_type,
            position: 0,
            delimiter: ";".to_string(),
            current: String::new(),
            statements: Vec::new(),
            statement_tokens: Vec::new(),
            current_token: String::new(),
            compound_mode: None,
            compound_depth: 0,
        }
    }

    fn parse(mut self) -> Vec<ParsedSqlStatement> {
        while self.position < self.source.len() {
            if self.try_consume_delimiter_command() {
                continue;
            }

            if self.try_consume_statement_delimiter() {
                continue;
            }

            if self.try_consume_line_comment() {
                continue;
            }

            if self.try_consume_block_comment() {
                continue;
            }

            if self.try_consume_single_quote() {
                continue;
            }

            if self.try_consume_double_quote() {
                continue;
            }

            if self.try_consume_backtick_identifier() {
                continue;
            }

            if self.try_consume_dollar_quote() {
                continue;
            }

            self.consume_plain_char();
        }

        self.finish_current_token();
        self.push_current_statement();
        self.statements
    }

    fn remaining(&self) -> &'a str {
        &self.source[self.position..]
    }

    fn peek_char(&self) -> Option<char> {
        self.remaining().chars().next()
    }

    fn advance_char(&mut self) -> Option<char> {
        let ch = self.peek_char()?;
        self.position += ch.len_utf8();
        Some(ch)
    }

    fn advance_bytes(&mut self, len: usize) {
        self.position += len;
    }

    fn current_trimmed(&self) -> &str {
        self.current.trim()
    }

    fn push_current_statement(&mut self) {
        let sql = self.current.trim().to_string();
        if !sql.is_empty() {
            self.statements.push(ParsedSqlStatement { sql });
        }

        self.current.clear();
        self.statement_tokens.clear();
        self.current_token.clear();
        self.compound_mode = None;
        self.compound_depth = 0;
    }

    fn finish_current_token(&mut self) {
        if self.current_token.is_empty() {
            return;
        }

        let token = self.current_token.to_uppercase();
        let previous_token = self.statement_tokens.last().cloned();
        self.statement_tokens.push(token.clone());
        if self.statement_tokens.len() > 32 {
            self.statement_tokens.remove(0);
        }

        match self.db_type {
            DatabaseType::MySQL => {
                if self.compound_mode.is_none()
                    && matches!(token.as_str(), "PROCEDURE" | "FUNCTION" | "TRIGGER" | "EVENT")
                    && self.statement_tokens.iter().any(|value| value == "CREATE")
                {
                    self.compound_mode = Some(CompoundMode::MysqlRoutine);
                }
            }
            DatabaseType::SQLite => {
                if self.compound_mode.is_none()
                    && token == "TRIGGER"
                    && self.statement_tokens.iter().any(|value| value == "CREATE")
                {
                    self.compound_mode = Some(CompoundMode::SqliteTrigger);
                }
            }
            _ => {}
        }

        if self.compound_mode.is_some() {
            if is_compound_block_start(&token) && previous_token.as_deref() != Some("END") {
                self.compound_depth += 1;
            } else if token == "END" && self.compound_depth > 0 {
                self.compound_depth -= 1;
            }
        }

        self.current_token.clear();
    }

    fn consume_plain_char(&mut self) {
        if let Some(ch) = self.advance_char() {
            if is_identifier_char(ch) {
                self.current_token.push(ch);
            } else {
                self.finish_current_token();
            }
            self.current.push(ch);
        }
    }

    fn try_consume_statement_delimiter(&mut self) -> bool {
        if !self.remaining().starts_with(&self.delimiter) {
            return false;
        }

        self.finish_current_token();
        if self.compound_depth > 0 {
            return false;
        }
        self.push_current_statement();
        self.advance_bytes(self.delimiter.len());
        true
    }

    fn try_consume_delimiter_command(&mut self) -> bool {
        if *self.db_type != DatabaseType::MySQL || !self.current_trimmed().is_empty() {
            return false;
        }

        let remaining = self.remaining();
        if !starts_with_keyword(remaining, "DELIMITER") {
            return false;
        }

        let mut line_end = remaining.find('\n').unwrap_or(remaining.len());
        if line_end > 0 && remaining[..line_end].ends_with('\r') {
            line_end -= 1;
        }

        let delimiter_value = remaining["DELIMITER".len()..line_end].trim();
        if !delimiter_value.is_empty() {
            self.delimiter = delimiter_value.to_string();
        }

        self.advance_bytes(remaining.find('\n').map(|index| index + 1).unwrap_or(remaining.len()));
        true
    }

    fn try_consume_line_comment(&mut self) -> bool {
        let remaining = self.remaining();
        let is_mysql_hash = *self.db_type == DatabaseType::MySQL && remaining.starts_with('#');
        let is_dash_comment = remaining.starts_with("--")
            && remaining["--".len()..]
                .chars()
                .next()
                .map(|ch| ch.is_whitespace())
                .unwrap_or(true);

        if !is_mysql_hash && !is_dash_comment {
            return false;
        }

        let comment_end = remaining.find('\n').unwrap_or(remaining.len());
        let should_preserve = !self.current_trimmed().is_empty();
        if should_preserve {
            self.finish_current_token();
            self.current.push_str(&remaining[..comment_end]);
        }
        self.advance_bytes(comment_end);

        if self.peek_char() == Some('\n') {
            if should_preserve {
                self.current.push('\n');
            }
            self.advance_char();
        }

        true
    }

    fn try_consume_block_comment(&mut self) -> bool {
        let remaining = self.remaining();
        if !remaining.starts_with("/*") {
            return false;
        }

        let should_preserve = !self.current_trimmed().is_empty();
        self.finish_current_token();

        if let Some(end_index) = remaining.find("*/") {
            if should_preserve {
                self.current.push_str(&remaining[..end_index + 2]);
            }
            self.advance_bytes(end_index + 2);
        } else {
            if should_preserve {
                self.current.push_str(remaining);
            }
            self.position = self.source.len();
        }

        true
    }

    fn try_consume_single_quote(&mut self) -> bool {
        if self.peek_char() != Some('\'') {
            return false;
        }

        self.finish_current_token();
        self.consume_quoted_literal('\'', true);
        true
    }

    fn try_consume_double_quote(&mut self) -> bool {
        if self.peek_char() != Some('"') {
            return false;
        }

        self.finish_current_token();
        self.consume_quoted_literal('"', true);
        true
    }

    fn try_consume_backtick_identifier(&mut self) -> bool {
        if self.peek_char() != Some('`') {
            return false;
        }

        self.finish_current_token();
        self.consume_quoted_literal('`', true);
        true
    }

    fn try_consume_dollar_quote(&mut self) -> bool {
        if !matches!(self.db_type, DatabaseType::PostgreSQL | DatabaseType::OpenGauss) || self.peek_char() != Some('$') {
            return false;
        }

        let remaining = self.remaining();
        let bytes = remaining.as_bytes();
        let mut index = 1;
        while index < bytes.len() {
            let current = bytes[index] as char;
            if current == '$' {
                let tag = &remaining[..=index];
                if is_valid_dollar_quote_tag(tag) {
                    self.finish_current_token();
                    self.current.push_str(tag);
                    self.advance_bytes(tag.len());

                    if let Some(end_index) = self.remaining().find(tag) {
                        self.current.push_str(&self.remaining()[..end_index + tag.len()]);
                        self.advance_bytes(end_index + tag.len());
                    } else {
                        self.current.push_str(self.remaining());
                        self.position = self.source.len();
                    }
                    return true;
                }
                return false;
            }

            if !(current == '_' || current.is_ascii_alphanumeric()) {
                return false;
            }
            index += 1;
        }

        false
    }

    fn consume_quoted_literal(&mut self, quote: char, doubled_escape: bool) {
        if let Some(ch) = self.advance_char() {
            self.current.push(ch);
        }

        while let Some(ch) = self.advance_char() {
            self.current.push(ch);

            if ch == '\\' && quote == '\'' {
                if let Some(next) = self.advance_char() {
                    self.current.push(next);
                }
                continue;
            }

            if ch == quote {
                if doubled_escape && self.peek_char() == Some(quote) {
                    if let Some(next) = self.advance_char() {
                        self.current.push(next);
                    }
                    continue;
                }
                break;
            }
        }
    }
}

fn starts_with_keyword(input: &str, keyword: &str) -> bool {
    if input.len() < keyword.len() {
        return false;
    }

    let Some(head) = input.get(..keyword.len()) else {
        return false;
    };
    if !head.eq_ignore_ascii_case(keyword) {
        return false;
    }

    input
        .get(keyword.len()..)
        .and_then(|tail| tail.chars().next())
        .map(|ch| ch.is_whitespace())
        .unwrap_or(true)
}

fn is_identifier_char(ch: char) -> bool {
    ch == '_' || ch == '$' || ch.is_ascii_alphanumeric()
}

fn is_compound_block_start(token: &str) -> bool {
    matches!(token, "BEGIN" | "CASE" | "LOOP" | "REPEAT" | "WHILE" | "IF")
}

fn is_valid_dollar_quote_tag(tag: &str) -> bool {
    if !tag.starts_with('$') || !tag.ends_with('$') {
        return false;
    }

    let inner = &tag[1..tag.len() - 1];
    inner.is_empty() || inner.chars().all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
}

fn lex_keywords(sql: &str, db_type: &DatabaseType) -> Vec<String> {
    let parser = SqlScriptParser::new(sql, db_type);
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut position = 0;

    while position < parser.source.len() {
        let remaining = &parser.source[position..];

        if remaining.starts_with("--")
            && remaining["--".len()..]
                .chars()
                .next()
                .map(|ch| ch.is_whitespace())
                .unwrap_or(true)
        {
            position += remaining.find('\n').unwrap_or(remaining.len());
            continue;
        }

        if *db_type == DatabaseType::MySQL && remaining.starts_with('#') {
            position += remaining.find('\n').unwrap_or(remaining.len());
            continue;
        }

        if remaining.starts_with("/*") {
            if let Some(end_index) = remaining.find("*/") {
                position += end_index + 2;
            } else {
                break;
            }
            continue;
        }

        let ch = remaining.chars().next().unwrap();
        if ch == '\'' || ch == '"' || ch == '`' {
            let mut local = SqlScriptParser::new(remaining, db_type);
            if ch == '\'' {
                local.try_consume_single_quote();
            } else if ch == '"' {
                local.try_consume_double_quote();
            } else {
                local.try_consume_backtick_identifier();
            }
            position += local.position;
            continue;
        }

        if matches!(db_type, DatabaseType::PostgreSQL | DatabaseType::OpenGauss) && ch == '$' {
            let mut local = SqlScriptParser::new(remaining, db_type);
            if local.try_consume_dollar_quote() {
                position += local.position;
                continue;
            }
        }

        if is_identifier_char(ch) {
            current.push(ch);
        } else if !current.is_empty() {
            tokens.push(current.to_uppercase());
            current.clear();
        }

        position += ch.len_utf8();
    }

    if !current.is_empty() {
        tokens.push(current.to_uppercase());
    }

    tokens
}

pub fn split_sql_script(sql: &str, db_type: &DatabaseType) -> Vec<ParsedSqlStatement> {
    SqlScriptParser::new(sql, db_type).parse()
}

pub fn can_paginate_select_statement(sql: &str, db_type: &DatabaseType) -> bool {
    let tokens = lex_keywords(sql, db_type);
    if tokens.first().map(String::as_str) != Some("SELECT") {
        return false;
    }

    !tokens.iter().any(|token| token == "LIMIT")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_simple_statements() {
        let statements = split_sql_script("SELECT 1; SELECT 2;", &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[0].sql, "SELECT 1");
        assert_eq!(statements[1].sql, "SELECT 2");
    }

    #[test]
    fn keeps_mysql_procedure_body_together_without_delimiter_command() {
        let sql = "CREATE PROCEDURE demo()\nBEGIN\nSELECT 1;\nSELECT 2;\nEND;\nSELECT 3;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.contains("SELECT 1;\nSELECT 2;"));
        assert_eq!(statements[1].sql, "SELECT 3");
    }

    #[test]
    fn respects_mysql_delimiter_command() {
        let sql = "DELIMITER $$\nCREATE PROCEDURE demo()\nBEGIN\nSELECT 1;\nEND $$\nDELIMITER ;\nSELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.starts_with("CREATE PROCEDURE demo()"));
        assert_eq!(statements[1].sql, "SELECT 2");
    }

    #[test]
    fn keeps_postgres_dollar_quoted_function_together() {
        let sql = "CREATE FUNCTION demo() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql; SELECT 1;";
        let statements = split_sql_script(sql, &DatabaseType::PostgreSQL);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.contains("PERFORM 1; END;"));
        assert_eq!(statements[1].sql, "SELECT 1");
    }

    #[test]
    fn keeps_sqlite_trigger_together() {
        let sql = "CREATE TRIGGER demo AFTER INSERT ON users BEGIN INSERT INTO logs VALUES (1); END; SELECT 1;";
        let statements = split_sql_script(sql, &DatabaseType::SQLite);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.starts_with("CREATE TRIGGER demo"));
        assert_eq!(statements[1].sql, "SELECT 1");
    }

    #[test]
    fn ignores_semicolon_in_single_quoted_string() {
        let sql = "SELECT ';not split;'; SELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[0].sql, "SELECT ';not split;'");
        assert_eq!(statements[1].sql, "SELECT 2");
    }

    #[test]
    fn ignores_semicolon_in_double_quoted_string() {
        let sql = "SELECT \";still one\"; SELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::PostgreSQL);
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[0].sql, "SELECT \";still one\"");
    }

    #[test]
    fn ignores_semicolon_in_backtick_identifier() {
        let sql = "SELECT `semi;colon` FROM `demo;table`; SELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.contains("`semi;colon`"));
    }

    #[test]
    fn ignores_semicolon_in_line_comment() {
        let sql = "SELECT 1 -- ; comment\n; SELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.starts_with("SELECT 1"));
        assert_eq!(statements[1].sql, "SELECT 2");
    }

    #[test]
    fn ignores_semicolon_in_mysql_hash_comment() {
        let sql = "SELECT 1 # ; comment\n; SELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[1].sql, "SELECT 2");
    }

    #[test]
    fn ignores_semicolon_in_block_comment() {
        let sql = "SELECT 1 /* ; still same statement ; */; SELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::SQLite);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.contains("still same statement"));
    }

    #[test]
    fn handles_mysql_nested_begin_end_blocks() {
        let sql = "CREATE PROCEDURE demo()\nBEGIN\nIF 1 = 1 THEN\nBEGIN\nSELECT 1;\nEND;\nEND IF;\nEND;\nSELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.contains("END IF;"));
        assert_eq!(statements[1].sql, "SELECT 2");
    }

    #[test]
    fn handles_mysql_function_with_case_expression() {
        let sql = "CREATE FUNCTION demo(x INT) RETURNS INT\nBEGIN\nRETURN CASE WHEN x > 0 THEN 1 ELSE 0 END;\nEND;\nSELECT 1;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.contains("CASE WHEN"));
    }

    #[test]
    fn handles_mysql_trigger_with_begin_end() {
        let sql = "CREATE TRIGGER trg BEFORE INSERT ON users FOR EACH ROW BEGIN SET NEW.name = 'x'; END; SELECT 1;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.starts_with("CREATE TRIGGER trg"));
    }

    #[test]
    fn handles_mysql_delimiter_with_slashes() {
        let sql = "DELIMITER //\r\nCREATE PROCEDURE demo()\r\nBEGIN\r\nSELECT 1;\r\nEND //\r\nDELIMITER ;\r\nSELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[1].sql, "SELECT 2");
    }

    #[test]
    fn preserves_comments_inside_compound_mysql_statement() {
        let sql = "CREATE PROCEDURE demo()\nBEGIN\n-- keep me\nSELECT 1;\n/* and me */\nSELECT 2;\nEND;";
        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 1);
        assert!(statements[0].sql.contains("-- keep me"));
        assert!(statements[0].sql.contains("/* and me */"));
    }

    #[test]
    fn handles_postgres_dollar_quote_with_named_tag() {
        let sql = "CREATE FUNCTION demo() RETURNS void AS $func$ BEGIN PERFORM 1; END; $func$ LANGUAGE plpgsql; SELECT 1;";
        let statements = split_sql_script(sql, &DatabaseType::PostgreSQL);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].sql.contains("$func$"));
    }

    #[test]
    fn handles_postgres_semicolon_in_comment_before_statement() {
        let sql = "-- first ; comment\nSELECT 1;\n/* second ; comment */\nSELECT 2;";
        let statements = split_sql_script(sql, &DatabaseType::PostgreSQL);
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[0].sql, "SELECT 1");
        assert!(statements[1].sql.contains("SELECT 2"));
    }

    #[test]
    fn handles_sqlite_trigger_without_followup_statement() {
        let sql = "CREATE TRIGGER demo AFTER UPDATE ON users BEGIN UPDATE logs SET seen = 1; END;";
        let statements = split_sql_script(sql, &DatabaseType::SQLite);
        assert_eq!(statements.len(), 1);
        assert!(statements[0].sql.starts_with("CREATE TRIGGER demo"));
    }

    #[test]
    fn skips_empty_statements() {
        let sql = " ; ; SELECT 1; ; ";
        let statements = split_sql_script(sql, &DatabaseType::SQLite);
        assert_eq!(statements.len(), 1);
        assert_eq!(statements[0].sql, "SELECT 1");
    }

    #[test]
    fn paginate_detection_for_simple_select() {
        assert!(can_paginate_select_statement("SELECT * FROM users", &DatabaseType::MySQL));
    }

    #[test]
    fn paginate_detection_for_select_with_limit() {
        assert!(!can_paginate_select_statement("SELECT * FROM users LIMIT 10", &DatabaseType::MySQL));
    }

    #[test]
    fn paginate_detection_rejects_procedure_call() {
        assert!(!can_paginate_select_statement("CALL demo()", &DatabaseType::MySQL));
    }

    #[test]
    fn paginate_detection_ignores_comments_and_strings() {
        assert!(can_paginate_select_statement("/* head */ SELECT ';' AS value", &DatabaseType::PostgreSQL));
    }

    #[test]
    fn handles_multibyte_comment_before_mysql_ddl_without_panicking() {
        let sql = r#"
-- 销售记录表
CREATE TABLE `sales` (
  `sale_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` INT UNSIGNED NOT NULL,
  `region` VARCHAR(50) NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `sale_date` DATE NOT NULL,
  PRIMARY KEY (`sale_id`),
  INDEX `idx_region_product` (`region`, `product_id`), -- 用于查询提示
  INDEX `idx_sale_date` (`sale_date`)
) ENGINE=InnoDB;
"#;

        let statements = split_sql_script(sql, &DatabaseType::MySQL);
        assert_eq!(statements.len(), 1);
        assert!(statements[0].sql.starts_with("CREATE TABLE `sales`"));
        assert!(statements[0].sql.contains("用于查询提示"));
    }

    #[test]
    fn handles_various_utf8_comments_in_mysql_parser() {
        let cases = [
            "-- 日本語コメント\nSELECT 1;",
            "-- 한글 주석\nSELECT 1;",
            "-- تعليق عربي\nSELECT 1;",
            "-- emoji 😀 comment\nSELECT 1;",
        ];

        for sql in cases {
            let statements = split_sql_script(sql, &DatabaseType::MySQL);
            assert_eq!(statements.len(), 1, "failed sql: {sql}");
            assert_eq!(statements[0].sql, "SELECT 1", "failed sql: {sql}");
        }
    }
}
