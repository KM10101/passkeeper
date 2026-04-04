# PassKeeper — 设计文档

**日期：** 2026-04-04  
**状态：** 已确认

---

## 概述

PassKeeper 是一个本地优先的密码管理器桌面应用，用于安全存储密码、API Token、笔记、书签等凭据。数据完全保存在本地，支持加密导出/导入以在多设备间迁移。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 |
| 后端 | Rust |
| 前端 | React + TypeScript + Vite |
| 数据库 | SQLite（via rusqlite） |
| 密钥派生 | Argon2id |
| 字段加密 | AES-256-GCM |
| 内存安全清零 | zeroize crate |
| 状态管理 | React Context + TanStack Query |

---

## 架构

### 核心原则

- **Rust 重后端**：所有加密/解密、数据库读写、搜索、导出逻辑均在 Rust 中处理
- **React 纯展示层**：前端只负责 UI 渲染和用户交互，通过 Tauri IPC commands 调用后端
- **最小解密暴露**：敏感字段仅在用户主动查看某条记录时解密，用完不缓存，不在前端长期持有
- **明文搜索**：列表/搜索接口只返回明文元数据，不触发解密

### 分层结构

```
Frontend (React + TypeScript)
    ↕  Tauri IPC Commands
Backend (Rust)
  ├── Crypto Layer   — Argon2id 派生主密钥，AES-256-GCM 字段加密，zeroize 清零
  ├── Data Layer     — rusqlite，entries/entry_fields/groups/favicon_cache 表
  └── Export Layer   — 加密二进制导出/导入
    ↕  rusqlite
SQLite Database
```

---

## 认证模型

- **主密码**：应用启动后需输入主密码解锁
- **密钥派生**：`Argon2id(master_password, salt)` → 32 字节主密钥，仅存于 Rust `AppState`
- **密码验证**：`app_config` 中存储用主密钥加密的固定校验字符串，解密成功则密码正确，不存储主密钥本身
- **自动锁定**：闲置超过配置时长后自动清零内存中的主密钥
- **2FA**：预留扩展点，当前版本不实现

---

## 数据模型

### groups 表

```sql
CREATE TABLE groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    parent_id  INTEGER REFERENCES groups(id),   -- NULL = 顶级分组
    icon       TEXT,                            -- emoji 或图标名
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
```

层级深度建议限制在 3 层以内。删除分组时，子分组和条目移入"未分组"。

### entries 表

```sql
CREATE TABLE entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id      INTEGER REFERENCES groups(id),
    title         TEXT    NOT NULL,
    url           TEXT,
    site_title    TEXT,               -- 自动抓取的页面标题
    username      TEXT,
    template_type TEXT    NOT NULL,   -- "password"|"token"|"note"|"bookmark"
    tags          TEXT,               -- JSON 数组，如 ["work","dev"]
    notes         TEXT,               -- 明文备注（非敏感说明）
    favorite      BOOLEAN NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_entries_title    ON entries(title);
CREATE INDEX idx_entries_url      ON entries(url);
CREATE INDEX idx_entries_username ON entries(username);
CREATE INDEX idx_entries_tags     ON entries(tags);
CREATE INDEX idx_entries_group    ON entries(group_id);
```

### entry_fields 表（加密敏感字段）

```sql
CREATE TABLE entry_fields (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    field_name  TEXT    NOT NULL,   -- 明文字段名，如 "password"、"api_key"
    field_value BLOB    NOT NULL,   -- AES-256-GCM 加密值
    nonce       BLOB    NOT NULL,   -- 每字段独立随机 12 字节 nonce
    sort_order  INTEGER NOT NULL DEFAULT 0
);
```

每个敏感字段使用独立随机 nonce，防止相同值被关联识别。

### favicon_cache 表

```sql
CREATE TABLE favicon_cache (
    domain     TEXT    PRIMARY KEY,  -- "github.com"
    favicon    BLOB,                 -- PNG/ICO 二进制，NULL 表示抓取失败
    fetched_at INTEGER NOT NULL
);
```

按域名去重，多个同域条目共享同一份 favicon。favicon 为 NULL 时，前端以 title 首字母 + 哈希颜色渲染降级头像。

### app_config 表

