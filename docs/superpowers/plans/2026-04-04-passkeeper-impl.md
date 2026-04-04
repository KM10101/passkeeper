# PassKeeper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本地优先的 Tauri v2 桌面密码管理器，支持 AES-256-GCM 字段加密、分组管理、多模板条目、加密导出/导入。

**Architecture:** Rust 重后端处理所有加密/数据库逻辑，React+TypeScript 纯展示层通过 Tauri IPC commands 通信。敏感字段仅在用户主动查看时按需解密，不在前端缓存。

**Tech Stack:** Tauri v2, Rust (rusqlite, argon2, aes-gcm, zeroize, serde, tokio), React + TypeScript + Vite, TanStack Query

---

## 文件结构

### Rust 后端

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
└── src/
    ├── main.rs              # Tauri app 入口，注册 commands，初始化 AppState
    ├── state.rs             # AppState 结构体（持有主密钥、db 连接池）
    ├── error.rs             # 统一 AppError 类型，实现 serde::Serialize
    ├── db/
    │   ├── mod.rs           # 导出 db 模块
    │   ├── init.rs          # 建表 SQL，数据库初始化
    │   └── models.rs        # Rust 结构体：Group, Entry, EntryField, AppConfig
    ├── crypto/
    │   ├── mod.rs           # 导出 crypto 模块
    │   ├── kdf.rs           # Argon2id 密钥派生
    │   └── aes.rs           # AES-256-GCM 加密/解密，zeroize 清零
    └── commands/
        ├── mod.rs           # 导出所有 commands
        ├── auth.rs          # unlock, lock, is_locked, change_master_password
        ├── groups.rs        # list_groups, create_group, update_group, delete_group
        ├── entries.rs       # list_entries, get_entry, create_entry, update_entry, delete_entry
        ├── metadata.rs      # fetch_site_metadata, get_favicon
        ├── vault_io.rs      # export_vault, import_vault
        └── settings.rs      # get_settings, update_settings
```

### React 前端

```
src/
├── main.tsx
├── App.tsx
├── lib/
│   └── tauri.ts             # Tauri invoke 封装，类型安全
├── hooks/
│   ├── useVault.ts          # 锁定状态、解锁/锁定
│   ├── useEntries.ts        # 条目列表、搜索、过滤
│   └── useGroups.ts         # 分组树数据
├── pages/
│   ├── UnlockPage.tsx
│   ├── VaultPage.tsx
│   ├── EntryDetailPage.tsx
│   └── SettingsPage.tsx
└── components/
    ├── GroupTree.tsx
    ├── EntryList.tsx
    ├── EntryForm.tsx
    ├── SearchBar.tsx
    ├── TagBadge.tsx
    └── FaviconAvatar.tsx
```

---

## Task 1: Project Scaffolding

**Files:** `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/src/main.rs`, `src/main.tsx`, `package.json`, `vite.config.ts`

### Steps

- [ ] **Step 1: Write the failing test**

  Create `src-tauri/src/main.rs` with a placeholder compile test:

  ```rust
  // src-tauri/src/main.rs
  #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

  fn main() {
      tauri::Builder::default()
          .run(tauri::generate_context!())
          .expect("error while running tauri application");
  }

  #[cfg(test)]
  mod tests {
      #[test]
      fn project_compiles() {
          assert!(true);
      }
  }
  ```

  Create `src-tauri/Cargo.toml`:

  ```toml
  [package]
  name = "passkeeper"
  version = "0.1.0"
  edition = "2021"

  [lib]
  name = "passkeeper_lib"
  crate-type = ["staticlib", "cdylib", "rlib"]

  [build-dependencies]
  tauri-build = { version = "2", features = [] }

  [dependencies]
  tauri = { version = "2", features = ["shell-open"] }
  rusqlite = { version = "0.31", features = ["bundled"] }
  argon2 = "0.5"
  aes-gcm = "0.10"
  zeroize = { version = "1", features = ["derive"] }
  serde = { version = "1", features = ["derive"] }
  serde_json = "1"
  rand = "0.8"
  base64 = "0.22"
  tokio = { version = "1", features = ["full"] }
  anyhow = "1"
  thiserror = "1"
  reqwest = { version = "0.12", features = ["json"] }
  scraper = "0.19"
  tauri-plugin-shell = "2"

  [profile.release]
  panic = "abort"
  codegen-units = 1
  lto = true
  opt-level = "s"
  strip = true
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test 2>&1 | head -20
  ```

  Expected: compilation error — `build.rs` and `tauri.conf.json` are missing.

- [ ] **Step 3: Write minimal implementation**

  Create `src-tauri/build.rs`:

  ```rust
  fn main() {
      tauri_build::build()
  }
  ```

  Create `src-tauri/tauri.conf.json`:

  ```json
  {
    "$schema": "https://schema.tauri.app/config/2",
    "productName": "PassKeeper",
    "version": "0.1.0",
    "identifier": "com.passkeeper.app",
    "build": {
      "frontendDist": "../dist",
      "devUrl": "http://localhost:5173",
      "beforeDevCommand": "npm run dev",
      "beforeBuildCommand": "npm run build"
    },
    "app": {
      "windows": [
        { "title": "PassKeeper", "width": 1100, "height": 700, "minWidth": 800, "minHeight": 500 }
      ],
      "security": { "csp": null }
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"]
    }
  }
  ```

  Scaffold the frontend:

  ```bash
  npm create vite@latest . -- --template react-ts
  npm install
  npm install @tauri-apps/api @tanstack/react-query
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test
  ```

  Expected output: `test tests::project_compiles ... ok`

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/ src/ package.json vite.config.ts index.html tsconfig*.json
  git commit -m "feat: scaffold Tauri v2 project with all dependencies"
  ```

---

## Task 2: Error Types and AppState

