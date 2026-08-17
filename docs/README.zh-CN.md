# ✨ Nova Agent（新星 Agent）

**Nova Agent** 是一个轻量、开箱即用的开源 AI Agent 应用 —— Claude Code 的极简替代实现。技术栈：**React 19 + TypeScript + Express + Vercel AI SDK + MCP + Agent Skills**。

> 小巧但完整：Agent 循环、MCP 工具、技能系统、多轮对话、轨迹展示、多 Agent 管理、可视化配置、安全隔离 —— 全部具备且可扩展。

[English README](../README.md)

---

## ✨ 功能清单

### Agent 核心
- ✅ **Agent 循环**：Vercel AI SDK `streamText` 多步工具调用循环（最多 8 步）
- ✅ **多轮对话**：完整上下文 + 自动标题
- ✅ **流式输出**：SSE 打字机效果 + 思考动画
- ✅ **Markdown 渲染**：标题 / 代码高亮 / 表格 / 链接 / 引用（markdown-it + highlight.js）
- ✅ **工具调用卡片**：实时展示工具输入 / 输出 / 耗时 / 状态
- ✅ **轨迹视图**：每步工具调用时间线 + inspector（输入 / 输出 / 耗时 / token）
- ✅ **中断 / 继续**：流式期间可 Stop，已生成内容保留
- ✅ **上下文压缩**：token 感知——上下文占用接近模型窗口上限时（默认 90%，真实 API 计数），LLM 自动把较早历史总结为摘要（注入 system prompt）并保留最近 20 条 —— 长对话不再溢出上下文

### 多 Agent 管理
- ✅ 新建 / 编辑 / 删除 Agent（persona + 模型 + 工具勾选 + 技能勾选）
- ✅ 侧边栏切换 Agent（自动回到对话视图）
- ✅ 每个 Agent 独立配置，删除时连带清理会话

### 可视化配置（零代码）
- ✅ **技能管理**：表单可视化新建 / 编辑 / 删除技能（自动生成 SKILL.md）
- ✅ **技能搜索**：技能多时输入关键词即时过滤
- ✅ **工具浏览**：按 MCP server 分组展示全部工具 + 参数 Schema
- ✅ **API Key 配置**：界面 🔑 按钮配置，密钥存项目外

### 会话管理
- ✅ 会话切换 / 新建 / 重命名（行内编辑）/ 删除
- ✅ 首条消息自动创建会话
- ✅ **SQLite** 持久化（自动迁移旧 JSON 数据）

### 定时任务
- ✅ 5 段 cron 定时任务：让 Agent 定时干活（如每 5 分钟盯盘、每日日报）
- ✅ 任务在专用会话中运行（上下文连续），执行结果落库
- ✅ 支持手动立即执行、暂停/启用/删除

### 安全
- ✅ **工作区隔离**：Agent 只能访问可配置的工作区（默认 `workspace/`），读不到项目代码与 API key
- ✅ **Key 外置**：密钥存项目外 `.nova-agent-key.json`
- ✅ 删除操作需自定义确认弹窗
- ✅ Markdown 渲染禁用原始 HTML（防 XSS）
- ✅ **MCP 健康检查**：自动 ping + 指数退避重连

### 体验
- ✅ 深色玻璃拟态 + 紫蓝渐变（LobeChat 风格）
- ✅ 动画：消息进出场 / 工具卡片展开 / 视图切换 / 弹窗 spring
- ✅ 统一导航（对话 / 轨迹 / 技能 / 工具）侧边栏互切

---

## 🏗️ 技术架构

```
┌───────────── 浏览器 (React 19) ──────────────┐
│  Sidebar（Agent/会话/导航）→ MainPane        │
│    ├─ ChatView（消息 + 工具卡片 + 输入框）    │
│    ├─ TrajectoryView（轨迹时间线）            │
│    ├─ SkillManager（技能可视化编辑）          │
│    └─ ToolManager（工具浏览）                 │
│  Zustand store → api.ts（REST + SSE）        │
└───────────────────┬──────────────────────────┘
                    │ fetch /api/*（SSE 流式）
┌───────────────────▼──────────────────────────┐
│  Express 后端（server/）                      │
│  ├─ agentLoop.ts   Agent 循环（AI SDK streamText）│
│  ├─ compact.ts     上下文压缩（LLM 总结）      │
│  ├─ mcp.ts         MCP 客户端管理              │
│  ├─ skills.ts      SKILL.md 扫描/解析/CRUD     │
│  ├─ store.ts       Agent/Session 持久化 + key  │
│  └─ index.ts       路由（REST + SSE + 中断）   │
└───────┬──────────────────────┬────────────────┘
        │ MCP 协议              │ OpenAI 兼容
  ┌─────▼──────┐         ┌──────▼──────┐
  │ MCP Servers│         │  LLM API    │
  │ playwright │         │ DeepSeek    │
  │ filesystem │         │（或任意）    │
  └────────────┘         └─────────────┘
```

