# PassKeeper 功能完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 12 issues from requirements.md to bring PassKeeper to a polished, feature-complete state.

**Architecture:** Dependency-ordered: Rust schema/field-type system first → TypeScript type sync → plugin setup → UI components. Tasks 1-5 are backend/infrastructure; Tasks 6-12 are frontend.

**Tech Stack:** Tauri v2, Rust (rusqlite, aes-gcm), React 18, TypeScript, shadcn/ui, Tailwind CSS, Sonner (toast), @tauri-apps/plugin-shell, @tauri-apps/plugin-dialog

---

## File Map

| File | Action |
|---|---|
| `src-tauri/src/db/init.rs` | Add `field_type` column; make `nonce` nullable |
| `src-tauri/src/db/models.rs` | `EntryField`: add `field_type`; `nonce: Option<Vec<u8>>` |
| `src-tauri/src/commands/entries.rs` | Conditional encrypt by field_type; fix tag search |
| `src-tauri/src/commands/vault_io.rs` | Include field_type in export/import; add path commands |
| `src-tauri/src/main.rs` | Register shell + dialog plugins |
| `src-tauri/Cargo.toml` | Add `tauri-plugin-dialog = "2"` |
| `src-tauri/tauri.conf.json` | Fix icon array |
| `src-tauri/capabilities/default.json` | Create: grant shell + dialog permissions |
| `src/lib/tauri.ts` | Add field_type to interfaces; openUrl; dialog wrappers; path commands |
| `src/main.tsx` | Add `<Toaster />` |
| `src/components/layout/AppShell.tsx` | Drag-to-resize columns |
| `src/components/entries/EntryDetail.tsx` | field_type rendering; inline edit; AlertDialog; toast; URL open |
| `src/components/entries/EntryDialog.tsx` | field_type selector; token default field |
| `src/components/ui/alert-dialog.tsx` | Create shadcn AlertDialog |
| `src/pages/SettingsPage.tsx` | Full rewrite with styled import/export UI |
| `src/pages/UnlockPage.tsx` | Minor UI polish |
| `src/components/EntryList.tsx` | Empty state improvement |

---

## Task 1: Fix App Icon

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Update icon config**

In `src-tauri/tauri.conf.json`, change:
```json
"bundle": {
  "active": true,
  "targets": "all",
  "icon": []
}
```
to:
```json
"bundle": {
  "active": true,
  "targets": "all",
  "icon": ["icons/icon.ico"]
}
```

- [ ] **Step 2: Commit**
```bash
git add src-tauri/tauri.conf.json
git commit -m "fix: add app icon to bundle config"
```

---

## Task 2: Rust – Schema + Field Type System + Tag Search

**Files:**
- Modify: `src-tauri/src/db/init.rs`
- Modify: `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/commands/entries.rs`

This is the foundational task. All existing Rust tests that use `NewEntryField` must be updated to include `field_type`.

### Step 2.1 – Update schema

Replace the `entry_fields` table definition in `src-tauri/src/db/init.rs`. Change the entire `execute_batch` SQL string — replace the `entry_fields` block as follows:

```rust
// Old:
        CREATE TABLE IF NOT EXISTS entry_fields (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
            field_name  TEXT    NOT NULL,
            field_value BLOB    NOT NULL,
            nonce       BLOB    NOT NULL,
            sort_order  INTEGER NOT NULL DEFAULT 0
        );

// New:
        CREATE TABLE IF NOT EXISTS entry_fields (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
            field_name  TEXT    NOT NULL,
            field_type  TEXT    NOT NULL DEFAULT 'secret',
            field_value BLOB    NOT NULL,
            nonce       BLOB,
            sort_order  INTEGER NOT NULL DEFAULT 0
        );
```

- [ ] **Step 1: Write failing test for plaintext field storage**

Add to the `#[cfg(test)]` block in `src-tauri/src/commands/entries.rs`:

```rust
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
}
```

