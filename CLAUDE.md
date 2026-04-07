# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (Tauri will use this automatically)
npm run dev

# Full Tauri desktop app (dev mode)
npm run tauri dev

# Build production app
npm run build          # frontend only
npm run tauri build    # full desktop binary

# Run frontend tests (single pass, no watch)
npm test

# Run a single frontend test file
npx vitest run src/hooks/useVault.test.ts

# Run Rust backend tests
cd src-tauri && cargo test

# Run a single Rust test
cd src-tauri && cargo test <test_name>

# Lint / type-check
npx tsc --noEmit
```

## Architecture

PassKeeper is a **local-first desktop password manager** built with Tauri v2 (Rust backend + React frontend). All data stays on-device in an encrypted SQLite database at `%APPDATA%\passkeeper\vault.db` (Windows).

### Security model

- Master password → Argon2id KDF → AES-256-GCM encryption key (held in `AppState` as `Mutex<Option<MasterKey>>`)
- All sensitive entry fields are encrypted at rest; decryption happens in Rust on each read
- Auto-lock timer resets on activity; lock clears the in-memory key

### Frontend → Backend communication

All IPC goes through `src/lib/tauri.ts`, which exports typed wrappers around `invoke()` for all ~20 Tauri commands. Never call `invoke()` directly — add a typed wrapper there instead. TypeScript interfaces for all backend types (`Group`, `Entry`, `EntryDetail`, `DecryptedField`, `AppSettings`, `Template`, etc.) are also defined here.

React Query (`@tanstack/react-query`) manages all server state. Custom hooks in `src/hooks/` (`useVault`, `useGroups`, `useEntries`, `useTemplates`) encapsulate query/mutation logic and are the only place that calls `src/lib/tauri.ts`. When entry mutations occur, also invalidate `['groups']` to refresh `entry_count` on the sidebar.

### Frontend layout

Three-column vault UI: `GroupTree` (sidebar) → `EntryList` (middle) → `EntryDetail` (right panel). Routing between `UnlockPage` and `VaultPage` is handled in `src/App.tsx` based on lock state.

- `src/components/entries/` — `EntryCard`, `EntryDetail`, `EntryForm`, `FieldRenderer`
- `src/components/ui/` — shadcn/ui primitives + custom: `EmojiPicker` (uses `ReactDOM.createPortal` + `getBoundingClientRect` to avoid overflow clipping), `TimezoneCombobox`, `field-type-combobox`
- `src/pages/` — `UnlockPage`, `VaultPage`, `SettingsPage`, `EntryPage`

UI components are shadcn/ui (Radix primitives + Tailwind CSS variables). Dark mode is class-based via `ThemeProvider`. Radix Popover is **not** installed — use portal pattern for floating UI elements.

### Backend structure

```
src-tauri/src/
├── commands/     # One file per domain: auth, groups, entries, metadata, vault_io, settings, templates
├── crypto/       # kdf.rs (Argon2id), aes.rs (AES-256-GCM)
├── db/           # init.rs (schema + migrations), models.rs (structs)
├── state.rs      # AppState: DB connection + master key + last-activity timestamp
└── error.rs      # AppError (thiserror) — all commands return Result<T, AppError>
```

New Tauri commands must be registered in `main.rs` via `.invoke_handler(tauri::generate_handler![...])`.

In Rust row-mapping closures, always use `.collect::<rusqlite::Result<Vec<_>>>()?` — never `.map(|r| r.unwrap()).collect()`. Panicking inside a `Mutex` lock poisons it, causing all subsequent lock attempts to also panic.

### Data model

6 SQLite tables: `groups` (nested via `parent_id`), `entries`, `entry_fields` (encrypted per-field), `favicon_cache`, `app_config`, `templates`.

- Timestamps are stored as `INTEGER` (Unix epoch via `unixepoch()`), not `TEXT`. In the frontend, convert with `new Date(ts * 1000)`.
- `entries.tags` is a JSON array string (e.g. `'["work","dev"]'`), serialized/deserialized in the frontend.
- `app_config` is a key-value store used for all settings (auto-lock, proxy, timezone, etc.) via `read_config` / `write_config` helpers in `settings.rs`.
- `groups` has no UNIQUE constraint on `name` — duplicate name checks must be done in the frontend before calling `create_group`.

Export/import uses a `.pkv` format (encrypted JSON bundle) handled in `commands/vault_io.rs`.

## Development workflow

When executing a multi-task implementation plan, use the **superpowers subagent-driven development** approach:

1. Use `/superpowers:brainstorming` to explore requirements and design before any implementation
2. Use `/superpowers:writing-plans` to produce a written plan before touching code
3. Use `/superpowers:executing-plans` to drive execution — each task is handled by a dedicated subagent (via the `Agent` tool with `subagent_type: general-purpose`) rather than implemented inline in the main context
4. After each subagent completes, run `/superpowers:requesting-code-review` to verify spec compliance and code quality before moving to the next task
5. Use git worktrees (`/superpowers:using-git-worktrees`) to isolate feature work from the main branch

Independent sub-tasks within a batch can be dispatched in parallel using `/superpowers:dispatching-parallel-agents`.