---

## 🚀 快速启动

### 前置要求
- Node.js 22+（使用内置 `node:sqlite`，无需原生模块）
- DeepSeek API Key（或任意 OpenAI 兼容服务）

### 启动

```bash
cd nova-agent
npm install          # 首次
npm run dev          # 同时启动前端(5173) + 后端(8787)
```

- 前端：http://localhost:5173
- 后端：http://localhost:8787

### 配置 API Key（任选其一）
1. **前端**：打开页面 → 侧边栏右下角 🔑 → 输入 key → 保存（存到项目外 `.nova-agent-key.json`）
2. **环境变量**：`DEEPSEEK_API_KEY=sk-...`

---

## 📁 目录结构

```
nova-agent/
├─ server/                    # 后端
│  ├─ index.ts                # Express 路由（REST + SSE + 中断）
│  ├─ agentLoop.ts            # Agent 循环（AI SDK streamText + MCP 工具）
│  ├─ compact.ts              # 上下文压缩（LLM 总结）
│  ├─ mcp.ts                  # MCP 客户端管理
│  ├─ skills.ts               # SKILL.md 扫描/解析/CRUD
│  ├─ models.ts               # 模型注册表（内置 + 自定义提供商）
│  ├─ memory.ts               # 长期记忆（LRU + 去重合并）
│  ├─ scheduler.ts            # 定时任务（5 段 cron）
│  ├─ db.ts                   # SQLite 初始化（node:sqlite）
│  ├─ builtinTools.ts         # 内置工具（web_search 等）
│  ├─ store.ts                # Agent/Session 持久化 + API key
│  └─ types.ts                # 共享类型
├─ src/                       # 前端（React 19 + TS + Zustand）
│  ├─ components/             # Sidebar/ChatView/Trajectory/SkillManager/ToolManager...
│  ├─ store.ts                # Zustand store
│  ├─ api.ts                  # REST + SSE 封装
│  ├─ markdown.ts             # markdown-it + highlight.js
│  └─ styles.css              # 设计体系（渐变/玻璃/动画）
├─ skills/                    # 技能（SKILL.md，Agent Skills 格式）
│  ├─ browser-ops/SKILL.md
│  └─ file-ops/SKILL.md
├─ mcp-servers/               # MCP server 配置（JSON）
│  ├─ filesystem.json
│  └─ playwright.json
├─ data/                      # 运行时数据（SQLite 数据库，不入库）
├─ workspace/                 # 默认工作区（设置页可配置；不入库）
├─ docs/                      # 开发者文档（架构/开发指南/变更记录/中文版说明）
└─ package.json
```

---

## ⚙️ 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | LLM API key（无外部 key 文件时的兜底） |
| `NOVA_AGENT_PORT` | `8787` | 后端端口 |
| `NOVA_AGENT_COMPACT_PCT` | `90` | 自动压缩阈值：上下文占用超过模型窗口的该百分比即压缩（token 感知，按最近一次 API 的真实输入计数） |
| `NOVA_AGENT_COMPACT_MIN` | `40` | 消息数兜底：超过该条数强制压缩（与 token 阈值双条件） |
| `NOVA_AGENT_COMPACT_KEEP` | `20` | 压缩后保留的最近消息数（更早的由 LLM 总结） |

---

## 📂 工作区（Agent 文件边界）

默认 Agent 只能读写项目内 `workspace/`。你可以像 Codex 一样把它指向任意文件夹，作为 Agent 的工作区域：

- **设置 → 工作区**：填相对路径（相对项目根解析）或绝对路径；留空 = 重置回默认 `workspace/`。首次运行会引导选择工作区（可跳过，默认 `workspace/` 始终作为兜底工具区）。保存后自动重连挂载工作区的 MCP server（如 filesystem），无需重启
- 附件上传与 **filesystem** 工具都以它为根——Agent 看到的正是你选的那个文件夹
- MCP 配置可用 `{{workspace}}` 占位符引用（如 `"args": ["node", "server.js", "{{workspace}}/data"]`）；以 `./` 或 `../` 开头的参数按项目根解析为绝对路径
- ⚠️ 安全提示：工作区就是 Agent 的权限边界。指向项目根或 API key 文件所在目录（都会被拒绝）等于把该目录的文件访问权交给 Agent；指向其他敏感目录同理——请谨慎选择。另外注意：切换工作区后，旧工作区下的上传附件将不可再预览（附件随工作区走）。

