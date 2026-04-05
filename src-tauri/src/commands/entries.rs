use tauri::State;
use serde::{Deserialize, Serialize};
use crate::db::models::Entry;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::crypto::{encrypt, decrypt};

#[derive(Debug, Serialize, Deserialize)]
pub struct NewEntryField {
    pub field_name: String,
    pub field_type: String,
    pub field_value: String,
    pub sort_order: i64,
}

#[derive(Debug, Serialize)]
pub struct DecryptedField {
    pub id: i64,
    pub field_name: String,
    pub field_type: String,
    pub plaintext: String,
    pub sort_order: i64,
}

#[derive(Debug, Serialize)]
pub struct EntryDetail {
    pub entry: Entry,
    pub fields: Vec<DecryptedField>,
}

fn is_encrypted_type(field_type: &str) -> bool {
    matches!(field_type, "password" | "secret" | "token")
}

fn get_key(state: &AppState) -> AppResult<[u8; 32]> {
    state.master_key.lock().unwrap()
        .as_ref().map(|k| k.0).ok_or(AppError::Locked)
}

/// Map a rusqlite row (columns 0..13) to Entry.
/// Column order: id, group_id, title, url, site_title, username,
///   template_type, tags, notes, favorite, pinned, sort_order, created_at, updated_at
fn map_entry_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    Ok(Entry {
        id: r.get(0)?,
        group_id: r.get(1)?,
        title: r.get(2)?,
        url: r.get(3)?,
        site_title: r.get(4)?,
        username: r.get(5)?,
        template_type: r.get(6)?,
        tags: r.get(7)?,
        notes: r.get(8)?,
        favorite: r.get::<_, i64>(9)? != 0,
        pinned: r.get::<_, i64>(10)? != 0,
        sort_order: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
    })
}

const ENTRY_SELECT: &str =
    "SELECT id, group_id, title, url, site_title, username, \
     template_type, tags, notes, favorite, pinned, sort_order, created_at, updated_at \
     FROM entries";

/// Sync derived columns (username, url, notes) from fields list.
fn sync_metadata(
    db: &rusqlite::Connection,
    entry_id: i64,
    fields: &[NewEntryField],
) -> AppResult<()> {
    let username = fields.iter()
        .find(|f| f.field_name == "username")
        .or_else(|| fields.iter().find(|f| f.field_type == "email"))
        .map(|f| f.field_value.clone());

    let url = fields.iter()
        .find(|f| f.field_type == "url")
        .map(|f| f.field_value.clone());

    let notes = fields.iter()
        .find(|f| f.field_name == "notes")
        .map(|f| f.field_value.clone());

    db.execute(
        "UPDATE entries SET username=?1, url=?2, notes=?3 WHERE id=?4",
        rusqlite::params![username, url, notes, entry_id],
    )?;
    Ok(())
}

pub fn list_entries_inner(
    group_id: Option<i64>,
    search: Option<String>,
    _tags: Option<String>,
    favorite: bool,
    state: &AppState,
) -> AppResult<Vec<Entry>> {
    let db = state.db.lock().unwrap();
    let mut sql = format!("{} WHERE 1=1", ENTRY_SELECT);
    let mut params: Vec<rusqlite::types::Value> = vec![];

    if let Some(gid) = group_id {
        sql.push_str(" AND group_id=?");
        params.push(rusqlite::types::Value::Integer(gid));
    }
    if favorite {
        sql.push_str(" AND favorite=1");
    }
    if let Some(s) = search {
        sql.push_str(" AND (title LIKE ? OR username LIKE ? OR url LIKE ? OR tags LIKE ?)");
        let pat = format!("%{}%", s);
        params.push(rusqlite::types::Value::Text(pat.clone()));
        params.push(rusqlite::types::Value::Text(pat.clone()));
        params.push(rusqlite::types::Value::Text(pat.clone()));
        params.push(rusqlite::types::Value::Text(pat));
    }
    sql.push_str(" ORDER BY pinned DESC, sort_order ASC, updated_at DESC");

    let mut stmt = db.prepare(&sql)?;
    let entries = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), map_entry_row)?
        .map(|r| r.unwrap())
        .collect();
    Ok(entries)
}

