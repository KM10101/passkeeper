# PassKeeper 第二轮迭代设计文档

**日期：** 2026-04-05  
**范围：** PRD prd-20260405-2155.md 中需求 1、2、3、4、5、6a、6b、6f、7、8、9（第一轮）  
**推迟：** 需求 6c、6d、6e、6g、6h（富字段渲染，第二轮）

---

## 背景

基于上一轮迭代已完成的核心功能，本次迭代聚焦于 Entry 列表交互增强、Entry 表单彻底重构（纯字段化）、设置页扩展（代理/存储目录）及杂项 UI 改进。不考虑数据迁移，数据库直接删除重建。

---

## Section 1：数据模型变更

### entries 表新增列

```sql
pinned      INTEGER NOT NULL DEFAULT 0   -- 置顶标志（0/1）
sort_order  INTEGER NOT NULL DEFAULT 0   -- 拖拽排序序号
```

排序 SQL：
```sql
ORDER BY pinned DESC, sort_order ASC, updated_at DESC
```
`sort_order` 相同时按 `updated_at DESC` 兜底，保证初始状态下新条目在前。

### 字段同步策略

`create_entry_inner` / `update_entry_inner` 执行时，从传入的 `fields` 列表自动提取并写入 entries 顶层列（供搜索和 EntryCard 字幕行使用）：

- `entries.username`：优先取 `field_name="username"` 的第一个字段值；若无，取 `field_type="email"` 的第一个字段值
- `entries.url`：取 `field_type="url"` 的第一个字段值（供 favicon 抓取）
- `entries.notes`：取 `field_name="notes"` 的第一个字段值

`entries.template_type` 保留列但 UI 不再展示，写入固定值 `"custom"`。

### Title 唯一性校验

在 Rust 层（非 DB 约束）实现，避免 SQLite UNIQUE + NULL 的歧义问题：

```rust
// create 时
let exists: bool = db.query_row(
    "SELECT COUNT(*) FROM entries WHERE group_id IS ?1 AND title=?2",
    params![group_id, title], |r| r.get::<_, i64>(0)
)? > 0;
if exists { return Err(AppError::DuplicateTitle); }

// update 时，排除自身
let exists: bool = db.query_row(
    "SELECT COUNT(*) FROM entries WHERE group_id IS ?1 AND title=?2 AND id!=?3",
    params![group_id, title, id], |r| r.get::<_, i64>(0)
)? > 0;
if exists { return Err(AppError::DuplicateTitle); }
```

新增错误变体：
```rust
#[error("同分组下已存在同名条目")]
DuplicateTitle,
```

### app_config 新增配置项

| key | 默认值 | 含义 |
|---|---|---|
| `favicon_cache_expiry_days` | `7` | favicon 缓存有效期（天） |
| `http_proxy` | `""` | HTTP 代理 URL，如 `http://127.0.0.1:7890`，空=不使用 |
| `no_proxy` | `""` | 不走代理的地址，逗号分隔，如 `localhost,127.0.0.1,.corp.com` |
| `storage_dir` | `""` | 数据存储目录，空=使用默认路径 |

---

## Section 2：Entry 列表 UI 变更

### EntryCard

- 右侧添加 `⋯` 按钮（始终可见），点击展开 `DropdownMenu`
- 菜单项：**编辑**、**置顶 / 取消置顶**、**删除**（触发 AlertDialog 二次确认）
- 卡片左侧添加拖拽 handle（`GripVertical` 图标，hover 时显示）
- 字幕行：显示 `entry.username`（由 Rust 同步，有则显示，无则不显示）

### EntryList

- 使用 `@dnd-kit/core` + `@dnd-kit/sortable` 实现拖拽排序
- 置顶区和普通区各自独立拖拽，顶部显示 `📌 置顶` 分隔标签（有置顶条目时才显示）
- 不支持跨区拖拽（`SortableContext` 各自独立）
- 拖拽结束后调用 `reorder_entries`，批量写 `sort_order`

### 新增 Tauri 命令

```rust
// 置顶 / 取消置顶
pin_entry(id: i64, pinned: bool) -> Entry

// 批量更新排序（pinned=true 更新置顶区，false 更新普通区）
reorder_entries(ids: Vec<i64>, pinned: bool) -> ()
```

