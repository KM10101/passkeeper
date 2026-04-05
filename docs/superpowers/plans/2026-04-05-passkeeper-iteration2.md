# PassKeeper Iteration 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PRD iteration 2 — entry list enhancements (pin, drag-sort, ⋯ menu), entry form full rewrite (field-only + templates), settings expansion (proxy, storage dir), sticky headers, timestamps, and app icon.

**Architecture:** Rust backend gains `pinned`/`sort_order` on entries, title-uniqueness validation, proxy-aware HTTP client, and storage migration. Frontend gains @dnd-kit sortable lists, a completely rewritten EntryDialog (field-only), and extended SettingsPage.

**Tech Stack:** Rust/Tauri v2, rusqlite, reqwest 0.12, React 18, @tanstack/react-query, @dnd-kit/core + @dnd-kit/sortable, shadcn/ui, Tailwind CSS, Sonner toasts.

**Spec:** `docs/superpowers/specs/2026-04-05-passkeeper-iteration2-design.md`

---

### Task 1: DB Schema + Entry Model + AppState db_path

**Files:**
- Modify: `src-tauri/src/db/init.rs`
- Modify: `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/state.rs`

- [ ] **Step 1: Add `pinned` and `sort_order` columns to entries table in `init.rs`**

Replace the entries CREATE TABLE statement (keep the rest of the batch identical):

```rust
        CREATE TABLE IF NOT EXISTS entries (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id      INTEGER REFERENCES groups(id) ON DELETE SET NULL,
            title         TEXT    NOT NULL,
            url           TEXT,
            site_title    TEXT,
            username      TEXT,
            template_type TEXT    NOT NULL DEFAULT 'custom',
            tags          TEXT    NOT NULL DEFAULT '[]',
            notes         TEXT,
            favorite      INTEGER NOT NULL DEFAULT 0,
            pinned        INTEGER NOT NULL DEFAULT 0,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );
```

- [ ] **Step 2: Add `pinned` and `sort_order` to `Entry` struct in `models.rs`**

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Entry {
    pub id: i64,
    pub group_id: Option<i64>,
    pub title: String,
    pub url: Option<String>,
    pub site_title: Option<String>,
    pub username: Option<String>,
    pub template_type: String,
    pub tags: String,
    pub notes: Option<String>,
    pub favorite: bool,
    pub pinned: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}
```

- [ ] **Step 3: Add `db_path` field to `AppState` and update `new()` in `state.rs`**

```rust
use rusqlite::Connection;
use std::sync::Mutex;
use std::time::Instant;
use std::path::PathBuf;
use zeroize::Zeroize;

pub struct MasterKey(pub [u8; 32]);

impl Drop for MasterKey {
    fn drop(&mut self) { self.0.zeroize(); }
}

pub struct AppState {
    pub master_key: Mutex<Option<MasterKey>>,
    pub db: Mutex<Connection>,
    pub db_path: Mutex<PathBuf>,
    pub last_activity: Mutex<Instant>,
}

impl AppState {
    pub fn new(conn: Connection, db_path: PathBuf) -> Self {
        Self {
            master_key: Mutex::new(None),
            db: Mutex::new(conn),
            db_path: Mutex::new(db_path),
            last_activity: Mutex::new(Instant::now()),
        }
    }

    pub fn touch(&self) {
        *self.last_activity.lock().unwrap() = Instant::now();
    }
}
```

- [ ] **Step 4: Fix all `AppState::new(conn)` calls in test helpers — they now need a second argument**

In every test module that calls `AppState::new`, change:
```rust
AppState::new(conn)
```
to:
```rust
AppState::new(conn, std::path::PathBuf::new())
```

Files with test helpers to update:
- `src-tauri/src/commands/auth.rs` — `make_state()`
- `src-tauri/src/commands/entries.rs` — `make_unlocked_state()`
- `src-tauri/src/commands/settings.rs` — `make_state()`
- `src-tauri/src/commands/metadata.rs` — `make_state()`
- `src-tauri/src/commands/vault_io.rs` — any `make_state()` / `make_unlocked_state()`

- [ ] **Step 5: Run Rust tests to confirm schema and model changes compile**

```bash
cd src-tauri && cargo test 2>&1 | head -50
```

Expected: compilation errors only in `commands/entries.rs` (Entry struct now has new fields — all SELECT mappers are outdated). All other tests should pass or fail only due to the entries mapper mismatch.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/init.rs src-tauri/src/db/models.rs src-tauri/src/state.rs \
  src-tauri/src/commands/auth.rs src-tauri/src/commands/entries.rs \
  src-tauri/src/commands/settings.rs src-tauri/src/commands/metadata.rs \
  src-tauri/src/commands/vault_io.rs
git commit -m "feat: add pinned/sort_order to entries schema and db_path to AppState"
```

---

### Task 2: AppError + Entries Command Extensions

**Files:**
- Modify: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/commands/entries.rs`

- [ ] **Step 1: Add `DuplicateTitle` variant to `AppError` in `error.rs`**

Add after `NotFound`:
```rust
    #[error("同分组下已存在同名条目")]
    DuplicateTitle,
```

- [ ] **Step 2: Replace entire `src-tauri/src/commands/entries.rs`**

This file needs extensive changes: updated SELECT columns, field sync, title uniqueness, sort_order init, new commands `pin_entry` and `reorder_entries`, fixed sort order, and fix for the `change_master_password` nonce bug in `auth.rs`. Write the complete file:

```rust
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
```

- [ ] **Step 3: Fix `change_master_password` in `auth.rs` to skip plaintext (no-nonce) fields**

In `auth.rs`, find the `change_master_password` function. Replace the fields query to only select encrypted fields:

```rust
    // Re-encrypt only encrypted fields (those with a nonce)
    let fields: Vec<(i64, Vec<u8>, Vec<u8>)> = {
        let mut stmt = db.prepare(
            "SELECT id, field_value, nonce FROM entry_fields WHERE nonce IS NOT NULL"
        )?;
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap().map(|r| r.unwrap()).collect()
    };
```

- [ ] **Step 4: Register new commands in `main.rs`**

Add `pin_entry` and `reorder_entries` to the `invoke_handler` list:

```rust
            commands::entries::pin_entry,
            commands::entries::reorder_entries,
```

Also update the `main` function to handle `storage_dir` and use the new `AppState::new(conn, path)` signature:

```rust
fn get_default_db_path() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("passkeeper")
        .join("vault.db")
}

