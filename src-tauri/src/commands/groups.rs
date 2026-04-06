use tauri::State;
use crate::db::models::Group;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

fn query_group(db: &rusqlite::Connection, id: i64) -> rusqlite::Result<Group> {
    db.query_row(
        "SELECT g.id, g.name, g.parent_id, g.icon, g.sort_order, g.is_pinned, g.created_at,
                COUNT(e.id) as entry_count
         FROM groups g
         LEFT JOIN entries e ON e.group_id = g.id
         WHERE g.id = ?1",
        [id],
        |r| Ok(Group {
            id: r.get(0)?, name: r.get(1)?, parent_id: r.get(2)?,
            icon: r.get(3)?, sort_order: r.get(4)?,
            is_pinned: r.get::<_, i64>(5)? != 0,
            created_at: r.get(6)?,
            entry_count: r.get(7)?,
        }),
    )
}

pub fn list_groups_inner(state: &AppState) -> AppResult<Vec<Group>> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT g.id, g.name, g.parent_id, g.icon, g.sort_order, g.is_pinned, g.created_at,
                COUNT(e.id) as entry_count
         FROM groups g
         LEFT JOIN entries e ON e.group_id = g.id
         GROUP BY g.id
         ORDER BY g.is_pinned DESC, g.sort_order ASC, g.name ASC",
    )?;
    let groups = stmt.query_map([], |r| Ok(Group {
        id: r.get(0)?, name: r.get(1)?, parent_id: r.get(2)?,
        icon: r.get(3)?, sort_order: r.get(4)?,
        is_pinned: r.get::<_, i64>(5)? != 0,
        created_at: r.get(6)?,
        entry_count: r.get(7)?,
    }))?.collect::<rusqlite::Result<Vec<_>>>()?;
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
    Ok(query_group(&db, id)?)
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
    Ok(query_group(&db, id)?)
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

#[derive(serde::Deserialize)]
pub struct GroupOrderItem {
    pub id: i64,
    pub sort_order: i64,
}

pub fn toggle_group_pin_inner(id: i64, state: &AppState) -> AppResult<Group> {
    let db = state.db.lock().unwrap();
    let rows = db.execute(
        "UPDATE groups SET is_pinned = CASE WHEN is_pinned=1 THEN 0 ELSE 1 END WHERE id=?1",
        [id],
    )?;
    if rows == 0 { return Err(AppError::NotFound); }
    Ok(query_group(&db, id)?)
}

pub fn reorder_groups_inner(items: Vec<GroupOrderItem>, state: &AppState) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.execute_batch("BEGIN")?;
    for item in &items {
        db.execute(
            "UPDATE groups SET sort_order=?1 WHERE id=?2",
            rusqlite::params![item.sort_order, item.id],
        )?;
    }
    db.execute_batch("COMMIT")?;
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

#[tauri::command]
pub async fn toggle_group_pin(id: i64, state: State<'_, AppState>) -> Result<Group, AppError> {
    toggle_group_pin_inner(id, &state)
}

#[tauri::command]
pub async fn reorder_groups(items: Vec<GroupOrderItem>, state: State<'_, AppState>) -> Result<(), AppError> {
    reorder_groups_inner(items, &state)
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
    fn create_and_list_group() {
        let state = make_state();
        let group = create_group_inner("Work", None, None, 0, &state).unwrap();
        assert_eq!(group.name, "Work");
        assert_eq!(group.entry_count, 0);
        let groups = list_groups_inner(&state).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].id, group.id);
        assert_eq!(groups[0].entry_count, 0);
    }

    #[test]
    fn list_groups_counts_entries() {
        let state = make_state();
        let g = create_group_inner("Dev", None, None, 0, &state).unwrap();
        state.db.lock().unwrap().execute(
            "INSERT INTO entries(group_id, title, template_type, tags) VALUES(?1,'e1','custom','[]')",
            [g.id],
        ).unwrap();
        state.db.lock().unwrap().execute(
            "INSERT INTO entries(group_id, title, template_type, tags) VALUES(?1,'e2','custom','[]')",
            [g.id],
        ).unwrap();
        let groups = list_groups_inner(&state).unwrap();
        assert_eq!(groups[0].entry_count, 2);
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

    #[test]
    fn toggle_group_pin_works() {
        let state = make_state();
        let g = create_group_inner("Work", None, None, 0, &state).unwrap();
        assert!(!g.is_pinned);
        let pinned = toggle_group_pin_inner(g.id, &state).unwrap();
        assert!(pinned.is_pinned);
        let unpinned = toggle_group_pin_inner(g.id, &state).unwrap();
        assert!(!unpinned.is_pinned);
    }

    #[test]
    fn reorder_groups_updates_sort_order() {
        let state = make_state();
        let a = create_group_inner("A", None, None, 0, &state).unwrap();
        let b = create_group_inner("B", None, None, 1, &state).unwrap();
        let items = vec![GroupOrderItem { id: a.id, sort_order: 5 }, GroupOrderItem { id: b.id, sort_order: 2 }];
        reorder_groups_inner(items, &state).unwrap();
        let groups = list_groups_inner(&state).unwrap();
        let a_updated = groups.iter().find(|g| g.id == a.id).unwrap();
        assert_eq!(a_updated.sort_order, 5);
    }

    #[test]
    fn list_groups_pinned_sort_order() {
        let state = make_state();
        let a = create_group_inner("A", None, None, 0, &state).unwrap();
        let b = create_group_inner("B", None, None, 1, &state).unwrap();
        toggle_group_pin_inner(b.id, &state).unwrap(); // pin B
        let groups = list_groups_inner(&state).unwrap();
        assert_eq!(groups[0].id, b.id); // pinned first
        assert_eq!(groups[1].id, a.id);
    }
}