- [ ] **Step 2: Run test – verify it fails**
```bash
cd src-tauri && cargo test plaintext_field_stored_without_nonce 2>&1 | tail -20
```
Expected: FAIL (compile error – `field_type` does not exist on `NewEntryField`)

- [ ] **Step 3: Update `models.rs` – `EntryField` struct**

Replace the `EntryField` struct in `src-tauri/src/db/models.rs`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EntryField {
    pub id: i64,
    pub entry_id: i64,
    pub field_name: String,
    pub field_type: String,
    pub field_value: Vec<u8>,
    pub nonce: Option<Vec<u8>>,
    pub sort_order: i64,
}
```

- [ ] **Step 4: Update `entries.rs` – structs and storage logic**

Replace `NewEntryField` and `DecryptedField` structs:

```rust
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
```

Add the helper function before `get_key`:

```rust
fn is_encrypted_type(field_type: &str) -> bool {
    matches!(field_type, "password" | "secret" | "token")
}
```

Replace the field-insert loop in `create_entry_inner` (the `for f in &fields` block):

```rust
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
```

Apply the same replacement in `update_entry_inner` (same `for f in &fields` loop, same code, `entry_id` replaced with `id`):

```rust
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
```

Replace the `get_entry_inner` field-query block (from `let mut stmt = db.prepare` through `Ok(EntryDetail...)`):

```rust
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
        let nonce: [u8; 12] = nonce_vec.try_into().unwrap();
        let decrypted = decrypt(&key, &value_bytes, &nonce).unwrap_or_default();
        String::from_utf8_lossy(&decrypted).into_owned()
    } else {
        String::from_utf8_lossy(&value_bytes).into_owned()
    };
    DecryptedField { id: fid, field_name: fname, field_type: ftype, plaintext, sort_order: sort }
}).collect();
Ok(EntryDetail { entry, fields })
```

- [ ] **Step 5: Fix tag search in `list_entries_inner`**

In the `if let Some(s) = search` block, replace:

```rust
// Old:
sql.push_str(" AND (title LIKE ? OR username LIKE ? OR url LIKE ?)");
let pat = format!("%{}%", s);
params.push(rusqlite::types::Value::Text(pat.clone()));
params.push(rusqlite::types::Value::Text(pat.clone()));
params.push(rusqlite::types::Value::Text(pat));

// New:
sql.push_str(" AND (title LIKE ? OR username LIKE ? OR url LIKE ? OR tags LIKE ?)");
let pat = format!("%{}%", s);
params.push(rusqlite::types::Value::Text(pat.clone()));
params.push(rusqlite::types::Value::Text(pat.clone()));
params.push(rusqlite::types::Value::Text(pat.clone()));
params.push(rusqlite::types::Value::Text(pat));
```

- [ ] **Step 6: Update existing tests in `entries.rs` to include `field_type`**

In the `#[cfg(test)]` block, update the `create_and_get_entry_decrypts_fields` test:

```rust
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
```

Update `list_entries_filter_by_group` test (it uses `create_entry_inner` with empty `fields`, no change needed there since fields is `vec![]`).

- [ ] **Step 7: Run all Rust tests – verify they pass**
```bash
cd src-tauri && cargo test 2>&1 | tail -30
```
Expected: all tests pass (including `plaintext_field_stored_without_nonce`)

- [ ] **Step 8: Commit**
```bash
git add src-tauri/src/db/init.rs src-tauri/src/db/models.rs src-tauri/src/commands/entries.rs
git commit -m "feat: add field_type system with conditional encryption and fix tag search"
```

---

## Task 3: Rust – Update vault_io for field_type + Path-Based Commands

**Files:**
- Modify: `src-tauri/src/commands/vault_io.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write failing test for path-based export/import**

Add to the `#[cfg(test)]` block in `vault_io.rs`:

```rust
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
    let state2 = AppState::new(conn2);
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
```

- [ ] **Step 2: Run test – verify it fails**
```bash
cd src-tauri && cargo test export_import_with_field_type 2>&1 | tail -20
```
Expected: FAIL (compile error – `field_type` not in `NewEntryField`, `EntryField` mismatch)

