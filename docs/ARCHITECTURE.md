# Nova Agent 架构详解（小白友好版）

> 这份文档用**大白话**讲清楚 Nova Agent 是怎么运转的。不需要 Node.js 基础也能看懂。
> 配合 [DEVELOPMENT.md](./DEVELOPMENT.md) 一起看效果更佳。

---

## 1. 一句话概括

**Nova Agent 是一个"网页聊天机器人"网站**，你可以在网页上跟 AI 助手对话，助手能调用各种工具（打开网页、读写文件等）帮你干活，还能**定时自动执行任务**（比如每 5 分钟查一次行情）。

它由两部分组成，装在同一台电脑上：

```
┌─────────────────────────────────────────────┐
│  浏览器（你看到的网页界面）                    │
│  = 前台：负责显示、输入、按钮、动画            │
└──────────────────┬──────────────────────────┘
                   │ 通过"接口"对话（fetch /api/...）
┌──────────────────▼──────────────────────────┐
│  Node.js 后端服务（真正干活的大脑）            │
│  = 后台：负责对话逻辑、存数据、调工具、定时任务  │
└─────────────────────────────────────────────┘
```

- **前端**（`src/` 目录）：用 Vue 2.7 写的网页界面——你在浏览器里看到的一切
- **后端**（`server/` 目录）：用 Express 写的服务程序——处理所有请求

> 为什么叫"前后端"？可以类比餐厅：**前端是菜单和餐桌**（顾客看到的），**后端是厨房**（真正做菜的）。

---

## 2. 数据流：你说一句话，背后发生了什么

```
你输入"帮我查一下今天的天气"
   │
   ▼
① 前端把这句话发给后端：POST /api/chat
   │
   ▼
② 后端把这句话放进"会话记录"（存在 SQLite 数据库里）
   │
   ▼
③ 后端把"你的话 + 之前所有对话 + 助手人设 + 技能说明"打包成提示词
   │
   ▼
④ 后端调用 AI 大模型（DeepSeek），模型开始"思考"
   │
   ▼
⑤ 模型决定：需要查天气 → 后端调用"天气工具"（MCP）→ 拿到结果还给模型
   │
   ▼
⑥ 模型根据工具结果组织语言回答
   │
   ▼
⑦ 回答通过 SSE 流式通道**一个字一个字**传回前端（打字机效果）
   │
   ▼
⑧ 前端渲染成漂亮的 Markdown 消息，同时把这次对话存回数据库
```

> **SSE 是什么？** 一种"服务器持续往浏览器推文字"的技术。普通网页是"你问一次、答一次"，SSE 是"你问一次、答案像水龙头一样持续流出来"，所以能看到打字机效果。

---

## 3. 四个核心概念（必须搞懂）

### ① Agent（助手）

一个 Agent = 一个"人设 + 模型 + 工具 + 技能"的配置。比如：

| Agent 名称 | 人设（persona） | 勾选的工具 | 勾选的技能 |
|---|---|---|---|
| 默认助手 | 乐于助人的 AI | 无 | 无 |
| 浏览器专家 | 擅长上网冲浪 | playwright（浏览器） | browser-ops |
| 文件管家 | 擅长整理文件 | filesystem（文件） | file-ops |

**新增一个 Agent 不需要写代码**——网页上点几下就行。

### ② MCP 工具（Agent 的"手"）

MCP = Model Context Protocol，可以理解为 **"AI 世界的 USB 接口"**——任何工具只要支持 MCP 协议，插上就能用。

当前内置两个：
- **playwright**：控制真实浏览器的工具（打开网页、点击、截图、读内容）
- **filesystem**：读写文件的工具（**只能访问 `workspace/` 目录**，防止 AI 乱翻项目代码）

配置文件在 `mcp-servers/` 目录，每个 JSON 文件 = 一个工具服务器。

### ③ Agent Skills 技能（Agent 的"操作手册"）

技能 = 一份 `SKILL.md` 文档，告诉 Agent"做某类任务时该怎么操作"。比如 `browser-ops/SKILL.md` 教它怎么高效浏览网页。

**技能是纯文本**：新增技能 = 网页上填个表单，或者丢一个 md 文件进 `skills/` 目录。

### ④ Session 会话（聊天记录）