fn main() {
    let default_path = get_default_db_path();
    std::fs::create_dir_all(default_path.parent().unwrap()).unwrap();

    // Open default DB first to read storage_dir config
    let default_conn = rusqlite::Connection::open(&default_path).unwrap();
    init_db(&default_conn).unwrap();

    let storage_dir: Option<String> = default_conn.query_row(
        "SELECT value FROM app_config WHERE key='storage_dir'",
        [], |r| r.get::<_, String>(0),
    ).ok().filter(|s| !s.is_empty());

    let (active_conn, db_path) = if let Some(ref dir) = storage_dir {
        let custom_path = std::path::PathBuf::from(dir).join("vault.db");
        std::fs::create_dir_all(dir).unwrap();
        let custom_conn = rusqlite::Connection::open(&custom_path).unwrap();
        init_db(&custom_conn).unwrap();
        drop(default_conn);
        (custom_conn, custom_path)
    } else {
        (default_conn, default_path)
    };

    let app_state = AppState::new(active_conn, db_path);

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::auth::unlock,
            commands::auth::lock,
            commands::auth::is_locked,
            commands::auth::change_master_password,
            commands::groups::list_groups,
            commands::groups::create_group,
            commands::groups::update_group,
            commands::groups::delete_group,
            commands::entries::list_entries,
            commands::entries::get_entry,
            commands::entries::create_entry,
            commands::entries::update_entry,
            commands::entries::delete_entry,
            commands::entries::pin_entry,
            commands::entries::reorder_entries,
            commands::metadata::fetch_site_metadata,
            commands::metadata::get_favicon,
            commands::vault_io::export_vault,
            commands::vault_io::import_vault,
            commands::vault_io::export_vault_to_path,
            commands::vault_io::import_vault_from_path,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_storage_dir,
            commands::settings::migrate_storage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Run all Rust tests**

```bash
cd src-tauri && cargo test 2>&1
```

Expected: all tests pass. If `vault_io` tests fail due to `Entry` field count changes in SQL, update the mapper in `vault_io.rs` to also include `pinned` and `sort_order` in its INSERT/SELECT statements.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/error.rs src-tauri/src/commands/entries.rs \
  src-tauri/src/commands/auth.rs src-tauri/src/main.rs
git commit -m "feat: title uniqueness, field sync, pin/reorder commands, storage_dir startup"
```

---

### Task 3: Settings Commands Extension

**Files:**
- Modify: `src-tauri/src/commands/settings.rs`

- [ ] **Step 1: Replace entire `settings.rs` with extended version**

```rust
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
```

- [ ] **Step 2: Run Rust tests**

```bash
cd src-tauri && cargo test settings 2>&1
```

Expected: `get_settings_returns_defaults` and `update_and_get_settings_roundtrip` pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/settings.rs
git commit -m "feat: extend AppSettings with proxy/storage config and migrate_storage command"
```

---

### Task 4: Metadata Command — Proxy Client + Favicon Expiry

**Files:**
- Modify: `src-tauri/src/commands/metadata.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add `chrono` to `Cargo.toml` dependencies**

```toml
chrono = { version = "0.4", features = ["alloc"] }
```

- [ ] **Step 2: Replace entire `metadata.rs`**

```rust
use tauri::State;
use serde::Serialize;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::commands::settings::get_settings_inner;

#[derive(Debug, Serialize)]
pub struct SiteMetadata {
    pub title: Option<String>,
    pub favicon_domain: Option<String>,
}

fn build_http_client(state: &AppState) -> reqwest::Client {
    let settings = get_settings_inner(state).ok();
    let http_proxy = settings.as_ref().map(|s| s.http_proxy.as_str()).unwrap_or("").to_string();
    let no_proxy_str = settings.as_ref().map(|s| s.no_proxy.as_str()).unwrap_or("").to_string();

    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10));

    if !http_proxy.is_empty() {
        if let Ok(mut proxy) = reqwest::Proxy::all(&http_proxy) {
            if !no_proxy_str.is_empty() {
                proxy = proxy.no_proxy(reqwest::NoProxy::from_string(&no_proxy_str));
            }
            builder = builder.proxy(proxy);
        }
    }

    builder.build().unwrap_or_else(|_| reqwest::Client::new())
}

fn favicon_is_expired(state: &AppState, domain: &str) -> bool {
    let expiry_days = get_settings_inner(state)
        .map(|s| s.favicon_cache_expiry_days)
        .unwrap_or(7);
    let db = state.db.lock().unwrap();
    let fetched_at: Option<String> = db.query_row(
        "SELECT fetched_at FROM favicon_cache WHERE domain=?1",
        [domain], |r| r.get(0),
    ).ok();
    match fetched_at {
        None => true,
        Some(ts) => {
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&ts, "%Y-%m-%d %H:%M:%S") {
                let age = chrono::Utc::now().naive_utc() - dt;
                age.num_days() >= expiry_days
            } else {
                true
            }
        }
    }
}

pub fn get_favicon_inner(domain: &str, state: &AppState) -> AppResult<Option<Vec<u8>>> {
    let db = state.db.lock().unwrap();
    let result: Option<Vec<u8>> = db.query_row(
        "SELECT data FROM favicon_cache WHERE domain=?1",
        [domain], |r| r.get(0),
    ).ok();
    Ok(result)
}

pub fn store_favicon_inner(domain: &str, data: &[u8], state: &AppState) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO favicon_cache(domain, data, fetched_at) VALUES(?1, ?2, datetime('now'))",
        rusqlite::params![domain, data],
    )?;
    Ok(())
}

pub async fn fetch_site_metadata_inner(url: &str, state: &AppState) -> AppResult<SiteMetadata> {
    let domain = extract_domain(url);
    let client = build_http_client(state);
    let mut title: Option<String> = None;
    let mut favicon_domain: Option<String> = None;

    if let Ok(resp) = client.get(url).send().await {
        if let Ok(html) = resp.text().await {
            let doc = scraper::Html::parse_document(&html);
            let sel = scraper::Selector::parse("title").unwrap();
            title = doc.select(&sel).next().map(|e| e.inner_html().trim().to_string());
        }
    }

    if let Some(ref d) = domain {
        if favicon_is_expired(state, d) {
            let favicon_url = format!("https://{}/favicon.ico", d);
            if let Ok(resp) = client.get(&favicon_url).send().await {
                if resp.status().is_success() {
                    if let Ok(bytes) = resp.bytes().await {
                        let data: Vec<u8> = bytes.to_vec();
                        if !data.is_empty() {
                            let _ = store_favicon_inner(d, &data, state);
                        }
                    }
                }
            }
        }
        favicon_domain = Some(d.clone());
    }

    Ok(SiteMetadata { title, favicon_domain })
}