pub fn get_entry_inner(id: i64, state: &AppState) -> AppResult<EntryDetail> {
    let key = get_key(state)?;
    let db = state.db.lock().unwrap();
    let entry = db.query_row(
        &format!("{} WHERE id=?1", ENTRY_SELECT),
        [id],
        map_entry_row,
    ).map_err(|_| AppError::NotFound)?;

    let mut stmt = db.prepare(
        "SELECT id, field_name, field_type, field_value, nonce, sort_order \
         FROM entry_fields WHERE entry_id=?1 ORDER BY sort_order",
    )?;
    let fields: Vec<DecryptedField> = stmt
        .query_map([id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Vec<u8>>(3)?,
                r.get::<_, Option<Vec<u8>>>(4)?,
                r.get::<_, i64>(5)?,
            ))
        })?
        .map(|r| {
            let (fid, fname, ftype, value_bytes, nonce_opt, sort) = r.unwrap();
            let plaintext = if let Some(nonce_vec) = nonce_opt {
                let nonce: [u8; 12] = nonce_vec.try_into().unwrap_or([0u8; 12]);
                let decrypted = decrypt(&key, &value_bytes, &nonce).unwrap_or_default();
                String::from_utf8_lossy(&decrypted).into_owned()
            } else {
                String::from_utf8_lossy(&value_bytes).into_owned()
            };
            DecryptedField { id: fid, field_name: fname, field_type: ftype, plaintext, sort_order: sort }
        })
        .collect();

    Ok(EntryDetail { entry, fields })
}

fn insert_fields(
    db: &rusqlite::Connection,
    entry_id: i64,
    key: &[u8; 32],
    fields: &[NewEntryField],
) -> AppResult<()> {
    for f in fields {
        if is_encrypted_type(&f.field_type) {
            let (ct, nonce) = encrypt(key, f.field_value.as_bytes())?;
            db.execute(
                "INSERT INTO entry_fields(entry_id,field_name,field_type,field_value,nonce,sort_order) \
                 VALUES(?1,?2,?3,?4,?5,?6)",
                rusqlite::params![entry_id, f.field_name, f.field_type, ct, nonce.to_vec(), f.sort_order],
            )?;
        } else {
            db.execute(
                "INSERT INTO entry_fields(entry_id,field_name,field_type,field_value,nonce,sort_order) \
                 VALUES(?1,?2,?3,?4,NULL,?5)",
                rusqlite::params![entry_id, f.field_name, f.field_type, f.field_value.as_bytes().to_vec(), f.sort_order],
            )?;
        }
    }
    Ok(())
}

pub fn create_entry_inner(
    group_id: Option<i64>,
    title: String,
    url: Option<String>,
    site_title: Option<String>,
    username: Option<String>,
    template_type: String,
    tags: String,
    notes: Option<String>,
    favorite: bool,
    fields: Vec<NewEntryField>,
    state: &AppState,
) -> AppResult<Entry> {
    let key = get_key(state)?;
    let db = state.db.lock().unwrap();

    // Title uniqueness check
    let exists: bool = db.query_row(
        "SELECT COUNT(*) FROM entries WHERE group_id IS ?1 AND title=?2",
        rusqlite::params![group_id, title],
        |r| r.get::<_, i64>(0),
    )? > 0;
    if exists { return Err(AppError::DuplicateTitle); }

    // Compute next sort_order for non-pinned entries in this group
    let next_sort: i64 = db.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM entries WHERE group_id IS ?1 AND pinned=0",
        rusqlite::params![group_id],
        |r| r.get(0),
    ).unwrap_or(0);

    db.execute(
        "INSERT INTO entries(group_id,title,url,site_title,username,template_type,tags,notes,favorite,pinned,sort_order) \
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10)",
        rusqlite::params![group_id, title, url, site_title, username,
            "custom", tags, notes, favorite as i64, next_sort],
    )?;
    let entry_id = db.last_insert_rowid();

    insert_fields(&db, entry_id, &key, &fields)?;
    sync_metadata(&db, entry_id, &fields)?;

    let entry = db.query_row(
        &format!("{} WHERE id=?1", ENTRY_SELECT),
        [entry_id],
        map_entry_row,
    )?;
    Ok(entry)
}

