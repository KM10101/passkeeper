# PassKeeper Iteration 5 — Design Spec

**Date:** 2026-04-06
**Source PRD:** `docs/prds/prd-20260406-1830.md`
**Implementation approach:** Risk-tiered grouping (Tier 1 → Tier 2 → Tier 3)

---

## Overview

9 features grouped into 3 tiers by complexity:

- **Tier 1 (quick wins, no schema changes):** multiline fields, proxy toggle, timezone dropdown, export timestamp filename
- **Tier 2 (logic/drag, no new tables):** group pin + drag-to-reorder, field reorder in entry editor, fix storage migration bug
- **Tier 3 (new architecture):** full-page entry editor, template management system

---

## Tier 1: Quick Wins

### Feature 5 — Multiline text/secret fields

**Problem:** `text` and `secret` field types only support single-line input.

**Solution:**
- In `EntryDialog.tsx` and `EntryDetail.tsx`, replace `<Input>` with `<Textarea>` for fields of type `text` or `secret`.
- Textarea auto-resizes to content. Uses `font-mono` styling.
- For `secret` type: keep show/hide toggle; when hidden, mask textarea content via CSS (`-webkit-text-security: disc` or replace with dots).
- No backend changes — `entry_fields.field_value` is already a BLOB that handles arbitrary length.

### Feature 6 — Proxy enable/disable toggle

**Problem:** No way to disable the proxy without clearing the proxy URL.

**Solution:**
- Add `proxy_enabled: bool` to `AppSettings` struct in `src-tauri/src/commands/settings.rs`.
- Store as key `proxy_enabled` (`"true"`/`"false"`) in `app_config` table. Default: `false`.
- In `SettingsPage.tsx`, add a `<Switch>` labeled "启用代理" before the proxy URL input. When switch is off, proxy URL and no-proxy inputs are visually disabled (`opacity-50`, `pointer-events-none`). URL value is preserved.
- Backend: when `proxy_enabled` is false, ignore `http_proxy` when making HTTP requests (favicon fetching).

### Feature 7 — Timezone filterable dropdown

**Problem:** Timezone is a free-text input — no validation, no discoverability.

**Solution:**
- Replace the `<Input>` for timezone in `SettingsPage.tsx` with a `<Combobox>` (same pattern as field-type-combobox).
- Populate options from `Intl.supportedValuesOf('timeZone')` at render time (browser-native, no external data needed).
- Type-to-filter by timezone string. First option is always "系统默认" (empty string, uses system timezone). Selected value stored and saved the same way as before.
- No backend changes.

### Feature 9 — Export timestamp filename

**Problem:** Users must manually type the export filename; risk of overwriting previous backups.

**Solution:**
- In `SettingsPage.tsx`, when the user clicks "导出", generate a default filename: `passkeeper-YYYYMMDD-HHmm.pkv` using `new Date()` formatted with zero-padded values.
- Pass this as the `defaultPath` option to `saveFileDialog()`. User can still edit the name before saving.
- No backend changes.

---

## Tier 2: Logic & Drag Complexity

### Feature 1 — Group pin + drag-to-reorder

**Problem:** Groups can only be reordered implicitly by name; no manual ordering or pinning.

**Schema change:**
- Add `is_pinned INTEGER NOT NULL DEFAULT 0` to `groups` table (migration in `db/init.rs`).

**Backend changes:**
- `list_groups`: update ORDER BY to `is_pinned DESC, sort_order ASC, name ASC`.
- New command `toggle_group_pin(id)`: flips `is_pinned` for the given group.
- New command `reorder_groups(items: Vec<{id, sort_order}>)`: bulk-updates `sort_order` for provided group IDs in a single transaction.
- Add typed wrappers to `src/lib/tauri.ts`.
- Add mutations to `src/hooks/useGroups.ts`.

**Frontend changes (`GroupTree.tsx`):**
- Add `@dnd-kit/core` and `@dnd-kit/sortable` (install as new deps).
- Each `GroupItem` gets a drag handle icon (shown on hover). `DndContext` + `SortableContext` wraps the list.
- On drag-end: derive new `sort_order` values from array indices, call `reorder_groups`.
- Pinned groups: rendered with a distinct background tint and a pin icon badge. Pinning/unpinning via a hover button (pin icon) on each group card — calls `toggle_group_pin`.
- Pinned groups always sort above unpinned regardless of `sort_order`.

### Feature 3 — Field reorder in entry editor

**Problem:** Fields in the entry editor have no UI for reordering; `sort_order` exists in DB but is never exposed.

