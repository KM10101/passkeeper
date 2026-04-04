# PassKeeper

本地优先的桌面密码管理器，基于 Tauri v2 构建。所有数据加密存储在本地，不依赖任何云服务。

## 功能特性

- 主密码解锁，Argon2id 密钥派生
- AES-256-GCM 加密存储所有敏感字段
- 分组管理（支持嵌套）
- 条目支持多字段、标签、收藏、备注
- 站点元数据自动抓取（页面标题 + favicon 缓存）
- 加密导出 / 导入（`.pkv` 格式）
- 自动锁定计时器

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 |
| 后端逻辑 | Rust |
| 数据库 | SQLite（rusqlite，bundled） |
| 加密 | Argon2id + AES-256-GCM（argon2 / aes-gcm） |
| 前端 | React 18 + TypeScript |
| UI 组件 | shadcn/ui + Tailwind CSS v3 |
| 状态管理 | TanStack React Query v5 |
| 构建工具 | Vite 5 |

## 环境要求

- [Rust](https://rustup.rs/) 1.77+
- [Node.js](https://nodejs.org/) 18+
- Tauri v2 系统依赖（见 [Tauri 文档](https://tauri.app/start/prerequisites/)）

## 快速开始

```bash
# 安装前端依赖
npm install

# 开发模式（同时启动 Vite dev server 和 Tauri 窗口）
npm run tauri dev

# 生产构建
npm run tauri build
```

## 运行测试

```bash
# Rust 后端测试（21 个）
cd src-tauri && cargo test

# 前端测试（3 个）
npm test
```

## 项目结构

```
passkeeper/
├── src/                        # 前端（React + TypeScript）
│   ├── App.tsx                 # 路由入口（UnlockPage ↔ VaultPage）
│   ├── index.css               # Tailwind 指令 + shadcn CSS 变量
│   ├── lib/
│   │   ├── tauri.ts            # 类型安全的 Tauri IPC 封装（20 个命令）
│   │   ├── theme.ts            # 主题工具函数（applyTheme / getStoredTheme）
│   │   └── utils.ts            # cn() 工具函数（clsx + tailwind-merge）
│   ├── hooks/
│   │   ├── useVault.ts         # 锁定状态、unlock/lock
│   │   ├── useGroups.ts        # 分组 CRUD
│   │   └── useEntries.ts       # 条目 CRUD
│   ├── pages/
│   │   ├── UnlockPage.tsx      # 主密码输入页
│   │   └── VaultPage.tsx       # 主界面（三栏布局）
│   └── components/
│       ├── layout/
│       │   ├── AppShell.tsx    # 顶栏 + 三栏骨架
│       │   └── ThemeProvider.tsx # 深色/浅色主题上下文
│       ├── sidebar/
│       │   └── GroupMenu.tsx   # 分组右键菜单（重命名 / 删除）
│       ├── entries/
│       │   ├── EntryCard.tsx   # 条目卡片（favicon + 标题 + 元信息）
│       │   ├── EntryDetail.tsx # 右侧详情面板
│       │   └── EntryDialog.tsx # 新建 / 编辑弹窗
│       ├── ui/                 # shadcn/ui 基础组件
│       │   ├── button.tsx
│       │   ├── input.tsx
│       │   ├── label.tsx
│       │   ├── textarea.tsx
│       │   ├── badge.tsx
│       │   ├── dialog.tsx
│       │   ├── dropdown-menu.tsx
│       │   ├── select.tsx
│       │   └── switch.tsx
│       ├── GroupTree.tsx       # 分组侧边栏（含新建分组）
│       └── EntryList.tsx       # 条目列表（搜索 + 新建按钮）
│
└── src-tauri/                  # Rust 后端
    ├── src/
    │   ├── main.rs             # Tauri Builder，注册所有命令
    │   ├── lib.rs              # 模块声明
    │   ├── error.rs            # AppError（thiserror + serde）
    │   ├── state.rs            # AppState（MasterKey + DB + 活动时间）
    │   ├── crypto/
    │   │   ├── kdf.rs          # Argon2id 密钥派生（m=64MB, t=3, p=4）
    │   │   └── aes.rs          # AES-256-GCM 加密 / 解密
    │   ├── db/
    │   │   ├── init.rs         # 建表（5 张表，WAL 模式）
    │   │   └── models.rs       # Group / Entry / EntryField 结构体
    │   └── commands/
    │       ├── auth.rs         # unlock / lock / is_locked / change_master_password
    │       ├── groups.rs       # list / create / update / delete group
    │       ├── entries.rs      # list / get / create / update / delete entry（含字段加解密）
    │       ├── metadata.rs     # fetch_site_metadata / get_favicon
    │       ├── vault_io.rs     # export_vault / import_vault（.pkv 格式）
    │       └── settings.rs     # get_settings / update_settings
    └── tauri.conf.json         # 窗口配置（1100×700）
```

## 架构说明

### 数据流

```
前端 React 组件
    ↓ useMutation / useQuery（React Query）
src/hooks/
    ↓ invoke()
src/lib/tauri.ts（IPC 封装）
    ↓ Tauri IPC
src-tauri/src/commands/（Tauri 命令）
    ↓
AppState（Mutex<Connection> + Mutex<Option<MasterKey>>）
```

### 加密模型

1. **主密码** → Argon2id（salt 随机 32 字节）→ **主密钥**（32 字节）
2. 主密钥存于内存（`AppState.master_key`），使用 `zeroize` 在 Drop 时清零
3. 每个条目字段单独用 AES-256-GCM 加密，nonce 随机生成（12 字节），与密文一起存入 `entry_fields`
4. 导出文件（`.pkv`）：`magic(4) + version(4) + salt(32) + nonce(12) + AES-GCM(JSON payload)`

### 数据库（SQLite）

| 表 | 用途 |
|---|---|
| `groups` | 分组（支持自引用嵌套） |
| `entries` | 条目元数据（标题、URL、用户名等明文） |
| `entry_fields` | 加密字段（密码等敏感值） |
| `favicon_cache` | 站点图标缓存（按域名） |
| `app_config` | 应用配置（主密钥验证令牌、设置项） |

数据库文件位于系统数据目录：
- Windows: `%APPDATA%\passkeeper\vault.db`
- macOS: `~/Library/Application Support/passkeeper/vault.db`
- Linux: `~/.local/share/passkeeper/vault.db`