fn extract_domain(url: &str) -> Option<String> {
    url.split("://").nth(1)
        .and_then(|s| s.split('/').next())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn fetch_site_metadata(
    url: String, state: State<'_, AppState>,
) -> Result<SiteMetadata, AppError> {
    fetch_site_metadata_inner(&url, &state).await
}

#[tauri::command]
pub async fn get_favicon(
    domain: String, state: State<'_, AppState>,
) -> Result<Option<Vec<u8>>, AppError> {
    get_favicon_inner(&domain, &state)
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
    fn get_favicon_returns_none_when_not_cached() {
        let state = make_state();
        assert!(get_favicon_inner("example.com", &state).unwrap().is_none());
    }

    #[test]
    fn store_and_retrieve_favicon() {
        let state = make_state();
        let data = vec![1u8, 2, 3, 4];
        store_favicon_inner("example.com", &data, &state).unwrap();
        assert_eq!(get_favicon_inner("example.com", &state).unwrap(), Some(data));
    }

    #[test]
    fn favicon_is_expired_when_not_cached() {
        let state = make_state();
        assert!(favicon_is_expired(&state, "new.com"));
    }

    #[test]
    fn favicon_not_expired_immediately_after_store() {
        let state = make_state();
        store_favicon_inner("fresh.com", &[1, 2, 3], &state).unwrap();
        assert!(!favicon_is_expired(&state, "fresh.com"));
    }
}
```

- [ ] **Step 3: Run Rust tests**

```bash
cd src-tauri && cargo test 2>&1
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/metadata.rs src-tauri/Cargo.toml
git commit -m "feat: proxy-aware HTTP client and favicon cache expiry"
```

---

### Task 5: TypeScript Types + Hooks

**Files:**
- Modify: `src/lib/tauri.ts`
- Modify: `src/hooks/useEntries.ts`

- [ ] **Step 1: Update `src/lib/tauri.ts` — extend Entry, AppSettings, add new wrappers**

In `Entry` interface, add after `favorite`:
```typescript
  pinned: boolean;
  sort_order: number;
```

Replace `AppSettings` interface:
```typescript
export interface AppSettings {
  auto_lock_minutes: number;
  show_passwords_by_default: boolean;
  favicon_cache_expiry_days: number;
  http_proxy: string;
  no_proxy: string;
  storage_dir: string;
}
```

Replace `updateSettings` wrapper:
```typescript
export const updateSettings = (
  autoLockMinutes: number,
  showPasswordsByDefault: boolean,
  faviconCacheExpiryDays: number,
  httpProxy: string,
  noProxy: string,
) => invoke<AppSettings>('update_settings', {
  autoLockMinutes, showPasswordsByDefault,
  faviconCacheExpiryDays, httpProxy, noProxy,
});
```

Add new wrappers after the existing Settings section:
```typescript
export const getStorageDir = () => invoke<string>('get_storage_dir');
export const migrateStorage = (newDir: string) =>
  invoke<void>('migrate_storage', { newDir });
```

Add after `openFileDialog`:
```typescript
export const openDirDialog = () =>
  dialogOpen({ directory: true, multiple: false }) as Promise<string | null>;
```

Add after `listEntries`:
```typescript
export const pinEntry = (id: number, pinned: boolean) =>
  invoke<Entry>('pin_entry', { id, pinned });
export const reorderEntries = (ids: number[], pinned: boolean) =>
  invoke<void>('reorder_entries', { ids, pinned });
```

- [ ] **Step 2: Update `src/hooks/useEntries.ts` — add pin and reorder mutations**

Add imports:
```typescript
import {
  listEntries, createEntry, updateEntry, deleteEntry,
  pinEntry, reorderEntries, NewEntryField,
} from '../lib/tauri';
```

Add mutations inside `useEntries`:
```typescript
  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      pinEntry(id, pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  });

  const reorder = useMutation({
    mutationFn: ({ ids, pinned }: { ids: number[]; pinned: boolean }) =>
      reorderEntries(ids, pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  });
```

Add to return object:
```typescript
    pinEntry: pin.mutateAsync,
    reorderEntries: reorder.mutateAsync,
```

- [ ] **Step 3: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: only pre-existing errors in `SettingsPage.tsx` (updateSettings signature changed — fixed in Task 10). All other files clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tauri.ts src/hooks/useEntries.ts
git commit -m "feat: extend TS types for pinned/sort_order, proxy settings, pin/reorder wrappers"
```

---

### Task 6: Install @dnd-kit + EntryCard ⋯ Menu + Drag Handle

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/components/entries/EntryCard.tsx`

- [ ] **Step 1: Install @dnd-kit packages**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added to `node_modules` and `package.json`.

- [ ] **Step 2: Replace `src/components/entries/EntryCard.tsx`**

```tsx
import { GripVertical, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "../ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import type { Entry } from "../../lib/tauri";

interface Props {
  entry: Entry;
  selected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
}

export function EntryCard({ entry, selected, onClick, onEdit, onPin, onDelete }: Props) {
  const tags = entry.tags ? entry.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const domain = entry.url ? (() => { try { return new URL(entry.url).hostname; } catch { return null; } })() : null;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-full text-left border-b border-border transition-colors flex items-stretch group",
        selected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent",
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex items-center px-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
        onClick={e => e.stopPropagation()}
        tabIndex={-1}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Card body — clickable */}
      <button
        onClick={onClick}
        className="flex items-start gap-3 px-2 py-2.5 flex-1 min-w-0 text-left"
      >
        {/* Favicon */}
        <div className="shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center overflow-hidden mt-0.5">
          {domain ? (
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              alt=""
              className="w-6 h-6"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">
              {entry.title.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium truncate">{entry.title}</span>
            {entry.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
          </div>
          {entry.username && (
            <p className="text-xs text-muted-foreground truncate">{entry.username}</p>
          )}
          {!entry.username && domain && (
            <p className="text-xs text-muted-foreground truncate">{domain}</p>
          )}
          {tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* ⋯ menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center px-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> 编辑
          </DropdownMenuItem>
          <DropdownMenuItem onClick={e => { e.stopPropagation(); onPin(); }}>
            {entry.pinned
              ? <><PinOff className="h-3.5 w-3.5 mr-2" /> 取消置顶</>
              : <><Pin className="h-3.5 w-3.5 mr-2" /> 置顶</>
            }
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: errors only in `EntryList.tsx` (doesn't yet pass `onEdit`/`onPin`/`onDelete` to EntryCard — fixed in Task 7).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/entries/EntryCard.tsx
git commit -m "feat: EntryCard with drag handle and three-dot context menu"
```

---

### Task 7: EntryList with Drag-and-Drop Sortable Sections

**Files:**
- Modify: `src/components/EntryList.tsx`

- [ ] **Step 1: Replace `src/components/EntryList.tsx`**

```tsx
import { useState } from "react";
import { Search, Plus, Pin } from "lucide-react";
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { EntryCard } from "./entries/EntryCard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./ui/alert-dialog";
import { useEntries } from "../hooks/useEntries";
import { toast } from "sonner";
import type { Entry } from "../lib/tauri";

interface Props {
  groupId: number | null;
  selectedEntryId: number | null;
  onSelect: (id: number) => void;
  onNewEntry: () => void;
  onEditEntry: (id: number) => void;
}

export function EntryList({ groupId, selectedEntryId, onSelect, onNewEntry, onEditEntry }: Props) {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const { entries, deleteEntry, pinEntry, reorderEntries } = useEntries(groupId ?? undefined, search || undefined);

  const pinned = entries.filter(e => e.pinned);
  const normal = entries.filter(e => !e.pinned);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent, isPinned: boolean) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = isPinned ? pinned : normal;
    const oldIndex = section.findIndex(e => e.id === active.id);
    const newIndex = section.findIndex(e => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...section];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    try {
      await reorderEntries({ ids: reordered.map(e => e.id), pinned: isPinned });
    } catch {
      toast.error("排序保存失败");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEntry(deleteTarget.id);
      toast.success(`"${deleteTarget.title}" 已删除`);
      setDeleteTarget(null);
    } catch {
      toast.error("删除失败");
    }
  };

  const handlePin = async (entry: Entry) => {
    try {
      await pinEntry({ id: entry.id, pinned: !entry.pinned });
      toast.success(entry.pinned ? "已取消置顶" : "已置顶");
    } catch {
      toast.error("操作失败");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sticky search + new button */}
      <div className="sticky top-0 z-10 bg-background p-2 border-b border-border flex gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索..."
            className="pl-7 h-8 text-sm"
          />
        </div>
        <Button size="sm" className="h-8 px-2" onClick={onNewEntry}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <p className="text-sm">{search ? "无搜索结果" : "暂无条目"}</p>
            {!search && (
              <button onClick={onNewEntry} className="text-xs text-primary hover:underline">
                创建第一条记录
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Pinned section */}
            {pinned.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30">
                  <Pin className="h-3 w-3" /> 置顶
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter}
                  onDragEnd={e => handleDragEnd(e, true)}>
                  <SortableContext items={pinned.map(e => e.id)} strategy={verticalListSortingStrategy}>
                    {pinned.map(entry => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedEntryId}
                        onClick={() => onSelect(entry.id)}
                        onEdit={() => onEditEntry(entry.id)}
                        onPin={() => handlePin(entry)}
                        onDelete={() => setDeleteTarget(entry)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </>
            )}

            {/* Normal section */}
            {normal.length > 0 && (
              <>
                {pinned.length > 0 && (
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30">
                    其他
                  </div>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter}
                  onDragEnd={e => handleDragEnd(e, false)}>
                  <SortableContext items={normal.map(e => e.id)} strategy={verticalListSortingStrategy}>
                    {normal.map(entry => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedEntryId}
                        onClick={() => onSelect(entry.id)}
                        onEdit={() => onEditEntry(entry.id)}
                        onPin={() => handlePin(entry)}
                        onDelete={() => setDeleteTarget(entry)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 "{deleteTarget?.title}"？</AlertDialogTitle>
            <AlertDialogDescription>此操作无法撤销，该条目的所有数据将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Update `VaultPage.tsx` to pass `onEditEntry` prop to `EntryList`**

Find the `<EntryList ... />` JSX in `src/pages/VaultPage.tsx` and add the `onEditEntry` prop:

```tsx
<EntryList
  groupId={selectedGroupId}
  selectedEntryId={selectedEntryId}
  onSelect={setSelectedEntryId}
  onNewEntry={() => setDialogOpen(true)}
  onEditEntry={(id) => {
    setSelectedEntryId(id);
    setDialogOpen(true);  // opens EntryDialog in edit mode for the selected entry
  }}
/>
```

- [ ] **Step 3: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: errors only in `SettingsPage.tsx` and possibly `EntryDetail.tsx` due to previously changed signatures — those are fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/components/EntryList.tsx src/pages/VaultPage.tsx
git commit -m "feat: drag-and-drop sortable entry list with pinned/normal sections"
```

---

### Task 8: EntryDialog Full Rewrite

**Files:**
- Modify: `src/components/entries/EntryDialog.tsx`

- [ ] **Step 1: Replace entire `src/components/entries/EntryDialog.tsx`**

```tsx
import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { toast } from "sonner";
import { useGroups } from "../../hooks/useGroups";
import { useEntries } from "../../hooks/useEntries";
import type { EntryDetail } from "../../lib/tauri";

// ── Types ────────────────────────────────────────────────
interface FieldRow {
  id: number;         // local key only
  field_name: string;
  field_type: string;
  field_value: string;
  sort_order: number;
  error?: string;
}

// ── Constants ────────────────────────────────────────────
const FIELD_TYPES = [
  { value: "text",     label: "Text" },
  { value: "secret",   label: "Secret" },
  { value: "token",    label: "Token" },
  { value: "password", label: "Password" },
  { value: "url",      label: "URL" },
  { value: "email",    label: "Email" },
  { value: "number",   label: "Number" },
  { value: "date",     label: "Date" },
];

const ENCRYPTED_TYPES = new Set(["password", "secret", "token"]);

const QUICK_ADD: Array<{ label: string; field_name: string; field_type: string }> = [
  { label: "用户名", field_name: "username", field_type: "text" },
  { label: "密码",   field_name: "password", field_type: "password" },
  { label: "URL",    field_name: "url",      field_type: "url" },
  { label: "Token",  field_name: "token",    field_type: "token" },
  { label: "邮箱",   field_name: "email",    field_type: "email" },
];

const TEMPLATES: Array<{ label: string; fields: Array<{ field_name: string; field_type: string }> }> = [
  { label: "账号密码", fields: [
    { field_name: "username", field_type: "text" },
    { field_name: "password", field_type: "password" },
    { field_name: "url",      field_type: "url" },
  ]},
  { label: "API/Token", fields: [
    { field_name: "api_key",  field_type: "token" },
    { field_name: "endpoint", field_type: "url" },
  ]},
  { label: "银行卡", fields: [
    { field_name: "card_number", field_type: "secret" },
    { field_name: "cvv",         field_type: "secret" },
    { field_name: "expiry",      field_type: "date" },
  ]},
  { label: "笔记", fields: [
    { field_name: "content", field_type: "text" },
  ]},
];

// ── Validation ────────────────────────────────────────────
function validateField(field_type: string, value: string): string | undefined {
  if (!value) return undefined;
  switch (field_type) {
    case "url":
      if (!/^https?:\/\/.+/.test(value)) return "URL 必须以 http:// 或 https:// 开头";
      break;
    case "email":
      if (!value.includes("@") || !value.split("@")[1]?.includes("."))
        return "请输入有效的邮箱地址";
      break;
    case "number":
      if (!/^\d*\.?\d*$/.test(value)) return "请输入有效的数字";
      break;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "日期格式应为 YYYY-MM-DD";
      break;
  }
  return undefined;
}

// ── Component ─────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  existing?: EntryDetail;
  defaultGroupId?: number | null;
}

export function EntryDialog({ open, onClose, existing, defaultGroupId }: Props) {
  const { groups } = useGroups();
  const { createEntry, updateEntry } = useEntries();

  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(true);

  // Reset form when dialog opens/changes
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setTitle(existing.entry.title);
      setTagsInput(existing.entry.tags);
      setGroupId(existing.entry.group_id);
      setFavorite(existing.entry.favorite);
      setFields(existing.fields.map((f, i) => ({
        id: i,
        field_name: f.field_name,
        field_type: f.field_type,
        field_value: f.plaintext,
        sort_order: f.sort_order,
      })));
    } else {
      setTitle("");
      setTagsInput("");
      setGroupId(defaultGroupId ?? null);
      setFavorite(false);
      setFields([]);
    }
    setError(null);
  }, [open, existing, defaultGroupId]);

  const addField = (field_name: string, field_type: string) => {
    setFields(prev => [...prev, {
      id: Date.now() + Math.random(),
      field_name,
      field_type,
      field_value: "",
      sort_order: prev.length,
    }]);
  };

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    const newFields = tpl.fields.map((f, i) => ({
      id: Date.now() + Math.random() + i,
      field_name: f.field_name,
      field_type: f.field_type,
      field_value: "",
      sort_order: fields.length + i,
    }));
    setFields(prev => [...prev, ...newFields]);
  };

  const updateFieldValue = (id: number, value: string) => {
    setFields(prev => prev.map(f => {
      if (f.id !== id) return f;
      return { ...f, field_value: value, error: validateField(f.field_type, value) };
    }));
  };

  const updateFieldName = (id: number, name: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, field_name: name } : f));
  };

  const updateFieldType = (id: number, type: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, field_type: type, error: undefined } : f));
  };

  const removeField = (id: number) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const hasValidationErrors = fields.some(f => !!f.error);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("标题不能为空"); return; }
    if (hasValidationErrors) { setError("请修正字段格式错误"); return; }

    // Run validation pass on all fields before submit
    const validated = fields.map(f => ({
      ...f,
      error: validateField(f.field_type, f.field_value),
    }));
    if (validated.some(f => !!f.error)) {
      setFields(validated);
      setError("请修正字段格式错误");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const newFields = fields.map((f, i) => ({
        field_name: f.field_name,
        field_type: f.field_type,
        field_value: f.field_value,
        sort_order: i,
      }));
      const args = {
        groupId, title: title.trim(), url: null, siteTitle: null, username: null,
        templateType: "custom", tags: tagsInput.trim(), notes: null, favorite, fields: newFields,
      };
      if (existing) {
        await updateEntry({ id: existing.entry.id, ...args });
      } else {
        await createEntry(args);
      }
      toast.success(existing ? "条目已更新" : "条目已创建");
      onClose();
    } catch (err) {
      const msg = String(err);
      if (msg.includes("DuplicateTitle") || msg.includes("同分组")) {
        setError("同分组下已存在同名条目");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "编辑条目" : "新建条目"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">标题 <span className="text-destructive">*</span></Label>
            <Input
              id="title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：GitHub"
              autoFocus
            />
          </div>

          {/* Fields list */}
          <div className="flex flex-col gap-1.5">
            <Label>字段</Label>
            {fields.length === 0 ? (
              <div className="border border-dashed border-border rounded-md p-4 text-center text-sm text-muted-foreground">
                暂无字段，使用下方按钮快速添加
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {fields.map((field) => (
                  <div key={field.id} className="flex flex-col gap-0.5">
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="字段名"
                        value={field.field_name}
                        onChange={e => updateFieldName(field.id, e.target.value)}
                        className="w-[110px] shrink-0 text-sm h-8"
                      />
                      <select
                        value={field.field_type}
                        onChange={e => updateFieldType(field.id, e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none w-[95px] shrink-0"
                      >
                        {FIELD_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <FieldValueInput
                        field={field}
                        onChange={v => updateFieldValue(field.id, v)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8"
                        onClick={() => removeField(field.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                    {field.error && (
                      <p className="text-xs text-destructive ml-1">{field.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick add */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">快捷添加</span>
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_ADD.map(qa => (
                <button
                  key={qa.label}
                  type="button"
                  onClick={() => addField(qa.field_name, qa.field_type)}
                  className="text-xs border border-border rounded-md px-2 py-1 hover:bg-accent transition-colors"
                >
                  {qa.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => addField("", "text")}
                className="text-xs border border-dashed border-border rounded-md px-2 py-1 hover:bg-accent transition-colors"
              >
                <Plus className="h-3 w-3 inline mr-0.5" />自定义
              </button>
            </div>
          </div>

          {/* Templates */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">模版（追加字段）</span>
            <div className="flex gap-1.5 flex-wrap">
              {TEMPLATES.map(tpl => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="text-xs bg-muted rounded-md px-2 py-1 hover:bg-accent transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Meta (tags, group, favorite) — collapsible */}
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground text-left"
              onClick={() => setShowMeta(v => !v)}
            >
              {showMeta ? "▾" : "▸"} 标签 / 分组 / 收藏
            </button>
            {showMeta && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tags" className="text-xs">标签（逗号分隔）</Label>
                  <Input
                    id="tags"
                    value={tagsInput}
                    onChange={e => setTagsInput(e.target.value)}
                    placeholder="work, personal"
                    className="h-8 text-sm"
                  />
                  {tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="group" className="text-xs">分组</Label>
                  <select
                    id="group"
                    value={groupId ?? ""}
                    onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">无分组</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="favorite" checked={favorite} onCheckedChange={setFavorite} />
                  <Label htmlFor="favorite" className="text-sm">收藏</Label>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={saving || hasValidationErrors}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-component: field value input with show/hide for secrets ──
function FieldValueInput({ field, onChange }: { field: FieldRow; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const isSecret = ENCRYPTED_TYPES.has(field.field_type);

  return (
    <div className="relative flex-1">
      <Input
        type={isSecret && !show ? "password" : "text"}
        placeholder="值"
        value={field.field_value}
        onChange={e => onChange(e.target.value)}
        className={`h-8 text-sm pr-8 ${field.error ? "border-destructive" : ""}`}
      />
      {isSecret && (
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: clean (excluding known `SettingsPage.tsx` error from Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/components/entries/EntryDialog.tsx
git commit -m "feat: rewrite EntryDialog with field-only form, templates, quick-add, and validation"
```

---

### Task 9: EntryDetail — Cleanup + Timestamps + Sticky Header

**Files:**
- Modify: `src/components/entries/EntryDetail.tsx`

- [ ] **Step 1: Replace entire `src/components/entries/EntryDetail.tsx`**

Remove the hardcoded `entry.username`, `entry.url`, `entry.notes` display sections. All fields now come from `detail.fields`. Add timestamps at the bottom. Add sticky header.

```tsx
import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Copy, Star, Pencil, Trash2, ExternalLink, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "../ui/alert-dialog";
import { useEntries } from "../../hooks/useEntries";
import { getEntry, openUrl } from "../../lib/tauri";
import type { DecryptedField, NewEntryField } from "../../lib/tauri";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const ENCRYPTED_TYPES = new Set(["password", "secret", "token"]);

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function FieldRow({
  field, onSave, onDelete, canDelete,
}: {
  field: DecryptedField;
  onSave: (id: number, newValue: string) => Promise<void>;
  onDelete: (id: number) => void;
  canDelete: boolean;
}) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(field.plaintext);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEncrypted = ENCRYPTED_TYPES.has(field.field_type);
  const isUrl = field.field_type === "url";

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const copy = () => {
    navigator.clipboard.writeText(field.plaintext);
    toast.success(`${field.field_name} 已复制`);
  };

  const commitEdit = async () => {
    if (saving || editValue === field.plaintext) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(field.id, editValue);
      setEditing(false);
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => { setEditValue(field.plaintext); setEditing(false); };

  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground capitalize">{field.field_name}
        <span className="ml-1 text-[10px] opacity-50">{field.field_type}</span>
      </span>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Input
              ref={inputRef}
              type={isEncrypted ? "password" : "text"}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
              onBlur={commitEdit}
              className="h-7 text-sm flex-1"
              disabled={saving}
            />
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </>
        ) : (
          <>
            <span
              className="text-sm flex-1 break-all font-mono cursor-text hover:bg-accent/50 rounded px-1 -mx-1 transition-colors"
              onClick={() => { setEditing(true); setEditValue(field.plaintext); }}
              title="点击编辑"
            >
              {isEncrypted && !show ? "••••••••" : (field.plaintext || <span className="text-muted-foreground italic text-xs">空</span>)}
            </span>
            {isEncrypted && (
              <button onClick={() => setShow(v => !v)} className="text-muted-foreground hover:text-foreground shrink-0">
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
            {isUrl && field.plaintext && (
              <button onClick={() => openUrl(field.plaintext)} className="text-muted-foreground hover:text-foreground shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={copy} className="text-muted-foreground hover:text-foreground shrink-0">
              <Copy className="h-3.5 w-3.5" />
            </button>
            {canDelete && (
              <button onClick={() => onDelete(field.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface Props {
  entryId: number;
  onEdit: () => void;
  onDeleted: () => void;
}

export function EntryDetail({ entryId, onEdit, onDeleted }: Props) {
  const { deleteEntry, updateEntry } = useEntries();
  const qc = useQueryClient();
  const { data: detail, isLoading } = useQuery({
    queryKey: ["entry", entryId],
    queryFn: () => getEntry(entryId),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [localFields, setLocalFields] = useState<DecryptedField[]>([]);
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldValue, setNewFieldValue] = useState("");

  useEffect(() => { if (detail) setLocalFields(detail.fields); }, [detail]);

  if (isLoading || !detail) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>;
  }

  const { entry } = detail;
  const tags = entry.tags ? entry.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const domain = entry.url ? (() => { try { return new URL(entry.url).hostname; } catch { return null; } })() : null;

  const buildNewEntryFields = (fields: DecryptedField[]): NewEntryField[] =>
    fields.map(f => ({ field_name: f.field_name, field_type: f.field_type, field_value: f.plaintext, sort_order: f.sort_order }));

  const persistFields = async (fields: DecryptedField[]) => {
    await updateEntry({
      id: entry.id, groupId: entry.group_id, title: entry.title,
      url: entry.url, siteTitle: entry.site_title, username: entry.username,
      templateType: entry.template_type, tags: entry.tags,
      notes: entry.notes ?? null, favorite: entry.favorite,
      fields: buildNewEntryFields(fields),
    });
    qc.invalidateQueries({ queryKey: ["entry", entryId] });
  };

  const handleFieldSave = async (fieldId: number, newValue: string) => {
    const original = localFields;
    const updated = localFields.map(f => f.id === fieldId ? { ...f, plaintext: newValue } : f);
    setLocalFields(updated);
    try {
      await persistFields(updated);
      toast.success("字段已更新");
    } catch (err) {
      setLocalFields(original);
      throw err;
    }
  };

  const handleFieldDelete = async (fieldId: number) => {
    const original = localFields;
    const updated = localFields.filter(f => f.id !== fieldId);
    setLocalFields(updated);
    try {
      await persistFields(updated);
      toast.success("字段已删除");
    } catch {
      setLocalFields(original);
      toast.error("删除失败");
    }
  };

  const handleAddField = async () => {
    if (!newFieldName.trim()) return;
    const newField: DecryptedField = {
      id: Date.now(),
      field_name: newFieldName.trim(),
      field_type: newFieldType,
      plaintext: newFieldValue,
      sort_order: localFields.length,
    };
    const updated = [...localFields, newField];
    setLocalFields(updated);
    await persistFields(updated);
    setNewFieldName(""); setNewFieldType("text"); setNewFieldValue(""); setAddingField(false);
    toast.success("字段已添加");
  };

  const handleDelete = async () => {
    await deleteEntry(entry.id);
    toast.success(`"${entry.title}" 已删除`);
    onDeleted();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {domain ? (
              <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=48`} alt=""
                className="w-7 h-7"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <span className="text-lg font-bold text-muted-foreground">{entry.title.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold truncate">{entry.title}</h2>
              {entry.favorite && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />}
            </div>
            {entry.url && (
              <button onClick={() => openUrl(entry.url!)}
                className="text-xs text-primary hover:underline truncate block text-left">
                {domain}
              </button>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
          </div>
        )}

        {/* Fields */}
        <div className="flex flex-col">
          {localFields.map(f => (
            <FieldRow key={f.id} field={f} onSave={handleFieldSave} onDelete={handleFieldDelete} canDelete />
          ))}
        </div>

        {/* Add field */}
        {addingField ? (
          <div className="flex gap-2 items-center mt-1">
            <Input placeholder="字段名" value={newFieldName} onChange={e => setNewFieldName(e.target.value)}
              className="w-1/4 h-8 text-sm"
              onKeyDown={e => { if (e.key === "Escape") setAddingField(false); }} />
            <select value={newFieldType} onChange={e => setNewFieldType(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none w-[95px] shrink-0">
              {["text","secret","token","password","url","email","number","date"].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Input placeholder="值" value={newFieldValue} onChange={e => setNewFieldValue(e.target.value)}
              className="flex-1 h-8 text-sm"
              type={["password","secret","token"].includes(newFieldType) ? "password" : "text"} />
            <button onClick={handleAddField} className="text-primary hover:text-primary/80">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => setAddingField(false)} className="text-muted-foreground hover:text-foreground">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button onClick={() => setAddingField(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit">
            <Plus className="h-3.5 w-3.5" /> 添加字段
          </button>
        )}

        {/* Timestamps */}
        <div className="flex gap-4 text-xs text-muted-foreground mt-auto pt-4 border-t border-border">
          <span>创建于 {formatDate(entry.created_at)}</span>
          <span>更新于 {formatDate(entry.updated_at)}</span>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 "{entry.title}"？</AlertDialogTitle>
            <AlertDialogDescription>此操作无法撤销，该条目的所有数据将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: clean (excluding known SettingsPage error).

- [ ] **Step 3: Commit**

```bash
git add src/components/entries/EntryDetail.tsx
git commit -m "feat: EntryDetail sticky header, timestamps, remove hardcoded fields"
```

---

### Task 10: SettingsPage Extension — Proxy + Storage Dir

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Replace entire `src/pages/SettingsPage.tsx`**

```tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload, Lock, FolderOpen } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  getSettings, updateSettings, exportVaultToPath, importVaultFromPath,
  saveFileDialog, openFileDialog, getStorageDir, migrateStorage, openDirDialog,
} from "../lib/tauri";

interface Props { onBack: () => void; }

export function SettingsPage({ onBack }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: currentStorageDir } = useQuery({ queryKey: ["storage_dir"], queryFn: getStorageDir });

  const [autoLock, setAutoLock] = useState(5);
  const [showPw, setShowPw] = useState(false);
  const [faviconExpiry, setFaviconExpiry] = useState(7);
  const [httpProxy, setHttpProxy] = useState("");
  const [noProxy, setNoProxy] = useState("");
  const [storageDirInput, setStorageDirInput] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Sync local state when settings load
  useEffect(() => {
    if (!settings) return;
    setAutoLock(settings.auto_lock_minutes);
    setShowPw(settings.show_passwords_by_default);
    setFaviconExpiry(settings.favicon_cache_expiry_days);
    setHttpProxy(settings.http_proxy);
    setNoProxy(settings.no_proxy);
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () => updateSettings(autoLock, showPw, faviconExpiry, httpProxy, noProxy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("设置已保存");
    },
    onError: (e) => toast.error(`保存失败: ${e}`),
  });

  const handleExport = async () => {
    if (!exportPassword) { toast.error("请输入导出密码"); return; }
    const path = await saveFileDialog({
      title: "导出备份",
      filters: [{ name: "PassKeeper Vault", extensions: ["pkv"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      await exportVaultToPath(path, exportPassword);
      toast.success("备份已导出");
      setExportPassword("");
    } catch (e) {
      toast.error(`导出失败: ${e}`);
    } finally { setBusy(false); }
  };

  const handleImport = async () => {
    if (!importPassword) { toast.error("请输入备份密码"); return; }
    const path = await openFileDialog({
      title: "选择备份文件",
      filters: [{ name: "PassKeeper Vault", extensions: ["pkv"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      await importVaultFromPath(path, importPassword);
      toast.success("数据已导入");
      qc.invalidateQueries();
      setImportPassword("");
    } catch (e) {
      toast.error(`导入失败: ${e}`);
    } finally { setBusy(false); }
  };

  const handlePickStorageDir = async () => {
    const dir = await openDirDialog();
    if (dir) setStorageDirInput(dir);
  };

  const handleMigrateStorage = async () => {
    if (!storageDirInput.trim()) { toast.error("请选择或输入目录路径"); return; }
    setBusy(true);
    try {
      await migrateStorage(storageDirInput.trim());
      toast.success("存储路径已保存，重启后生效");
      setStorageDirInput("");
    } catch (e) {
      toast.error(`迁移失败: ${e}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-6 h-14 border-b border-border bg-background shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">设置</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-8">

          {/* Security */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">安全</h2>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autolock" className="text-sm font-medium">自动锁定</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">无操作后自动锁定（分钟）</p>
                </div>
                <Input id="autolock" type="number" min={1} max={60} value={autoLock}
                  onChange={e => setAutoLock(Number(e.target.value))} className="w-20 text-center" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="showpw" className="text-sm font-medium">默认显示密码</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">打开条目时密码默认可见</p>
                </div>
                <Switch id="showpw" checked={showPw} onCheckedChange={setShowPw} />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                  <Lock className="h-3.5 w-3.5 mr-1.5" /> 保存设置
                </Button>
              </div>
            </div>
          </section>

          {/* Favicon & Proxy */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">网络与图标</h2>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="favicon-expiry" className="text-sm font-medium">图标缓存有效期</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">超过此天数重新抓取</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input id="favicon-expiry" type="number" min={1} max={365} value={faviconExpiry}
                    onChange={e => setFaviconExpiry(Number(e.target.value))} className="w-20 text-center" />
                  <span className="text-sm text-muted-foreground">天</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="http-proxy" className="text-sm font-medium">HTTP 代理</Label>
                <Input id="http-proxy" value={httpProxy} onChange={e => setHttpProxy(e.target.value)}
                  placeholder="http://127.0.0.1:7890" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="no-proxy" className="text-sm font-medium">不走代理</Label>
                <Input id="no-proxy" value={noProxy} onChange={e => setNoProxy(e.target.value)}
                  placeholder="localhost,127.0.0.1,.internal.com" />
                <p className="text-xs text-muted-foreground">逗号分隔，支持 .domain.com 通配</p>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                  <Lock className="h-3.5 w-3.5 mr-1.5" /> 保存
                </Button>
              </div>
            </div>
          </section>

          {/* Storage */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">数据存储</h2>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium">当前存储路径</p>
                <p className="text-xs text-muted-foreground mt-0.5 break-all font-mono">
                  {currentStorageDir || "加载中..."}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="storage-dir" className="text-sm font-medium">自定义路径</Label>
                <div className="flex gap-2">
                  <Input id="storage-dir" value={storageDirInput}
                    onChange={e => setStorageDirInput(e.target.value)}
                    placeholder="留空使用默认路径" className="flex-1" />
                  <Button type="button" variant="outline" size="icon" onClick={handlePickStorageDir}>
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">保存后重启应用生效，数据文件将自动复制到新位置</p>
              </div>
              <Button variant="outline" onClick={handleMigrateStorage} disabled={busy || !storageDirInput.trim()}>
                保存并迁移数据
              </Button>
            </div>
          </section>

          {/* Backup */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">备份与恢复</h2>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-medium">导出备份</h3>
                <p className="text-xs text-muted-foreground mt-0.5">将所有数据加密导出为 .pkv 文件</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="export-pw" className="text-xs">导出密码</Label>
                <Input id="export-pw" type="password" placeholder="设置备份密码"
                  value={exportPassword} onChange={e => setExportPassword(e.target.value)} />
              </div>
              <Button variant="outline" onClick={handleExport} disabled={busy}>
                <Download className="h-4 w-4 mr-2" /> 选择位置并导出
              </Button>
            </div>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-medium">导入数据</h3>
                <p className="text-xs text-muted-foreground mt-0.5">从 .pkv 备份文件导入数据</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import-pw" className="text-xs">备份密码</Label>
                <Input id="import-pw" type="password" placeholder="输入备份密码"
                  value={importPassword} onChange={e => setImportPassword(e.target.value)} />
              </div>
              <Button variant="outline" onClick={handleImport} disabled={busy}>
                <Upload className="h-4 w-4 mr-2" /> 选择文件并导入
              </Button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: SettingsPage with proxy config, favicon expiry, and storage dir migration"
```

---

### Task 11: Sticky Headers — GroupTree

**Files:**
- Modify: `src/components/GroupTree.tsx`

- [ ] **Step 1: Read `src/components/GroupTree.tsx` and add `sticky top-0 z-10 bg-background` to the header section**

Find the header/toolbar area at the top of GroupTree (typically the div containing the "Groups" title and add-group button) and add sticky positioning:

```tsx
// Find the existing header div and change its className to include:
className="sticky top-0 z-10 bg-background border-b border-border px-3 py-2 flex items-center justify-between shrink-0"
```

Also ensure the GroupTree container uses `flex flex-col h-full overflow-hidden` so the sticky header works within a scrollable container:
```tsx
// Outer wrapper:
<div className="flex flex-col h-full">
  {/* sticky header */}
  <div className="sticky top-0 z-10 bg-background border-b border-border ...">
    ...title and controls...
  </div>
  {/* scrollable content */}
  <div className="flex-1 overflow-y-auto">
    ...group tree items...
  </div>
</div>
```

- [ ] **Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/GroupTree.tsx
git commit -m "feat: sticky header for GroupTree column"
```

---

### Task 12: App Icon

**Files:**
- Create: `src-tauri/icons/icon.svg`
- Modify: `src-tauri/icons/` (generated PNG/ICO)

- [ ] **Step 1: Create `src-tauri/icons/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#2563EB"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="512" height="512" rx="110" fill="url(#bg)"/>
  <!-- Key ring (circle) -->
  <circle cx="210" cy="200" r="90" fill="none" stroke="white" stroke-width="36"/>
  <!-- Key stem -->
  <line x1="275" y1="245" x2="400" y2="370" stroke="white" stroke-width="36" stroke-linecap="round"/>
  <!-- Key teeth -->
  <line x1="345" y1="315" x2="375" y2="345" stroke="white" stroke-width="28" stroke-linecap="round"/>
  <line x1="370" y1="340" x2="400" y2="310" stroke="white" stroke-width="28" stroke-linecap="round"/>
  <!-- Data lines (password list) -->
  <rect x="310" y="390" width="120" height="18" rx="9" fill="white" opacity="0.7"/>
  <rect x="310" y="420" width="85"  height="18" rx="9" fill="white" opacity="0.5"/>
  <rect x="310" y="450" width="100" height="18" rx="9" fill="white" opacity="0.4"/>
</svg>
```

- [ ] **Step 2: Generate icons using Tauri CLI**

```bash
npm run tauri icon src-tauri/icons/icon.svg
```

This auto-generates all required icon files:
- `src-tauri/icons/32x32.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/icon.ico` (Windows multi-size)
- `src-tauri/icons/icon.png`
- and more

Expected output: `✓ Finished` with a list of generated files.

- [ ] **Step 3: Verify `tauri.conf.json` references `icons/icon.ico`**

Confirm that `src-tauri/tauri.conf.json` has:
```json
"bundle": {
  "icon": ["icons/icon.ico", "icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png"]
}
```

If it only has `["icons/icon.ico"]`, also add the PNG entries.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/icons/
git commit -m "feat: redesign app icon with gradient key design"
```

---

## Final Verification

- [ ] **Run all Rust tests**

```bash
cd src-tauri && cargo test 2>&1
```

Expected: all tests pass (≥27 tests).

- [ ] **Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Start dev server and smoke test**

```bash
npm run tauri dev
```

Manual checks:
1. Entry list: drag to reorder works, pin/unpin moves entry between sections
2. New entry dialog: quick-add buttons work, templates append fields, validation blocks invalid URLs/emails
3. Entry detail: sticky header stays visible on scroll, timestamps shown at bottom
4. Settings: proxy fields save and reload, storage dir picker opens folder dialog
5. App icon visible in taskbar/title bar
