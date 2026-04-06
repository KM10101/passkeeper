use rusqlite::Connection;
use crate::error::AppResult;

pub fn init_db(conn: &Connection) -> AppResult<()> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS groups (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            parent_id   INTEGER REFERENCES groups(id) ON DELETE SET NULL,
            icon        TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS entries (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id      INTEGER REFERENCES groups(id) ON DELETE SET NULL,
            title         TEXT    NOT NULL,
            url           TEXT,
            site_title    TEXT,
            username      TEXT,
            template_type TEXT    NOT NULL DEFAULT 'custom',
            tags          TEXT    NOT NULL DEFAULT '[]',
            notes         TEXT,
            favorite      INTEGER NOT NULL DEFAULT 0,
            pinned        INTEGER NOT NULL DEFAULT 0,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS entry_fields (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
            field_name  TEXT    NOT NULL,
            field_type  TEXT    NOT NULL DEFAULT 'secret',
            field_value BLOB    NOT NULL,
            nonce       BLOB,
            sort_order  INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS favicon_cache (
            domain      TEXT PRIMARY KEY,
            data        BLOB    NOT NULL,
            fetched_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS app_config (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL
        );
    ")?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS templates (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            is_builtin  INTEGER NOT NULL DEFAULT 0,
            fields      TEXT    NOT NULL DEFAULT '[]',
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );
    ")?;

    // Seed builtin templates once
    let builtin_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM templates WHERE is_builtin=1", [], |r| r.get(0)
    )?;
    if builtin_count == 0 {
        let builtins: &[(&str, &str)] = &[
            ("账号密码", r#"[{"name":"username","field_type":"text"},{"name":"password","field_type":"password"},{"name":"url","field_type":"url"}]"#),
            ("API/Token", r#"[{"name":"api_key","field_type":"token"},{"name":"endpoint","field_type":"url"}]"#),
            ("银行卡",    r#"[{"name":"card_number","field_type":"secret"},{"name":"cvv","field_type":"secret"},{"name":"expiry","field_type":"date"}]"#),
            ("笔记",      r#"[{"name":"content","field_type":"markdown"}]"#),
        ];
        for (name, fields) in builtins {
            conn.execute(
                "INSERT INTO templates(name, is_builtin, fields) VALUES(?1, 1, ?2)",
                rusqlite::params![name, fields],
            )?;
        }
    }

    // Migration: add is_pinned to groups if missing
    if conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('groups') WHERE name='is_pinned'",
        [],
        |r| r.get::<_, i64>(0),
    ).unwrap_or(0) == 0 {
        conn.execute(
            "ALTER TABLE groups ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn init_db_creates_all_tables() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();

        let tables: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).unwrap();
            stmt.query_map([], |r| r.get(0)).unwrap()
                .map(|r| r.unwrap())
                .collect()
        };

        assert!(tables.contains(&"groups".to_string()));
        assert!(tables.contains(&"entries".to_string()));
        assert!(tables.contains(&"entry_fields".to_string()));
        assert!(tables.contains(&"favicon_cache".to_string()));
        assert!(tables.contains(&"app_config".to_string()));
    }

    #[test]
    fn init_db_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        init_db(&conn).unwrap();
    }
}
