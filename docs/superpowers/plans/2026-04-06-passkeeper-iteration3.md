# PassKeeper Iteration 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增富文本字段类型（markdown/code/json/yaml）的渲染支持，将全局 UI 改为卡片风格，并重新设计分组面板（Emoji 图标 + 条目计数）。

**Architecture:** 纯前端改动为主。Rust 侧只需在 `list_groups` SQL 中添加 COUNT JOIN 并扩展 Group 结构体。前端新增 `FieldRenderer`（react-markdown + highlight.js）、`FieldTypeCombobox`（自定义可搜索下拉）、`EmojiPicker`（预设网格）三个新组件；改造 EntryCard/EntryList/EntryDetail/EntryDialog/GroupTree 为卡片风格。

**Tech Stack:** React + TypeScript + Tauri v2 (Rust) + shadcn/ui + react-markdown + highlight.js + @tailwindcss/typography

**Spec:** `docs/superpowers/specs/2026-04-06-passkeeper-iteration3-design.md`

---

## File Map

| 文件 | 操作 |
|---|---|
| `src-tauri/src/db/models.rs` | 修改：Group 结构体新增 `entry_count` |
| `src-tauri/src/commands/groups.rs` | 修改：list/create/update query 添加 COUNT JOIN |
| `src/lib/tauri.ts` | 修改：Group 类型新增 `entry_count` |
| `src/index.css` | 修改：添加 hljs 主题 CSS |
| `tailwind.config.js` | 修改：添加 typography 插件 |
| `src/components/entries/FieldRenderer.tsx` | **新建** |
| `src/components/ui/field-type-combobox.tsx` | **新建** |
| `src/components/ui/EmojiPicker.tsx` | **新建** |
| `src/components/entries/EntryCard.tsx` | 修改：卡片样式 |
| `src/components/EntryList.tsx` | 修改：容器背景 + gap |
| `src/components/entries/EntryDetail.tsx` | 修改：字段卡片 + FieldRenderer + raw toggle |
| `src/components/entries/EntryDialog.tsx` | 修改：FieldTypeCombobox + Textarea + 快捷按钮 |
| `src/components/GroupTree.tsx` | **重写**：卡片 + Emoji + 条目数 |

---

### Task 1: Rust — Group entry_count

**Files:**
- Modify: `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/commands/groups.rs`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: 更新 Group 结构体**

在 `src-tauri/src/db/models.rs` 中，将 Group 结构体改为：

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Group {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub icon: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub entry_count: i64,
}
```

- [ ] **Step 2: 添加 query_group 辅助函数**

在 `src-tauri/src/commands/groups.rs` 顶部（`use` 之后）添加辅助函数，避免三处查询重复：

```rust
fn query_group(db: &rusqlite::Connection, id: i64) -> rusqlite::Result<Group> {
    db.query_row(
        "SELECT g.id, g.name, g.parent_id, g.icon, g.sort_order, g.created_at,
                COUNT(e.id) as entry_count
         FROM groups g
         LEFT JOIN entries e ON e.group_id = g.id
         WHERE g.id = ?1",
        [id],
        |r| Ok(Group {
            id: r.get(0)?, name: r.get(1)?, parent_id: r.get(2)?,
            icon: r.get(3)?, sort_order: r.get(4)?, created_at: r.get(5)?,
            entry_count: r.get(6)?,
        }),
    )
}
```

- [ ] **Step 3: 更新 list_groups_inner**

将 `list_groups_inner` 中的 SQL 和 mapper 更新为：

```rust
pub fn list_groups_inner(state: &AppState) -> AppResult<Vec<Group>> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT g.id, g.name, g.parent_id, g.icon, g.sort_order, g.created_at,
                COUNT(e.id) as entry_count
         FROM groups g
         LEFT JOIN entries e ON e.group_id = g.id
         GROUP BY g.id
         ORDER BY g.sort_order, g.name",
    )?;
    let groups = stmt.query_map([], |r| Ok(Group {
        id: r.get(0)?, name: r.get(1)?, parent_id: r.get(2)?,
        icon: r.get(3)?, sort_order: r.get(4)?, created_at: r.get(5)?,
        entry_count: r.get(6)?,
    }))?.map(|r| r.unwrap()).collect();
    Ok(groups)
}
```

- [ ] **Step 4: 更新 create_group_inner 和 update_group_inner**

将两处 `db.query_row("SELECT id, name, ... FROM groups WHERE id=?1", ...)` 替换为 `query_group(&db, id)`：

```rust
pub fn create_group_inner(...) -> AppResult<Group> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO groups(name, parent_id, icon, sort_order) VALUES(?1,?2,?3,?4)",
        rusqlite::params![name, parent_id, icon, sort_order],
    )?;
    let id = db.last_insert_rowid();
    Ok(query_group(&db, id)?)
}