一次对话 = 一个会话。会话存在 **SQLite 数据库**（`data/nova-agent.db`），重启电脑也不丢。

会话太长时，后端会自动"压缩"：把早期对话用 AI 总结成一段摘要，只保留最近 20 条——这样既省 token 又不丢上下文。

---

## 4. 数据库：数据都存在哪

项目用 **SQLite**（Node.js 内置支持，不需要额外安装数据库软件）。所有数据在一个文件里：`data/nova-agent.db`

| 表名 | 存什么 | 谁在用 |
|---|---|---|
| `agents` | Agent 配置（人设/模型/工具勾选） | 侧边栏的 Agents 列表 |
| `sessions` | 会话（消息数组存 JSON 文本） | 对话历史 |
| `config` | 键值配置 | 预留 |
| `tasks` | 定时任务（cron/指令/执行记录） | 定时任务页面 |

> 早期版本用 JSON 文件存储，现在已自动迁移到 SQLite——**旧数据不用管，启动时自动搬家**（原文件备份在 `data/imported-json-backup/`）。

---

## 5. 代码目录地图（每个文件干什么）

```
nova-agent/
├─ index.html              # 网页入口（浏览器打开的第一个文件）
├─ package.json            # 项目说明书：依赖清单、启动命令（Node.js 世界最重要文件）
├─ vite.config.ts          # 前端构建工具配置（开发服务器端口、转发设置）
├─ tsconfig.json           # TypeScript 类型检查配置
│
├─ src/                    # ★ 前端（浏览器里跑的代码）
│  ├─ main.ts              # 程序入口：创建 Vue 应用
│  ├─ App.vue              # 根组件：把侧边栏和主区域拼起来
│  ├─ store.ts             # 全局状态（Pinia）：当前选中的 Agent/会话、流式文本等
│  ├─ api.ts               # 与后端通信的唯一入口（所有 fetch 都在这）
│  ├─ markdown.ts          # Markdown 渲染（把 AI 回复变成好看的文章）
│  ├─ styles.css           # 全局样式（深色玻璃拟态主题）
│  ├─ types.ts             # 前端用到的类型定义
│  └─ components/          # 界面零件（.vue 文件 = 一个界面组件）
│     ├─ Sidebar.vue       # 左侧边栏：Agent 列表、会话列表、导航
│     ├─ MainPane.vue      # 右侧主区域：根据导航切换下面 4 个视图
│     ├─ ChatView.vue      # 聊天视图（消息区 + 输入框）
│     ├─ MessageList.vue   # 消息列表渲染（含流式打字机）
│     ├─ Composer.vue      # 底部输入框
│     ├─ ToolCallCard.vue  # 工具调用卡片（展示工具输入/输出/耗时）
│     ├─ TrajectoryView.vue# 轨迹视图：一次回答中每一步工具调用时间线
│     ├─ SkillManager.vue  # 技能管理页（可视化编辑技能）
│     ├─ TaskManager.vue   # 定时任务页（创建/启停/立即执行）
│     ├─ ToolManager.vue   # 工具浏览页（看有哪些工具+参数说明）
│     ├─ AgentConfigModal.vue # 新建/编辑 Agent 弹窗
│     ├─ ApiKeyModal.vue   # 填 API Key 弹窗
│     └─ ConfirmDialog.vue # 通用确认弹窗（防误删）
│
├─ server/                 # ★ 后端（Node.js 里跑的代码）
│  ├─ index.ts             # 服务入口：路由挂载、启动调度器、健康检查
│  ├─ agentLoop.ts         # ★ Agent 循环：一次对话的核心逻辑（调模型→跑工具→再调模型）
│  ├─ compact.ts           # 上下文压缩（长对话自动总结）
│  ├─ scheduler.ts         # ★ 定时任务调度器（cron 解析 + 每分钟扫描执行）
│  ├─ mcp.ts               # MCP 工具管理（连接工具服务器 + 健康检查 + 自动重连）
│  ├─ skills.ts            # 技能读写（扫描 skills/ 目录、解析 SKILL.md）
│  ├─ store.ts             # 数据存取层（Agent/Session 的 SQLite 读写）
│  ├─ db.ts                # SQLite 数据库初始化 + 旧 JSON 数据自动迁移
│  ├─ types.ts             # 类型定义（前后端共享的"接口约定"）
│  └─ routes/              # 路由（每个文件管一类接口）
│     ├─ agents.ts         # /api/agents 增删改查
│     ├─ sessions.ts       # /api/sessions 会话管理 + 手动压缩
│     ├─ chat.ts           # /api/chat SSE 流式对话 + /api/chat/stop 中断
│     ├─ tasks.ts          # /api/tasks 定时任务 CRUD + 手动执行
│     └─ catalogs.ts       # /api/skills、/api/mcp-servers、/api/tools 浏览类
│
├─ skills/                 # 技能目录（SKILL.md 文件）
├─ mcp-servers/            # 工具服务器配置（JSON 文件）
├─ data/                   # 运行时数据（SQLite 数据库，已被 git 忽略）
├─ workspace/              # Agent 唯一能访问的工作区（已被 git 忽略）
├─ docs/                   # 文档（本文件所在目录）
└─ .github/workflows/      # CI/CD 自动化配置
   ├─ ci.yml               # 每次推送自动跑：类型检查 + 构建
   └─ release.yml          # 自动发版（release-please）
```