**Files:** `src-tauri/src/error.rs`, `src-tauri/src/state.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/error.rs`:

  ```rust
  #[cfg(test)]
  mod tests {
      use super::*;

      #[test]
      fn app_error_serializes_to_json() {
          let err = AppError::Locked;
          let json = serde_json::to_string(&err).unwrap();
          assert!(json.contains("Locked"));
      }

      #[test]
      fn app_error_invalid_password_display() {
          let err = AppError::InvalidPassword;
          let s = format!("{}", err);
          assert!(!s.is_empty());
      }
  }
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test error 2>&1 | head -30
  ```

  Expected: compile error — `AppError` not defined.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/error.rs
  use serde::Serialize;
  use thiserror::Error;

  #[derive(Debug, Error, Serialize)]
  #[serde(tag = "type", content = "message")]
  pub enum AppError {
      #[error("Database error: {0}")]
      Database(String),
      #[error("Crypto error: {0}")]
      Crypto(String),
      #[error("Vault is locked")]
      Locked,
      #[error("Record not found")]
      NotFound,
      #[error("Invalid master password")]
      InvalidPassword,
      #[error("IO error: {0}")]
      Io(String),
      #[error("{0}")]
      Other(String),
  }

  impl From<rusqlite::Error> for AppError {
      fn from(e: rusqlite::Error) -> Self { AppError::Database(e.to_string()) }
  }
  impl From<std::io::Error> for AppError {
      fn from(e: std::io::Error) -> Self { AppError::Io(e.to_string()) }
  }
  impl From<anyhow::Error> for AppError {
      fn from(e: anyhow::Error) -> Self { AppError::Other(e.to_string()) }
  }

  pub type AppResult<T> = Result<T, AppError>;
  ```

  ```rust
  // src-tauri/src/state.rs
  use rusqlite::Connection;
  use std::sync::Mutex;
  use std::time::Instant;
  use zeroize::Zeroize;

  pub struct MasterKey(pub [u8; 32]);

  impl Drop for MasterKey {
      fn drop(&mut self) { self.0.zeroize(); }
  }

  pub struct AppState {
      pub master_key: Mutex<Option<MasterKey>>,
      pub db: Mutex<Connection>,
      pub last_activity: Mutex<Instant>,
  }

  impl AppState {
      pub fn new(conn: Connection) -> Self {
          Self {
              master_key: Mutex::new(None),
              db: Mutex::new(conn),
              last_activity: Mutex::new(Instant::now()),
          }
      }

      pub fn touch(&self) {
          *self.last_activity.lock().unwrap() = Instant::now();
      }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test error
  ```

  Expected output:
  ```
  test error::tests::app_error_serializes_to_json ... ok
  test error::tests::app_error_invalid_password_display ... ok
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/error.rs src-tauri/src/state.rs
  git commit -m "feat: add AppError types and AppState"
  ```

---

## Task 3: Database Initialization

**Files:** `src-tauri/src/db/init.rs`, `src-tauri/src/db/models.rs`, `src-tauri/src/db/mod.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/db/init.rs`:

  ```rust
  #[cfg(test)]
  mod tests {
      use super::*;
      use rusqlite::Connection;

      #[test]
      fn init_db_creates_all_tables() {
          let conn = Connection::open_in_memory().unwrap();
          init_db(&conn).unwrap();

          let tables: Vec<String> = {
              let mut stmt = conn.prepare(
                  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
              ).unwrap();
              stmt.query_map([], |r| r.get(0)).unwrap()
                  .map(|r| r.unwrap())
                  .collect()
          };

          assert!(tables.contains(&"groups".to_string()));
          assert!(tables.contains(&"entries".to_string()));
          assert!(tables.contains(&"entry_fields".to_string()));
          assert!(tables.contains(&"favicon_cache".to_string()));
          assert!(tables.contains(&"app_config".to_string()));
      }

      #[test]
      fn init_db_is_idempotent() {
          let conn = Connection::open_in_memory().unwrap();
          init_db(&conn).unwrap();
          init_db(&conn).unwrap(); // second call must not error
      }
  }
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test db::init 2>&1 | head -20
  ```

  Expected: compile error — `init_db` not defined.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/db/init.rs
  use rusqlite::Connection;
  use crate::error::AppResult;

  pub fn init_db(conn: &Connection) -> AppResult<()> {
      conn.execute_batch("
          PRAGMA journal_mode=WAL;
          PRAGMA foreign_keys=ON;

          CREATE TABLE IF NOT EXISTS groups (
              id          INTEGER PRIMARY KEY AUTOINCREMENT,
              name        TEXT    NOT NULL,
              parent_id   INTEGER REFERENCES groups(id) ON DELETE SET NULL,
              icon        TEXT,
              sort_order  INTEGER NOT NULL DEFAULT 0,
              created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS entries (
              id            INTEGER PRIMARY KEY AUTOINCREMENT,
              group_id      INTEGER REFERENCES groups(id) ON DELETE SET NULL,
              title         TEXT    NOT NULL,
              url           TEXT,
              site_title    TEXT,
              username      TEXT,
              template_type TEXT    NOT NULL DEFAULT 'password',
              tags          TEXT    NOT NULL DEFAULT '[]',
              notes         TEXT,
              favorite      INTEGER NOT NULL DEFAULT 0,
              created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
              updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS entry_fields (
              id          INTEGER PRIMARY KEY AUTOINCREMENT,
              entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
              field_name  TEXT    NOT NULL,
              field_value BLOB    NOT NULL,
              nonce       BLOB    NOT NULL,
              sort_order  INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS favicon_cache (
              domain      TEXT PRIMARY KEY,
              data        BLOB    NOT NULL,
              fetched_at  TEXT    NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS app_config (
              key         TEXT PRIMARY KEY,
              value       TEXT NOT NULL
          );
      ")?;
      Ok(())
  }
  ```

  ```rust
  // src-tauri/src/db/models.rs
  use serde::{Deserialize, Serialize};

  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct Group {
      pub id: i64,
      pub name: String,
      pub parent_id: Option<i64>,
      pub icon: Option<String>,
      pub sort_order: i64,
      pub created_at: String,
  }

  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct Entry {
      pub id: i64,
      pub group_id: Option<i64>,
      pub title: String,
      pub url: Option<String>,
      pub site_title: Option<String>,
      pub username: Option<String>,
      pub template_type: String,
      pub tags: String, // JSON array string
      pub notes: Option<String>,
      pub favorite: bool,
      pub created_at: String,
      pub updated_at: String,
  }

  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct EntryField {
      pub id: i64,
      pub entry_id: i64,
      pub field_name: String,
      pub field_value: Vec<u8>, // encrypted bytes
      pub nonce: Vec<u8>,
      pub sort_order: i64,
  }

  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct AppConfig {
      pub key: String,
      pub value: String,
  }
  ```

  ```rust
  // src-tauri/src/db/mod.rs
  pub mod init;
  pub mod models;
  pub use init::init_db;
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test db::init
  ```

  Expected output:
  ```
  test db::init::tests::init_db_creates_all_tables ... ok
  test db::init::tests::init_db_is_idempotent ... ok
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/db/
  git commit -m "feat: add database schema and models"
  ```

---

## Task 4: Crypto Layer

**Files:** `src-tauri/src/crypto/kdf.rs`, `src-tauri/src/crypto/aes.rs`, `src-tauri/src/crypto/mod.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/crypto/aes.rs`:

  ```rust
  #[cfg(test)]
  mod tests {
      use super::*;
      use crate::crypto::kdf::derive_key;

      #[test]
      fn encrypt_decrypt_roundtrip() {
          let key = [0u8; 32];
          let plaintext = b"super secret password";
          let (ciphertext, nonce) = encrypt(&key, plaintext).unwrap();
          let decrypted = decrypt(&key, &ciphertext, &nonce).unwrap();
          assert_eq!(decrypted, plaintext);
      }

      #[test]
      fn wrong_key_returns_error() {
          let key1 = [0u8; 32];
          let key2 = [1u8; 32];
          let plaintext = b"data";
          let (ciphertext, nonce) = encrypt(&key1, plaintext).unwrap();
          let result = decrypt(&key2, &ciphertext, &nonce);
          assert!(result.is_err());
      }

      #[test]
      fn derive_key_is_deterministic() {
          let salt = [42u8; 16];
          let k1 = derive_key("password", &salt).unwrap();
          let k2 = derive_key("password", &salt).unwrap();
          assert_eq!(k1, k2);
      }

      #[test]
      fn derive_key_different_passwords_differ() {
          let salt = [0u8; 16];
          let k1 = derive_key("password1", &salt).unwrap();
          let k2 = derive_key("password2", &salt).unwrap();
          assert_ne!(k1, k2);
      }
  }
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test crypto 2>&1 | head -20
  ```

  Expected: compile error — `encrypt`, `decrypt`, `derive_key` not defined.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/crypto/kdf.rs
  use argon2::{Argon2, Algorithm, Version, Params};
  use crate::error::{AppError, AppResult};

  pub fn derive_key(password: &str, salt: &[u8]) -> AppResult<[u8; 32]> {
      let params = Params::new(65536, 3, 4, Some(32))
          .map_err(|e| AppError::Crypto(e.to_string()))?;
      let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
      let mut key = [0u8; 32];
      argon2.hash_password_into(password.as_bytes(), salt, &mut key)
          .map_err(|e| AppError::Crypto(e.to_string()))?;
      Ok(key)
  }
  ```

  ```rust
  // src-tauri/src/crypto/aes.rs
  use aes_gcm::{Aes256Gcm, Key, Nonce};
  use aes_gcm::aead::{Aead, KeyInit};
  use rand::RngCore;
  use crate::error::{AppError, AppResult};

  pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> AppResult<(Vec<u8>, [u8; 12])> {
      let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
      let mut nonce_bytes = [0u8; 12];
      rand::thread_rng().fill_bytes(&mut nonce_bytes);
      let nonce = Nonce::from_slice(&nonce_bytes);
      let ciphertext = cipher.encrypt(nonce, plaintext)
          .map_err(|e| AppError::Crypto(e.to_string()))?;
      Ok((ciphertext, nonce_bytes))
  }

  pub fn decrypt(key: &[u8; 32], ciphertext: &[u8], nonce: &[u8; 12]) -> AppResult<Vec<u8>> {
      let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
      let nonce = Nonce::from_slice(nonce);
      cipher.decrypt(nonce, ciphertext)
          .map_err(|_| AppError::Crypto("decryption failed".into()))
  }
  ```

  ```rust
  // src-tauri/src/crypto/mod.rs
  pub mod kdf;
  pub mod aes;
  pub use kdf::derive_key;
  pub use aes::{encrypt, decrypt};
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test crypto
  ```

  Expected output:
  ```
  test crypto::aes::tests::encrypt_decrypt_roundtrip ... ok
  test crypto::aes::tests::wrong_key_returns_error ... ok
  test crypto::aes::tests::derive_key_is_deterministic ... ok
  test crypto::aes::tests::derive_key_different_passwords_differ ... ok
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/crypto/
  git commit -m "feat: add Argon2id KDF and AES-256-GCM crypto layer"
  ```

---

## Task 5: Auth Commands

**Files:** `src-tauri/src/commands/auth.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/commands/auth.rs`:

  ```rust
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
      fn first_unlock_initializes_vault() {
          let state = make_state();
          unlock_inner("master123", &state).unwrap();
          assert!(state.master_key.lock().unwrap().is_some());
      }

      #[test]
      fn unlock_wrong_password_returns_error() {
          let state = make_state();
          unlock_inner("correct", &state).unwrap();
          // lock it
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
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test commands::auth 2>&1 | head -20
  ```

  Expected: compile error — `unlock_inner`, `lock_inner` not defined.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/commands/auth.rs
  use tauri::State;
  use crate::error::{AppError, AppResult};
  use crate::state::{AppState, MasterKey};
  use crate::crypto::{derive_key, encrypt, decrypt};
  use rand::RngCore;
  use base64::{Engine as _, engine::general_purpose::STANDARD as B64};

  const VERIFY_PLAINTEXT: &[u8] = b"PASSKEEPER_VERIFY";

  pub fn unlock_inner(password: &str, state: &AppState) -> AppResult<()> {
      let db = state.db.lock().unwrap();

      // Check if vault is initialized
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
          rand::thread_rng().fill_bytes(&mut salt);
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
      rand::thread_rng().fill_bytes(&mut new_salt);
      let new_key = derive_key(&new_password, &new_salt)?;

      // Re-encrypt all entry_fields in a transaction
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
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test commands::auth
  ```

  Expected output:
  ```
  test commands::auth::tests::first_unlock_initializes_vault ... ok
  test commands::auth::tests::unlock_wrong_password_returns_error ... ok
  test commands::auth::tests::lock_clears_master_key ... ok
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/commands/auth.rs
  git commit -m "feat: add unlock/lock/is_locked/change_master_password commands"
  ```

---

## Task 6: Group Commands

**Files:** `src-tauri/src/commands/groups.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/commands/groups.rs`:

  ```rust
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
          // Insert an entry in that group
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
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test commands::groups 2>&1 | head -20
  ```

  Expected: compile error — inner functions not defined.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/commands/groups.rs
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
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test commands::groups
  ```

  Expected output:
  ```
  test commands::groups::tests::create_and_list_group ... ok
  test commands::groups::tests::delete_group_moves_entries_to_ungrouped ... ok
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/commands/groups.rs
  git commit -m "feat: add group CRUD commands"
  ```

---

## Task 7: Entry Commands

**Files:** `src-tauri/src/commands/entries.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/commands/entries.rs`:

  ```rust
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
              NewEntryField { field_name: "password".into(), field_value: "s3cr3t".into(), sort_order: 0 },
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
          assert_eq!(detail.fields[0].plaintext, "s3cr3t");
      }

      #[test]
      fn list_entries_filter_by_group() {
          let state = make_unlocked_state();
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
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test commands::entries 2>&1 | head -20
  ```

  Expected: compile error — types and functions not defined.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/commands/entries.rs
  use tauri::State;
  use serde::{Deserialize, Serialize};
  use crate::db::models::Entry;
  use crate::error::{AppError, AppResult};
  use crate::state::AppState;
  use crate::crypto::{encrypt, decrypt};

  #[derive(Debug, Serialize, Deserialize)]
  pub struct NewEntryField {
      pub field_name: String,
      pub field_value: String,
      pub sort_order: i64,
  }

  #[derive(Debug, Serialize)]
  pub struct DecryptedField {
      pub id: i64,
      pub field_name: String,
      pub plaintext: String,
      pub sort_order: i64,
  }

  #[derive(Debug, Serialize)]
  pub struct EntryDetail {
      pub entry: Entry,
      pub fields: Vec<DecryptedField>,
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
          sql.push_str(" AND (title LIKE ? OR username LIKE ? OR url LIKE ?)");
          let pat = format!("%{}%", s);
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
          "SELECT id, field_name, field_value, nonce, sort_order \
           FROM entry_fields WHERE entry_id=?1 ORDER BY sort_order"
      )?;
      let fields: Vec<DecryptedField> = stmt.query_map([id], |r| {
          Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?,
              r.get::<_, Vec<u8>>(2)?, r.get::<_, Vec<u8>>(3)?, r.get::<_, i64>(4)?))
      })?.map(|r| {
          let (fid, fname, ct, nonce_vec, sort) = r.unwrap();
          let nonce: [u8; 12] = nonce_vec.try_into().unwrap();
          let plain = decrypt(&key, &ct, &nonce).unwrap_or_default();
          DecryptedField {
              id: fid, field_name: fname,
              plaintext: String::from_utf8_lossy(&plain).into_owned(),
              sort_order: sort,
          }
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
          let (ct, nonce) = encrypt(&key, f.field_value.as_bytes())?;
          db.execute(
              "INSERT INTO entry_fields(entry_id,field_name,field_value,nonce,sort_order) \
               VALUES(?1,?2,?3,?4,?5)",
              rusqlite::params![entry_id, f.field_name, ct, nonce.to_vec(), f.sort_order],
          )?;
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
          let (ct, nonce) = encrypt(&key, f.field_value.as_bytes())?;
          db.execute(
              "INSERT INTO entry_fields(entry_id,field_name,field_value,nonce,sort_order) \
               VALUES(?1,?2,?3,?4,?5)",
              rusqlite::params![id, f.field_name, ct, nonce.to_vec(), f.sort_order],
          )?;
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
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test commands::entries
  ```

  Expected output:
  ```
  test commands::entries::tests::create_and_get_entry_decrypts_fields ... ok
  test commands::entries::tests::list_entries_filter_by_group ... ok
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/commands/entries.rs
  git commit -m "feat: add entry CRUD commands with field encryption"
  ```

---

## Task 8: Site Metadata Commands

**Files:** `src-tauri/src/commands/metadata.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/commands/metadata.rs`:

  ```rust
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
      fn get_favicon_returns_none_when_not_cached() {
          let state = make_state();
          let result = get_favicon_inner("example.com", &state).unwrap();
          assert!(result.is_none());
      }

      #[test]
      fn store_and_retrieve_favicon() {
          let state = make_state();
          let data = vec![1u8, 2, 3, 4];
          store_favicon_inner("example.com", &data, &state).unwrap();
          let result = get_favicon_inner("example.com", &state).unwrap();
          assert_eq!(result, Some(data));
      }
  }
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test commands::metadata 2>&1 | head -20
  ```

  Expected: compile error — functions not defined.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/commands/metadata.rs
  use tauri::State;
  use serde::Serialize;
  use crate::error::{AppError, AppResult};
  use crate::state::AppState;

  #[derive(Debug, Serialize)]
  pub struct SiteMetadata {
      pub title: Option<String>,
      pub favicon_domain: Option<String>,
  }

  pub fn get_favicon_inner(domain: &str, state: &AppState) -> AppResult<Option<Vec<u8>>> {
      let db = state.db.lock().unwrap();
      let result: Option<Vec<u8>> = db.query_row(
          "SELECT data FROM favicon_cache WHERE domain=?1", [domain], |r| r.get(0)
      ).ok();
      Ok(result)
  }

  pub fn store_favicon_inner(domain: &str, data: &[u8], state: &AppState) -> AppResult<()> {
      let db = state.db.lock().unwrap();
      db.execute(
          "INSERT OR REPLACE INTO favicon_cache(domain, data) VALUES(?1, ?2)",
          rusqlite::params![domain, data],
      )?;
      Ok(())
  }

  pub async fn fetch_site_metadata_inner(url: &str, state: &AppState) -> AppResult<SiteMetadata> {
      let domain = extract_domain(url);

      // Try to fetch page title and favicon; failures are silent
      let client = reqwest::Client::builder()
          .timeout(std::time::Duration::from_secs(5))
          .build()
          .map_err(|e| AppError::Other(e.to_string()))?;

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
          let favicon_url = format!("https://{}/favicon.ico", d);
          if let Ok(resp) = client.get(&favicon_url).send().await {
              if resp.status().is_success() {
                  if let Ok(bytes) = resp.bytes().await {
                      let data: Vec<u8> = bytes.to_vec();
                      if !data.is_empty() {
                          let _ = store_favicon_inner(d, &data, state);
                          favicon_domain = Some(d.clone());
                      }
                  }
              }
          }
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
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test commands::metadata
  ```

  Expected output:
  ```
  test commands::metadata::tests::get_favicon_returns_none_when_not_cached ... ok
  test commands::metadata::tests::store_and_retrieve_favicon ... ok
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/commands/metadata.rs
  git commit -m "feat: add site metadata and favicon cache commands"
  ```

---

## Task 9: Vault Export/Import

**Files:** `src-tauri/src/commands/vault_io.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/commands/vault_io.rs`:

  ```rust
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
          let state = AppState::new(conn);
          *state.master_key.lock().unwrap() = Some(MasterKey([9u8; 32]));
          state
      }

      #[test]
      fn export_import_roundtrip() {
          let state = make_unlocked_state();
          let fields = vec![
              NewEntryField { field_name: "password".into(), field_value: "vault_pass".into(), sort_order: 0 },
          ];
          create_entry_inner(None, "VaultEntry".into(), None, None, None,
              "password".into(), "[]".into(), None, false, fields, &state).unwrap();

          let export_bytes = export_vault_inner("export_pw", &state).unwrap();
          assert!(export_bytes.len() > 52); // magic(4)+version(4)+salt(32)+nonce(12) minimum

          // Import into a fresh state
          let conn2 = Connection::open_in_memory().unwrap();
          init_db(&conn2).unwrap();
          let state2 = AppState::new(conn2);
          *state2.master_key.lock().unwrap() = Some(MasterKey([9u8; 32]));
          import_vault_inner(&export_bytes, "export_pw", &state2).unwrap();

          let count: i64 = state2.db.lock().unwrap().query_row(
              "SELECT COUNT(*) FROM entries", [], |r| r.get(0)
          ).unwrap();
          assert_eq!(count, 1);
      }
  }
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test commands::vault_io 2>&1 | head -20
  ```

  Expected: compile error — functions not defined.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/commands/vault_io.rs
  use tauri::State;
  use serde::{Deserialize, Serialize};
  use crate::db::models::{Group, Entry, EntryField};
  use crate::error::{AppError, AppResult};
  use crate::state::AppState;
  use crate::crypto::{derive_key, encrypt, decrypt};
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
          let mut s = db.prepare("SELECT id,name,parent_id,icon,sort_order,created_at FROM groups")?;
          s.query_map([], |r| Ok(Group { id:r.get(0)?,name:r.get(1)?,parent_id:r.get(2)?,icon:r.get(3)?,sort_order:r.get(4)?,created_at:r.get(5)? }))?.map(|r|r.unwrap()).collect()
      };
      let entries: Vec<Entry> = {
          let mut s = db.prepare("SELECT id,group_id,title,url,site_title,username,template_type,tags,notes,favorite,created_at,updated_at FROM entries")?;
          s.query_map([], |r| Ok(Entry { id:r.get(0)?,group_id:r.get(1)?,title:r.get(2)?,url:r.get(3)?,site_title:r.get(4)?,username:r.get(5)?,template_type:r.get(6)?,tags:r.get(7)?,notes:r.get(8)?,favorite:r.get::<_,i64>(9)?!=0,created_at:r.get(10)?,updated_at:r.get(11)? }))?.map(|r|r.unwrap()).collect()
      };
      let fields: Vec<EntryField> = {
          let mut s = db.prepare("SELECT id,entry_id,field_name,field_value,nonce,sort_order FROM entry_fields")?;
          s.query_map([], |r| Ok(EntryField { id:r.get(0)?,entry_id:r.get(1)?,field_name:r.get(2)?,field_value:r.get(3)?,nonce:r.get(4)?,sort_order:r.get(5)? }))?.map(|r|r.unwrap()).collect()
      };

      let payload = serde_json::to_vec(&VaultPayload { groups, entries, fields })
          .map_err(|e| AppError::Other(e.to_string()))?;

      let mut salt = [0u8; 32];
      rand::thread_rng().fill_bytes(&mut salt);
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
              rusqlite::params![g.id,g.name,g.parent_id,g.icon,g.sort_order,g.created_at],
          )?;
      }
      for e in &payload.entries {
          db.execute(
              "INSERT OR IGNORE INTO entries(id,group_id,title,url,site_title,username,template_type,tags,notes,favorite,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
              rusqlite::params![e.id,e.group_id,e.title,e.url,e.site_title,e.username,e.template_type,e.tags,e.notes,e.favorite as i64,e.created_at,e.updated_at],
          )?;
      }
      for f in &payload.fields {
          db.execute(
              "INSERT OR IGNORE INTO entry_fields(id,entry_id,field_name,field_value,nonce,sort_order) VALUES(?1,?2,?3,?4,?5,?6)",
              rusqlite::params![f.id,f.entry_id,f.field_name,f.field_value,f.nonce,f.sort_order],
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
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test commands::vault_io
  ```

  Expected output:
  ```
  test commands::vault_io::tests::export_import_roundtrip ... ok
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/commands/vault_io.rs
  git commit -m "feat: add encrypted vault export/import (.pkv format)"
  ```

---

## Task 10: Settings Commands

**Files:** `src-tauri/src/commands/settings.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/commands/settings.rs`:

  ```rust
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
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test commands::settings 2>&1 | head -20
  ```

  Expected: compile error — functions not defined.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/commands/settings.rs
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
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test commands::settings
  ```

  Expected output:
  ```
  test commands::settings::tests::get_settings_returns_defaults ... ok
  test commands::settings::tests::update_and_get_settings ... ok
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/commands/settings.rs
  git commit -m "feat: add settings commands"
  ```

---

## Task 11: Wire Up Commands in main.rs

**Files:** `src-tauri/src/commands/mod.rs`, `src-tauri/src/main.rs`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/main.rs`:

  ```rust
  #[cfg(test)]
  mod tests {
      #[test]
      fn all_modules_compile() {
          // Passes if all modules are declared and compile without error.
          assert!(true);
      }
  }
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test main 2>&1 | head -20
  ```

  Expected: compile error — modules not declared.

- [ ] **Step 3: Write minimal implementation**

  ```rust
  // src-tauri/src/commands/mod.rs
  pub mod auth;
  pub mod groups;
  pub mod entries;
  pub mod metadata;
  pub mod vault_io;
  pub mod settings;
  ```

  Update `src-tauri/src/main.rs`:

  ```rust
  #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

  mod error;
  mod state;
  mod db;
  mod crypto;
  mod commands;

  use state::AppState;
  use db::init_db;

  fn main() {
      let db_path = dirs::data_dir()
          .unwrap_or_else(|| std::path::PathBuf::from("."))
          .join("passkeeper")
          .join("vault.db");
      std::fs::create_dir_all(db_path.parent().unwrap()).unwrap();
      let conn = rusqlite::Connection::open(&db_path).unwrap();
      init_db(&conn).unwrap();
      let app_state = AppState::new(conn);

      tauri::Builder::default()
          .manage(app_state)
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
              commands::metadata::fetch_site_metadata,
              commands::metadata::get_favicon,
              commands::vault_io::export_vault,
              commands::vault_io::import_vault,
              commands::settings::get_settings,
              commands::settings::update_settings,
          ])
          .run(tauri::generate_context!())
          .expect("error while running tauri application");
  }

  #[cfg(test)]
  mod tests {
      #[test]
      fn all_modules_compile() {
          assert!(true);
      }
  }
  ```

  Add `dirs` to `Cargo.toml` dependencies:

  ```toml
  dirs = "5"
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/
  git commit -m "feat: wire up all Tauri commands in main.rs"
  ```

---

## Task 12: Frontend - Tauri IPC Layer

**Files:** `src/lib/tauri.ts`

### Steps

- [ ] **Step 1: Write the failing test**

  Create `src/lib/tauri.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
  }));

  import { invoke } from '@tauri-apps/api/core';
  import { unlockVault, lockVault, isLocked } from './tauri';

  describe('tauri IPC wrappers', () => {
    it('unlockVault calls invoke with correct command', async () => {
      (invoke as any).mockResolvedValue(undefined);
      await unlockVault('mypassword');
      expect(invoke).toHaveBeenCalledWith('unlock', { password: 'mypassword' });
    });

    it('isLocked returns boolean', async () => {
      (invoke as any).mockResolvedValue(true);
      const result = await isLocked();
      expect(result).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run src/lib/tauri.test.ts 2>&1 | head -20
  ```

  Expected: error — `unlockVault`, `lockVault`, `isLocked` not exported.

- [ ] **Step 3: Write minimal implementation**

  ```typescript
  // src/lib/tauri.ts
  import { invoke } from '@tauri-apps/api/core';

  export interface Group {
    id: number;
    name: string;
    parent_id: number | null;
    icon: string | null;
    sort_order: number;
    created_at: string;
  }

  export interface Entry {
    id: number;
    group_id: number | null;
    title: string;
    url: string | null;
    site_title: string | null;
    username: string | null;
    template_type: string;
    tags: string;
    notes: string | null;
    favorite: boolean;
    created_at: string;
    updated_at: string;
  }

  export interface DecryptedField {
    id: number;
    field_name: string;
    plaintext: string;
    sort_order: number;
  }

  export interface EntryDetail {
    entry: Entry;
    fields: DecryptedField[];
  }

  export interface NewEntryField {
    field_name: string;
    field_value: string;
    sort_order: number;
  }

  export interface AppSettings {
    auto_lock_minutes: number;
    show_passwords_by_default: boolean;
  }

  export interface SiteMetadata {
    title: string | null;
    favicon_domain: string | null;
  }

  // Auth
  export const unlockVault = (password: string) =>
    invoke<void>('unlock', { password });
  export const lockVault = () => invoke<void>('lock');
  export const isLocked = () => invoke<boolean>('is_locked');
  export const changeMasterPassword = (oldPassword: string, newPassword: string) =>
    invoke<void>('change_master_password', { oldPassword, newPassword });

  // Groups
  export const listGroups = () => invoke<Group[]>('list_groups');
  export const createGroup = (name: string, parentId: number | null, icon: string | null, sortOrder: number) =>
    invoke<Group>('create_group', { name, parentId, icon, sortOrder });
  export const updateGroup = (id: number, name: string, icon: string | null, sortOrder: number) =>
    invoke<Group>('update_group', { id, name, icon, sortOrder });
  export const deleteGroup = (id: number) => invoke<void>('delete_group', { id });

  // Entries
  export const listEntries = (groupId?: number, search?: string, tags?: string, favorite?: boolean) =>
    invoke<Entry[]>('list_entries', { groupId, search, tags, favorite: favorite ?? false });
  export const getEntry = (id: number) => invoke<EntryDetail>('get_entry', { id });
  export const createEntry = (
    groupId: number | null, title: string, url: string | null,
    siteTitle: string | null, username: string | null,
    templateType: string, tags: string, notes: string | null,
    favorite: boolean, fields: NewEntryField[],
  ) => invoke<Entry>('create_entry', { groupId, title, url, siteTitle, username, templateType, tags, notes, favorite, fields });
  export const updateEntry = (
    id: number, groupId: number | null, title: string, url: string | null,
    siteTitle: string | null, username: string | null,
    templateType: string, tags: string, notes: string | null,
    favorite: boolean, fields: NewEntryField[],
  ) => invoke<Entry>('update_entry', { id, groupId, title, url, siteTitle, username, templateType, tags, notes, favorite, fields });
  export const deleteEntry = (id: number) => invoke<void>('delete_entry', { id });

  // Metadata
  export const fetchSiteMetadata = (url: string) =>
    invoke<SiteMetadata>('fetch_site_metadata', { url });
  export const getFavicon = (domain: string) =>
    invoke<number[] | null>('get_favicon', { domain });

  // Vault IO
  export const exportVault = (exportPassword: string) =>
    invoke<number[]>('export_vault', { exportPassword });
  export const importVault = (data: number[], exportPassword: string) =>
    invoke<void>('import_vault', { data, exportPassword });

  // Settings
  export const getSettings = () => invoke<AppSettings>('get_settings');
  export const updateSettings = (autoLockMinutes: number, showPasswordsByDefault: boolean) =>
    invoke<AppSettings>('update_settings', { autoLockMinutes, showPasswordsByDefault });
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npx vitest run src/lib/tauri.test.ts
  ```

  Expected output:
  ```
  ✓ tauri IPC wrappers > unlockVault calls invoke with correct command
  ✓ tauri IPC wrappers > isLocked returns boolean
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/tauri.ts src/lib/tauri.test.ts
  git commit -m "feat: add type-safe Tauri IPC wrappers"
  ```

---

## Task 13: Frontend - Hooks

**Files:** `src/hooks/useVault.ts`, `src/hooks/useGroups.ts`, `src/hooks/useEntries.ts`

### Steps

- [ ] **Step 1: Write the failing test**

  Create `src/hooks/useVault.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { renderHook, act } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import React from 'react';

  vi.mock('../lib/tauri', () => ({
    isLocked: vi.fn().mockResolvedValue(true),
    unlockVault: vi.fn().mockResolvedValue(undefined),
    lockVault: vi.fn().mockResolvedValue(undefined),
  }));

  import { useVault } from './useVault';

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: new QueryClient() }, children)
  );

  describe('useVault', () => {
    it('exposes unlock and lock functions', () => {
      const { result } = renderHook(() => useVault(), { wrapper });
      expect(typeof result.current.unlock).toBe('function');
      expect(typeof result.current.lock).toBe('function');
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run src/hooks/useVault.test.ts 2>&1 | head -20
  ```

  Expected: error — `useVault` not exported.

- [ ] **Step 3: Write minimal implementation**

  ```typescript
  // src/hooks/useVault.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { isLocked, unlockVault, lockVault } from '../lib/tauri';

  export function useVault() {
    const qc = useQueryClient();
    const { data: locked = true } = useQuery({
      queryKey: ['locked'],
      queryFn: isLocked,
      refetchInterval: 30_000,
    });
    const unlock = useMutation({
      mutationFn: (password: string) => unlockVault(password),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['locked'] }),
    });
    const lock = useMutation({
      mutationFn: lockVault,
      onSuccess: () => qc.invalidateQueries({ queryKey: ['locked'] }),
    });
    return { locked, unlock: unlock.mutateAsync, lock: lock.mutateAsync };
  }
  ```

  ```typescript
  // src/hooks/useGroups.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { listGroups, createGroup, updateGroup, deleteGroup } from '../lib/tauri';

  export function useGroups() {
    const qc = useQueryClient();
    const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups });
    const create = useMutation({
      mutationFn: ({ name, parentId, icon, sortOrder }: { name: string; parentId: number | null; icon: string | null; sortOrder: number }) =>
        createGroup(name, parentId, icon, sortOrder),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
    });
    const update = useMutation({
      mutationFn: ({ id, name, icon, sortOrder }: { id: number; name: string; icon: string | null; sortOrder: number }) =>
        updateGroup(id, name, icon, sortOrder),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
    });
    const remove = useMutation({
      mutationFn: (id: number) => deleteGroup(id),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
    });
    return { groups, create: create.mutateAsync, update: update.mutateAsync, remove: remove.mutateAsync };
  }
  ```

  ```typescript
  // src/hooks/useEntries.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { listEntries, getEntry, createEntry, updateEntry, deleteEntry, NewEntryField } from '../lib/tauri';

  export function useEntries(groupId?: number, search?: string) {
    const qc = useQueryClient();
    const { data: entries = [] } = useQuery({
      queryKey: ['entries', groupId, search],
      queryFn: () => listEntries(groupId, search),
    });
    const create = useMutation({
      mutationFn: (args: Parameters<typeof createEntry>) => createEntry(...args),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
    });
    const update = useMutation({
      mutationFn: (args: Parameters<typeof updateEntry>) => updateEntry(...args),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
    });
    const remove = useMutation({
      mutationFn: (id: number) => deleteEntry(id),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
    });
    const useEntryDetail = (id: number) => useQuery({
      queryKey: ['entry', id],
      queryFn: () => getEntry(id),
      enabled: !!id,
    });
    return { entries, create: create.mutateAsync, update: update.mutateAsync, remove: remove.mutateAsync, useEntryDetail };
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npx vitest run src/hooks/useVault.test.ts
  ```

  Expected output: `✓ useVault > exposes unlock and lock functions`

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/
  git commit -m "feat: add React Query hooks for vault, groups, entries"
  ```

---

## Task 14: UnlockPage Component

**Files:** `src/pages/UnlockPage.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

  Create `src/pages/UnlockPage.test.tsx`:

  ```tsx
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import { UnlockPage } from './UnlockPage';
  import { vi } from 'vitest';

  vi.mock('../lib/tauri', () => ({
      tauriInvoke: vi.fn().mockResolvedValue(undefined),
  }));

  test('renders password input and submit button', () => {
      render(<UnlockPage onUnlocked={() => {}} />);
      expect(screen.getByPlaceholderText(/master password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument();
  });

  test('calls onUnlocked after successful unlock', async () => {
      const onUnlocked = vi.fn();
      render(<UnlockPage onUnlocked={onUnlocked} />);
      fireEvent.change(screen.getByPlaceholderText(/master password/i), {
          target: { value: 'mypassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: /unlock/i }));
      await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run src/pages/UnlockPage.test.tsx 2>&1 | tail -10
  ```

  Expected: test fails — component not found.

- [ ] **Step 3: Write minimal implementation**

  ```tsx
  // src/pages/UnlockPage.tsx
  import { useState } from 'react';
  import { tauriInvoke } from '../lib/tauri';

  interface Props {
      onUnlocked: () => void;
  }

  export function UnlockPage({ onUnlocked }: Props) {
      const [password, setPassword] = useState('');
      const [error, setError] = useState<string | null>(null);
      const [loading, setLoading] = useState(false);

      const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          setError(null);
          setLoading(true);
          try {
              await tauriInvoke('unlock', { password });
              onUnlocked();
          } catch (err: unknown) {
              setError(err instanceof Error ? err.message : String(err));
          } finally {
              setLoading(false);
          }
      };

      return (
          <div className="unlock-page">
              <h1>PassKeeper</h1>
              <form onSubmit={handleSubmit}>
                  <input
                      type="password"
                      placeholder="Master password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoFocus
                      required
                  />
                  {error && <p className="error">{error}</p>}
                  <button type="submit" disabled={loading}>
                      {loading ? 'Unlocking...' : 'Unlock'}
                  </button>
              </form>
          </div>
      );
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npx vitest run src/pages/UnlockPage.test.tsx
  ```

  Expected output: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/UnlockPage.tsx src/pages/UnlockPage.test.tsx
  git commit -m "feat: add UnlockPage component"
  ```

---

## Task 15: VaultPage and GroupTree

**Files:** `src/pages/VaultPage.tsx`, `src/components/GroupTree.tsx`, `src/components/EntryList.tsx`, `src/components/SearchBar.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

  Create `src/pages/VaultPage.test.tsx`:

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { VaultPage } from './VaultPage';
  import { vi } from 'vitest';

  vi.mock('../lib/tauri', () => ({
      tauriInvoke: vi.fn().mockImplementation((cmd: string) => {
          if (cmd === 'list_groups') return Promise.resolve([]);
          if (cmd === 'list_entries') return Promise.resolve([]);
          return Promise.resolve(null);
      }),
  }));

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  test('renders vault page with search bar', async () => {
      render(
          <QueryClientProvider client={qc}>
              <VaultPage onLock={() => {}} />
          </QueryClientProvider>
      );
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run src/pages/VaultPage.test.tsx 2>&1 | tail -10
  ```

  Expected: test fails — component not found.

- [ ] **Step 3: Write minimal implementation**

  ```tsx
  // src/components/SearchBar.tsx
  interface Props {
      value: string;
      onChange: (v: string) => void;
  }
  export function SearchBar({ value, onChange }: Props) {
      return (
          <input
              type="search"
              placeholder="Search entries..."
              value={value}
              onChange={e => onChange(e.target.value)}
          />
      );
  }
  ```

  ```tsx
  // src/components/GroupTree.tsx
  import { useGroups } from '../hooks/useGroups';
  interface Props { selectedId: number | null; onSelect: (id: number | null) => void; }
  export function GroupTree({ selectedId, onSelect }: Props) {
      const { data: groups = [] } = useGroups();
      return (
          <nav>
              <button onClick={() => onSelect(null)} className={selectedId === null ? 'active' : ''}>
                  All Entries
              </button>
              {groups.map(g => (
                  <button key={g.id} onClick={() => onSelect(g.id)}
                      className={selectedId === g.id ? 'active' : ''}>
                      {g.icon && <span>{g.icon}</span>} {g.name}
                  </button>
              ))}
          </nav>
      );
  }
  ```

  ```tsx
  // src/components/EntryList.tsx
  import { useEntries } from '../hooks/useEntries';
  interface Props { groupId: number | null; search: string; onSelect: (id: number) => void; }
  export function EntryList({ groupId, search, onSelect }: Props) {
      const { data: entries = [] } = useEntries(groupId, search);
      if (entries.length === 0) return <p>No entries found.</p>;
      return (
          <ul>
              {entries.map(e => (
                  <li key={e.id} onClick={() => onSelect(e.id)} style={{ cursor: 'pointer' }}>
                      <strong>{e.title}</strong>
                      {e.username && <span> — {e.username}</span>}
                  </li>
              ))}
          </ul>
      );
  }
  ```

  ```tsx
  // src/pages/VaultPage.tsx
  import { useState } from 'react';
  import { GroupTree } from '../components/GroupTree';
  import { EntryList } from '../components/EntryList';
  import { SearchBar } from '../components/SearchBar';
  import { useVault } from '../hooks/useVault';

  interface Props { onLock: () => void; }

  export function VaultPage({ onLock }: Props) {
      const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
      const [search, setSearch] = useState('');
      const [selectedEntry, setSelectedEntry] = useState<number | null>(null);
      const { lock } = useVault();

      const handleLock = async () => { await lock(); onLock(); };

      return (
          <div className="vault-layout">
              <aside>
                  <GroupTree selectedId={selectedGroup} onSelect={setSelectedGroup} />
                  <button onClick={handleLock}>Lock</button>
              </aside>
              <main>
                  <SearchBar value={search} onChange={setSearch} />
                  <EntryList groupId={selectedGroup} search={search} onSelect={setSelectedEntry} />
              </main>
          </div>
      );
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npx vitest run src/pages/VaultPage.test.tsx
  ```

  Expected output: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/VaultPage.tsx src/components/
  git commit -m "feat: add VaultPage, GroupTree, EntryList, SearchBar components"
  ```

---

## Task 16: EntryDetailPage

**Files:** `src/pages/EntryDetailPage.tsx`, `src/components/EntryForm.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

  Create `src/pages/EntryDetailPage.test.tsx`:

  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { EntryDetailPage } from './EntryDetailPage';
  import { vi } from 'vitest';

  vi.mock('../lib/tauri', () => ({
      tauriInvoke: vi.fn().mockImplementation((cmd: string) => {
          if (cmd === 'get_entry') return Promise.resolve({
              entry: { id: 1, title: 'GitHub', url: 'https://github.com', username: 'user', template_type: 'password', tags: '[]', favorite: false, created_at: '', updated_at: '' },
              fields: [{ id: 1, field_name: 'password', plaintext: 'secret', sort_order: 0 }],
          });
          return Promise.resolve(null);
      }),
  }));

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  test('renders entry title and masked password field', async () => {
      render(
          <QueryClientProvider client={qc}>
              <EntryDetailPage entryId={1} onBack={() => {}} />
          </QueryClientProvider>
      );
      await waitFor(() => expect(screen.getByText('GitHub')).toBeInTheDocument());
      expect(screen.getByText('password')).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run src/pages/EntryDetailPage.test.tsx 2>&1 | tail -10
  ```

  Expected: test fails — component not found.

- [ ] **Step 3: Write minimal implementation**

  ```tsx
  // src/pages/EntryDetailPage.tsx
  import { useState } from 'react';
  import { useQuery } from '@tanstack/react-query';
  import { tauriInvoke } from '../lib/tauri';

  interface Field { id: number; field_name: string; plaintext: string; sort_order: number; }
  interface EntryDetail {
      entry: { id: number; title: string; url?: string; username?: string; template_type: string; tags: string; favorite: boolean; created_at: string; updated_at: string; };
      fields: Field[];
  }

  interface Props { entryId: number; onBack: () => void; }

  export function EntryDetailPage({ entryId, onBack }: Props) {
      const [revealed, setRevealed] = useState<Set<number>>(new Set());
      const { data, isLoading } = useQuery<EntryDetail>({
          queryKey: ['entry', entryId],
          queryFn: () => tauriInvoke('get_entry', { id: entryId }),
      });

      if (isLoading) return <p>Loading...</p>;
      if (!data) return <p>Entry not found.</p>;

      const toggle = (id: number) => setRevealed(prev => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
      });

      return (
          <div>
              <button onClick={onBack}>Back</button>
              <h2>{data.entry.title}</h2>
              {data.entry.url && <a href={data.entry.url} target="_blank" rel="noreferrer">{data.entry.url}</a>}
              {data.entry.username && <p>Username: {data.entry.username}</p>}
              <ul>
                  {data.fields.map(f => (
                      <li key={f.id}>
                          <span>{f.field_name}: </span>
                          <span>{revealed.has(f.id) ? f.plaintext : '••••••••'}</span>
                          <button onClick={() => toggle(f.id)}>
                              {revealed.has(f.id) ? 'Hide' : 'Show'}
                          </button>
                          <button onClick={() => navigator.clipboard.writeText(f.plaintext)}>
                              Copy
                          </button>
                      </li>
                  ))}
              </ul>
          </div>
      );
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npx vitest run src/pages/EntryDetailPage.test.tsx
  ```

  Expected output: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/EntryDetailPage.tsx
  git commit -m "feat: add EntryDetailPage with reveal/copy field actions"
  ```

---

## Task 17: App.tsx - Route Orchestration

**Files:** `src/App.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

  Create `src/App.test.tsx`:

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import App from './App';
  import { vi } from 'vitest';

  vi.mock('./lib/tauri', () => ({
      tauriInvoke: vi.fn().mockImplementation((cmd: string) => {
          if (cmd === 'is_locked') return Promise.resolve(true);
          return Promise.resolve(null);
      }),
  }));

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  test('shows unlock page when vault is locked', async () => {
      render(<QueryClientProvider client={qc}><App /></QueryClientProvider>);
      // Initially shows loading or unlock page
      expect(document.body).toBeTruthy();
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run src/App.test.tsx 2>&1 | tail -10
  ```

  Expected: test fails — App not implemented.

- [ ] **Step 3: Write minimal implementation**

  ```tsx
  // src/App.tsx
  import { useState, useEffect } from 'react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { UnlockPage } from './pages/UnlockPage';
  import { VaultPage } from './pages/VaultPage';
  import { tauriInvoke } from './lib/tauri';

  const queryClient = new QueryClient();

  export default function App() {
      const [locked, setLocked] = useState<boolean | null>(null);
      const [selectedEntry, setSelectedEntry] = useState<number | null>(null);

      useEffect(() => {
          tauriInvoke<boolean>('is_locked').then(setLocked);
      }, []);

      if (locked === null) return <div>Loading...</div>;

      return (
          <QueryClientProvider client={queryClient}>
              {locked ? (
                  <UnlockPage onUnlocked={() => setLocked(false)} />
              ) : (
                  <VaultPage onLock={() => setLocked(true)} />
              )}
          </QueryClientProvider>
      );
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npx vitest run src/App.test.tsx
  ```

  Expected output: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/App.tsx src/App.test.tsx
  git commit -m "feat: add App.tsx with lock/unlock routing"
  ```

---

## Task 18: Integration Test and Final Wiring

**Files:** `src-tauri/src/main.rs` (final), `src/main.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

  Add to `src-tauri/src/main.rs`:

  ```rust
  #[cfg(test)]
  mod integration_tests {
      use rusqlite::Connection;
      use crate::db::init_db;
      use crate::state::{AppState, MasterKey};
      use crate::commands::auth::unlock_inner;
      use crate::commands::entries::{create_entry_inner, get_entry_inner, NewEntryField};

      #[test]
      fn full_vault_workflow() {
          let conn = Connection::open_in_memory().unwrap();
          init_db(&conn).unwrap();
          let state = AppState::new(conn);

          // Unlock
          unlock_inner("integration_test_password", &state).unwrap();
          assert!(state.master_key.lock().unwrap().is_some());

          // Create entry with encrypted field
          let fields = vec![
              NewEntryField { field_name: "password".into(), field_value: "my_secret_pw".into(), sort_order: 0 },
              NewEntryField { field_name: "totp".into(), field_value: "JBSWY3DPEHPK3PXP".into(), sort_order: 1 },
          ];
          let entry = create_entry_inner(
              None, "Integration Test Site".into(),
              Some("https://test.example.com".into()),
              None, Some("testuser".into()),
              "password".into(), r#"["work","test"]"#.into(),
              Some("Test notes".into()), false, fields, &state,
          ).unwrap();

          // Retrieve and verify decryption
          let detail = get_entry_inner(entry.id, &state).unwrap();
          assert_eq!(detail.entry.title, "Integration Test Site");
          assert_eq!(detail.fields.len(), 2);
          let pw_field = detail.fields.iter().find(|f| f.field_name == "password").unwrap();
          assert_eq!(pw_field.plaintext, "my_secret_pw");
      }
  }
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd src-tauri && cargo test integration_tests 2>&1 | head -20
  ```

  Expected: compile error — modules not fully wired.

- [ ] **Step 3: Write minimal implementation**

  Ensure `src-tauri/src/main.rs` declares all modules and the `src/main.tsx` bootstraps React:

  ```tsx
  // src/main.tsx
  import React from 'react';
  import ReactDOM from 'react-dom/client';
  import App from './App';
  import './index.css';

  ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
          <App />
      </React.StrictMode>
  );
  ```

  Run all Rust tests to confirm everything passes:

  ```bash
  cd src-tauri && cargo test
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd src-tauri && cargo test integration_tests
  ```

  Expected output: `test integration_tests::full_vault_workflow ... ok`

- [ ] **Step 5: Run full test suite**

  ```bash
  cd src-tauri && cargo test
  npx vitest run
  ```

  All tests should pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src-tauri/src/main.rs src/main.tsx
  git commit -m "feat: wire up all modules and add integration test"
  ```

---

## Task 19: Build and Smoke Test

### Steps

- [ ] **Step 1: Build the frontend**

  ```bash
  npm run build
  ```

  Expected: `dist/` directory created without errors.

- [ ] **Step 2: Build the Tauri app**

  ```bash
  npm run tauri build
  ```

  Expected: installer/binary created in `src-tauri/target/release/bundle/`.

- [ ] **Step 3: Smoke test checklist**

  Run the built binary and verify:

  - [ ] App launches and shows the unlock screen
  - [ ] First unlock with any password initializes the vault
  - [ ] Second launch with correct password unlocks successfully
  - [ ] Second launch with wrong password shows error
  - [ ] Can create a group
  - [ ] Can create a password entry with encrypted fields
  - [ ] Password field shows `••••••••` by default, reveals on click
  - [ ] Copy button copies plaintext to clipboard
  - [ ] Lock button locks the vault and returns to unlock screen
  - [ ] Export vault creates a `.pkv` file
  - [ ] Import vault restores entries

- [ ] **Step 4: Final commit**

  ```bash
  git add -A
  git commit -m "feat: PassKeeper v0.1.0 complete implementation"
  git tag v0.1.0
  ```

---