pub fn update_entry_inner(
    id: i64,
    group_id: Option<i64>,
    title: String,
    url: Option<String>,
    site_title: Option<String>,
    username: Option<String>,
    template_type: String,
    tags: String,
    notes: Option<String>,
    favorite: bool,
    fields: Vec<NewEntryField>,
    state: &AppState,
) -> AppResult<Entry> {
    let key = get_key(state)?;
    let db = state.db.lock().unwrap();

    // Title uniqueness check (exclude self)
    let exists: bool = db.query_row(
        "SELECT COUNT(*) FROM entries WHERE group_id IS ?1 AND title=?2 AND id!=?3",
        rusqlite::params![group_id, title, id],
        |r| r.get::<_, i64>(0),
    )? > 0;
    if exists { return Err(AppError::DuplicateTitle); }

    let rows = db.execute(
        "UPDATE entries SET group_id=?1,title=?2,url=?3,site_title=?4,username=?5,\
         template_type='custom',tags=?6,notes=?7,favorite=?8,updated_at=datetime('now') WHERE id=?9",
        rusqlite::params![group_id, title, url, site_title, username,
            tags, notes, favorite as i64, id],
    )?;
    if rows == 0 { return Err(AppError::NotFound); }

    db.execute("DELETE FROM entry_fields WHERE entry_id=?1", [id])?;
    insert_fields(&db, id, &key, &fields)?;
    sync_metadata(&db, id, &fields)?;

    let entry = db.query_row(
        &format!("{} WHERE id=?1", ENTRY_SELECT),
        [id],
        map_entry_row,
    )?;
    Ok(entry)
}

pub fn pin_entry_inner(id: i64, pinned: bool, state: &AppState) -> AppResult<Entry> {
    let db = state.db.lock().unwrap();

    // Compute next sort_order in target section
    let next_sort: i64 = db.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM entries WHERE pinned=?1",
        [pinned as i64],
        |r| r.get(0),
    ).unwrap_or(0);

    let rows = db.execute(
        "UPDATE entries SET pinned=?1, sort_order=?2, updated_at=datetime('now') WHERE id=?3",
        rusqlite::params![pinned as i64, next_sort, id],
    )?;
    if rows == 0 { return Err(AppError::NotFound); }

    let entry = db.query_row(
        &format!("{} WHERE id=?1", ENTRY_SELECT),
        [id],
        map_entry_row,
    ).map_err(|_| AppError::NotFound)?;
    Ok(entry)
}