- [ ] **Step 3: Update `vault_io.rs` – export/import to include `field_type`**

Update the fields query in `export_vault_inner`:

```rust
let fields: Vec<EntryField> = {
    let mut s = db.prepare(
        "SELECT id,entry_id,field_name,field_type,field_value,nonce,sort_order FROM entry_fields"
    )?;
    let x = s.query_map([], |r| Ok(EntryField {
        id: r.get(0)?, entry_id: r.get(1)?, field_name: r.get(2)?,
        field_type: r.get(3)?, field_value: r.get(4)?, nonce: r.get(5)?,
        sort_order: r.get(6)?,
    }))?.map(|r| r.unwrap()).collect();
    x
};
```

Update the field insert in `import_vault_inner`:

```rust
for f in &payload.fields {
    db.execute(
        "INSERT OR IGNORE INTO entry_fields(id,entry_id,field_name,field_type,field_value,nonce,sort_order) \
         VALUES(?1,?2,?3,?4,?5,?6,?7)",
        rusqlite::params![f.id, f.entry_id, f.field_name, f.field_type, f.field_value, f.nonce, f.sort_order],
    )?;
}
```

Also update the existing `export_import_roundtrip` test in `vault_io.rs` to add `field_type`:

```rust
let fields = vec![
    NewEntryField { field_name: "password".into(), field_type: "password".into(), field_value: "vault_pass".into(), sort_order: 0 },
];
```

- [ ] **Step 4: Add path-based commands at the bottom of `vault_io.rs` (before `#[cfg(test)]`)**

```rust
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
```

- [ ] **Step 5: Register new commands + plugins in `src-tauri/src/main.rs`**

Add to the `.invoke_handler(tauri::generate_handler![...])` list:
```rust
commands::vault_io::export_vault_to_path,
commands::vault_io::import_vault_from_path,
```

Add plugin registration after `.manage(app_state)`:
```rust
.plugin(tauri_plugin_shell::init())
.plugin(tauri_plugin_dialog::init())
```

The full updated `main.rs`:
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
            commands::metadata::fetch_site_metadata,
            commands::metadata::get_favicon,
            commands::vault_io::export_vault,
            commands::vault_io::import_vault,
            commands::vault_io::export_vault_to_path,
            commands::vault_io::import_vault_from_path,
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

- [ ] **Step 6: Add `tauri-plugin-dialog` to `Cargo.toml`**

In `[dependencies]`, add:
```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 7: Run all Rust tests – verify they pass**
```bash
cd src-tauri && cargo test 2>&1 | tail -30
```
Expected: all tests pass

- [ ] **Step 8: Commit**
```bash
git add src-tauri/src/commands/vault_io.rs src-tauri/src/main.rs src-tauri/Cargo.toml
git commit -m "feat: update vault_io for field_type and add path-based export/import commands"
```

---

## Task 4: Plugin Capabilities Config

**Files:**
- Create: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Create capabilities directory and file**

Create `src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default PassKeeper permissions",
  "windows": ["main"],
  "permissions": [
    "shell:allow-open",
    "dialog:allow-open",
    "dialog:allow-save"
  ]
}
```

- [ ] **Step 2: Verify Cargo builds (plugins registered correctly)**
```bash
cd src-tauri && cargo build 2>&1 | tail -20
```
Expected: Builds without errors

- [ ] **Step 3: Commit**
```bash
git add src-tauri/capabilities/default.json src-tauri/Cargo.lock
git commit -m "feat: add capability config for shell and dialog plugins"
```

---

## Task 5: Frontend – Install Dependencies + Update TypeScript Interfaces

**Files:**
- Modify: `src/lib/tauri.ts`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install frontend packages**
```bash
npm install sonner @tauri-apps/plugin-shell @tauri-apps/plugin-dialog @radix-ui/react-alert-dialog
```

- [ ] **Step 2: Update `src/lib/tauri.ts` – add field_type to interfaces**

Change `NewEntryField`:
```typescript
export interface NewEntryField {
  field_name: string;
  field_type: string;
  field_value: string;
  sort_order: number;
}
```

Change `DecryptedField`:
```typescript
export interface DecryptedField {
  id: number;
  field_name: string;
  field_type: string;
  plaintext: string;
  sort_order: number;
}
```

- [ ] **Step 3: Add new wrappers at the bottom of `src/lib/tauri.ts`**

Add these imports at the top of the file (after the existing `invoke` import):
```typescript
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { save as dialogSave, open as dialogOpen } from '@tauri-apps/plugin-dialog';
```

Add these exports at the bottom of the file:
```typescript
// Shell
export const openUrl = (url: string) => shellOpen(url);

