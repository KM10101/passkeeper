use tauri::State;
use serde::{Deserialize, Serialize};
use crate::db::models::{Group, Entry, EntryField};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::crypto::{derive_key, encrypt, decrypt};
use rand::rngs::OsRng;
use rand::RngCore;

const MAGIC: &[u8; 4] = b"PKV1";
const VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct VaultPayload {
    groups: Vec<Group>,
    entries: Vec<Entry>,
    fields: Vec<EntryField>,
}

pub fn export_vault_inner(export_password: &str, state: &AppState) -> AppResult<Vec<u8>> {
    let db = state.db.lock().unwrap();

    let groups: Vec<Group> = {
        let mut s = db.prepare("SELECT id,name,parent_id,icon,sort_order,is_pinned,created_at FROM groups")?;
        let x = s.query_map([], |r| Ok(Group {
            id: r.get(0)?, name: r.get(1)?, parent_id: r.get(2)?,
            icon: r.get(3)?, sort_order: r.get(4)?,
            is_pinned: r.get::<_, i64>(5)? != 0,
            created_at: r.get(6)?,
            entry_count: 0,
        }))?.map(|r| r.unwrap()).collect(); x
    };
    let entries: Vec<Entry> = {
        let mut s = db.prepare("SELECT id,group_id,title,url,site_title,username,template_type,tags,notes,favorite,pinned,sort_order,created_at,updated_at FROM entries")?;
        let x = s.query_map([], |r| Ok(Entry {
            id: r.get(0)?, group_id: r.get(1)?, title: r.get(2)?,
            url: r.get(3)?, site_title: r.get(4)?, username: r.get(5)?,
            template_type: r.get(6)?, tags: r.get(7)?, notes: r.get(8)?,
            favorite: r.get::<_, i64>(9)? != 0,
            pinned: r.get::<_, i64>(10)? != 0,
            sort_order: r.get(11)?,
            created_at: r.get(12)?, updated_at: r.get(13)?,
        }))?.map(|r| r.unwrap()).collect(); x
    };
    let fields: Vec<EntryField> = {
        let mut s = db.prepare("SELECT id,entry_id,field_name,field_type,field_value,nonce,sort_order FROM entry_fields")?;
        let x = s.query_map([], |r| Ok(EntryField {
            id: r.get(0)?, entry_id: r.get(1)?, field_name: r.get(2)?,
            field_type: r.get(3)?, field_value: r.get(4)?, nonce: r.get(5)?, sort_order: r.get(6)?,
        }))?.map(|r| r.unwrap()).collect(); x
    };

    let payload = serde_json::to_vec(&VaultPayload { groups, entries, fields })
        .map_err(|e| AppError::Other(e.to_string()))?;

    let mut salt = [0u8; 32];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key(export_password, &salt)?;
    let (ciphertext, nonce) = encrypt(&key, &payload)?;

    let mut out = Vec::new();
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&VERSION.to_le_bytes());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub fn import_vault_inner(data: &[u8], export_password: &str, state: &AppState) -> AppResult<()> {
    if data.len() < 52 { return Err(AppError::Crypto("file too short".into())); }
    if &data[0..4] != MAGIC { return Err(AppError::Crypto("invalid magic".into())); }

    let salt: [u8; 32] = data[8..40].try_into().unwrap();
    let nonce: [u8; 12] = data[40..52].try_into().unwrap();
    let ciphertext = &data[52..];

    let key = derive_key(export_password, &salt)?;
    let plaintext = decrypt(&key, ciphertext, &nonce)?;
    let payload: VaultPayload = serde_json::from_slice(&plaintext)
        .map_err(|e| AppError::Other(e.to_string()))?;

    let db = state.db.lock().unwrap();
    for g in &payload.groups {
        db.execute(
            "INSERT OR IGNORE INTO groups(id,name,parent_id,icon,sort_order,created_at) VALUES(?1,?2,?3,?4,?5,?6)",
            rusqlite::params![g.id, g.name, g.parent_id, g.icon, g.sort_order, g.created_at],
        )?;
    }
    for e in &payload.entries {
        db.execute(
            "INSERT OR IGNORE INTO entries(id,group_id,title,url,site_title,username,template_type,tags,notes,favorite,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            rusqlite::params![e.id, e.group_id, e.title, e.url, e.site_title, e.username,
                e.template_type, e.tags, e.notes, e.favorite as i64, e.created_at, e.updated_at],
        )?;
    }
    for f in &payload.fields {
        db.execute(
            "INSERT OR IGNORE INTO entry_fields(id,entry_id,field_name,field_type,field_value,nonce,sort_order) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![f.id, f.entry_id, f.field_name, f.field_type, f.field_value, f.nonce, f.sort_order],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub async fn export_vault(
    export_password: String, state: State<'_, AppState>,
) -> Result<Vec<u8>, AppError> {
    export_vault_inner(&export_password, &state)
}

#[tauri::command]
pub async fn import_vault(
    data: Vec<u8>, export_password: String, state: State<'_, AppState>,
) -> Result<(), AppError> {
    import_vault_inner(&data, &export_password, &state)
}

#[tauri::command]
pub async fn export_vault_to_path(
    path: String, export_password: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let bytes = export_vault_inner(&export_password, &state)?;
    std::fs::write(&path, &bytes)?;
    Ok(())
}

#[tauri::command]
pub async fn import_vault_from_path(
    path: String, export_password: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let bytes = std::fs::read(&path)?;
    import_vault_inner(&bytes, &export_password, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::state::{AppState, MasterKey};
    use crate::db::init_db;
    use crate::commands::entries::{create_entry_inner, NewEntryField};

    fn make_unlocked_state() -> AppState {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let state = AppState::new(conn, std::path::PathBuf::new());
        *state.master_key.lock().unwrap() = Some(MasterKey([9u8; 32]));
        state
    }

    #[test]
    fn export_import_with_field_type() {
        let state = make_unlocked_state();
        let fields = vec![
            NewEntryField { field_name: "password".into(), field_type: "password".into(), field_value: "vault_pass".into(), sort_order: 0 },
            NewEntryField { field_name: "note".into(), field_type: "text".into(), field_value: "plain note".into(), sort_order: 1 },
        ];
        create_entry_inner(None, "VaultEntry".into(), None, None, None,
            "login".into(), "".into(), None, false, fields, &state).unwrap();

        let export_bytes = export_vault_inner("export_pw", &state).unwrap();

        let conn2 = Connection::open_in_memory().unwrap();
        init_db(&conn2).unwrap();
        let state2 = AppState::new(conn2, std::path::PathBuf::new());
        *state2.master_key.lock().unwrap() = Some(MasterKey([9u8; 32]));
        import_vault_inner(&export_bytes, "export_pw", &state2).unwrap();

        let count: i64 = state2.db.lock().unwrap().query_row(
            "SELECT COUNT(*) FROM entries", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(count, 1);
        let field_count: i64 = state2.db.lock().unwrap().query_row(
            "SELECT COUNT(*) FROM entry_fields", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(field_count, 2);
    }

    #[test]
    fn export_import_roundtrip() {
        let state = make_unlocked_state();
        let fields = vec![
            NewEntryField { field_name: "password".into(), field_type: "password".into(), field_value: "vault_pass".into(), sort_order: 0 },
        ];
        create_entry_inner(None, "VaultEntry".into(), None, None, None,
            "password".into(), "[]".into(), None, false, fields, &state).unwrap();

        let export_bytes = export_vault_inner("export_pw", &state).unwrap();
        assert!(export_bytes.len() > 52);

        let conn2 = Connection::open_in_memory().unwrap();
        init_db(&conn2).unwrap();
        let state2 = AppState::new(conn2, std::path::PathBuf::new());
        *state2.master_key.lock().unwrap() = Some(MasterKey([9u8; 32]));
        import_vault_inner(&export_bytes, "export_pw", &state2).unwrap();

        let count: i64 = state2.db.lock().unwrap().query_row(
            "SELECT COUNT(*) FROM entries", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(count, 1);
    }
}