pub fn update_group_inner(id: i64, name: &str, icon: Option<String>, sort_order: i64, state: &AppState) -> AppResult<Group> {
    let db = state.db.lock().unwrap();
    let rows = db.execute(
        "UPDATE groups SET name=?1, icon=?2, sort_order=?3 WHERE id=?4",
        rusqlite::params![name, icon, sort_order, id],
    )?;
    if rows == 0 { return Err(AppError::NotFound); }
    Ok(query_group(&db, id)?)
}
```

- [ ] **Step 5: 更新测试**

`groups.rs` 的 `create_and_list_group` 测试需要增加对 `entry_count` 的断言（新建分组时为 0）：

```rust
#[test]
fn create_and_list_group() {
    let state = make_state();
    let group = create_group_inner("Work", None, None, 0, &state).unwrap();
    assert_eq!(group.name, "Work");
    assert_eq!(group.entry_count, 0);
    let groups = list_groups_inner(&state).unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].entry_count, 0);
}
```

并添加一个新测试验证有条目时 entry_count 正确：

```rust
#[test]
fn list_groups_counts_entries() {
    let state = make_state();
    let g = create_group_inner("Dev", None, None, 0, &state).unwrap();
    state.db.lock().unwrap().execute(
        "INSERT INTO entries(group_id, title, template_type, tags) VALUES(?1,'e1','custom','[]')",
        [g.id],
    ).unwrap();
    state.db.lock().unwrap().execute(
        "INSERT INTO entries(group_id, title, template_type, tags) VALUES(?1,'e2','custom','[]')",
        [g.id],
    ).unwrap();
    let groups = list_groups_inner(&state).unwrap();
    assert_eq!(groups[0].entry_count, 2);
}
```

- [ ] **Step 6: 运行 Rust 测试**

```bash
cd src-tauri && cargo test groups
```

预期：所有 groups 相关测试通过（包括 `delete_group_moves_entries_to_ungrouped`）。

- [ ] **Step 7: 更新 TypeScript Group 类型**

在 `src/lib/tauri.ts` 中，`Group` 接口新增字段：

```typescript
export interface Group {
  id: number;
  name: string;
  parent_id: number | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  entry_count: number;   // ← 新增
}
```

- [ ] **Step 8: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误（`entry_count` 未在 UI 中使用，此时只是类型定义，无使用处报错）。

- [ ] **Step 9: 提交**

```bash
git add src-tauri/src/db/models.rs src-tauri/src/commands/groups.rs src/lib/tauri.ts
git commit -m "feat: add entry_count to Group via SQL COUNT JOIN"
```

---

### Task 2: 安装依赖 + highlight.js 主题 + Tailwind Typography

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/index.css`

- [ ] **Step 1: 安装 npm 依赖**

```bash
cd E:/projects/typescript/passkeeper
npm install react-markdown remark-gfm highlight.js @tailwindcss/typography
```

预期：`package.json` 中出现四个新依赖，无报错。

- [ ] **Step 2: 启用 Tailwind typography 插件**

将 `tailwind.config.js` 的 `plugins: []` 改为：

```js
plugins: [require('@tailwindcss/typography')],
```

- [ ] **Step 3: 在 index.css 末尾添加 hljs 主题**

在 `src/index.css` 文件末尾追加（不替换任何现有内容）：

