use tauri::State;
use serde::Serialize;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct AppSettings {
    pub auto_lock_minutes: i64,
    pub show_passwords_by_default: bool,
}

pub fn get_settings_inner(state: &AppState) -> AppResult<AppSettings> {
    let db = state.db.lock().unwrap();
    let auto_lock: i64 = db.query_row(
        "SELECT value FROM app_config WHERE key='auto_lock_minutes'",
        [], |r| r.get::<_, String>(0)
    ).ok().and_then(|v| v.parse().ok()).unwrap_or(5);
    let show_pw: bool = db.query_row(
        "SELECT value FROM app_config WHERE key='show_passwords_by_default'",
        [], |r| r.get::<_, String>(0)
    ).ok().map(|v| v == "true").unwrap_or(false);
    Ok(AppSettings { auto_lock_minutes: auto_lock, show_passwords_by_default: show_pw })
}

pub fn update_settings_inner(
    auto_lock_minutes: i64, show_passwords_by_default: bool, state: &AppState,
) -> AppResult<AppSettings> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO app_config(key,value) VALUES('auto_lock_minutes',?1)",
        [auto_lock_minutes.to_string()],
    )?;
    db.execute(
        "INSERT OR REPLACE INTO app_config(key,value) VALUES('show_passwords_by_default',?1)",
        [show_passwords_by_default.to_string()],
    )?;
    drop(db);
    get_settings_inner(state)
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    get_settings_inner(&state)
}

#[tauri::command]
pub async fn update_settings(
    auto_lock_minutes: i64, show_passwords_by_default: bool,
    state: State<'_, AppState>,
) -> Result<AppSettings, AppError> {
    update_settings_inner(auto_lock_minutes, show_passwords_by_default, &state)
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
        AppState::new(conn)
    }

    #[test]
    fn get_settings_returns_defaults() {
        let state = make_state();
        let settings = get_settings_inner(&state).unwrap();
        assert_eq!(settings.auto_lock_minutes, 5);
        assert!(!settings.show_passwords_by_default);
    }

    #[test]
    fn update_and_get_settings() {
        let state = make_state();
        let updated = update_settings_inner(10, true, &state).unwrap();
        assert_eq!(updated.auto_lock_minutes, 10);
        assert!(updated.show_passwords_by_default);
        let fetched = get_settings_inner(&state).unwrap();
        assert_eq!(fetched.auto_lock_minutes, 10);
    }
}