```sql
CREATE TABLE app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

| key | 说明 |
|-----|------|
| `argon2_salt` | 32 字节随机 salt（base64），初始化时生成，不可更改 |
| `master_key_verify` | 用主密钥加密的固定字符串，用于验证密码正确性 |
| `auto_lock_minutes` | 闲置自动锁定时间（分钟），默认 15 |

### 预置模板字段

| 模板 | 明文字段 | 加密字段 |
|------|----------|----------|
| Password | username, url | password, totp_secret（可选） |
| Token / API Key | scope, expires_at | token |
| Note | —— | content |
| Bookmark | url, description | —— |

每种模板均可追加任意自定义字段，字段创建时可选择是否加密。

---

## Tauri Commands 接口

### 解锁 / 锁定

```typescript
unlock(password: string) → Result<(), Error>
lock() → void
is_locked() → bool
```

### 分组管理

```typescript
list_groups() → Vec<Group>                          // 完整树形结构
create_group(name, parent_id?, icon?) → Group
update_group(id, name?, icon?, sort_order?) → Group
delete_group(id) → void                             // 子分组和条目移入未分组
```

### 条目 CRUD

```typescript
list_entries(filter: {
    group_id?: number,
    tags?: string[],
    search?: string,     // 匹配 title / username / url / tags
    favorite?: boolean
}) → Vec<EntrySummary>   // 只含明文字段，不触发解密

get_entry(id: number) → EntryDetail  // 含解密后的 entry_fields，按需解密

create_entry(entry: NewEntry) → EntrySummary
update_entry(id, entry: UpdateEntry) → EntrySummary
delete_entry(id) → void
```

### 网站元数据

```typescript
fetch_site_metadata(url: string) → SiteMetadata  // 后台静默抓取，失败不影响保存
get_favicon(domain: string) → Option<Vec<u8>>    // 返回 PNG bytes
```

### 导入 / 导出（仅加密二进制）

```typescript
export_vault(path: string, export_password: string) → void
// 导出密码可与主密码不同，便于在不同设备上使用不同主密码导入

import_vault(path: string, export_password: string) → ImportResult
```

### 设置

```typescript
get_settings() → Settings
update_settings(auto_lock_minutes?: number) → void
change_master_password(old_password: string, new_password: string) → void
// 需重新加密所有 entry_fields，整个操作在一个事务中完成
```

---

## 前端结构

```
src/
├── pages/
│   ├── UnlockPage        # 主密码输入，解锁金库
│   ├── VaultPage         # 主界面：左侧分组树 + 右侧条目列表
│   ├── EntryDetailPage   # 查看/编辑某条记录（触发解密）
│   └── SettingsPage      # 修改主密码、自动锁定时间
├── components/
│   ├── GroupTree         # 可折叠分组层级树（左侧导航）
│   ├── EntryList         # 条目卡片列表
│   ├── EntryForm         # 新建/编辑表单，支持模板选择 + 自定义字段
│   ├── SearchBar         # 实时搜索（title/username/tags/url）
│   ├── TagBadge          # 标签展示组件
│   └── FaviconAvatar     # favicon 图片或首字母降级头像
├── hooks/
│   ├── useVault          # 锁定状态、解锁/锁定操作
│   ├── useEntries        # 条目列表、搜索、过滤
│   └── useGroups         # 分组树数据
└── lib/
    └── tauri.ts          # Tauri command 调用封装（类型安全）
```

### VaultPage 布局

```
┌─────────────────────────────────────────────────┐
│  PassKeeper                        🔒 锁定  ⚙️  │
├──────────────┬──────────────────────────────────┤
│ ★ 收藏       │  🔍 搜索...    [标签过滤]          │
│ 📁 全部      ├──────────────────────────────────┤
│              │  [favicon] GitHub                 │
│ 📁 工作      │           user@email.com  [work]  │
│   📁 开发    │                                   │
│     📁 CI/CD │  [favicon] AWS Console            │
│ 📁 个人      │           admin  [work][cloud]    │
│   📁 社交    │                                   │
│ 📁 服务器    │  [T]  Bearer Token                │
│              │       api.example.com  [dev]      │
└──────────────┴──────────────────────────────────┘
```

---

## 导出文件格式

加密二进制文件（`.pkv` 扩展名）：

```
[4 bytes magic: "PKVT"]
[4 bytes version: u32]
[32 bytes salt: Argon2id salt for export_password]
[12 bytes nonce: AES-256-GCM nonce]
[N bytes ciphertext: AES-256-GCM 加密的 JSON 数据]
[16 bytes GCM tag]
```

JSON 数据包含 groups、entries、entry_fields 的完整快照。导出密码与主密码独立，允许在不同设备上以不同主密码导入。

---

## 错误处理

- 密码错误：返回通用错误信息，不透露是"密码错误"还是"数据损坏"（防止信息泄露）
- 解密失败：记录日志，向前端返回错误，不崩溃
- favicon 抓取失败：静默降级，不影响条目保存，前端显示首字母头像
- 数据库操作失败：返回错误，前端展示提示
- `change_master_password` 失败：事务回滚，数据保持原状

---

## 不在本版本范围内

- 2FA（预留扩展点）
- 云同步
- 浏览器扩展
- 密码强度检测 / 泄露检查
- 多用户 / 多金库