---

## 6. 请求怎么路由（后端怎么知道该处理什么）

后端把所有接口按前缀分给不同的"路由文件"：

| 接口路径 | 路由文件 | 用途 |
|---|---|---|
| `POST /api/chat` | `routes/chat.ts` | 聊天（核心） |
| `/api/agents` | `routes/agents.ts` | Agent 管理 |
| `/api/sessions` | `routes/sessions.ts` | 会话管理 |
| `/api/tasks` | `routes/tasks.ts` | 定时任务 |
| `/api/skills` | `routes/catalogs.ts` | 技能 |
| `/api/mcp-servers` | `routes/catalogs.ts` | 工具服务器清单 |
| `/api/tools` | `routes/catalogs.ts` | 工具列表 |
| `/api/config` | `index.ts` | API Key 状态 |
| `/api/health` | `index.ts` | 健康检查 |

---

## 7. 定时任务怎么运转

```
网页上创建任务（填 cron 表达式 + 指令 + 选 Agent）
   │
   ▼
存入 SQLite 的 tasks 表
   │
   ▼
后端调度器每分钟扫描一次任务表
   │
   ▼
cron 时间到了吗？
   ├─ 没到 → 继续等下一分钟
   └─ 到了 → 在任务的"专用会话"里让 Agent 执行一轮
             （专用会话 = 每次执行都记得上次的上下文）
   │
   ▼
执行结果写回任务表（last_result），网页上能看到
```

**cron 表达式速记**（5 段：分 时 日 月 周）：

| 表达式 | 含义 |
|---|---|
| `* * * * *` | 每分钟 |
| `*/5 * * * *` | 每 5 分钟 |
| `0 */5 * * *` | 每 5 小时（整点） |
| `0 9 * * 1-5` | 工作日早上 9 点 |
| `0 23 * * *` | 每天 23 点 |

---

## 8. 安全设计（为什么 AI 碰不到你的秘密）

| 防护 | 原理 |
|---|---|
| **工作区隔离** | filesystem 工具只能读写 `workspace/`，项目代码和数据库在别处 |
| **API Key 外置** | key 存在项目目录**外面**的 `.nova-agent-key.json`，AI 的工具够不着 |
| **XSS 防护** | AI 回复渲染时禁用原始 HTML，防止恶意脚本 |
| **超时保护** | 工具调用默认 120 秒超时，卡住自动报错 |
| **MCP 健康检查** | 工具服务器挂了会自动重连（指数退避，最多 20 次） |

---

## 9. 技术选型为什么是这些（一句话版）

详细调研见 [TECH-DECISION.md](../TECH-DECISION.md)，这里只说结论：

- **Vue 2.7 + Vite**：界面框架，生态成熟
- **Express**：后端框架，简单直接
- **Vercel AI SDK**：调 AI 模型的"万能插座"（换任何模型都行）
- **MCP 协议**：工具接入标准（"AI 的 USB-C"）
- **Agent Skills**：技能标准格式（Claude Code 同款）
- **SQLite（node:sqlite）**：内置数据库，零安装零依赖
- **不用 LangChain**：太重（48.9MB vs 我们的 11.5MB），且标准协议 > 框架抽象
