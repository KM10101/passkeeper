# PassKeeper UI Redesign

**Date:** 2026-04-05
**Status:** Approved

## Overview

Redesign the PassKeeper frontend from a bare-bones inline-style prototype to a production-quality UI using shadcn/ui + Tailwind CSS. The redesign adds full CRUD functionality (entries and groups), a three-column layout, dark/light theme switching, and a modal-based entry form.

---

## Tech Stack

- **Tailwind CSS v3** + PostCSS — utility-first styling
- **shadcn/ui** — component library (Button, Input, Dialog, Select, Badge, DropdownMenu, Tooltip, Switch)
- **lucide-react** — icon library (shadcn default)
- **Theme switching** — shadcn `dark` class strategy, persisted to `localStorage`

No new state management libraries. All data state stays in React Query + local component state.

---

## Layout

Three-column layout at 100vh, no scrolling on the shell:

```
┌─────────────────────────────────────────────────────┐
│  TopBar: Logo | spacer | ThemeToggle | LockButton    │
├──────────────┬──────────────────┬───────────────────┤
│  Sidebar     │  Entry List      │  Entry Detail      │
│  220px       │  320px           │  flex-1            │
│              │                  │                    │
│  Group tree  │  SearchBar       │  Favicon + title   │
│  + New Group │  + New Entry btn │  Username / URL    │
│              │                  │  Tags              │
│  Each group  │  EntryCard list  │  Fields (show/hide)│
│  has ... menu│  (favicon, title,│  Edit / Delete     │
│              │   username, url, │  buttons           │
│              │   tags)          │                    │
└──────────────┴──────────────────┴───────────────────┘
```

- Sidebar and entry list scroll independently
- Detail panel shows empty state illustration when no entry is selected
- New/edit entry uses a centered Dialog (modal), not inline

---

## Components

### New / Rewritten Files

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx        # TopBar + three-column skeleton
│   │   └── ThemeProvider.tsx   # dark/light context + localStorage
│   ├── sidebar/
│   │   ├── GroupTree.tsx       # Group list with active state (rewrite)
│   │   └── GroupMenu.tsx       # "..." dropdown: rename, delete, icon
│   ├── entries/
│   │   ├── EntryList.tsx       # Scrollable card list (rewrite)
│   │   ├── EntryCard.tsx       # Single entry card (favicon + title + meta)
│   │   ├── EntryDetail.tsx     # Right-panel detail view (rewrite)
│   │   └── EntryDialog.tsx     # New/edit modal with full form
│   └── ui/                     # shadcn auto-generated primitives
├── pages/
│   ├── UnlockPage.tsx          # Centered card, logo, password input (rewrite)
│   └── VaultPage.tsx           # Mounts AppShell, owns selectedGroup/Entry state
└── lib/
    └── theme.ts                # applyTheme(), getStoredTheme() helpers
```

### EntryDialog Form Fields

| Field | Type | Notes |
|---|---|---|
| Title | text input | required |
| Username | text input | |
| Password | password input | show/hide toggle |
| URL | url input | |
| Notes | textarea | |
| Tags | tag input (comma-separated) | displayed as Badge list |
| Group | Select dropdown | lists all groups + "No group" |
| Favorite | Switch toggle | |
| Custom fields | dynamic list | field name + value, add/remove rows, value is password type |

---

## Data Flow

- `ThemeProvider` wraps the app, exposes `theme` + `toggleTheme` via context
- `VaultPage` owns `selectedGroupId: number | null` and `selectedEntryId: number | null`
- `useGroups` hook: `groups`, `createGroup`, `updateGroup`, `deleteGroup`
- `useEntries` hook: `entries`, `createEntry`, `updateEntry`, `deleteEntry`
- `EntryDialog` holds local form state; on submit calls the appropriate mutation; closes on success
- `GroupMenu` calls `updateGroup` / `deleteGroup` directly; React Query invalidates and refreshes
- Password field visibility: local `showPassword` boolean state, no backend involvement

---

## Theme

- Light: white background, slate-700 text, blue-600 accent
- Dark: slate-900 background, slate-100 text, blue-400 accent
- Toggle button in TopBar, persisted to `localStorage` key `passkeeper-theme`
- Applied by toggling `dark` class on `<html>` element

---

## UnlockPage

- Centered card (max-w-sm) with PassKeeper logo/title
- Password input + Unlock button
- Error message shown inline below the button
- Theme toggle available even on lock screen

---

## Out of Scope

- Drag-and-drop group reordering
- Entry history / audit log
- Password strength meter
- Import from other password managers
- Mobile/responsive layout