pub fn reorder_entries_inner(
    ids: Vec<i64>,
    pinned: bool,
    state: &AppState,
) -> AppResult<()> {
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction()?;
    for (idx, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE entries SET sort_order=?1 WHERE id=?2 AND pinned=?3",
            rusqlite::params![idx as i64, id, pinned as i64],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub async fn list_entries(
    group_id: Option<i64>,
    search: Option<String>,
    tags: Option<String>,
    favorite: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<Entry>, AppError> {
    list_entries_inner(group_id, search, tags, favorite.unwrap_or(false), &state)
}

#[tauri::command]
pub async fn get_entry(id: i64, state: State<'_, AppState>) -> Result<EntryDetail, AppError> {
    get_entry_inner(id, &state)
}

#[tauri::command]
pub async fn create_entry(
    group_id: Option<i64>, title: String, url: Option<String>,
    site_title: Option<String>, username: Option<String>,
    template_type: String, tags: String, notes: Option<String>,
    favorite: bool, fields: Vec<NewEntryField>,
    state: State<'_, AppState>,
) -> Result<Entry, AppError> {
    create_entry_inner(group_id, title, url, site_title, username,
        template_type, tags, notes, favorite, fields, &state)
}

#[tauri::command]
pub async fn update_entry(
    id: i64, group_id: Option<i64>, title: String, url: Option<String>,
    site_title: Option<String>, username: Option<String>,
    template_type: String, tags: String, notes: Option<String>,
    favorite: bool, fields: Vec<NewEntryField>,
    state: State<'_, AppState>,
) -> Result<Entry, AppError> {
    update_entry_inner(id, group_id, title, url, site_title, username,
        template_type, tags, notes, favorite, fields, &state)
}

#[tauri::command]
pub async fn delete_entry(id: i64, state: State<'_, AppState>) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    let rows = db.execute("DELETE FROM entries WHERE id=?1", [id])?;
    if rows == 0 { return Err(AppError::NotFound); }
    Ok(())
}

#[tauri::command]
pub async fn pin_entry(
    id: i64, pinned: bool, state: State<'_, AppState>,
) -> Result<Entry, AppError> {
    pin_entry_inner(id, pinned, &state)
}

#[tauri::command]
pub async fn reorder_entries(
    ids: Vec<i64>, pinned: bool, state: State<'_, AppState>,
) -> Result<(), AppError> {
    reorder_entries_inner(ids, pinned, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::state::{AppState, MasterKey};
    use crate::db::init_db;

    fn make_unlocked_state() -> AppState {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let state = AppState::new(conn, std::path::PathBuf::new());
        *state.master_key.lock().unwrap() = Some(MasterKey([7u8; 32]));
        state
    }

    #[test]
    fn create_and_get_entry_decrypts_fields() {
        let state = make_unlocked_state();
        let fields = vec![
            NewEntryField { field_name: "password".into(), field_type: "password".into(), field_value: "s3cr3t".into(), sort_order: 0 },
        ];
        let entry = create_entry_inner(
            None, "GitHub".into(), Some("https://github.com".into()),
            None, None, "custom".into(), "[]".into(), None, false, fields, &state,
        ).unwrap();
        let detail = get_entry_inner(entry.id, &state).unwrap();
        assert_eq!(detail.entry.title, "GitHub");
        assert_eq!(detail.fields[0].plaintext, "s3cr3t");
    }

    #[test]
    fn duplicate_title_in_same_group_returns_error() {
        let state = make_unlocked_state();
        create_entry_inner(None, "MyEntry".into(), None, None, None,
            "custom".into(), "[]".into(), None, false, vec![], &state).unwrap();
        let result = create_entry_inner(None, "MyEntry".into(), None, None, None,
            "custom".into(), "[]".into(), None, false, vec![], &state);
        assert!(matches!(result, Err(AppError::DuplicateTitle)));
    }

    #[test]
    fn same_title_different_groups_is_allowed() {
        let state = make_unlocked_state();
        state.db.lock().unwrap().execute(
            "INSERT INTO groups(id, name, sort_order) VALUES(1, 'G1', 0), (2, 'G2', 0)", [],
        ).unwrap();
        create_entry_inner(Some(1), "Entry".into(), None, None, None,
            "custom".into(), "[]".into(), None, false, vec![], &state).unwrap();
        let result = create_entry_inner(Some(2), "Entry".into(), None, None, None,
            "custom".into(), "[]".into(), None, false, vec![], &state);
        assert!(result.is_ok());
    }

    #[test]
    fn pin_entry_moves_to_pinned_section() {
        let state = make_unlocked_state();
        let entry = create_entry_inner(None, "Test".into(), None, None, None,
            "custom".into(), "[]".into(), None, false, vec![], &state).unwrap();
        assert!(!entry.pinned);
        let pinned = pin_entry_inner(entry.id, true, &state).unwrap();
        assert!(pinned.pinned);
    }

    #[test]
    fn reorder_entries_updates_sort_order() {
        let state = make_unlocked_state();
        let a = create_entry_inner(None, "A".into(), None, None, None,
            "custom".into(), "[]".into(), None, false, vec![], &state).unwrap();
        let b = create_entry_inner(None, "B".into(), None, None, None,
            "custom".into(), "[]".into(), None, false, vec![], &state).unwrap();
        reorder_entries_inner(vec![b.id, a.id], false, &state).unwrap();
        let entries = list_entries_inner(None, None, None, false, &state).unwrap();
        assert_eq!(entries[0].id, b.id);
        assert_eq!(entries[1].id, a.id);
    }

    #[test]
    fn field_sync_sets_username_and_url() {
        let state = make_unlocked_state();
        let fields = vec![
            NewEntryField { field_name: "username".into(), field_type: "text".into(), field_value: "alice".into(), sort_order: 0 },
            NewEntryField { field_name: "url".into(), field_type: "url".into(), field_value: "https://example.com".into(), sort_order: 1 },
        ];
        let entry = create_entry_inner(None, "SyncTest".into(), None, None, None,
            "custom".into(), "[]".into(), None, false, fields, &state).unwrap();
        assert_eq!(entry.username.as_deref(), Some("alice"));
        assert_eq!(entry.url.as_deref(), Some("https://example.com"));
    }
}
