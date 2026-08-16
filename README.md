# 🐋 my-agent · 麻雀版 Claude Code

一个功能完整的全栈 AI Agent 应用（对标 Claude Code 的最小实现）：**Vue 2.7 前端 + Express 后端 + Vercel AI SDK + MCP 工具 + Agent Skills 技能**。

> 特点：麻雀虽小五脏俱全 —— Agent 循环、MCP 工具、技能系统、多轮对话、轨迹展示、多 Agent 管理、可视化配置、安全隔离，全部具备且可扩展。

---

## ✨ 功能清单

### Agent 核心
- ✅ **Agent 循环**：Vercel AI SDK `streamText` 多步工具调用循环（最多 8 步）
- ✅ **多轮对话**：完整上下文 + 自动标题
- ✅ **流式输出**：SSE 打字机效果 + 思考动画
- ✅ **Markdown 渲染**：标题/代码高亮/表格/链接/引用（markdown-it + highlight.js）
- ✅ **工具调用展示**：实时工具卡片（输入/输出/耗时/状态）
- ✅ **轨迹视图**：每步工具调用时间线 + inspector（输入/输出/耗时/token）
- ✅ **中断/继续**：流式期间 Stop 按钮，已生成内容保留
- ✅ **自动压缩**：会话超过 40 条消息时，LLM 自动总结旧对话为摘要（注入 system prompt），保留最近 20 条
- ✅ **手动压缩**：会话顶部一键压缩上下文，摘要横幅展示历史总结

### 多 Agent 管理
- ✅ 新建 / 编辑 / 删除 Agent（persona + 模型 + 工具勾选 + 技能勾选）
- ✅ Agent 切换（侧边栏点击，自动回对话视图）
- ✅ 每个 Agent 独立配置，删除连带清理会话

### 可视化配置（非技术用户可用）
- ✅ **技能管理**：可视化新建/编辑/删除技能（表单生成 SKILL.md，不用碰文件）
- ✅ **技能搜索**：技能多时输入关键词秒过滤
- ✅ **工具浏览**：按 MCP server 分组展示所有工具 + 参数 Schema
- ✅ **API Key 配置**：前端 🔑 按钮配置，存项目外（安全）

### 会话管理
- ✅ 会话切换 / 新建 / 重命名（行内编辑）/ 删除
- ✅ 无会话时直接输入即自动创建
- ✅ 会话持久化（JSON 检查点，崩溃不丢）

### 安全
- ✅ **工作区隔离**：Agent 只能访问 `workspace/`，读不到项目代码和 API key
- ✅ **Key 外置**：API key 存项目外 `.my-agent-key.json`
- ✅ 自定义确认弹窗（删除操作防误触）
- ✅ Markdown 渲染禁原始 HTML（防 XSS）

### 体验
- ✅ 深色玻璃拟态 + 紫蓝渐变（LobeChat 风格）
- ✅ 动画：消息进出场 / 工具卡片展开 / 视图切换 / 弹窗 spring
- ✅ 统一导航（对话/轨迹/技能/工具）侧边栏互切

---

## 🏗️ 技术架构

```
┌────────────────── 浏览器 (Vue 2.7) ──────────────────┐
│  Sidebar（Agent/会话/导航）→ MainPane               │
│    ├─ ChatView（消息 + 工具卡片 + Composer）          │
│    ├─ TrajectoryView（轨迹时间线）                   │
│    ├─ SkillManager（技能可视化编辑）                 │
│    └─ ToolManager（工具浏览）                        │
│  Pinia store（状态）→ api.ts（REST + SSE）           │
└───────────────┬────────────────────────────────────┘
                │ fetch /api/*（SSE 流式）
┌───────────────▼────────────────────────────────────┐
│  Express 后端（server/）                             │
│  ├─ agentLoop.ts   Agent 循环（AI SDK streamText）    │
│  ├─ mcp.ts         MCP 客户端管理（官方 SDK）         │
│  ├─ skills.ts      SKILL.md 扫描/解析/CRUD           │
│  ├─ store.ts       Agent/Session 持久化 + key 管理    │
│  └─ index.ts       路由（REST + SSE + 中断）          │
└───────┬──────────────────────┬─────────────────────┘
        │ MCP 协议              │ OpenAI 兼容
  ┌─────▼──────┐         ┌──────▼──────┐
  │ MCP Servers│         │ DeepSeek API│
  │ playwright │         │ v4-flash    │
  │ filesystem │         │ v4-pro      │
  └────────────┘         └─────────────┘
```

---

## 🚀 快速启动

### 前置要求
- Node.js 18+
- DeepSeek API Key（或其他 OpenAI 兼容服务）

### 启动

```bash
cd D:\Data\deepseekharness_project\my-agent
npm install          # 首次
npm run dev          # 同时启动前端(5173) + 后端(8787)
```

- 前端：http://localhost:5173
- 后端：http://localhost:8787（`MY_AGENT_PORT` 可改）

### 配置 API Key
两种方式（任选）：
1. **前端**：打开页面 → 侧边栏右下角 🔑 → 输入 key → 保存（存到项目外 `.my-agent-key.json`）
2. **环境变量**：`$env:DEEPSEEK_API_KEY = "sk-..."`

---

## 📁 目录结构

