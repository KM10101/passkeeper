use tauri::State;
use serde::Serialize;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct AppSettings {
    pub auto_lock_minutes: i64,
    pub show_passwords_by_default: bool,
    pub favicon_cache_expiry_days: i64,
    pub http_proxy: String,
    pub no_proxy: String,
    pub storage_dir: String,
}

fn read_config(db: &rusqlite::Connection, key: &str, default: &str) -> String {
    db.query_row(
        "SELECT value FROM app_config WHERE key=?1",
        [key], |r| r.get::<_, String>(0),
    ).unwrap_or_else(|_| default.to_string())
}

fn write_config(db: &rusqlite::Connection, key: &str, value: &str) -> AppResult<()> {
    db.execute(
        "INSERT OR REPLACE INTO app_config(key,value) VALUES(?1,?2)",
        [key, value],
    )?;
    Ok(())
}

pub fn get_settings_inner(state: &AppState) -> AppResult<AppSettings> {
    let db = state.db.lock().unwrap();
    Ok(AppSettings {
        auto_lock_minutes: read_config(&db, "auto_lock_minutes", "5")
            .parse().unwrap_or(5),
        show_passwords_by_default: read_config(&db, "show_passwords_by_default", "false") == "true",
        favicon_cache_expiry_days: read_config(&db, "favicon_cache_expiry_days", "7")
            .parse().unwrap_or(7),
        http_proxy: read_config(&db, "http_proxy", ""),
        no_proxy: read_config(&db, "no_proxy", ""),
        storage_dir: read_config(&db, "storage_dir", ""),
    })
}

pub fn update_settings_inner(
    auto_lock_minutes: i64,
    show_passwords_by_default: bool,
    favicon_cache_expiry_days: i64,
    http_proxy: String,
    no_proxy: String,
    state: &AppState,
) -> AppResult<AppSettings> {
    let db = state.db.lock().unwrap();
    write_config(&db, "auto_lock_minutes", &auto_lock_minutes.to_string())?;
    write_config(&db, "show_passwords_by_default", &show_passwords_by_default.to_string())?;
    write_config(&db, "favicon_cache_expiry_days", &favicon_cache_expiry_days.to_string())?;
    write_config(&db, "http_proxy", &http_proxy)?;
    write_config(&db, "no_proxy", &no_proxy)?;
    drop(db);
    get_settings_inner(state)
}

pub fn get_storage_dir_inner(state: &AppState) -> String {
    let path = state.db_path.lock().unwrap();
    path.parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn migrate_storage_inner(new_dir: String, state: &AppState) -> AppResult<()> {
    let current_path = state.db_path.lock().unwrap().clone();
    let new_path = std::path::PathBuf::from(&new_dir).join("vault.db");
    if new_path == current_path { return Ok(()); }
    std::fs::create_dir_all(&new_dir)?;
    std::fs::copy(&current_path, &new_path)?;
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO app_config(key,value) VALUES('storage_dir',?1)",
        [&new_dir],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    get_settings_inner(&state)
}

#[tauri::command]
pub async fn update_settings(
    auto_lock_minutes: i64,
    show_passwords_by_default: bool,
    favicon_cache_expiry_days: i64,
    http_proxy: String,
    no_proxy: String,
    state: State<'_, AppState>,
) -> Result<AppSettings, AppError> {
    update_settings_inner(auto_lock_minutes, show_passwords_by_default,
        favicon_cache_expiry_days, http_proxy, no_proxy, &state)
}

#[tauri::command]
pub async fn get_storage_dir(state: State<'_, AppState>) -> Result<String, AppError> {
    Ok(get_storage_dir_inner(&state))
}

#[tauri::command]
pub async fn migrate_storage(
    new_dir: String, state: State<'_, AppState>,
) -> Result<(), AppError> {
    migrate_storage_inner(new_dir, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::state::AppState;
    use crate::db::init_db;

    fn make_state() -> AppState {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        AppState::new(conn, std::path::PathBuf::new())
    }

    #[test]
    fn get_settings_returns_defaults() {
        let state = make_state();
        let s = get_settings_inner(&state).unwrap();
        assert_eq!(s.auto_lock_minutes, 5);
        assert!(!s.show_passwords_by_default);
        assert_eq!(s.favicon_cache_expiry_days, 7);
        assert!(s.http_proxy.is_empty());
    }

    #[test]
    fn update_and_get_settings_roundtrip() {
        let state = make_state();
        let updated = update_settings_inner(
            10, true, 14,
            "http://127.0.0.1:7890".into(),
            "localhost,127.0.0.1".into(),
            &state,
        ).unwrap();
        assert_eq!(updated.auto_lock_minutes, 10);
        assert_eq!(updated.favicon_cache_expiry_days, 14);
        assert_eq!(updated.http_proxy, "http://127.0.0.1:7890");
        assert_eq!(updated.no_proxy, "localhost,127.0.0.1");
    }
}
