use tauri::State;
use crate::error::{AppError, AppResult};
use crate::state::{AppState, MasterKey};
use crate::crypto::{derive_key, encrypt, decrypt};
use rand::rngs::OsRng;
use rand::RngCore;
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};

const VERIFY_PLAINTEXT: &[u8] = b"PASSKEEPER_VERIFY";

pub fn unlock_inner(password: &str, state: &AppState) -> AppResult<()> {
    let db = state.db.lock().unwrap();

    let salt_b64: Option<String> = db.query_row(
        "SELECT value FROM app_config WHERE key = 'master_salt'",
        [], |r| r.get(0)
    ).ok();

    if let Some(salt_b64) = salt_b64 {
        // Vault exists — verify password
        let salt = B64.decode(&salt_b64).map_err(|e| AppError::Crypto(e.to_string()))?;
        let key = derive_key(password, &salt)?;

        let verify_b64: String = db.query_row(
            "SELECT value FROM app_config WHERE key = 'master_key_verify'",
            [], |r| r.get(0)
        ).map_err(|_| AppError::InvalidPassword)?;

        let verify_bytes = B64.decode(&verify_b64).map_err(|e| AppError::Crypto(e.to_string()))?;
        let nonce_b64: String = db.query_row(
            "SELECT value FROM app_config WHERE key = 'master_key_verify_nonce'",
            [], |r| r.get(0)
        ).map_err(|_| AppError::InvalidPassword)?;
        let nonce_bytes = B64.decode(&nonce_b64).map_err(|e| AppError::Crypto(e.to_string()))?;
        let nonce: [u8; 12] = nonce_bytes.try_into().map_err(|_| AppError::Crypto("bad nonce".into()))?;

        decrypt(&key, &verify_bytes, &nonce).map_err(|_| AppError::InvalidPassword)?;

        drop(db);
        *state.master_key.lock().unwrap() = Some(MasterKey(key));
    } else {
        // First unlock — initialize vault
        let mut salt = [0u8; 32];
        OsRng.fill_bytes(&mut salt);
        let key = derive_key(password, &salt)?;
        let (verify_ct, verify_nonce) = encrypt(&key, VERIFY_PLAINTEXT)?;

        db.execute("INSERT INTO app_config(key,value) VALUES('master_salt',?1)",
            [B64.encode(&salt)])?;
        db.execute("INSERT INTO app_config(key,value) VALUES('master_key_verify',?1)",
            [B64.encode(&verify_ct)])?;
        db.execute("INSERT INTO app_config(key,value) VALUES('master_key_verify_nonce',?1)",
            [B64.encode(&verify_nonce)])?;

        drop(db);
        *state.master_key.lock().unwrap() = Some(MasterKey(key));
    }

    state.touch();
    Ok(())
}

pub fn lock_inner(state: &AppState) {
    state.master_key.lock().unwrap().take();
}

#[tauri::command]
pub async fn unlock(password: String, state: State<'_, AppState>) -> Result<(), AppError> {
    unlock_inner(&password, &state)
}

#[tauri::command]
pub async fn lock(state: State<'_, AppState>) -> Result<(), AppError> {
    lock_inner(&state);
    Ok(())
}

#[tauri::command]
pub async fn is_locked(state: State<'_, AppState>) -> Result<bool, AppError> {
    Ok(state.master_key.lock().unwrap().is_none())
}

#[tauri::command]
pub async fn change_master_password(
    old_password: String,
    new_password: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    // Verify old password first
    unlock_inner(&old_password, &state)?;

    let db = state.db.lock().unwrap();
    let salt_b64: String = db.query_row(
        "SELECT value FROM app_config WHERE key = 'master_salt'", [], |r| r.get(0)
    )?;
    let old_salt = B64.decode(&salt_b64).map_err(|e| AppError::Crypto(e.to_string()))?;
    let old_key = derive_key(&old_password, &old_salt)?;

    // Generate new salt and key
    let mut new_salt = [0u8; 32];
    OsRng.fill_bytes(&mut new_salt);
    let new_key = derive_key(&new_password, &new_salt)?;

    // Re-encrypt all entry_fields
    let fields: Vec<(i64, Vec<u8>, Vec<u8>)> = {
        let mut stmt = db.prepare("SELECT id, field_value, nonce FROM entry_fields")?;
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap().map(|r| r.unwrap()).collect()
    };

    for (id, ct, nonce_vec) in fields {
        let nonce: [u8; 12] = nonce_vec.try_into().map_err(|_| AppError::Crypto("bad nonce".into()))?;
        let plaintext = decrypt(&old_key, &ct, &nonce)?;
        let (new_ct, new_nonce) = encrypt(&new_key, &plaintext)?;
        db.execute("UPDATE entry_fields SET field_value=?1, nonce=?2 WHERE id=?3",
            rusqlite::params![new_ct, new_nonce.to_vec(), id])?;
    }

    // Update config
    let (verify_ct, verify_nonce) = encrypt(&new_key, VERIFY_PLAINTEXT)?;
    db.execute("UPDATE app_config SET value=?1 WHERE key='master_salt'", [B64.encode(&new_salt)])?;
    db.execute("UPDATE app_config SET value=?1 WHERE key='master_key_verify'", [B64.encode(&verify_ct)])?;
    db.execute("UPDATE app_config SET value=?1 WHERE key='master_key_verify_nonce'", [B64.encode(&verify_nonce)])?;

    drop(db);
    *state.master_key.lock().unwrap() = Some(MasterKey(new_key));
    Ok(())
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
    fn first_unlock_initializes_vault() {
        let state = make_state();
        unlock_inner("master123", &state).unwrap();
        assert!(state.master_key.lock().unwrap().is_some());
    }

    #[test]
    fn unlock_wrong_password_returns_error() {
        let state = make_state();
        unlock_inner("correct", &state).unwrap();
        state.master_key.lock().unwrap().take();
        let result = unlock_inner("wrong", &state);
        assert!(matches!(result, Err(crate::error::AppError::InvalidPassword)));
    }

    #[test]
    fn lock_clears_master_key() {
        let state = make_state();
        unlock_inner("pass", &state).unwrap();
        lock_inner(&state);
        assert!(state.master_key.lock().unwrap().is_none());
    }
}
