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

pub fn list_entries_inner(
    group_id: Option<i64>, search: Option<String>,
    _tags: Option<String>, favorite: bool, state: &AppState,
) -> AppResult<Vec<Entry>> {
    let db = state.db.lock().unwrap();
    let mut sql = "SELECT id, group_id, title, url, site_title, username, \
        template_type, tags, notes, favorite, created_at, updated_at \
        FROM entries WHERE 1=1".to_string();
    let mut params: Vec<rusqlite::types::Value> = vec![];
    if let Some(gid) = group_id {
        sql.push_str(" AND group_id=?");
        params.push(rusqlite::types::Value::Integer(gid));
    }
    if favorite { sql.push_str(" AND favorite=1"); }
    if let Some(s) = search {
        sql.push_str(" AND (title LIKE ? OR username LIKE ? OR url LIKE ? OR tags LIKE ?)");
        let pat = format!("%{}%", s);
        params.push(rusqlite::types::Value::Text(pat.clone()));
        params.push(rusqlite::types::Value::Text(pat.clone()));
        params.push(rusqlite::types::Value::Text(pat.clone()));
        params.push(rusqlite::types::Value::Text(pat));
    }
    sql.push_str(" ORDER BY updated_at DESC");
    let mut stmt = db.prepare(&sql)?;
    let entries = stmt.query_map(rusqlite::params_from_iter(params.iter()), |r| {
        Ok(Entry {
            id: r.get(0)?, group_id: r.get(1)?, title: r.get(2)?,
            url: r.get(3)?, site_title: r.get(4)?, username: r.get(5)?,
            template_type: r.get(6)?, tags: r.get(7)?, notes: r.get(8)?,
            favorite: r.get::<_, i64>(9)? != 0,
            created_at: r.get(10)?, updated_at: r.get(11)?,
        })
    })?.map(|r| r.unwrap()).collect();
    Ok(entries)
}

pub fn get_entry_inner(id: i64, state: &AppState) -> AppResult<EntryDetail> {
    let key = get_key(state)?;
    let db = state.db.lock().unwrap();
    let entry = db.query_row(
        "SELECT id, group_id, title, url, site_title, username, template_type, \
         tags, notes, favorite, created_at, updated_at FROM entries WHERE id=?1",
        [id], |r| Ok(Entry {
            id: r.get(0)?, group_id: r.get(1)?, title: r.get(2)?,
            url: r.get(3)?, site_title: r.get(4)?, username: r.get(5)?,
            template_type: r.get(6)?, tags: r.get(7)?, notes: r.get(8)?,
            favorite: r.get::<_, i64>(9)? != 0,
            created_at: r.get(10)?, updated_at: r.get(11)?,
        })
    ).map_err(|_| AppError::NotFound)?;

    let mut stmt = db.prepare(
        "SELECT id, field_name, field_type, field_value, nonce, sort_order \
         FROM entry_fields WHERE entry_id=?1 ORDER BY sort_order"
    )?;
    let fields: Vec<DecryptedField> = stmt.query_map([id], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, Vec<u8>>(3)?,
            r.get::<_, Option<Vec<u8>>>(4)?,
            r.get::<_, i64>(5)?,
        ))
    })?.map(|r| {
        let (fid, fname, ftype, value_bytes, nonce_opt, sort) = r.unwrap();
        let plaintext = if let Some(nonce_vec) = nonce_opt {
            let nonce: [u8; 12] = nonce_vec.try_into().unwrap_or([0u8; 12]);
            let decrypted = decrypt(&key, &value_bytes, &nonce).unwrap_or_default();
            String::from_utf8_lossy(&decrypted).into_owned()
        } else {
            String::from_utf8_lossy(&value_bytes).into_owned()
        };
        DecryptedField { id: fid, field_name: fname, field_type: ftype, plaintext, sort_order: sort }
    }).collect();
    Ok(EntryDetail { entry, fields })
}