// Dialog
export const saveFileDialog = (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
  dialogSave(options);
export const openFileDialog = (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
  dialogOpen({ ...options, multiple: false }) as Promise<string | null>;

// Vault IO – path-based
export const exportVaultToPath = (path: string, exportPassword: string) =>
  invoke<void>('export_vault_to_path', { path, exportPassword });
export const importVaultFromPath = (path: string, exportPassword: string) =>
  invoke<void>('import_vault_from_path', { path, exportPassword });
```

- [ ] **Step 4: Type-check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: Errors only in components that use `NewEntryField`/`DecryptedField` (not yet updated). No errors in `tauri.ts` itself.

- [ ] **Step 5: Commit**
```bash
git add src/lib/tauri.ts package.json package-lock.json
git commit -m "feat: update TypeScript interfaces for field_type and add plugin wrappers"
```

---

## Task 6: Toast System

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add Toaster to `src/main.tsx`**

Replace the entire file:
```tsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster position="bottom-right" richColors />
  </React.StrictMode>
);
```

- [ ] **Step 2: Commit**
```bash
git add src/main.tsx
git commit -m "feat: add Sonner toast system"
```

---

## Task 7: AlertDialog Component

**Files:**
- Create: `src/components/ui/alert-dialog.tsx`

- [ ] **Step 1: Create `src/components/ui/alert-dialog.tsx`**

```tsx
import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { cn } from "../../lib/utils"
import { buttonVariants } from "./button"

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants(), className)} {...props} />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogTrigger,
  AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle,
  AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/ui/alert-dialog.tsx
