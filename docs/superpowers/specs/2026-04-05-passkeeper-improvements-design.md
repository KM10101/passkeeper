# PassKeeper 功能完善设计文档

**日期：** 2026-04-05  
**范围：** requirements.md 中 12 个待处理问题的全量实现

---

## 背景

PassKeeper 是一个基于 Tauri v2（Rust + React）的本地优先桌面密码管理器。当前核心功能已完成，本次迭代聚焦于 requirements.md 中列出的 12 个体验问题，按依赖关系分三组实现。

---

## A 组：基础设施

### A1. Toast 通知系统（覆盖 #4 复制反馈、#10 操作成功提示）

**方案：** 引入 Sonner（shadcn 生态标准 toast 库）。

- 在 `main.tsx` 中添加 `<Toaster />` 组件（全局挂载）
- 在 `EntryDetail` 的复制按钮 `onClick` 中调用 `toast.success("已复制")`
- 在 `EntryDetail` 的删除成功回调中调用 `toast.success("已删除")`
- 在 `EntryDialog` 的保存成功回调中调用 `toast.success("已保存")`

**安装：** `npm install sonner`

---

### A2. Field Type 系统（覆盖 #7 Token 默认字段、#8 自定义字段加密选择）

**核心思路：** 用 `field_type` 字段统一控制字段的存储方式和渲染行为，取代当前"所有字段一律加密"的策略。

#### 数据库 Schema 变更

`entry_fields` 表新增 `field_type` 列，`nonce` 改为可 NULL：

```sql
CREATE TABLE IF NOT EXISTS entry_fields (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    field_name  TEXT    NOT NULL,
    field_type  TEXT    NOT NULL DEFAULT 'secret',
    field_value BLOB    NOT NULL,
    nonce       BLOB,              -- NULL 表示明文存储
    sort_order  INTEGER NOT NULL DEFAULT 0
);
```

> 注意：现有数据库直接删除重建，无需迁移。

#### 字段类型定义

| field_type | 存储方式 | 渲染行为 |
|---|---|---|
| `password` | 加密（nonce 非 NULL） | 遮盖 + 显示/隐藏按钮 + 复制 |
| `secret` | 加密（nonce 非 NULL） | 遮盖 + 显示/隐藏按钮 + 复制 |
| `token` | 加密（nonce 非 NULL） | 遮盖 + 显示/隐藏按钮 + 复制 |
| `text` | 明文（nonce 为 NULL） | 直接显示 + 复制 |
| `url` | 明文（nonce 为 NULL） | 可点击在浏览器打开 + 复制 |
| `number` | 明文（nonce 为 NULL） | 数字显示 + 复制 |
| `date` | 明文（nonce 为 NULL） | 格式化日期显示 + 复制 |
| `email` | 明文（nonce 为 NULL） | 文本显示 + 复制 |

**加密类型判断函数（Rust）：**

```rust
fn is_encrypted_type(field_type: &str) -> bool {
    matches!(field_type, "password" | "secret" | "token")
}
```

#### Rust 后端变更

- `NewEntryField` 结构体新增 `field_type: String`
- `DecryptedField` 结构体新增 `field_type: String`
- `create_entry_inner` / `update_entry_inner`：根据 `is_encrypted_type()` 决定是否加密
- `get_entry_inner`：读取 `field_type`，若 `nonce` 为 NULL 则直接返回明文，否则解密
- `list_entries_inner`：SQL 修正（见 B 组 #6）

#### 前端 TypeScript 变更

```typescript
// tauri.ts
export interface NewEntryField {
  field_name: string;
  field_type: string;   // 新增
  field_value: string;
  sort_order: number;
}

export interface DecryptedField {
  id: number;
  field_name: string;
  field_type: string;   // 新增
  plaintext: string;
  sort_order: number;
}
```

#### EntryDialog 自定义字段 UI

每个自定义字段行新增类型选择器：
```
[ 字段名 input ] [ 类型 select ] [ 值 input ] [ 删除按钮 ]
```

类型选择器选项：`text`、`secret`、`token`、`password`、`number`、`date`、`url`、`email`

#### 新建 Entry 默认字段

新建 Entry 时预置以下字段：
- `password`（field_type: `password`，必填，不可删除）
- `token`（field_type: `token`，值为空，可删除，属于默认预填的自定义字段）

`token` 字段覆盖了 requirement #7。

---

## B 组：快速修复

### B1. 应用图标（#1）

`src-tauri/tauri.conf.json` 中 `bundle.icon` 当前为空数组，修改为：

```json
"icon": ["icons/icon.ico"]
```

### B2. 删除确认样式（#3）

将 `EntryDetail` 中的 `confirm()` 替换为 shadcn `AlertDialog`：

- 点击删除按钮 → 打开 AlertDialog（"确认删除"标题 + Entry 名称 + 取消/确认按钮）
- 确认后执行删除 + `toast.success("已删除")`
- 需新增 `src/components/ui/alert-dialog.tsx`（shadcn 组件）

