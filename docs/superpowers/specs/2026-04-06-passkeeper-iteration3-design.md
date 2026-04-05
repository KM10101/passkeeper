# PassKeeper 第三轮迭代设计文档

**日期：** 2026-04-06
**范围：** 富文本字段渲染、全局卡片风格 UI 改造、分组面板重设计

---

## 背景

基于第二轮迭代完成的字段化数据模型，本次迭代聚焦于两个方向：

1. **富文本字段渲染**：为 `markdown`、`code`、`json`、`yaml` 四种新字段类型提供渲染视图，让密码本能承载更多结构化信息（操作说明、配置文件、API 文档等）。
2. **全局卡片风格**：将条目列表、字段列表、分组面板统一为卡片式视觉风格，提升层次感和拖拽操作的清晰度；同时为分组添加 Emoji 图标和条目计数。

---

## Section 1：数据模型变更

### 无 DB 变更

`entry_fields.field_type` 已是 `TEXT` 列，直接写入 `"markdown"`、`"code"`、`"json"`、`"yaml"` 即可，无需 migration。

`groups.icon` 列已存在（`TEXT NULL`），直接存 Emoji 字符（如 `"💼"`），无需变更。

### 加密策略

新四种类型与 `text` 类型一致，**不加密**（明文存储在 `entry_fields.field_value`）。它们不含密码等敏感数据，仅是用户笔记/配置内容。

Rust 侧 `ENCRYPTED_TYPES`（`["password", "secret", "token"]`）不需要修改。

---

## Section 2：富文本字段渲染

### 新增 field_type 值

| field_type | 含义 | 渲染方式 |
|---|---|---|
| `markdown` | Markdown 格式文本 | react-markdown + remark-gfm |
| `code` | 代码片段（自动检测语言） | highlight.js autodetect |
| `json` | JSON 数据 | highlight.js json 模式 |
| `yaml` | YAML 配置 | highlight.js yaml 模式 |

### EntryDetail 渲染交互

- 上述四种类型默认显示**渲染视图**
- 字段卡片右上角添加「原始」按钮（小徽章样式），点击后该字段切换为等宽纯文本，再次点击回到渲染视图
- 切换状态存在组件本地 state（`Set<fieldId>`），不持久化
- 编辑时（铅笔按钮）始终进入原始文本模式，`<textarea>` 带等宽字体 (`font-mono`)
- 对 `json` 类型：渲染前先 `JSON.parse` 再 `JSON.stringify(obj, null, 2)` 格式化；若 parse 失败则退化为 `code` 高亮显示

### FieldRenderer 组件

新建 `src/components/entries/FieldRenderer.tsx`，接收 `field_type` 和 `value`，返回对应渲染内容：

```tsx
interface FieldRendererProps {
  fieldType: string;
  value: string;
}
```

内部逻辑：
- `markdown`：`<ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>`，外层加 `prose prose-sm dark:prose-invert` Tailwind 排版类
- `code`：`hljs.highlightAuto(value)`，输出 `<pre><code>` 带语法着色
- `json`：先格式化，再 `hljs.highlight(formatted, { language: 'json' })`
- `yaml`：`hljs.highlight(value, { language: 'yaml' })`

highlight.js 只导入需要的语言包以控制体积：
```ts
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import xml from 'highlight.js/lib/languages/xml';
import typescript from 'highlight.js/lib/languages/typescript';
// autodetect 回退时使用已注册语言
```

highlight.js 主题：深色用 `github-dark`，浅色用 `github`。在 `src/index.css` 中同时引入两个主题 CSS，通过 `.dark` 类控制生效：

```css
/* highlight.js 主题 */
@import 'highlight.js/styles/github.css' layer(hljs-light);
@import 'highlight.js/styles/github-dark.css' layer(hljs-dark);

@layer hljs-light { :root:not(.dark) .hljs { /* github theme vars */ } }
@layer hljs-dark  { :root.dark .hljs { /* github-dark theme vars */ } }
```

实际实现：在 `src/index.css` 的末尾，用 `:root:not(.dark)` 和 `.dark` 分别覆写 `.hljs` 的 `background` 和 `color`，保持与 shadcn 主题一致。

### 新增依赖

```
react-markdown
remark-gfm
highlight.js
@tailwindcss/typography   ← prose 排版类所需
cmdk                      ← shadcn/ui Command（Combobox）所需
```

`@tailwindcss/typography` 需在 `tailwind.config.ts` 的 `plugins` 中启用：
```ts
plugins: [require('@tailwindcss/typography')]
```

---

## Section 3：EntryDialog 字段类型 Combobox

### 替换 select

将 `EntryDialog` 中每个字段行的 `<Select>` 替换为基于 shadcn/ui `Command` 的 **Combobox**，支持输入搜索和滚动。

需新增依赖：`cmdk`（已列于 Section 2 依赖清单）。

### 完整类型列表（12 项）

```
text        · 普通文本
password    · 密码（隐藏）
url         · 网址
email       · 邮箱
token       · Token（隐藏）
secret      · 密钥（隐藏）
number      · 数字
date        · 日期
markdown    · Markdown 文档
code        · 代码片段
json        · JSON 数据
yaml        · YAML 配置
```

Combobox 显示：图标 + 类型名。支持按名称过滤，列表最大高度 `max-h-48` 可滚动。

### 快捷添加按钮新增

在现有按钮组后追加：

| 按钮 | field_name | field_type |
|---|---|---|
| 📝 笔记 | `notes` | `markdown` |
| 💻 代码 | `code` | `code` |
| `{}` JSON | `data` | `json` |

### EntryDialog 编辑区域