```css
/* ── highlight.js theme ── */
.hljs {
  display: block;
  overflow-x: auto;
  padding: 0;
  background: transparent;
}

/* Light mode tokens */
:root:not(.dark) .hljs { color: #24292e; }
:root:not(.dark) .hljs-keyword,
:root:not(.dark) .hljs-selector-tag { color: #d73a49; }
:root:not(.dark) .hljs-string,
:root:not(.dark) .hljs-attr { color: #032f62; }
:root:not(.dark) .hljs-comment { color: #6a737d; font-style: italic; }
:root:not(.dark) .hljs-number,
:root:not(.dark) .hljs-literal { color: #005cc5; }
:root:not(.dark) .hljs-built_in,
:root:not(.dark) .hljs-title { color: #6f42c1; }
:root:not(.dark) .hljs-variable,
:root:not(.dark) .hljs-name { color: #e36209; }

/* Dark mode tokens */
.dark .hljs { color: #c9d1d9; }
.dark .hljs-keyword,
.dark .hljs-selector-tag { color: #ff7b72; }
.dark .hljs-string,
.dark .hljs-attr { color: #a5d6ff; }
.dark .hljs-comment { color: #8b949e; font-style: italic; }
.dark .hljs-number,
.dark .hljs-literal { color: #79c0ff; }
.dark .hljs-built_in,
.dark .hljs-title { color: #d2a8ff; }
.dark .hljs-variable,
.dark .hljs-name { color: #ffa657; }
```

- [ ] **Step 4: 验证 Tailwind 编译**

```bash
npm run dev
```

预期：开发服务器正常启动，无 PostCSS 报错。Ctrl+C 停止。

- [ ] **Step 5: 提交**

```bash
git add tailwind.config.js src/index.css package.json package-lock.json
git commit -m "feat: install react-markdown, highlight.js, tailwind typography"
```

---

### Task 3: FieldRenderer 组件

**Files:**
- Create: `src/components/entries/FieldRenderer.tsx`

- [ ] **Step 1: 创建 FieldRenderer.tsx**

```tsx
// src/components/entries/FieldRenderer.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('xml', xml);

export const RICH_TYPES = new Set(['markdown', 'code', 'json', 'yaml']);

function highlight(value: string, language?: string): string {
  if (language) {
    try { return hljs.highlight(value, { language }).value; } catch { /* fall through */ }
  }
  try { return hljs.highlightAuto(value).value; } catch { return escapeHtml(value); }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatJson(value: string): string {
  try { return JSON.stringify(JSON.parse(value), null, 2); }
  catch { return value; }
}

interface Props {
  fieldType: string;
  value: string;
}

export function FieldRenderer({ fieldType, value }: Props) {
  if (!value) {
    return <span className="text-muted-foreground italic text-xs">空</span>;
  }

  if (fieldType === 'markdown') {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      </div>
    );
  }

  let code: string;
  let lang: string | undefined;
  if (fieldType === 'json') {
    code = formatJson(value);
    lang = 'json';
  } else if (fieldType === 'yaml') {
    code = value;
    lang = 'yaml';
  } else {
    // 'code' — autodetect
    code = value;
    lang = undefined;
  }

  return (
    <pre className="hljs rounded-md bg-muted/50 dark:bg-muted/20 border border-border p-3 text-xs overflow-x-auto">
      <code dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} />
    </pre>
  );
}
```

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/entries/FieldRenderer.tsx
git commit -m "feat: add FieldRenderer for markdown/code/json/yaml field types"
```

---

### Task 4: EntryDetail — 字段卡片样式 + FieldRenderer 集成

**Files:**
- Modify: `src/components/entries/EntryDetail.tsx`

此任务改造 EntryDetail 中的 FieldRow 为卡片样式，并为富文本类型集成 FieldRenderer，支持原始/渲染切换。

- [ ] **Step 1: 更新 imports**

在 `src/components/entries/EntryDetail.tsx` 顶部，添加：

```tsx
import { FieldRenderer, RICH_TYPES } from './FieldRenderer';
import { Textarea } from '../ui/textarea';
import { cn } from '../../lib/utils';
```

保留所有现有 import，仅追加以上三行。

- [ ] **Step 2: 更新 FieldRow 组件签名和 state**

将 `FieldRow` 的 props 接口改为：

```tsx
function FieldRow({
  field, onSave, onDelete, canDelete, rawView, onToggleRaw,
}: {
  field: DecryptedField;
  onSave: (id: number, newValue: string) => Promise<void>;
  onDelete: (id: number) => void;
  canDelete: boolean;
  rawView: boolean;
  onToggleRaw: () => void;
}) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(field.plaintext);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEncrypted = ENCRYPTED_TYPES.has(field.field_type);
  const isUrl = field.field_type === 'url';
  const isRich = RICH_TYPES.has(field.field_type);