### B3. 标签搜索（#6）

修改 `src-tauri/src/commands/entries.rs` 中的 `list_entries_inner`：

```rust
// 原来：
sql.push_str(" AND (title LIKE ? OR username LIKE ? OR url LIKE ?)");
// 修改为：
sql.push_str(" AND (title LIKE ? OR username LIKE ? OR url LIKE ? OR tags LIKE ?)");
```

同时添加第四个 `pat` 到 `params`。

### B4. URL 在系统浏览器打开（#11）

- 安装 Tauri shell 插件（`@tauri-apps/plugin-shell`）
- `tauri.conf.json` 的 `plugins` 中启用 shell 插件，允许 `open` scope
- `src-tauri/Cargo.toml` 添加 `tauri-plugin-shell`
- `EntryDetail` 中 URL 字段：点击 → 调用 `open(url)` 而非 `<a href>`
- `EntryDetail` header 区域的域名链接同样改为调用 `open(url)`

---

## C 组：界面改进

### C1. 可拖拽列宽（#2）

在 `AppShell` 中用 React state 管理列宽，会话内有效：

```typescript
const [sidebarW, setSidebarW] = useState(220);
const [listW, setListW] = useState(320);
```

在两个分隔线位置各放一个 4px 宽的透明拖拽条（`cursor-col-resize`），绑定 `onMouseDown` → `document.addEventListener('mousemove', ...)` 实现拖拽，`mouseup` 时清理监听器。

最小宽度约束：sidebar ≥ 160px，list ≥ 200px，detail 剩余空间 ≥ 300px。

### C2. 导入导出 UI（#5）

重写 `SettingsPage`，使用 shadcn 组件样式，主要内容：

**自动锁定设置**（已有功能，重写样式）

**导出备份：**
- 输入导出密码（带强度提示）
- 点击"导出"→ 调用 Tauri `dialog.save()` 选择保存路径 → 调用 `exportVault()` → 写入文件 → `toast.success`

**导入数据：**
- 点击"选择文件"→ 调用 Tauri `dialog.open()` 选择 `.pkv` 文件 → 读取文件内容
- 输入导出密码
- 点击"导入"→ 调用 `importVault()` → `toast.success` → 刷新数据

Tauri 插件：`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`

### C3. 详情页内联字段编辑（#9）

`FieldRow` 组件改为支持点击进入编辑态：

- 默认展示态：值 + 操作按钮（不变）
- 点击值区域（或添加铅笔图标）→ 进入编辑态：inline `<input>` 替换文本展示
- 失焦或按 Enter → 调用 `updateEntry`（只更新该字段，传递完整 fields 数组）
- 按 Escape → 取消编辑，恢复原值
- 更新成功 → `toast.success("已更新")`

**字段操作按钮：**
- 每个字段行右侧新增删除按钮（trash 图标），点击删除该字段后调用 `updateEntry`
- 详情页底部新增"添加字段"按钮，点击后弹出新字段输入行（同 EntryDialog 的字段输入样式）

### C4. 整体 UI 美化（#12）

- **SettingsPage**：完全重写为 shadcn 样式（见 C2）
- **UnlockPage**：居中卡片布局，增加 Logo/图标区域，输入框和按钮统一样式
- **EntryList 空状态**：更换为带图标的友好提示
- **AppShell header**：增加搜索栏快捷键提示（`Ctrl+F`）或全局搜索入口
- **间距与字体**：EntryDetail padding 调整，标签与字段间距优化

---

## 实现顺序

```
A2 (field type 后端 schema+Rust) 
  → A2 (field type 前端 TypeScript)
  → A1 (toast 系统)
  → B1, B2, B3, B4 (快速修复，并行)
  → C1 (可拖拽列宽)
  → C2 (导入导出 UI)
  → C3 (内联编辑)
  → C4 (UI 美化)
```

---

## 受影响的文件

**Rust:**
- `src-tauri/src/db/init.rs` — schema 变更
- `src-tauri/src/commands/entries.rs` — field_type 存储逻辑、标签搜索
- `src-tauri/src/lib.rs` 或 `main.rs` — shell 插件注册
- `src-tauri/Cargo.toml` — 新增插件依赖
- `src-tauri/tauri.conf.json` — 图标、插件权限配置

**Frontend:**
- `src/lib/tauri.ts` — 接口类型更新、新命令 wrapper
- `src/main.tsx` — Toaster 挂载
- `src/components/layout/AppShell.tsx` — 拖拽列宽
- `src/components/entries/EntryDetail.tsx` — 内联编辑、AlertDialog、URL open、toast
- `src/components/entries/EntryDialog.tsx` — field_type 选择器、Token 默认字段
- `src/components/EntryList.tsx` — 空状态优化
- `src/components/ui/alert-dialog.tsx` — 新增 shadcn 组件
- `src/pages/SettingsPage.tsx` — 完全重写
- `src/pages/UnlockPage.tsx` — UI 美化