---

## 🔧 扩展方式（零代码）

### 新增 Agent
侧边栏 Agents 区 ＋ → 填名称 / persona → 勾选工具和技能 → 创建。双击可编辑。

### 新增技能（零代码）
**前端**：侧边栏 → 技能管理 → ＋ → 填表单（名称 / 简介 / 使用时机 / 正文）→ 创建。
**或手工**：`skills/<名称>/SKILL.md` 丢一个文件夹。

```markdown
---
name: 技能名
description: 简介
when_to_use: 使用时机
---
操作步骤正文（注入 system prompt）
```

### 新增工具（零代码）
`mcp-servers/` 加一个 JSON 配置即可接入任意 MCP server：

```json
{
  "id": "my-server",
  "name": "我的工具",
  "command": "npx",
  "args": ["-y", "某-mcp-server"],
  "timeoutMs": 30000
}
```

### 内置 MCP Servers

| id | 说明 |
|---|---|
| `playwright` | [@playwright/mcp](https://github.com/microsoft/playwright-mcp)：浏览器操作（打开 / 点击 / 截图 / 读取） |
| `filesystem` | [@modelcontextprotocol/server-filesystem](https://github.com/modelcontextprotocol/servers)：读写文件（**仅限工作区根目录**，可配置） |

### 内置 Skills

| id | 说明 |
|---|---|
| `browser-ops` | 浏览器操作专家（配 playwright） |
| `file-ops` | 文件操作助手（配 filesystem） |

---

## 🔒 安全模型

| 层 | 保护 |
|---|---|
| **工作区隔离** | filesystem MCP 只允许访问工作区（默认 `workspace/`，可在设置页配置），Agent 读不到项目代码 |
| **Key 外置** | API key 存项目外 `.nova-agent-key.json`，Agent 不可达 |
| **XSS 防护** | markdown-it `html: false`，禁原始 HTML |
| **确认弹窗** | 删除操作需自定义确认 |
| **超时保护** | 工具调用默认 120s 超时，超时返回结构化错误给模型 |

---

## 📄 API 一览

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/agents` | 列 Agent |
| POST | `/api/agents` | 新建 Agent |
| PUT/DELETE | `/api/agents/:id` | 编辑 / 删除 Agent（连带会话） |
| GET | `/api/mcp-servers` | MCP server 清单 |
| GET | `/api/mcp-servers/status` | MCP server 健康状态 |
| POST/PUT/DELETE | `/api/mcp-servers/:id` | 增 / 改 / 删 MCP server（动态生效，无需重启） |
| POST | `/api/mcp-servers/:id/reconnect` | 重连指定 MCP server |
| GET | `/api/tools` | 全部工具 + schema |
| GET | `/api/models` | 模型目录（内置 + 自定义提供商） |
| GET/POST | `/api/providers/keys` | 各 provider key 状态 / 保存 |
| GET/POST/DELETE | `/api/providers/custom` | 自定义提供商 CRUD |
| GET/POST/DELETE | `/api/skills` | 技能 CRUD |
| GET/POST | `/api/sessions` | 会话列表 / 新建 |
| PUT/DELETE | `/api/sessions/:id` | 重命名 / 删除会话 |
| GET | `/api/sessions/:id` | 取会话（含消息） |
| POST | `/api/sessions/:id/compact` | 手动压缩上下文（LLM 总结） |
| GET/POST/PUT/DELETE | `/api/tasks` | 定时任务 CRUD |
| POST | `/api/tasks/:id/run` | 手动立即执行任务 |
| **POST** | **`/api/chat`** | **SSE 流式对话（核心）** |
| POST | `/api/chat/stop` | 中断当前对话 |
| GET/POST/PUT/DELETE | `/api/memories` | 长期记忆 CRUD |
| GET | `/api/health` | 健康检查 |

---

## 🛠️ 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | React 19 + TypeScript + Vite | 类型安全，组件生态丰富 |
| 后端 | Express | 路由简单直接 |
| LLM | Vercel AI SDK + `@ai-sdk/deepseek` | 薄封装，框架无关 |
| 工具 | **MCP 协议** | 业界标准（"AI 的 USB-C"） |
| 技能 | **Agent Skills**（SKILL.md） | Claude Code / Cursor 事实标准 |
| 动画 | CSS keyframes（styles.css） | 零依赖 |

---

## 📄 License

[MIT](./LICENSE) © 2026 [Syotick](https://github.com/Syotick)
