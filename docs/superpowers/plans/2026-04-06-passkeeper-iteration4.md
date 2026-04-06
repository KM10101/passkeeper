# PassKeeper 迭代 4 实现计划

**日期**：2026-04-06  
**来源 PRD**：`docs/prds/prd-20260406-1330.md`

---

## 背景

迭代 3 完成了富文本渲染、卡片 UI 和分组重设计。本迭代修复 12 个用户反馈的 Bug 和体验问题，分为 5 个任务批次执行。数据库为测试数据，可直接删除重建，无需迁移。

---

## 任务列表

### T1：缓存失效修复 + 编辑条目 Bug（PRD #3, #6）

**文件**：`src/hooks/useEntries.ts`，`src/pages/VaultPage.tsx`

**#3 分组条目数量不更新**

根因：`useEntries` 的 mutations 只 invalidate `['entries']`，不 invalidate `['groups']`。分组的 `entry_count` 是 SQL COUNT JOIN 查询得到的，需要重新查询 groups 才能刷新。

修复：在 `create`、`update`、`remove` mutation 的 `onSuccess` 回调中追加：
```typescript
qc.invalidateQueries({ queryKey: ['groups'] });
```

**#6 条目列表编辑条目实际为新建条目**

根因：`VaultPage.tsx` 第 72-75 行的 `onEditEntry` 回调：
```typescript
onEditEntry={(id) => {
  setSelectedEntryId(id);
  setDialogOpen(true);    // ← 没有设置 editingEntryId！
}}
```
`editingEntryId` 始终是 null，所以 `editingDetail` 一直是 undefined，`EntryDialog` 以为是新建。

修复：改为调用已有的 `openEditEntry(id)`：
```typescript
onEditEntry={(id) => openEditEntry(id)}
```

**验收**：
- 新建条目后，对应分组的数量 +1；删除条目后 -1
- 条目列表点击"编辑"后，弹框内显示该条目的现有数据而非空表单

---

### T2：GroupTree 全面修复（PRD #1, #2, #4, #5）

**文件**：`src/components/ui/EmojiPicker.tsx`，`src/components/GroupTree.tsx`

**#1 EmojiPicker 弹出层被裁剪/重叠**

根因：`EmojiPicker` 使用 `position: absolute`，但父容器 `overflow-y: auto` 会裁剪绝对定位子元素，导致 picker 弹框错位或与其他元素重叠。

修复：改用 `ReactDOM.createPortal` + `position: fixed`，计算触发按钮的屏幕坐标后将 picker popup 渲染到 `document.body`：

```tsx
import { createPortal } from 'react-dom';

// 触发按钮 ref 上记录 rect
const [rect, setRect] = useState<DOMRect | null>(null);

const handleOpen = () => {
  if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
  setOpen(true);
};

// portal 渲染
{open && rect && createPortal(
  <div style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 9999 }}
       className="rounded-md border border-border bg-background shadow-md p-2">
    ...emoji grid...
  </div>,
  document.body
)}
```

保留 `mousedown` 的 click-outside 逻辑（不变）。

**#2 下拉菜单"重命名"改为"编辑"**

修复：`GroupTree.tsx` 第 104 行，将文字 `重命名` 改为 `编辑`。

**#4 新建分组没有取消按钮**

根因：`AddGroupCard` 只有 ✓ 按钮，`GroupTree` 中 `+` 按钮是 toggle（再次点击不关闭）。

修复：
1. `AddGroupCard` 增加 `onCancel: () => void` prop，在表单内追加 X 按钮（`<X className="h-4 w-4" />`）
2. `GroupTree` 中 `+` 按钮改为只设 `setAdding(true)`（不做 toggle）
3. 传递 `onCancel={() => setAdding(false)}` 给 `AddGroupCard`

**#5 分组名称空/重复无提示**

修复：
- 空名称：在 `AddGroupCard.handleSubmit` 中 `if (!name.trim())` 时改为 `toast.error("分组名称不能为空"); return;`
- 重复名称：`GroupTree.handleAdd` 中 wrap `createGroup` 于 try/catch，捕获后端 UNIQUE constraint 错误并显示 `toast.error("同名分组已存在")`

**验收**：
- EmojiPicker 在分组列表（scrollable 容器）内打开后，28 个表情可正常显示、选择，不被容器裁剪
- 下拉菜单显示"编辑"而不是"重命名"
- 点击 + 后出现新建表单，表单内有 ✓ 和 ✕ 两个按钮，点 ✕ 关闭表单
- 空名称点 ✓ 显示 toast 错误；重复名称显示 toast 错误

---

### T3：条目图标 Fallback + 对话框可拉伸（PRD #7, #8）