`reorder_entries` 按 `ids` 的下标顺序写入 `sort_order`（0, 1, 2…）。

新建条目时：`sort_order = (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM entries WHERE group_id IS ? AND pinned=0)`

---

## Section 3：Entry 表单重构

### EntryDialog 完全重写

移除硬编码的 username / password / url / notes 输入框，改为纯字段列表 + 快捷操作区。

**表单结构：**
```
标题 *  [必填，同分组唯一]

─── 字段列表 ──────────────────────
[字段行 1：名称(灰色只读) | 类型(灰色只读) | 值(可编辑) | 删除]
[字段行 2：...]
────────────────────────────────────

快捷添加：
[👤 用户名] [🔐 密码] [🔗 URL] [🔑 Token] [📧 邮箱] [✏️ 自定义]

模版：
[账号密码] [API/Token] [银行卡] [笔记]

─── 折叠区（默认展开）─────────────
标签 / 分组 / 收藏
────────────────────────────────────

[取消]  [保存]
```

### 快捷添加按钮

每次点击追加一行字段，字段名和类型预填，用户只需填写值：

| 按钮 | field_name | field_type |
|---|---|---|
| 用户名 | `username` | `text` |
| 密码 | `password` | `password` |
| URL | `url` | `url` |
| Token | `token` | `token` |
| 邮箱 | `email` | `email` |
| 自定义 | `""（空，用户填）` | `text` |

### 模版（追加字段，不替换已有）

| 模版 | 追加字段 |
|---|---|
| 账号密码 | username(text) + password(password) + url(url) |
| API/Token | api_key(token) + endpoint(url) |
| 银行卡 | card_number(secret) + cvv(secret) + expiry(date) |
| 笔记 | content(text) |

### 字段格式校验（保存时触发）

| field_type | 校验规则（值非空时） |
|---|---|
| `url` | 以 `http://` 或 `https://` 开头 |
| `email` | 包含 `@` 且 `@` 后有 `.` |
| `number` | `/^\d*\.?\d*$/` |
| `date` | `/^\d{4}-\d{2}-\d{2}$/` |
| 其他 | 无约束 |

校验失败：字段行下方显示红色错误提示，`保存` 按钮禁用。

---

## Section 4：Settings 页面扩展

在现有 SettingsPage 基础上新增两个 Card 区块。

### Favicon 抓取配置

```
缓存有效期：[___] 天（默认 7）
HTTP 代理：  [________________________________]
不走代理：   [________________________________]（逗号分隔）
[保存]
```

Rust 层在构建 `reqwest::Client` 时（`fetch_site_metadata`、`get_favicon`）读取配置：

```rust
let mut client_builder = reqwest::Client::builder();
if !proxy_url.is_empty() {
    let mut proxy = reqwest::Proxy::all(&proxy_url)?;
    if !no_proxy.is_empty() {
        proxy = proxy.no_proxy(reqwest::NoProxy::from_string(&no_proxy));
    }
    client_builder = client_builder.proxy(proxy);
}
```

`no_proxy` 字符串格式同 `NO_PROXY` 环境变量约定：逗号分隔的域名/IP/CIDR，支持通配前缀 `.corp.com`。

favicon 查询时检查 `fetched_at`：若超过 `favicon_cache_expiry_days` 天则重新抓取。

### 数据存储目录

```
当前路径：[只读显示，如 C:\Users\...\AppData\Roaming\passkeeper]
自定义路径：[________________________________] [选择目录]
[保存]
```

- 点击保存 → 调用 `migrate_storage(new_path)` → 复制 `vault.db` 到新路径 → 写入 `app_config.storage_dir` → toast 提示"路径已保存，重启后生效"
- 应用启动时（`main.rs`）：读取 `app_config.storage_dir`（需先用默认路径打开 DB → 读取配置 → 若有自定义路径则关闭并重连）
- 若目标路径已有 `vault.db`，提示用户确认是否覆盖

### 扩展 AppSettings 结构体