```
my-agent/
├─ server/                    # 后端
│  ├─ index.ts                # Express 路由（REST + SSE + 中断）
│  ├─ agentLoop.ts            # Agent 循环（AI SDK streamText + MCP 工具）
│  ├─ mcp.ts                  # MCP 客户端管理
│  ├─ skills.ts               # SKILL.md 扫描/解析/CRUD
│  ├─ store.ts                # Agent/Session 持久化 + API key 管理
│  └─ types.ts                # 共享类型
├─ src/                       # 前端（Vue 2.7 + Pinia）
│  ├─ components/             # Sidebar/ChatView/Trajectory/SkillManager/ToolManager...
│  ├─ store.ts                # Pinia store
│  ├─ api.ts                  # REST + SSE 封装
│  ├─ markdown.ts             # markdown-it + highlight.js
│  └─ styles.css              # 设计体系（渐变/玻璃/动画）
├─ skills/                    # 技能（SKILL.md，Agent Skills 格式）
│  ├─ browser-ops/SKILL.md
│  └─ file-ops/SKILL.md
├─ mcp-servers/               # MCP server 配置（JSON）
│  ├─ filesystem.json
│  └─ playwright.json
├─ data/                      # 运行时数据（Agent/Session JSON）
├─ workspace/                 # Agent 唯一可访问的工作区（在项目外）
├─ TECH-DECISION.md           # 技术选型调研报告
└─ package.json
```

---

## 🔧 扩展方式（非技术用户友好）

### 新增 Agent
侧边栏 Agents 区 ＋ → 填名称/persona → 勾选工具和技能 → 创建。双击可编辑。

### 新增技能（零代码）
**前端**：侧边栏 → 技能管理 → ＋ → 填表单（名称/简介/使用时机/正文）→ 创建。
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
| `playwright` | [@playwright/mcp](https://github.com/microsoft/playwright-mcp)：浏览器操作（打开/点击/截图/读取） |
| `filesystem` | [@modelcontextprotocol/server-filesystem](https://github.com/modelcontextprotocol/servers)：读写文件（**仅限 workspace/**） |

### 内置 Skills
| id | 说明 |
|---|---|
| `browser-ops` | 浏览器操作专家（配 playwright） |
| `file-ops` | 文件操作助手（配 filesystem） |

---

## 🔒 安全模型

| 层 | 保护 |
|---|---|
| **工作区隔离** | filesystem MCP 只允许 `workspace/`，Agent 读不到项目代码 |
| **Key 外置** | API key 存项目外 `.my-agent-key.json`，Agent 不可达 |
| **XSS 防护** | markdown-it `html: false`，禁原始 HTML |
| **确认弹窗** | 删除操作需自定义确认 |
| **超时保护** | 工具调用默认 120s 超时，超时返回结构化错误给模型 |

---

## 📄 API 一览

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/agents` | 列 Agent |
| POST | `/api/agents` | 新建 Agent |
| PUT/DELETE | `/api/agents/:id` | 编辑/删除 Agent（连带会话） |
| GET | `/api/mcp-servers` | MCP server 清单 |
| GET | `/api/tools` | 全部工具 + schema |
| GET/POST/DELETE | `/api/skills` | 技能 CRUD |
| GET/POST | `/api/sessions` | 会话列表/新建 |
| PUT/DELETE | `/api/sessions/:id` | 重命名/删除会话 |
| GET | `/api/sessions/:id` | 取会话（含消息） |
| **POST** | **`/api/chat`** | **SSE 流式对话（核心）** |
| POST | `/api/chat/stop` | 中断当前对话 |
| GET/POST | `/api/config` | API key 状态/保存 |

---

## ⚠️ 已知限制 / 后续方向

- **单会话超长**（>500 条消息）：全量渲染，可加虚拟滚动优化
- **multi-agent 编排**：`POST /api/subagent` 路由预留（当前 501）
- **持久化**：JSON 文件（够用），大规模可换 SQLite
- **模型**：默认 DeepSeek v4-flash（`deepseek-chat` 已停用，勿回退）

### 上下文压缩（已实现）

| 项 | 说明 |
|---|---|
| 自动触发 | 消息数 > 40（`MY_AGENT_COMPACT_MIN` 可调）时，turn 开始前自动压缩 |
| 保留条数 | 最近 20 条（`MY_AGENT_COMPACT_KEEP` 可调），更早消息由 LLM 总结 |
| 摘要去向 | `session.summary` 字段；注入 system prompt 供模型续接；前端横幅展示 |
| 手动压缩 | `POST /api/sessions/:id/compact`（原占位路由已升级为真实 summarization） |
| 失败兜底 | 压缩失败不阻塞对话，保留原历史继续 |

---

## 🛠️ 技术选型（详见 TECH-DECISION.md）

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | Vue 2.7 + Pinia + Vite | 用户指定栈，生态存活 |
| 后端 | Express | 一个文件搞定 |
| LLM | Vercel AI SDK + `@ai-sdk/deepseek` | 薄封装，框架无关 |
| 工具 | **MCP 协议** | 业界标准（"AI 的 USB-C"） |
| 技能 | **Agent Skills**（SKILL.md） | Claude Code/Cursor 事实标准 |
| 动画 | Vue 内置 transition | 零依赖 |

**为什么不用 LangChain/LangGraph/CrewAI**：见 `TECH-DECISION.md` —— 本机实测 LangChain 48.9MB/5577 文件，我们的 Agent 逻辑层仅 11.5MB，且标准协议 > 框架抽象。