**文件**：`src/components/entries/EntryCard.tsx`，`src/components/entries/EntryDialog.tsx`

**#7 条目列表图标未正常显示**

根因：`EntryCard` 中 `<img onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}>`，图片加载失败后只是 hide img，但整个 ternary 已在 `img` 分支，没有 fallback 文字显示。

修复：增加 `imgError` 状态，错误时渲染首字母：
```tsx
const [imgError, setImgError] = useState(false);

<div className="shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center overflow-hidden mt-0.5">
  {domain && !imgError ? (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      className="w-6 h-6"
      onError={() => setImgError(true)}
    />
  ) : (
    <span className="text-xs font-bold text-muted-foreground">
      {entry.title.charAt(0).toUpperCase()}
    </span>
  )}
</div>
```

注意：`imgError` 需要在 `entry` 变化时 reset（`useEffect(() => setImgError(false), [entry.id])`）。

**#8 新建/编辑条目弹框需支持自由拉伸**

根因：`DialogContent` 固定 `max-w-lg max-h-[90vh] overflow-y-auto`，用户无法调整大小。

修复：
- 移除 `max-h-[90vh] overflow-y-auto` className
- 在 `DialogContent` 上追加 `style={{ resize: 'both', overflow: 'auto', minWidth: '520px', minHeight: '400px', maxWidth: '90vw', maxHeight: '90vh' }}`

Tauri 使用 Chromium webview，CSS `resize: both` 在 fixed 定位元素上完全支持。

**验收**：
- 有 URL 的条目在列表中正常显示 favicon；无 URL 或 favicon 加载失败时显示首字母
- 新建/编辑条目弹框右下角有拖拽手柄，可自由调整大小

---

### T4：条目详情字段编辑体验重做（PRD #9, #10, #11）

**文件**：`src/components/entries/EntryDetail.tsx`

三个 PRD 条目合并为一个任务：

**#9 添加字段时长文本无法换行**

根因：添加字段时值输入框（`newFieldValue`）始终使用 `<Input>`，对 rich types 应该用 `<Textarea>`。

修复：在添加字段的 UI 区域，当 `RICH_TYPES.has(newFieldType)` 时用 `<Textarea>` 替代 `<Input>`：
```tsx
{RICH_TYPES.has(newFieldType) ? (
  <Textarea
    placeholder="值"
    value={newFieldValue}
    onChange={e => setNewFieldValue(e.target.value)}
    className="flex-1 text-sm min-h-[80px] resize-y font-mono"
  />
) : (
  <Input
    placeholder="值"
    value={newFieldValue}
    onChange={e => setNewFieldValue(e.target.value)}
    className="flex-1 h-8 text-sm"
    type={["password","secret","token"].includes(newFieldType) ? "password" : "text"}
  />
)}
```

**#10 字段添加编辑按钮 + 显式保存**

当前：点击值区域直接进入编辑，`onBlur` 自动保存（不透明、易误触）。  
目标：点击"编辑"按钮才进入编辑模式，点击"保存"按钮才保存。

`FieldRow` 修改：
1. 展示状态下，在 header 按钮区加 `<Pencil>` 编辑按钮（在 copy/delete 之前）：
   ```tsx
   {!editing && (
     <button onClick={() => { setEditing(true); setEditValue(field.plaintext); }}
       className="text-muted-foreground hover:text-foreground">
       <Pencil className="h-3.5 w-3.5" />
     </button>
   )}
   ```
2. 编辑状态下，移除 `onBlur={commitEdit}`，追加 Check（保存）和 X（取消）按钮：
   ```tsx
   {editing && (
     <>
       <button onClick={commitEdit} className="text-primary hover:text-primary/80" disabled={saving}>
         <Check className="h-3.5 w-3.5" />
       </button>
       <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
         <X className="h-3.5 w-3.5" />
       </button>
     </>
   )}
   ```

**#11 值区域移除点击编辑**

修复：
- 删除 rich 字段渲染区包裹的 `onClick` 和 `cursor-text`（第 148 行的 `<div onClick=...>`）
- 删除普通字段值 `<span>` 上的 `onClick`、`cursor-text`、`hover:bg-accent/50` 和 `title="点击编辑"` 属性

**验收**：
- 添加 markdown/code/json/yaml 字段时，值输入框为多行 Textarea，支持换行
- 字段展示时点击值区域无反应（不触发编辑）
- 字段展示时 header 有 Pencil 按钮，点击进入编辑模式
- 编辑模式下有 ✓ 保存和 ✕ 取消按钮，onBlur 不自动保存

---

### T5：时间戳存储 + 时区设置（PRD #12）