```

`textareaRef` 是新增的，其余 state 不变。

- [ ] **Step 3: 更新 useEffect（focus on edit）**

将现有的 `useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);` 改为：

```tsx
useEffect(() => {
  if (!editing) return;
  if (isRich) {
    textareaRef.current?.focus();
  } else {
    inputRef.current?.focus();
  }
}, [editing, isRich]);
```

- [ ] **Step 4: 重写 FieldRow return JSX**

将整个 return 语句替换为（卡片容器 + 头部行 + 值区域）：

```tsx
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col gap-1.5">
      {/* Header: field name + type + action buttons */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground capitalize flex-1">
          {field.field_name}
          <span className="ml-1 text-[10px] opacity-50">{field.field_type}</span>
        </span>
        <div className="flex items-center gap-1">
          {isRich && !editing && (
            <button
              onClick={onToggleRaw}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {rawView ? '渲染' : '原始'}
            </button>
          )}
          {!editing && isEncrypted && (
            <button onClick={() => setShow(v => !v)} className="text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
          {!editing && isUrl && field.plaintext && (
            <button onClick={() => openUrl(field.plaintext)} className="text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          {!editing && (
            <button onClick={copy} className="text-muted-foreground hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {canDelete && !editing && (
            <button onClick={() => onDelete(field.id)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Value area */}
      {editing ? (
        isRich ? (
          <Textarea
            ref={textareaRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
            onBlur={commitEdit}
            className={cn(
              'resize-y min-h-[80px] text-sm',
              field.field_type !== 'markdown' && 'font-mono',
            )}
            disabled={saving}
          />
        ) : (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              type={isEncrypted ? 'password' : 'text'}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
              onBlur={commitEdit}
              className="h-7 text-sm flex-1"
              disabled={saving}
            />
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
        )
      ) : isRich && !rawView ? (
        <div onClick={() => { setEditing(true); setEditValue(field.plaintext); }} className="cursor-text">
          <FieldRenderer fieldType={field.field_type} value={field.plaintext} />
        </div>
      ) : (
        <span
          className="text-sm break-all cursor-text hover:bg-accent/50 rounded px-1 -mx-1 transition-colors"
          onClick={() => { setEditing(true); setEditValue(field.plaintext); }}
          title="点击编辑"
        >
          {isEncrypted && !show
            ? '••••••••'
            : (field.plaintext || <span className="text-muted-foreground italic text-xs">空</span>)}
        </span>
      )}
    </div>
  );
```

注意：删掉原有的 `font-mono` class 和那行 `cursor-text` span 的 `font-mono`（富文本字段不需要等宽字体展示原始值）。对于非富文本字段，保持原有行为不变。

- [ ] **Step 5: 在 EntryDetail 主组件中添加 rawFields state**

在 `EntryDetail` 函数体内（`useState` 区域），`const [addingField, setAddingField] = useState(false);` 之前添加：

```tsx
const [rawFields, setRawFields] = useState<Set<number>>(new Set());
const toggleRaw = (fieldId: number) => setRawFields(prev => {
  const next = new Set(prev);
  next.has(fieldId) ? next.delete(fieldId) : next.add(fieldId);
  return next;
});
```

- [ ] **Step 6: 更新 FieldRow 调用处**

将 `{localFields.map(f => (<FieldRow key={f.id} field={f} onSave={handleFieldSave} onDelete={handleFieldDelete} canDelete />))}` 改为：

```tsx
{localFields.map(f => (
  <FieldRow
    key={f.id}
    field={f}
    onSave={handleFieldSave}
    onDelete={handleFieldDelete}
    canDelete
    rawView={rawFields.has(f.id)}
    onToggleRaw={() => toggleRaw(f.id)}
  />
))}
```

- [ ] **Step 7: 更新字段容器 class**

将 `<div className="flex flex-col">` 改为 `<div className="flex flex-col gap-2">`（移除 border-b 改用间距）。

- [ ] **Step 8: 更新 Add Field 区域的 select**

将 `addingField` 时的 `<select>` 选项列表（目前 8 个类型）更新为 12 个：

```tsx
{["text","secret","token","password","url","email","number","date","markdown","code","json","yaml"].map(t => (
  <option key={t} value={t}>{t}</option>
))}
```

- [ ] **Step 9: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 10: 提交**

```bash
git add src/components/entries/EntryDetail.tsx
git commit -m "feat: EntryDetail field cards with FieldRenderer and raw/render toggle"
```

---

### Task 5: FieldTypeCombobox 组件

**Files:**
- Create: `src/components/ui/field-type-combobox.tsx`

- [ ] **Step 1: 创建组件文件**

```tsx
// src/components/ui/field-type-combobox.tsx
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export const FIELD_TYPE_OPTIONS = [
  { value: 'text',     label: 'Text',     icon: '📝' },
  { value: 'password', label: 'Password', icon: '🔐' },
  { value: 'url',      label: 'URL',      icon: '🔗' },
  { value: 'email',    label: 'Email',    icon: '📧' },
  { value: 'token',    label: 'Token',    icon: '🔑' },
  { value: 'secret',   label: 'Secret',   icon: '🔒' },
  { value: 'number',   label: 'Number',   icon: '🔢' },
  { value: 'date',     label: 'Date',     icon: '📅' },
  { value: 'markdown', label: 'Markdown', icon: '📖' },
  { value: 'code',     label: 'Code',     icon: '💻' },
  { value: 'json',     label: 'JSON',     icon: '{}' },
  { value: 'yaml',     label: 'YAML',     icon: '⚙️' },
] as const;

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function FieldTypeCombobox({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = FIELD_TYPE_OPTIONS.filter(o =>
    o.value.includes(query.toLowerCase()) ||
    o.label.toLowerCase().includes(query.toLowerCase()),
  );
  const current = FIELD_TYPE_OPTIONS.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQuery(''); }}
        className="flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-2 text-sm min-w-[120px] hover:bg-accent transition-colors"
      >
        <span className="text-base leading-none">{current?.icon ?? '📝'}</span>
        <span className="flex-1 text-left truncate">{current?.label ?? value}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-48 rounded-md border border-border bg-background shadow-md">
          <div className="p-1.5 border-b border-border">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索类型…"
              className="w-full h-7 px-2 text-xs rounded bg-muted/50 outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">无结果</p>
            ) : filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent transition-colors',
                  opt.value === value && 'bg-accent',
                )}
              >
                <span className="text-base leading-none w-5">{opt.icon}</span>
                <span className="flex-1 text-left">{opt.label}</span>
                {opt.value === value && <Check className="h-3 w-3 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/ui/field-type-combobox.tsx
git commit -m "feat: add FieldTypeCombobox searchable dropdown for field types"
```

---

### Task 6: EntryDialog — Combobox + Textarea + 新快捷按钮

**Files:**
- Modify: `src/components/entries/EntryDialog.tsx`

- [ ] **Step 1: 更新 imports**

在 `EntryDialog.tsx` 顶部添加两个 import：

```tsx
import { FieldTypeCombobox } from '../ui/field-type-combobox';
import { Textarea } from '../ui/textarea';
import { RICH_TYPES } from './FieldRenderer';
```

删除 `FIELD_TYPES` 常量（整个数组，8行），因为已由 `FieldTypeCombobox` 内部维护。

- [ ] **Step 2: 更新 QUICK_ADD 常量**

将现有 `QUICK_ADD` 数组追加三项：

```tsx
const QUICK_ADD: Array<{ label: string; field_name: string; field_type: string }> = [
  { label: "用户名", field_name: "username", field_type: "text" },
  { label: "密码",   field_name: "password", field_type: "password" },
  { label: "URL",    field_name: "url",      field_type: "url" },
  { label: "Token",  field_name: "token",    field_type: "token" },
  { label: "邮箱",   field_name: "email",    field_type: "email" },
  { label: "📝 笔记", field_name: "notes",   field_type: "markdown" },
  { label: "💻 代码", field_name: "code",    field_type: "code" },
  { label: "{} JSON", field_name: "data",   field_type: "json" },
];
```

- [ ] **Step 3: 更新 TEMPLATES 中的「笔记」模板**

将 `笔记` 模板的 `field_type` 从 `"text"` 改为 `"markdown"`：

```tsx
{ label: "笔记", fields: [
  { field_name: "content", field_type: "markdown" },
]},
```

- [ ] **Step 4: 在字段行中替换 select 为 FieldTypeCombobox**

在 EntryDialog 中，字段行渲染部分（`FieldValueInput` 组件所在区域，约 220 行附近）有一个 `<select>` 用于选择 field_type。找到如下模式：

```tsx
<select
  value={field.field_type}
  onChange={e => updateField(field.id, 'field_type', e.target.value)}
  className="h-8 rounded-md border border-input bg-background px-2 text-sm ..."
>
  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
</select>
```

替换为：

```tsx
<FieldTypeCombobox
  value={field.field_type}
  onChange={v => updateField(field.id, 'field_type', v)}
/>
```

- [ ] **Step 5: 更新 FieldValueInput 子组件以支持富文本类型**

`FieldValueInput` 是文件末尾（约 397 行）的独立子组件，当前只有一个 `<Input>`。将整个组件替换为：

```tsx
function FieldValueInput({ field, onChange }: { field: FieldRow; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const isSecret = ENCRYPTED_TYPES.has(field.field_type);
  const isRich = RICH_TYPES.has(field.field_type);

  if (isRich) {
    return (
      <Textarea
        placeholder={`输入 ${field.field_type} 内容…`}
        value={field.field_value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'resize-y min-h-[80px] max-h-[200px] text-sm flex-1',
          field.field_type !== 'markdown' && 'font-mono',
          field.error ? 'border-destructive' : '',
        )}
      />
    );
  }

  return (
    <div className="relative flex-1">
      <Input
        type={isSecret && !show ? 'password' : 'text'}
        placeholder="值"
        value={field.field_value}
        onChange={e => onChange(e.target.value)}
        className={`h-8 text-sm pr-8 ${field.error ? 'border-destructive' : ''}`}
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

`cn` 已在 EntryDialog.tsx 的现有 import 中（如未引入则加 `import { cn } from '../../lib/utils'`）。

- [ ] **Step 6: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 7: 提交**

```bash
git add src/components/entries/EntryDialog.tsx
git commit -m "feat: EntryDialog with FieldTypeCombobox, Textarea for rich types, new quick-add buttons"
```

---

### Task 7: EntryCard + EntryList — 卡片风格

**Files:**
- Modify: `src/components/entries/EntryCard.tsx`
- Modify: `src/components/EntryList.tsx`

- [ ] **Step 1: 更新 EntryCard 容器样式**

在 `EntryCard.tsx` 中，将最外层 `<div>` 的 className 从：

```tsx
className={cn(
  "w-full text-left border-b border-border transition-colors flex items-stretch group",
  selected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent",
)}
```

改为：

```tsx
className={cn(
  "w-full text-left rounded-lg border border-border bg-card shadow-sm transition-all flex items-stretch group",
  selected
    ? "border-primary ring-1 ring-primary/20 shadow-md"
    : "hover:border-border/80 hover:shadow-md",
)}
```

其余内部结构（favicon、title、tags、drag handle、⋯ menu）不变。

- [ ] **Step 2: 更新 EntryList 滚动容器**

在 `EntryList.tsx` 中，找到渲染 pinned 区和 normal 区的外层滚动容器。当前结构类似：

```tsx
<div className="flex-1 overflow-y-auto">
  ...
  {/* 置顶 section */}
  {/* 普通 section */}
  ...
</div>
```

在滚动容器内部，将直接包裹两个 section 的 div 改为带背景和内边距：

```tsx
<div className="flex-1 overflow-y-auto bg-muted/40">
  <div className="p-2 flex flex-col gap-2">
    {/* pinned section */}
    {/* normal section */}
  </div>
</div>
```

如果两个 section 各自有 DndContext，它们在 `p-2 gap-2` 的 div 内各占位，section 标题行（"📌 置顶"、"其他"）之间本身已是自然间距。

section 标题行（`<div className="...">📌 置顶</div>`）添加 `mb-1` 以便与卡片有视觉分隔。

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 4: 提交**

```bash
git add src/components/entries/EntryCard.tsx src/components/EntryList.tsx
git commit -m "feat: card-style EntryCard and EntryList container"
```

---

### Task 8: EmojiPicker 组件

**Files:**
- Create: `src/components/ui/EmojiPicker.tsx`

- [ ] **Step 1: 创建 EmojiPicker.tsx**

```tsx
// src/components/ui/EmojiPicker.tsx
import { useState, useRef, useEffect } from 'react';

const EMOJIS = [
  '📁', '📂', '💼', '🏠', '🖥️', '🔑', '🏦', '🌐',
  '🛡️', '📧', '🔗', '💻', '🗄️', '☁️', '🎮', '📱',
  '🚀', '🔐', '🌟', '⚙️', '🎯', '📊', '🗂️', '🔒',
  '💡', '🏢', '🎓', '🧪',
];

interface Props {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-9 h-9 rounded-md border border-input bg-background flex items-center justify-center text-xl hover:bg-accent transition-colors"
        title="选择图标"
      >
        {value || '📁'}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 rounded-md border border-border bg-background shadow-md p-2">
          <div className="grid grid-cols-7 gap-1">
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onChange(emoji); setOpen(false); }}
                className={`w-8 h-8 rounded text-lg flex items-center justify-center hover:bg-accent transition-colors ${emoji === value ? 'bg-accent ring-1 ring-primary' : ''}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/ui/EmojiPicker.tsx
git commit -m "feat: add EmojiPicker component with 28 preset emojis"
```

---

### Task 9: GroupTree — 卡片风格全面重写

**Files:**
- Modify: `src/components/GroupTree.tsx`

此任务完全重写 GroupTree 组件，实现卡片风格、Emoji 图标选择和条目计数显示。

- [ ] **Step 1: 完整替换 GroupTree.tsx**

用以下内容完整替换 `src/components/GroupTree.tsx`：

```tsx
import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import { MoreHorizontal, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { EmojiPicker } from "./ui/EmojiPicker";
import { useGroups } from "../hooks/useGroups";
import { cn } from "../lib/utils";
import type { Group } from "../lib/tauri";

interface Props {
  selected: number | null;
  onSelect: (id: number | null) => void;
  totalCount: number;
}

// ── GroupItem (card, with inline edit mode) ──────────────────
function GroupItem({
  group,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  group: Group;
  selected: boolean;
  onSelect: () => void;
  onRename: (id: number, name: string, icon: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editIcon, setEditIcon] = useState(group.icon ?? "📁");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  const startEdit = () => {
    setEditName(group.name);
    setEditIcon(group.icon ?? "📁");
    setEditing(true);
  };

  const commitEdit = async () => {
    if (!editName.trim()) { setEditing(false); return; }
    await onRename(group.id, editName.trim(), editIcon);
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  if (editing) {
    return (
      <div className="rounded-lg border border-primary ring-1 ring-primary/20 bg-card p-2 flex items-center gap-2">
        <EmojiPicker value={editIcon} onChange={setEditIcon} />
        <Input
          ref={inputRef}
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
          className="h-8 text-sm flex-1"
        />
        <button onClick={commitEdit} className="text-primary hover:text-primary/80 shrink-0">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card shadow-sm transition-all flex items-center gap-2 px-3 py-2 group cursor-pointer",
        selected
          ? "border-primary ring-1 ring-primary/20 shadow-md"
          : "border-border hover:border-border/80 hover:shadow-md",
      )}
      onClick={onSelect}
    >
      <span className="text-xl leading-none shrink-0">{group.icon ?? "📁"}</span>
      <span className="flex-1 text-sm font-medium truncate">{group.name}</span>
      <span className={cn(
        "text-xs rounded-full px-2 py-0.5 shrink-0",
        selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}>
        {group.entry_count}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={e => { e.stopPropagation(); startEdit(); }}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> 重命名
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={e => { e.stopPropagation(); onDelete(group.id); }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── AddGroupCard (inline new group form) ─────────────────────
function AddGroupCard({ onAdd }: { onAdd: (name: string, icon: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim(), icon);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-primary ring-1 ring-primary/20 bg-card p-2 flex items-center gap-2"
    >
      <EmojiPicker value={icon} onChange={setIcon} />
      <Input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="分组名称"
        className="h-8 text-sm flex-1"
      />
      <button type="submit" className="text-primary hover:text-primary/80 shrink-0">
        <Check className="h-4 w-4" />
      </button>
    </form>
  );
}

// ── GroupTree ─────────────────────────────────────────────────
export function GroupTree({ selected, onSelect, totalCount }: Props) {
  const { groups, createGroup, updateGroup, deleteGroup } = useGroups();
  const [adding, setAdding] = useState(false);

  const handleAdd = async (name: string, icon: string) => {
    await createGroup({ name, parentId: null, icon, sortOrder: groups.length });
    setAdding(false);
  };

  const handleRename = async (id: number, name: string, icon: string | null) => {
    const g = groups.find(g => g.id === id)!;
    await updateGroup({ id, name, icon, sortOrder: g.sort_order });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">分组</span>
          <button
            onClick={() => setAdding(v => !v)}
            className="w-6 h-6 rounded-md bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-colors"
            title="新建分组"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* All Entries card */}
        <div
          className={cn(
            "rounded-lg border bg-card shadow-sm flex items-center gap-2 px-3 py-2 cursor-pointer transition-all",
            selected === null
              ? "border-primary ring-1 ring-primary/20 shadow-md"
              : "border-border hover:border-border/80 hover:shadow-md",
          )}
          onClick={() => onSelect(null)}
        >
          <span className="text-xl leading-none">🗂️</span>
          <span className="flex-1 text-sm font-medium">全部条目</span>
          <span className={cn(
            "text-xs rounded-full px-2 py-0.5",
            selected === null ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}>
            {totalCount}
          </span>
        </div>
      </div>

      {/* Scrollable group list */}
      <div className="flex-1 overflow-y-auto bg-muted/40">
        <div className="p-2 flex flex-col gap-2">
          {groups.map(group => (
            <GroupItem
              key={group.id}
              group={group}
              selected={selected === group.id}
              onSelect={() => onSelect(group.id)}
              onRename={handleRename}
              onDelete={deleteGroup}
            />
          ))}
          {adding && (
            <AddGroupCard onAdd={handleAdd} />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 更新 GroupTree 调用处（VaultPage）**

`GroupTree` 新增了 `totalCount` prop。在 `src/pages/VaultPage.tsx` 中找到 `<GroupTree .../>` 并添加 `totalCount`：

`VaultPage.tsx` 中目前没有 `useEntries`。需要：

1. 添加 import：
```tsx
import { useEntries } from '../hooks/useEntries';
```

2. 在 `VaultPage` 函数体内已有 state 之后添加：
```tsx
const { entries: allEntries } = useEntries(undefined);
```

3. 将现有的 `<GroupTree selected={selectedGroupId} onSelect={...} />` 改为：
```tsx
<GroupTree
  selected={selectedGroupId}
  onSelect={id => { setSelectedGroupId(id); setSelectedEntryId(null); }}
  totalCount={allEntries.length}
/>
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。若 VaultPage 因 `totalCount` 缺失报错，按 Step 2 修复。

- [ ] **Step 4: 提交**

```bash
git add src/components/GroupTree.tsx src/pages/VaultPage.tsx
git commit -m "feat: GroupTree rewrite with card style, emoji picker, and entry count"
```

---

## Final Verification

所有 7 个任务完成后执行：

```bash
cd src-tauri && cargo test
```

预期：所有 Rust 测试通过（≥ 58 个）。

```bash
npx tsc --noEmit
```

预期：0 TypeScript 错误。

手动检查清单（`npm run tauri dev`）：

1. **FieldRenderer**：创建一个 `markdown` 类型字段，填入 `# 标题\n- 列表项`，保存后详情页显示渲染的 HTML；点击「原始」切换为纯文本
2. **Code 字段**：创建 `code` 字段，填入 Python 代码，查看语法高亮（关键字着色）
3. **JSON 字段**：填入 `{"key":"value"}` ，显示格式化后的 JSON
4. **FieldTypeCombobox**：编辑条目时，字段类型选择器可输入搜索，12个选项可滚动
5. **快捷按钮**：「📝 笔记」「💻 代码」「{} JSON」三个新按钮能追加对应字段
6. **EntryCard**：条目显示为圆角卡片，选中时紫色边框，深色主题下也清晰
7. **GroupTree**：分组显示卡片样式，带条目数徽章；点击 ＋ 出现内联新建卡片（含 Emoji 选择器）；点击 ⋯ 可重命名（原地切换编辑卡片）
8. **深/浅色切换**：两种主题下 hljs 代码块颜色方案均正确