```rust
pub struct AppSettings {
    pub auto_lock_minutes: i64,
    pub show_passwords_by_default: bool,
    pub favicon_cache_expiry_days: i64,
    pub http_proxy: String,
    pub no_proxy: String,
    pub storage_dir: String,
}
```

新增 Tauri 命令：
```rust
get_storage_dir() -> String   // 返回当前实际使用路径
migrate_storage(new_path: String) -> ()  // 复制 DB + 写配置
```

---

## Section 5：杂项 UI 改进

### 固定标题栏（#7）

三列布局每列顶部 header 区域：
```tsx
<div className="sticky top-0 z-10 bg-background border-b border-border shrink-0">
  {/* header content */}
</div>
```

受影响组件：
- `GroupTree`（分组列表顶部"分组"标题 + 操作按钮）
- `EntryList`（搜索栏 + 新建按钮）
- `EntryDetail`（条目标题 + 编辑/删除按钮）
- `SettingsPage`（Settings 标题栏）

### 条目时间戳（#5）

EntryDetail 底部新增：
```tsx
<div className="flex gap-4 text-xs text-muted-foreground mt-auto pt-4 border-t border-border">
  <span>创建于 {formatDate(entry.created_at)}</span>
  <span>更新于 {formatDate(entry.updated_at)}</span>
</div>
```

`formatDate`：使用 `Intl.DateTimeFormat` 本地化格式，如 `2026年4月5日 09:11`。

### 应用图标（#1）

设计方案 C：渐变紫蓝底（`#6366F1` → `#2563EB`）+ 白色钥匙圆环 + 密码列表线条。

生成文件：
- `src-tauri/icons/icon.svg`（源文件）
- `src-tauri/icons/icon.ico`（Windows，多尺寸嵌入：16/32/48/256px）
- `src-tauri/icons/32x32.png`、`128x128.png`、`128x128@2x.png`

工具：使用 `magick`（ImageMagick）或手工 SVG → ICO 转换。

---

## 受影响文件

### Rust

- `src-tauri/src/db/init.rs` — entries 表新增 pinned/sort_order 列
- `src-tauri/src/db/models.rs` — Entry 结构体新增字段
- `src-tauri/src/error.rs` — 新增 DuplicateTitle 错误
- `src-tauri/src/commands/entries.rs` — title 唯一性校验、字段同步、pin/reorder 命令
- `src-tauri/src/commands/settings.rs` — 扩展 AppSettings、新增 migrate_storage
- `src-tauri/src/commands/metadata.rs` — reqwest Client 使用代理配置、favicon 过期检查
- `src-tauri/src/main.rs` — 注册新命令、启动时处理 storage_dir
- `src-tauri/Cargo.toml` — 确认 reqwest 代理相关 feature

### Frontend

- `src/lib/tauri.ts` — 新增命令 wrapper、扩展 AppSettings 类型、扩展 Entry 类型
- `src/hooks/useEntries.ts` — 新增 pinEntry、reorderEntries mutation
- `src/components/entries/EntryCard.tsx` — ⋯ 菜单、drag handle
- `src/components/EntryList.tsx` — dnd-kit 集成、置顶分区
- `src/components/entries/EntryDialog.tsx` — 完全重写
- `src/components/entries/EntryDetail.tsx` — 移除硬编码字段区块、新增时间戳、sticky header
- `src/components/GroupTree.tsx` — sticky header
- `src/pages/SettingsPage.tsx` — 新增代理配置和存储目录区块
- `src/pages/UnlockPage.tsx` — 无变更
- `src-tauri/icons/` — 新图标文件

---

## 实现顺序

```
1. DB schema + Rust 数据模型（entries pinned/sort_order + DuplicateTitle）
2. entries 命令扩展（title 校验、字段同步、pin/reorder）
3. settings 命令扩展（代理配置、storage_dir、migrate_storage）
4. metadata 命令（代理客户端、favicon 过期）
5. TypeScript 类型 + hook 更新
6. EntryCard ⋯ 菜单 + drag handle
7. EntryList dnd-kit 拖拽分区
8. EntryDialog 完全重写
9. EntryDetail sticky header + 时间戳（移除硬编码字段）
10. SettingsPage 扩展
11. 全局 sticky header（GroupTree、EntryList）
12. 应用图标生成
```