**涉及文件**：`src-tauri/src/db/init.rs`，`src-tauri/src/db/models.rs`，`src-tauri/src/commands/entries.rs`，`src-tauri/src/commands/groups.rs`，`src-tauri/src/commands/settings.rs`，`src/lib/tauri.ts`，`src/components/entries/EntryDetail.tsx`，`src/pages/SettingsPage.tsx`

**根因**：
1. SQLite `datetime('now')` 返回 UTC 文本 `"2024-01-01 12:00:00"`，`new Date("...")` 在 Chromium 中当作**本地时间**解析（缺少 'Z' 后缀），导致时区偏移
2. 没有时区配置，始终使用 `zh-CN` 默认格式化

**方案：改用 Unix 时间戳整型存储，前端加时区设置**

#### 后端变更

**`src-tauri/src/db/init.rs`**

将 `groups` 表和 `entries` 表中所有时间戳字段改为 INTEGER：
```sql
-- groups
created_at  INTEGER NOT NULL DEFAULT (unixepoch())

-- entries
created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
```

**`src-tauri/src/db/models.rs`**

```rust
pub struct Group {
    // ...
    pub created_at: i64,    // ← 由 String 改为 i64
    // ...
}

pub struct Entry {
    // ...
    pub created_at: i64,    // ← 由 String 改为 i64
    pub updated_at: i64,    // ← 由 String 改为 i64
}
```

**`src-tauri/src/commands/entries.rs`**

`map_entry_row`：第 57-58 行类型自动随 struct 字段类型改变（`r.get::<_, i64>(12)?` 等）。

`update_entry_inner`（第 271 行）和 `pin_entry_inner`（第 300 行）：
```rust
// 改：updated_at=datetime('now')
// 为：updated_at=unixepoch()
```

**`src-tauri/src/commands/groups.rs`**

`query_group` 函数（`created_at` 列）：类型跟随 struct 自动推断，无需显式改动，只需确保 SELECT 语句中包含该列。

**`src-tauri/src/commands/settings.rs`**

在 `AppSettings` 中追加 `timezone` 字段：
```rust
pub struct AppSettings {
    // 现有字段...
    pub timezone: String,   // ← 新增，IANA 时区名称，默认空字符串（表示使用系统时区）
}
```

在 `get_settings_inner` 中读取：
```rust
timezone: read_config(&db, "timezone", ""),
```

在 `update_settings_inner` 中增加 `timezone: String` 参数并写入配置。

更新 tauri command `update_settings` 签名，增加 `timezone: String` 参数。

#### 前端变更

**`src/lib/tauri.ts`**

```typescript
export interface Group {
  // ...
  created_at: number;    // ← number（Unix 秒）
}

export interface Entry {
  // ...
  created_at: number;   // ← number
  updated_at: number;   // ← number
}

export interface AppSettings {
  // 现有字段...
  timezone: string;     // ← 新增
}
```

更新 `updateSettings` 函数签名，增加 `timezone: string` 参数。

**`src/components/entries/EntryDetail.tsx`**

修改 `formatDate`：
```typescript
function formatDate(ts: number, timezone?: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(ts * 1000));   // ← ts 单位秒，×1000 转 ms
}
```

在 `EntryDetail` 内通过 `useQuery` 读取 `settings`，将 `settings?.timezone` 传给 `formatDate`：
```typescript
const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
// ...
<span>创建于 {formatDate(entry.created_at, settings?.timezone)}</span>
<span>更新于 {formatDate(entry.updated_at, settings?.timezone)}</span>
```

**`src/pages/SettingsPage.tsx`**

1. 增加 `timezone` 本地 state，从 `settings` 同步
2. 在设置表单中添加时区输入控件（`<Input>` 文本输入，支持填写 IANA 时区名称如 `Asia/Shanghai`），附加说明文字"留空使用系统时区"
3. 在 `saveSettings` 调用中传入 `timezone`

**验收**：
- 新创建的条目，详情页创建/更新时间显示正确（对比系统时钟）
- 在设置中填入 `Asia/Shanghai` 保存后，时间按 UTC+8 显示
- 设置中时区留空时，使用系统本地时区
- Rust 测试（`cargo test`）全部通过

---

## 执行顺序

| 批次 | 任务 | 预计复杂度 |
|------|------|------------|
| T1 | 缓存失效 + 编辑 bug | 低（2 文件，各 1-3 行）|
| T2 | GroupTree 修复 | 中（EmojiPicker portal + GroupTree 多处改动）|
| T3 | favicon fallback + 对话框拉伸 | 低（2 文件）|
| T4 | EntryDetail 字段编辑重做 | 中（FieldRow 逻辑较多）|
| T5 | 时间戳 + 时区 | 中高（跨 Rust + TypeScript，多文件）|
