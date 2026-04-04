use tauri::State;
use crate::db::models::Group;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub fn list_groups_inner(state: &AppState) -> AppResult<Vec<Group>> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT id, name, parent_id, icon, sort_order, created_at FROM groups ORDER BY sort_order, name"
    )?;
    let groups = stmt.query_map([], |r| Ok(Group {
        id: r.get(0)?, name: r.get(1)?, parent_id: r.get(2)?,
        icon: r.get(3)?, sort_order: r.get(4)?, created_at: r.get(5)?,
    }))?.map(|r| r.unwrap()).collect();
    Ok(groups)
}

pub fn create_group_inner(
    name: &str, parent_id: Option<i64>, icon: Option<String>, sort_order: i64,
    state: &AppState,
) -> AppResult<Group> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO groups(name, parent_id, icon, sort_order) VALUES(?1,?2,?3,?4)",
        rusqlite::params![name, parent_id, icon, sort_order],
    )?;
    let id = db.last_insert_rowid();
    let group = db.query_row(
        "SELECT id, name, parent_id, icon, sort_order, created_at FROM groups WHERE id=?1",
        [id], |r| Ok(Group {
            id: r.get(0)?, name: r.get(1)?, parent_id: r.get(2)?,
            icon: r.get(3)?, sort_order: r.get(4)?, created_at: r.get(5)?,
        })
    )?;
    Ok(group)
}

pub fn update_group_inner(
    id: i64, name: &str, icon: Option<String>, sort_order: i64,
    state: &AppState,
) -> AppResult<Group> {
    let db = state.db.lock().unwrap();
    let rows = db.execute(
        "UPDATE groups SET name=?1, icon=?2, sort_order=?3 WHERE id=?4",
        rusqlite::params![name, icon, sort_order, id],
    )?;
    if rows == 0 { return Err(AppError::NotFound); }
    let group = db.query_row(
        "SELECT id, name, parent_id, icon, sort_order, created_at FROM groups WHERE id=?1",
        [id], |r| Ok(Group {
            id: r.get(0)?, name: r.get(1)?, parent_id: r.get(2)?,
            icon: r.get(3)?, sort_order: r.get(4)?, created_at: r.get(5)?,
        })
    )?;
    Ok(group)
}

pub fn delete_group_inner(id: i64, state: &AppState) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    // Move child groups to ungrouped
    db.execute("UPDATE groups SET parent_id=NULL WHERE parent_id=?1", [id])?;
    // Move entries to ungrouped
    db.execute("UPDATE entries SET group_id=NULL WHERE group_id=?1", [id])?;
    let rows = db.execute("DELETE FROM groups WHERE id=?1", [id])?;
    if rows == 0 { return Err(AppError::NotFound); }
    Ok(())
}

#[tauri::command]
pub async fn list_groups(state: State<'_, AppState>) -> Result<Vec<Group>, AppError> {
    list_groups_inner(&state)
}

#[tauri::command]
pub async fn create_group(
    name: String, parent_id: Option<i64>, icon: Option<String>, sort_order: i64,
    state: State<'_, AppState>,
) -> Result<Group, AppError> {
    create_group_inner(&name, parent_id, icon, sort_order, &state)
}

#[tauri::command]
pub async fn update_group(
    id: i64, name: String, icon: Option<String>, sort_order: i64,
    state: State<'_, AppState>,
) -> Result<Group, AppError> {
    update_group_inner(id, &name, icon, sort_order, &state)
}

#[tauri::command]
pub async fn delete_group(id: i64, state: State<'_, AppState>) -> Result<(), AppError> {
    delete_group_inner(id, &state)
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
    fn create_and_list_group() {
        let state = make_state();
        let group = create_group_inner("Work", None, None, 0, &state).unwrap();
        assert_eq!(group.name, "Work");
        let groups = list_groups_inner(&state).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].id, group.id);
    }

    #[test]
    fn delete_group_moves_entries_to_ungrouped() {
        let state = make_state();
        let group = create_group_inner("ToDelete", None, None, 0, &state).unwrap();
        state.db.lock().unwrap().execute(
            "INSERT INTO entries(group_id, title, template_type, tags) VALUES(?1,'e1','password','[]')",
            [group.id],
        ).unwrap();
        delete_group_inner(group.id, &state).unwrap();
        let count: i64 = state.db.lock().unwrap().query_row(
            "SELECT COUNT(*) FROM entries WHERE group_id IS NULL", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(count, 1);
    }
}
