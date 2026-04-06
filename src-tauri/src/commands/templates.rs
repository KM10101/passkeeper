use tauri::State;
use serde::{Deserialize, Serialize};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Template {
    pub id: i64,
    pub name: String,
    pub is_builtin: bool,
    pub fields: String,
    pub created_at: i64,
}

fn query_template(db: &rusqlite::Connection, id: i64) -> rusqlite::Result<Template> {
    db.query_row(
        "SELECT id, name, is_builtin, fields, created_at FROM templates WHERE id=?1",
        [id],
        |r| Ok(Template {
            id: r.get(0)?, name: r.get(1)?,
            is_builtin: r.get::<_, i64>(2)? != 0,
            fields: r.get(3)?, created_at: r.get(4)?,
        }),
    )
}

pub fn list_templates_inner(state: &AppState) -> AppResult<Vec<Template>> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT id, name, is_builtin, fields, created_at FROM templates ORDER BY is_builtin DESC, id ASC"
    )?;
    let templates = stmt.query_map([], |r| Ok(Template {
        id: r.get(0)?, name: r.get(1)?,
        is_builtin: r.get::<_, i64>(2)? != 0,
        fields: r.get(3)?, created_at: r.get(4)?,
    }))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(templates)
}

pub fn create_template_inner(name: &str, fields: &str, state: &AppState) -> AppResult<Template> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO templates(name, is_builtin, fields) VALUES(?1, 0, ?2)",
        rusqlite::params![name, fields],
    )?;
    let id = db.last_insert_rowid();
    Ok(query_template(&db, id)?)
}

pub fn update_template_inner(id: i64, name: &str, fields: &str, state: &AppState) -> AppResult<Template> {
    let db = state.db.lock().unwrap();
    let (current_name, is_builtin): (String, i64) = db.query_row(
        "SELECT name, is_builtin FROM templates WHERE id=?1", [id],
        |r| Ok((r.get(0)?, r.get(1)?))
    ).map_err(|_| AppError::NotFound)?;

    // Builtin templates: allow field edits but not name changes
    let effective_name = if is_builtin != 0 { current_name.as_str() } else { name };
    let rows = db.execute(
        "UPDATE templates SET name=?1, fields=?2 WHERE id=?3",
        rusqlite::params![effective_name, fields, id],
    )?;
    if rows == 0 { return Err(AppError::NotFound); }
    Ok(query_template(&db, id)?)
}

pub fn delete_template_inner(id: i64, state: &AppState) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    let is_builtin: i64 = db.query_row(
        "SELECT is_builtin FROM templates WHERE id=?1", [id], |r| r.get(0)
    ).map_err(|_| AppError::NotFound)?;
    if is_builtin != 0 {
        return Err(AppError::Other("内置模版不能删除".into()));
    }
    db.execute("DELETE FROM templates WHERE id=?1", [id])?;
    Ok(())
}

const BUILTIN_DEFAULTS: &[(&str, &str)] = &[
    ("账号密码", r#"[{"name":"username","field_type":"text"},{"name":"password","field_type":"password"},{"name":"url","field_type":"url"}]"#),
    ("API/Token", r#"[{"name":"api_key","field_type":"token"},{"name":"endpoint","field_type":"url"}]"#),
    ("银行卡",    r#"[{"name":"card_number","field_type":"secret"},{"name":"cvv","field_type":"secret"},{"name":"expiry","field_type":"date"}]"#),
    ("笔记",      r#"[{"name":"content","field_type":"markdown"}]"#),
];

pub fn reset_builtin_template_inner(id: i64, state: &AppState) -> AppResult<Template> {
    let db = state.db.lock().unwrap();
    let (name, is_builtin): (String, i64) = db.query_row(
        "SELECT name, is_builtin FROM templates WHERE id=?1", [id],
        |r| Ok((r.get(0)?, r.get(1)?))
    ).map_err(|_| AppError::NotFound)?;
    if is_builtin == 0 {
        return Err(AppError::Other("只能重置内置模版".into()));
    }
    let default_fields = BUILTIN_DEFAULTS.iter()
        .find(|(n, _)| *n == name.as_str())
        .map(|(_, f)| *f)
        .ok_or_else(|| AppError::Other(format!("没有找到内置模版 '{}' 的默认字段", name)))?;
    db.execute("UPDATE templates SET fields=?1 WHERE id=?2", rusqlite::params![default_fields, id])?;
    Ok(query_template(&db, id)?)
}

#[tauri::command]
pub async fn list_templates(state: State<'_, AppState>) -> Result<Vec<Template>, AppError> {
    list_templates_inner(&state)
}

#[tauri::command]
pub async fn create_template(name: String, fields: String, state: State<'_, AppState>) -> Result<Template, AppError> {
    create_template_inner(&name, &fields, &state)
}

#[tauri::command]
pub async fn update_template(id: i64, name: String, fields: String, state: State<'_, AppState>) -> Result<Template, AppError> {
    update_template_inner(id, &name, &fields, &state)
}

#[tauri::command]
pub async fn delete_template(id: i64, state: State<'_, AppState>) -> Result<(), AppError> {
    delete_template_inner(id, &state)
}

#[tauri::command]
pub async fn reset_builtin_template(id: i64, state: State<'_, AppState>) -> Result<Template, AppError> {
    reset_builtin_template_inner(id, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::state::AppState;
    use crate::db::init::init_db;

    fn make_state() -> AppState {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        AppState::new(conn, std::path::PathBuf::new())
    }

    #[test]
    fn list_templates_returns_builtins() {
        let state = make_state();
        let templates = list_templates_inner(&state).unwrap();
        assert_eq!(templates.len(), 4);
        assert!(templates.iter().all(|t| t.is_builtin));
        assert!(templates.iter().any(|t| t.name == "账号密码"));
    }

    #[test]
    fn create_and_list_custom_template() {
        let state = make_state();
        let tpl = create_template_inner("My Template", r#"[{"name":"field1","field_type":"text"}]"#, &state).unwrap();
        assert_eq!(tpl.name, "My Template");
        assert!(!tpl.is_builtin);
        let all = list_templates_inner(&state).unwrap();
        assert_eq!(all.len(), 5);
    }

    #[test]
    fn delete_builtin_template_fails() {
        let state = make_state();
        let templates = list_templates_inner(&state).unwrap();
        let builtin_id = templates[0].id;
        let result = delete_template_inner(builtin_id, &state);
        assert!(result.is_err());
    }

    #[test]
    fn delete_custom_template_succeeds() {
        let state = make_state();
        let tpl = create_template_inner("Custom", "[]", &state).unwrap();
        delete_template_inner(tpl.id, &state).unwrap();
        let all = list_templates_inner(&state).unwrap();
        assert!(all.iter().all(|t| t.id != tpl.id));
    }

    #[test]
    fn reset_builtin_template_restores_defaults() {
        let state = make_state();
        let templates = list_templates_inner(&state).unwrap();
        let builtin = templates.iter().find(|t| t.name == "笔记").unwrap().clone();
        update_template_inner(builtin.id, "笔记", "[]", &state).unwrap();
        let reset = reset_builtin_template_inner(builtin.id, &state).unwrap();
        assert!(reset.fields.contains("content"));
    }
}