`markdown`/`code`/`json`/`yaml` 类型的字段值输入框：
- 替换单行 `<Input>` 为多行 `<Textarea>`
- 高度：`min-h-[80px] max-h-[200px] resize-y`
- 字体：`markdown` 用正文字体；`code`/`json`/`yaml` 用 `font-mono text-sm`

---

## Section 4：全局卡片风格 UI 改造

### 设计规范

| 元素 | Tailwind 类 |
|---|---|
| 列表容器背景 | `bg-muted/40` |
| 列表内边距 / 间距 | `p-2 flex flex-col gap-2` |
| 卡片基础样式 | `rounded-lg border border-border bg-card shadow-sm` |
| 卡片 hover | `hover:border-border/80 hover:shadow-md transition-all` |
| 选中卡片 | `border-primary ring-1 ring-primary/20 shadow-md` |

所有列（EntryList、GroupTree）移除现有的 `border-b border-border` 分隔线，改用 `gap-2` 间距。

### EntryCard

- 移除 `border-b border-border last:border-0`
- 卡片容器：`rounded-lg border border-border bg-card shadow-sm p-3`
- 选中：`border-primary ring-1 ring-primary/20`
- 拖拽中：`opacity-50 cursor-grabbing`

### EntryList 容器

```tsx
// 列表背景容器
<div className="flex-1 overflow-y-auto bg-muted/40">
  <div className="p-2 flex flex-col gap-2">
    {/* cards */}
  </div>
</div>
```

### EntryDetail 字段列表

- 移除每个 `FieldRow` 的 `border-b border-border`
- 字段列表容器：`flex flex-col gap-2`
- 每个字段行卡片：`rounded-lg border border-border bg-muted/20 p-3`

---

## Section 5：分组面板重设计（GroupTree）

### 整体布局

```
┌─────────────────────┐
│  分组              ＋ │  ← header（sticky）
│ ┌─────────────────┐ │
│ │ 🗂️  全部条目  24 │ │  ← 固定在 header 区域，蓝色图标
│ └─────────────────┘ │
├─────────────────────┤
│ ┌─────────────────┐ │
│ │ 💼  工作       8 ⋯│ │  ← 卡片，含条目数 + ⋯ 菜单
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ 🏠  个人       5 ⋯│ │
│ └─────────────────┘ │
│  ...                │
└─────────────────────┘
```

### 卡片样式

与 EntryCard 一致规范，选中状态同样 `border-primary ring-1 ring-primary/20`。

### 条目计数徽章

在 `useGroups` hook 中，通过 `get_entries(groupId)` 拿到各分组的条目数量，或直接在 SQL 查询中 JOIN 统计：

```rust
// 在 list_groups 命令中添加 entry_count 字段
SELECT g.*, COUNT(e.id) as entry_count
FROM groups g
LEFT JOIN entries e ON e.group_id = g.id
GROUP BY g.id
```

`Group` 结构体新增 `entry_count: i64` 字段（Rust + TypeScript 同步更新）。

「全部条目」的计数 = 所有 entries 总数，在前端汇总。

### Emoji 图标选择器

新建 `src/components/ui/EmojiPicker.tsx`，小型弹出网格（Popover）：

预设 28 个 Emoji（4 列 × 7 行）：
```
📁 📂 💼 🏠 🖥️ 🔑 🏦 🌐
🛡️ 📧 🔗 💻 🗄️ ☁️ 🎮 📱
🚀 🔐 🌟 ⚙️ 🎯 📊 🗂️ 🔒
💡 🏢 🎓 🧪
```

触发方式：新建/编辑分组时，名称输入框左侧的图标按钮（默认 `📁`）点击后弹出选择器，选中即关闭。

### GroupTree 组件变更

- `GroupItem` 子组件：卡片样式，左侧 Emoji 图标，右侧条目数 + ⋯ 菜单
- 新建分组：点击 header 右侧 ＋ 按钮，在列表底部插入一个内联编辑卡片（含图标选择 + 名称输入）
- 编辑分组（重命名/换图标）：通过 ⋯ 菜单触发，卡片原地进入编辑模式（inline edit）

---

## 受影响文件

### 新建

- `src/components/entries/FieldRenderer.tsx` — 富文本渲染组件
- `src/components/ui/EmojiPicker.tsx` — Emoji 选择器 Popover
- `src/components/ui/field-type-combobox.tsx` — 字段类型 Combobox

### 修改（前端）

- `src/components/entries/EntryCard.tsx` — 卡片样式
- `src/components/EntryList.tsx` — 容器背景 + gap 间距
- `src/components/entries/EntryDetail.tsx` — 字段卡片样式 + FieldRenderer 集成 + 原始/渲染切换
- `src/components/entries/EntryDialog.tsx` — Combobox 替换 select + Textarea + 快捷按钮新增
- `src/components/GroupTree.tsx` — 全面重写：卡片风格 + Emoji + 条目数
- `src/lib/tauri.ts` — Group 类型新增 `entry_count`

### 修改（Rust）

- `src-tauri/src/db/models.rs` — Group 结构体新增 `entry_count: i64`
- `src-tauri/src/commands/groups.rs` — `list_groups` SQL 新增 COUNT JOIN

### 主题 CSS

- `src/index.css` 或 `src/styles/hljs.css` — 引入 highlight.js 主题，深/浅色切换

---

## 实现顺序

```
1. Rust: list_groups 添加 entry_count（Group 结构体 + SQL + TS 类型）
2. FieldRenderer 组件（react-markdown + highlight.js 集成）
3. EntryDetail：字段卡片样式 + FieldRenderer 集成 + 原始/渲染切换
4. EntryDialog：field-type-combobox + Textarea + 快捷按钮
5. EntryCard + EntryList：卡片风格改造
6. EmojiPicker 组件
7. GroupTree 全面重写（卡片 + Emoji + 条目数）
```