git commit -m "feat: add AlertDialog shadcn component"
```

---

## Task 8: EntryDialog – field_type Selector + Token Default Field

**Files:**
- Modify: `src/components/entries/EntryDialog.tsx`

- [ ] **Step 1: Update `EntryDialog.tsx`**

Replace the entire file with:

```tsx
import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { useGroups } from "../../hooks/useGroups";
import { useEntries } from "../../hooks/useEntries";
import type { EntryDetail } from "../../lib/tauri";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "secret", label: "Secret" },
  { value: "token", label: "Token" },
  { value: "password", label: "Password" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

interface CustomField {
  id: number;
  field_name: string;
  field_type: string;
  field_value: string;
  sort_order: number;
}

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setTitle(existing.entry.title);
      setUsername(existing.entry.username ?? "");
      setUrl(existing.entry.url ?? "");
      setNotes(existing.entry.notes ?? "");
      setTagsInput(existing.entry.tags);
      setGroupId(existing.entry.group_id);
      setFavorite(existing.entry.favorite);
      const pwField = existing.fields.find(f => f.field_name === "password");
      setPassword(pwField?.plaintext ?? "");
      setCustomFields(
        existing.fields
          .filter(f => f.field_name !== "password")
          .map((f, i) => ({
            id: i,
            field_name: f.field_name,
            field_type: f.field_type,
            field_value: f.plaintext,
            sort_order: f.sort_order,
          })),
      );
    } else {
      setTitle(""); setUsername(""); setPassword(""); setUrl("");
      setNotes(""); setTagsInput(""); setGroupId(defaultGroupId ?? null);
      setFavorite(false);
      setCustomFields([
        { id: 0, field_name: "token", field_type: "token", field_value: "", sort_order: 1 },
      ]);
    }
    setError(null);
    setShowPassword(false);
  }, [existing, defaultGroupId, open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true); setError(null);
    try {
      const fields = [
        { field_name: "password", field_type: "password", field_value: password, sort_order: 0 },
        ...customFields.map((f, i) => ({
          field_name: f.field_name,
          field_type: f.field_type,
          field_value: f.field_value,
          sort_order: i + 1,
        })),
      ];
      const args = {
        groupId, title: title.trim(), url: url.trim() || null, siteTitle: null,
        username: username.trim() || null, templateType: "login",
        tags: tagsInput.trim(), notes: notes.trim() || null, favorite, fields,
      };
      if (existing) {
        await updateEntry({ id: existing.entry.id, ...args });
      } else {
        await createEntry(args);
      }
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Entry" : "New Entry"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. GitHub" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="url">URL</Label>
            <Input id="url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="work, personal" />
            {tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group">Group</Label>
            <select
              id="group"
              value={groupId ?? ""}
              onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="favorite" checked={favorite} onCheckedChange={setFavorite} />
            <Label htmlFor="favorite">Favorite</Label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Custom Fields</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() =>
                setCustomFields(prev => [...prev, {
                  id: Date.now() + Math.random(),
                  field_name: "", field_type: "text", field_value: "", sort_order: prev.length + 1,
                }])
              }>
                <Plus className="h-3 w-3 mr-1" /> Add Field
              </Button>
            </div>
            {customFields.map((field, i) => (
              <div key={field.id} className="flex gap-2 items-center">
                <Input
                  placeholder="Name"
                  value={field.field_name}
                  onChange={e => setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, field_name: e.target.value } : f))}
                  className="w-1/4"
                />
                <select
                  value={field.field_type}
                  onChange={e => setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, field_type: e.target.value } : f))}
                  className="flex h-10 rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-[110px] shrink-0"
                >
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <Input
                  type={["password", "secret", "token"].includes(field.field_type) ? "password" : "text"}
                  placeholder="Value"
                  value={field.field_value}
                  onChange={e => setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, field_value: e.target.value } : f))}
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon"
                  onClick={() => setCustomFields(prev => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors in `EntryDialog.tsx`

- [ ] **Step 3: Commit**
```bash
git add src/components/entries/EntryDialog.tsx
git commit -m "feat: add field_type selector and default token field to EntryDialog"
```

---

## Task 9: EntryDetail – field_type Rendering + Inline Edit + Delete Dialog + Toast

**Files:**
- Modify: `src/components/entries/EntryDetail.tsx`

This is the largest frontend change. The component gets: field_type-aware rendering, inline editing, AlertDialog for delete, toast feedback, and URL open via shell.

- [ ] **Step 1: Replace `src/components/entries/EntryDetail.tsx`**

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

function FieldRow({
  field,
  onSave,
  onDelete,
  canDelete,
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

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const copy = () => {
    navigator.clipboard.writeText(field.plaintext);
    toast.success(`${field.field_name} 已复制`);
  };

  const commitEdit = async () => {
    if (editValue === field.plaintext) { setEditing(false); return; }
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

  const cancelEdit = () => {
    setEditValue(field.plaintext);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground capitalize">{field.field_name}</span>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Input
              ref={inputRef}
              type={isEncrypted ? "password" : "text"}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") cancelEdit();
              }}
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
              {isEncrypted && !show ? "••••••••" : field.plaintext}
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

  useEffect(() => {
    if (detail) setLocalFields(detail.fields);
  }, [detail]);

  if (isLoading || !detail) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>;
  }

  const { entry } = detail;
  const tags = entry.tags ? entry.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const domain = entry.url ? (() => { try { return new URL(entry.url).hostname; } catch { return null; } })() : null;
  const pwField = localFields.find(f => f.field_name === "password");
  const customFields = localFields.filter(f => f.field_name !== "password");

  const buildNewEntryFields = (fields: DecryptedField[]): NewEntryField[] =>
    fields.map(f => ({
      field_name: f.field_name,
      field_type: f.field_type,
      field_value: f.plaintext,
      sort_order: f.sort_order,
    }));

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
    const updated = localFields.map(f =>
      f.id === fieldId ? { ...f, plaintext: newValue } : f
    );
    setLocalFields(updated);
    await persistFields(updated);
    toast.success("字段已更新");
  };

  const handleFieldDelete = async (fieldId: number) => {
    const updated = localFields.filter(f => f.id !== fieldId);
    setLocalFields(updated);
    await persistFields(updated);
    toast.success("字段已删除");
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
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {domain ? (
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=48`} alt="" className="w-8 h-8"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span className="text-xl font-bold text-muted-foreground">{entry.title.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold truncate">{entry.title}</h2>
            {entry.favorite && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />}
          </div>
          {entry.url && (
            <button
              onClick={() => openUrl(entry.url!)}
              className="text-sm text-primary hover:underline truncate block text-left"
            >
              {domain}
            </button>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="outline" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
      )}

      {/* Fields */}
      <div className="flex flex-col">
        {entry.username && (
          <div className="flex flex-col gap-0.5 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground">Username</span>
            <div className="flex items-center gap-2">
              <span className="text-sm flex-1 break-all font-mono">{entry.username}</span>
              <button onClick={() => { navigator.clipboard.writeText(entry.username!); toast.success("Username 已复制"); }}
                className="text-muted-foreground hover:text-foreground">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        {pwField && (
          <FieldRow field={pwField} onSave={handleFieldSave} onDelete={handleFieldDelete} canDelete={false} />
        )}
        {entry.url && (
          <div className="flex flex-col gap-0.5 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground">URL</span>
            <div className="flex items-center gap-2">
              <span className="text-sm flex-1 break-all font-mono">{entry.url}</span>
              <button onClick={() => openUrl(entry.url!)} className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { navigator.clipboard.writeText(entry.url!); toast.success("URL 已复制"); }}
                className="text-muted-foreground hover:text-foreground">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        {entry.notes && (
          <div className="flex flex-col gap-0.5 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground">Notes</span>
            <span className="text-sm whitespace-pre-wrap">{entry.notes}</span>
          </div>
        )}
        {customFields.map(f => (
          <FieldRow key={f.id} field={f} onSave={handleFieldSave} onDelete={handleFieldDelete} canDelete />
        ))}
      </div>

      {/* Add field */}
      {addingField ? (
        <div className="flex gap-2 items-center mt-2">
          <Input placeholder="Field name" value={newFieldName} onChange={e => setNewFieldName(e.target.value)}
            className="w-1/4 h-8 text-sm" onKeyDown={e => { if (e.key === "Escape") setAddingField(false); }} />
          <select
            value={newFieldType}
            onChange={e => setNewFieldType(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none w-[100px] shrink-0"
          >
            {["text","secret","token","password","url","email","number","date"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Input placeholder="Value" value={newFieldValue} onChange={e => setNewFieldValue(e.target.value)}
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
        <button
          onClick={() => setAddingField(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-1 w-fit"
        >
          <Plus className="h-3.5 w-3.5" /> Add field
        </button>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 "{entry.title}"？</AlertDialogTitle>
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

- [ ] **Step 2: Type-check**
```bash
npx tsc --noEmit 2>&1 | head -40
```
Expected: No errors

- [ ] **Step 3: Commit**
```bash
git add src/components/entries/EntryDetail.tsx
git commit -m "feat: EntryDetail with field_type rendering, inline edit, AlertDialog, toast, URL open"
```

---

## Task 10: Resizable Columns

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Replace `src/components/layout/AppShell.tsx`**

```tsx
import { useState, useCallback, useRef, type ReactNode } from "react";
import { Moon, Sun, Lock } from "lucide-react";
import { Button } from "../ui/button";
import { useTheme } from "./ThemeProvider";

interface AppShellProps {
  sidebar: ReactNode;
  entryList: ReactNode;
  detail: ReactNode;
  onLock: () => void;
}

export function AppShell({ sidebar, entryList, detail, onLock }: AppShellProps) {
  const { theme, toggleTheme } = useTheme();
  const [sidebarW, setSidebarW] = useState(220);
  const [listW, setListW] = useState(320);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback((
    setter: (w: number) => void,
    min: number,
    getMax: () => number,
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = setter === setSidebarW ? sidebarW : listW;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setter(Math.max(min, Math.min(getMax(), startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarW, listW]);

  const getContainerWidth = () => containerRef.current?.offsetWidth ?? 1100;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center px-4 h-12 border-b border-border shrink-0">
        <span className="font-bold text-primary text-lg">PassKeeper</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onLock} title="Lock vault">
          <Lock className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden" ref={containerRef}>
        {/* Sidebar */}
        <aside className="shrink-0 border-r border-border flex flex-col overflow-y-auto" style={{ width: sidebarW }}>
          {sidebar}
        </aside>

        {/* Drag handle 1 */}
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors active:bg-primary/50"
          onMouseDown={startDrag(setSidebarW, 160, () => getContainerWidth() - listW - 300)}
        />

        {/* Entry list */}
        <section className="shrink-0 border-r border-border flex flex-col overflow-y-auto" style={{ width: listW }}>
          {entryList}
        </section>

        {/* Drag handle 2 */}
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors active:bg-primary/50"
          onMouseDown={startDrag(setListW, 200, () => getContainerWidth() - sidebarW - 300)}
        />

        {/* Detail */}
        <main className="flex-1 overflow-y-auto">
          {detail}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: resizable three-column layout with drag handles"
```

---

## Task 11: SettingsPage – Import/Export UI

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Replace `src/pages/SettingsPage.tsx`**

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload, Lock } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  getSettings, updateSettings, exportVaultToPath, importVaultFromPath,
  saveFileDialog, openFileDialog,
} from "../lib/tauri";

interface Props { onBack: () => void; }

export function SettingsPage({ onBack }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [autoLock, setAutoLock] = useState(settings?.auto_lock_minutes ?? 5);
  const [showPw, setShowPw] = useState(settings?.show_passwords_by_default ?? false);
  const [exportPassword, setExportPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const saveSettings = useMutation({
    mutationFn: () => updateSettings(autoLock, showPw),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("设置已保存");
    },
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
    } finally {
      setBusy(false);
    }
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center gap-3 px-6 h-14 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">Settings</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Auto-lock */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">安全</h2>
          <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="autolock" className="text-sm font-medium">自动锁定</Label>
                <p className="text-xs text-muted-foreground mt-0.5">无操作后自动锁定（分钟）</p>
              </div>
              <Input
                id="autolock"
                type="number"
                min={1}
                max={60}
                value={autoLock}
                onChange={e => setAutoLock(Number(e.target.value))}
                className="w-20 text-center"
              />
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
                <Lock className="h-3.5 w-3.5 mr-1.5" />
                保存设置
              </Button>
            </div>
          </div>
        </section>

        {/* Export */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">备份与恢复</h2>
          <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium">导出备份</h3>
              <p className="text-xs text-muted-foreground mt-0.5">将所有数据加密导出为 .pkv 文件</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-pw" className="text-xs">导出密码</Label>
              <Input
                id="export-pw"
                type="password"
                placeholder="设置备份密码"
                value={exportPassword}
                onChange={e => setExportPassword(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={handleExport} disabled={busy}>
              <Download className="h-4 w-4 mr-2" />
              选择位置并导出
            </Button>
          </div>

          {/* Import */}
          <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium">导入数据</h3>
              <p className="text-xs text-muted-foreground mt-0.5">从 .pkv 备份文件导入数据（不覆盖现有条目）</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-pw" className="text-xs">备份密码</Label>
              <Input
                id="import-pw"
                type="password"
                placeholder="输入备份密码"
                value={importPassword}
                onChange={e => setImportPassword(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={handleImport} disabled={busy}>
              <Upload className="h-4 w-4 mr-2" />
              选择文件并导入
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add settings button to `AppShell` and wire `SettingsPage` in `VaultPage`**

`SettingsPage` is not yet connected. Two changes needed:

**a) Add Settings icon to `src/components/layout/AppShell.tsx`** — add `Settings` to the lucide import and add a button to the header (before the theme toggle):

```tsx
import { Moon, Sun, Lock, Settings } from "lucide-react";
// ...
interface AppShellProps {
  sidebar: ReactNode;
  entryList: ReactNode;
  detail: ReactNode;
  onLock: () => void;
  onSettings: () => void;  // add this
}
// In the header, before the theme toggle button:
<Button variant="ghost" size="icon" onClick={onSettings} title="Settings">
  <Settings className="h-4 w-4" />
</Button>
```

**b) Update `src/pages/VaultPage.tsx`** — add `showSettings` state and conditionally render `SettingsPage`:

```tsx
import { SettingsPage } from "./SettingsPage";

// inside VaultPage:
const [showSettings, setShowSettings] = useState(false);

// In the JSX, wrap the return:
if (showSettings) {
  return <SettingsPage onBack={() => setShowSettings(false)} />;
}

// Pass onSettings to AppShell:
<AppShell
  onLock={handleLock}
  onSettings={() => setShowSettings(true)}
  // ...rest of props
/>
```

- [ ] **Step 3: Type-check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors

- [ ] **Step 4: Commit**
```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: rebuild SettingsPage with styled import/export UI"
```

---

## Task 12: UI Polish – EntryList Empty State + UnlockPage

**Files:**
- Modify: `src/components/EntryList.tsx`
- Modify: `src/pages/UnlockPage.tsx`

- [ ] **Step 1: Update empty state in `src/components/EntryList.tsx`**

Replace the empty state block (the `entries.length === 0` branch):

```tsx
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
```

Add `Plus` to the import line: `import { Search, Plus } from "lucide-react";`

- [ ] **Step 2: Polish `src/pages/UnlockPage.tsx`**

Replace the entire file:

```tsx
import { useState } from "react";
import type { FormEvent } from "react";
import { Moon, Sun, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useTheme } from "../components/layout/ThemeProvider";
import { unlockVault } from "../lib/tauri";

interface Props { onUnlocked: () => void; }

export function UnlockPage({ onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await unlockVault(password);
      onUnlocked();
    } catch {
      setError("密码错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
            <ShieldCheck className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">PassKeeper</h1>
            <p className="text-sm text-muted-foreground mt-1">输入主密码以解锁密码库</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">主密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="h-11"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button type="submit" disabled={loading} className="w-full h-11 text-base">
            {loading ? "解锁中…" : "解锁"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          所有数据本地加密存储，从不上传
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors

- [ ] **Step 4: Final Rust test run**
```bash
cd src-tauri && cargo test 2>&1 | tail -20
```
Expected: All tests pass

- [ ] **Step 5: Commit**
```bash
git add src/components/EntryList.tsx src/pages/UnlockPage.tsx
git commit -m "feat: improve empty state and unlock page UI"
```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| #1 图标缺失 | Task 1 |
| #2 布局不可调整 | Task 10 |
| #3 删除确认样式差 | Task 7 + Task 9 |
| #4 复制无反馈 | Task 6 + Task 9 |
| #5 缺少导入导出功能 | Task 3 + Task 11 |
| #6 标签不可搜索 | Task 2 (Step 5) |
| #7 缺少默认 Token 字段 | Task 8 |
| #8 自定义字段无法选择加密 | Task 2 + Task 8 |
| #9 详情页无法直接编辑字段 | Task 9 |
| #10 操作无成功提示 | Task 6 + Task 9 |
| #11 URL 无法点击打开 | Task 5 + Task 9 |
| #12 整体 UI 不够美观 | Task 8, 10, 11, 12 |
