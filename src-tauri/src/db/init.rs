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
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS entries (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id      INTEGER REFERENCES groups(id) ON DELETE SET NULL,
            title         TEXT    NOT NULL,
            url           TEXT,
            site_title    TEXT,
            username      TEXT,
            template_type TEXT    NOT NULL DEFAULT 'password',
            tags          TEXT    NOT NULL DEFAULT '[]',
            notes         TEXT,
            favorite      INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
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
