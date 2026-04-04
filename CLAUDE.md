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

All IPC goes through `src/lib/tauri.ts`, which exports typed wrappers around `invoke()` for all ~20 Tauri commands. Never call `invoke()` directly — add a typed wrapper there instead.

React Query (`@tanstack/react-query`) manages all server state. Custom hooks in `src/hooks/` (e.g. `useVault`, `useGroups`, `useEntries`) encapsulate query/mutation logic and are the only place that calls `src/lib/tauri.ts`.

### Frontend layout

Three-column vault UI: `GroupTree` (sidebar) → `EntryList` (middle) → `EntryDetail` (right panel). Routing between `UnlockPage` and `VaultPage` is handled in `src/App.tsx` based on lock state.

UI components are shadcn/ui (Radix primitives + Tailwind CSS variables). Dark mode is class-based via `ThemeProvider`.

### Backend structure

```
src-tauri/src/
├── commands/     # One file per domain: auth, groups, entries, metadata, vault_io, settings
├── crypto/       # kdf.rs (Argon2id), aes.rs (AES-256-GCM)
├── db/           # init.rs (schema + migrations), models.rs (structs)
├── state.rs      # AppState: DB connection + master key + last-activity timestamp
└── error.rs      # AppError (thiserror) — all commands return Result<T, AppError>
```

New Tauri commands must be registered in `main.rs` via `.invoke_handler(tauri::generate_handler![...])`.

### Data model

5 SQLite tables: `groups` (nested via `parent_id`), `entries`, `entry_fields` (encrypted per-field), `favicon_cache`, `app_config`.

Export/import uses a `.pkv` format (encrypted JSON bundle) handled in `commands/vault_io.rs`.