**Solution:**
- No schema change — `entry_fields.sort_order` already exists.
- In the field list component shared by `EntryDialog.tsx` (and the new `EntryPage.tsx` from Tier 3), add `@dnd-kit/sortable` drag handles on each field row.
- On drag-end: update local field array order. `sort_order` is derived from array index on save (0-indexed).
- Same pattern applied in `EntryDetail.tsx` inline edit mode.
- `@dnd-kit` is already added for groups (Tier 1); reuse the same dependency.

### Feature 8 — Fix storage migration

**Problem:** `migrate_storage_inner` copies the DB to the new path, then writes `storage_dir` into the currently-open (old) DB. On restart, the app opens the new DB (the copy made before the config write), which still contains the old `storage_dir`. This creates a redirect loop or fallback to default path.

**Fix:**
1. In `migrate_storage_inner` (`commands/settings.rs`): after copying the DB file, open a **second temporary `rusqlite::Connection`** to the new DB file and write `storage_dir` there before closing it.
2. Also write `storage_dir` to a small plaintext sidecar file at `<app_data_dir>/passkeeper.conf` (simple `key=value` format). This file is read at startup in `main.rs` **before** opening any DB connection, so the correct DB path is always known even across restarts.
3. On every successful `update_settings` call that changes `storage_dir`, also update the sidecar file.
4. On startup: if sidecar exists and its `storage_dir` is valid, use it; otherwise fall back to default path.

---

## Tier 3: New Architecture

### Feature 2 — Full-page entry editor

**Problem:** The entry editor is a modal dialog that can't be resized independently of the app window.

**Solution:**
- Add React Router routes `/entry/new` and `/entry/:id/edit` in `App.tsx`.
- Create `src/pages/EntryPage.tsx`: full-page entry editor with:
  - Top bar: back button (← navigates back), title ("新建条目" / "编辑条目"), save button.
  - Body: same form fields as the current `EntryDialog` (title, dynamic fields, metadata section).
  - Fills the main content area; three-column layout is hidden while entry page is active.
- Extract the shared form logic from `EntryDialog.tsx` into a `src/components/entries/EntryForm.tsx` component. `EntryPage.tsx` renders `EntryForm`.
- Update all "new entry" triggers (button in `EntryList`) and "edit entry" triggers (button in `EntryDetail`) to use `navigate('/entry/new')` / `navigate('/entry/:id/edit')` instead of opening `EntryDialog`.
- Retire `EntryDialog.tsx` (remove file).
- Navigation back: pass current `groupId` as query param so the vault view restores the correct group and entry after returning.

### Feature 4 — Template management

**Schema — new `templates` table:**
```sql
CREATE TABLE IF NOT EXISTS templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  is_builtin  INTEGER NOT NULL DEFAULT 0,
  fields      TEXT NOT NULL,  -- JSON array: [{name, field_type}]
  created_at  INTEGER NOT NULL
);
```
Builtin templates (`账号密码`, `API/Token`, `银行卡`, `笔记`) are seeded in `db/init.rs` with `is_builtin = 1`.

**Backend — new `commands/templates.rs`:**
- `list_templates()` → `Vec<Template>`
- `create_template(name, fields)` → `Template`
- `update_template(id, name, fields)` → `Template` (builtin and custom both editable)
- `delete_template(id)` → `()` (returns error if `is_builtin = 1`)
- `reset_builtin_template(id)` → `Template` (resets fields to hardcoded defaults for builtin templates)
- Register all commands in `main.rs`. Add typed wrappers to `src/lib/tauri.ts`. Add `useTemplates` hook in `src/hooks/`.

**Frontend — Templates tab in Settings:**
- Add "模版" tab to `SettingsPage.tsx` tab list.
- `TemplatesSettings` component: list of template cards. Each shows name, field count, edit/delete buttons. Builtin templates show "重置" instead of delete.
- Clicking "编辑" opens an inline editor panel (below the card or as a collapsible section): name input + field list with the same `@dnd-kit/sortable` drag handles. Field rows: name input + type combobox + remove button. "添加字段" button at bottom.
- "新建模版" button at top creates a blank template and opens its editor.

**Entry editor integration:**
- In `EntryForm.tsx` (shared form from Feature 2), load templates via `useTemplates` hook instead of the hardcoded array.
- Template picker behavior unchanged: selecting a template appends its fields to the current list.

---

## Dependencies & Constraints

- `@dnd-kit/core` and `@dnd-kit/sortable` are new npm dependencies (used by Features 1 and 3).
- `Intl.supportedValuesOf` is available in all modern Chromium-based WebViews used by Tauri.
- The `passkeeper.conf` sidecar file (Feature 8) lives in the same `app_data_dir` as the DB; no new permissions needed.
- Builtin templates cannot be deleted but can be edited and reset — this preserves user customizations while allowing recovery.
- `EntryDialog.tsx` is fully retired in Tier 3; no backward compatibility needed since it's internal.
- All new Tauri commands must be registered in `main.rs` `invoke_handler`.