pub fn create_entry_inner(
    group_id: Option<i64>, title: String, url: Option<String>,
    site_title: Option<String>, username: Option<String>,
    template_type: String, tags: String, notes: Option<String>,
    favorite: bool, fields: Vec<NewEntryField>, state: &AppState,
) -> AppResult<Entry> {
    let key = get_key(state)?;
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO entries(group_id,title,url,site_title,username,template_type,tags,notes,favorite) \
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        rusqlite::params![group_id, title, url, site_title, username,
            template_type, tags, notes, favorite as i64],
    )?;
    let entry_id = db.last_insert_rowid();
    for f in &fields {
        if is_encrypted_type(&f.field_type) {
            let (ct, nonce) = encrypt(&key, f.field_value.as_bytes())?;
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
    let entry = db.query_row(
        "SELECT id, group_id, title, url, site_title, username, template_type, \
         tags, notes, favorite, created_at, updated_at FROM entries WHERE id=?1",
        [entry_id], |r| Ok(Entry {
            id: r.get(0)?, group_id: r.get(1)?, title: r.get(2)?,
            url: r.get(3)?, site_title: r.get(4)?, username: r.get(5)?,
            template_type: r.get(6)?, tags: r.get(7)?, notes: r.get(8)?,
            favorite: r.get::<_, i64>(9)? != 0,
            created_at: r.get(10)?, updated_at: r.get(11)?,
        })
    )?;
    Ok(entry)
}

pub fn update_entry_inner(
    id: i64, group_id: Option<i64>, title: String, url: Option<String>,
    site_title: Option<String>, username: Option<String>,
    template_type: String, tags: String, notes: Option<String>,
    favorite: bool, fields: Vec<NewEntryField>, state: &AppState,
) -> AppResult<Entry> {
    let key = get_key(state)?;
    let db = state.db.lock().unwrap();
    let rows = db.execute(
        "UPDATE entries SET group_id=?1,title=?2,url=?3,site_title=?4,username=?5,\
         template_type=?6,tags=?7,notes=?8,favorite=?9,updated_at=datetime('now') WHERE id=?10",
        rusqlite::params![group_id, title, url, site_title, username,
            template_type, tags, notes, favorite as i64, id],
    )?;
    if rows == 0 { return Err(AppError::NotFound); }
    db.execute("DELETE FROM entry_fields WHERE entry_id=?1", [id])?;
    for f in &fields {
        if is_encrypted_type(&f.field_type) {
            let (ct, nonce) = encrypt(&key, f.field_value.as_bytes())?;
            db.execute(
                "INSERT INTO entry_fields(entry_id,field_name,field_type,field_value,nonce,sort_order) \
                 VALUES(?1,?2,?3,?4,?5,?6)",
                rusqlite::params![id, f.field_name, f.field_type, ct, nonce.to_vec(), f.sort_order],
            )?;
        } else {
            db.execute(
                "INSERT INTO entry_fields(entry_id,field_name,field_type,field_value,nonce,sort_order) \
                 VALUES(?1,?2,?3,?4,NULL,?5)",
                rusqlite::params![id, f.field_name, f.field_type, f.field_value.as_bytes().to_vec(), f.sort_order],
            )?;
        }
    }
    let entry = db.query_row(
        "SELECT id, group_id, title, url, site_title, username, template_type, \
         tags, notes, favorite, created_at, updated_at FROM entries WHERE id=?1",
        [id], |r| Ok(Entry {
            id: r.get(0)?, group_id: r.get(1)?, title: r.get(2)?,
            url: r.get(3)?, site_title: r.get(4)?, username: r.get(5)?,
            template_type: r.get(6)?, tags: r.get(7)?, notes: r.get(8)?,
            favorite: r.get::<_, i64>(9)? != 0,
            created_at: r.get(10)?, updated_at: r.get(11)?,
        })
    )?;
    Ok(entry)
}

#[tauri::command]
pub async fn list_entries(
    group_id: Option<i64>, search: Option<String>,
    tags: Option<String>, favorite: Option<bool>,
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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::state::{AppState, MasterKey};
    use crate::db::init_db;

    fn make_unlocked_state() -> AppState {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let state = AppState::new(conn);
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
            None, None, "password".into(), "[]".into(), None, false,
            fields, &state,
        ).unwrap();
        let detail = get_entry_inner(entry.id, &state).unwrap();
        assert_eq!(detail.entry.title, "GitHub");
        assert_eq!(detail.fields.len(), 1);
        assert_eq!(detail.fields[0].field_name, "password");
        assert_eq!(detail.fields[0].field_type, "password");
        assert_eq!(detail.fields[0].plaintext, "s3cr3t");
    }

    #[test]
    fn plaintext_field_stored_without_nonce() {
        let state = make_unlocked_state();
        let fields = vec![
            NewEntryField { field_name: "password".into(), field_type: "password".into(), field_value: "s3cr3t".into(), sort_order: 0 },
            NewEntryField { field_name: "website".into(), field_type: "url".into(), field_value: "https://example.com".into(), sort_order: 1 },
        ];
        let entry = create_entry_inner(
            None, "Test".into(), None, None, None,
            "login".into(), "".into(), None, false, fields, &state,
        ).unwrap();
        let detail = get_entry_inner(entry.id, &state).unwrap();
        assert_eq!(detail.fields.len(), 2);
        let url_field = detail.fields.iter().find(|f| f.field_name == "website").unwrap();
        assert_eq!(url_field.field_type, "url");
        assert_eq!(url_field.plaintext, "https://example.com");
        let pw_field = detail.fields.iter().find(|f| f.field_name == "password").unwrap();
        assert_eq!(pw_field.field_type, "password");
        assert_eq!(pw_field.plaintext, "s3cr3t");
        let raw_nonce: Option<Vec<u8>> = state.db.lock().unwrap().query_row(
            "SELECT nonce FROM entry_fields WHERE field_name='website'",
            [], |r| r.get(0),
        ).unwrap();
        assert!(raw_nonce.is_none(), "url field should not have a nonce");
    }

    #[test]
    fn list_entries_filter_by_group() {
        let state = make_unlocked_state();
        // Create a group first so the FK constraint is satisfied
        state.db.lock().unwrap().execute(
            "INSERT INTO groups(id, name, sort_order) VALUES(1, 'TestGroup', 0)",
            [],
        ).unwrap();
        create_entry_inner(Some(1), "Entry A".into(), None, None, None,
            "password".into(), "[]".into(), None, false, vec![], &state).unwrap();
        create_entry_inner(None, "Entry B".into(), None, None, None,
            "password".into(), "[]".into(), None, false, vec![], &state).unwrap();
        let all = list_entries_inner(None, None, None, false, &state).unwrap();
        assert_eq!(all.len(), 2);
        let grouped = list_entries_inner(Some(1), None, None, false, &state).unwrap();
        assert_eq!(grouped.len(), 1);
    }
}
