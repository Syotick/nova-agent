# ✨ Nova Agent

**Nova Agent** is a lightweight, self-contained open-source AI agent — a minimal, fully functional alternative to Claude Code. Built with **Vue 2.7 + Express + Vercel AI SDK + MCP + Agent Skills**.

> Compact by design, complete by default: agent loop, MCP tools, skill system, multi-turn chat, trajectory tracing, multi-agent management, visual configuration, and sandboxed security — all included and extensible.

[中文文档](./docs/README.zh-CN.md)

---

## ✨ Features

### Agent Core
- ✅ **Agent loop**: multi-step tool-calling loop via Vercel AI SDK `streamText` (up to 8 steps)
- ✅ **Multi-turn chat**: full context with auto-generated titles
- ✅ **Streaming output**: SSE typewriter effect + thinking indicator
- ✅ **Markdown rendering**: headings / code highlighting / tables / links / quotes (markdown-it + highlight.js)
- ✅ **Tool call cards**: live tool cards (input / output / duration / status)
- ✅ **Trajectory view**: per-step timeline + inspector (input / output / duration / tokens)
- ✅ **Stop & resume**: Stop button during streaming; generated content is preserved
- ✅ **Context compaction**: when a session exceeds 40 messages, earlier history is summarized by the LLM (injected into the system prompt), keeping the last 20 — no more context overflow

### Multi-Agent Management
- ✅ Create / edit / delete agents (persona + model + tool selection + skill selection)
- ✅ Agent switching from the sidebar (auto-returns to chat view)
- ✅ Per-agent isolated configuration; deleting an agent removes its sessions

### Visual Configuration (no-code friendly)
- ✅ **Skill manager**: create / edit / delete skills through forms (generates `SKILL.md`, no file editing required)
- ✅ **Skill search**: instant filtering when the skill list grows
- ✅ **Tool browser**: all MCP tools grouped by server with parameter schemas
- ✅ **API key setup**: configure from the 🔑 button in the UI, stored outside the project

### Session Management
- ✅ Create / switch / rename (inline edit) / delete sessions
- ✅ First message auto-creates a session
- ✅ Session persistence via **SQLite** (auto-migrates legacy JSON data)

### Scheduled Tasks
- ✅ Cron-based scheduled tasks: let an agent run on a timer (e.g. market watch every 5 minutes, daily report)
- ✅ Tasks run in dedicated persistent sessions (continuous context), results recorded
- ✅ Run-on-demand, enable/pause/delete from the UI

### Security
- ✅ **Workspace isolation**: agents can only access `workspace/` — project code and API keys are unreachable
- ✅ **External key storage**: API key lives outside the project (`.nova-agent-key.json`)
- ✅ Custom confirmation dialogs (delete protection)
- ✅ Raw HTML disabled in Markdown rendering (XSS-safe)
- ✅ **MCP health checks**: automatic ping + exponential-backoff reconnect

### Experience
- ✅ Dark glassmorphism + purple-blue gradient (LobeChat style)
- ✅ Animations: message enter/leave, tool card expand, view transitions, spring modals
- ✅ Unified navigation (chat / trajectory / skills / tools)

---

## 🏗️ Architecture

```
┌────────────── Browser (Vue 2.7) ──────────────┐
│  Sidebar (Agents/Sessions/Nav) → MainPane     │
│    ├─ ChatView (messages + tool cards + input) │
│    ├─ TrajectoryView (step timeline)           │
│    ├─ SkillManager (visual skill editing)      │
│    └─ ToolManager (tool browser)               │
│  Pinia store → api.ts (REST + SSE)             │
└───────────────────┬───────────────────────────┘
                    │ fetch /api/* (SSE stream)
┌───────────────────▼───────────────────────────┐
│  Express backend (server/)                     │
│  ├─ agentLoop.ts   agent loop (AI SDK streamText) │
│  ├─ compact.ts     context compaction (LLM summary) │
│  ├─ mcp.ts         MCP client management       │
│  ├─ skills.ts      SKILL.md scan/parse/CRUD    │
│  ├─ store.ts       agent/session persistence + key mgmt │
│  └─ index.ts       routes (REST + SSE + abort) │
└───────┬──────────────────────┬────────────────┘
        │ MCP protocol          │ OpenAI-compatible
  ┌─────▼──────┐         ┌──────▼──────┐
  │ MCP Servers│         │ LLM API     │
  │ playwright │         │ DeepSeek    │
  │ filesystem │         │ (or any)    │
  └────────────┘         └─────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 22+ (uses built-in `node:sqlite`; no native modules needed)
- A DeepSeek API key (or any OpenAI-compatible endpoint)

### Run

```bash
cd nova-agent
npm install          # first time
npm run dev          # starts frontend (5173) + backend (8787)
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8787

### Configure the API Key

Either way (pick one):

1. **From the UI**: open the app → 🔑 button in the sidebar footer → enter your key → save (stored outside the project in `.nova-agent-key.json`)
2. **Environment variable**: `DEEPSEEK_API_KEY=sk-...`

---

## 📁 Project Structure

```
nova-agent/
├─ server/                    # backend
│  ├─ index.ts                # Express routes (REST + SSE + abort)
│  ├─ agentLoop.ts            # agent loop (AI SDK streamText + MCP tools)
│  ├─ compact.ts              # context compaction (LLM summarization)
│  ├─ mcp.ts                  # MCP client management
│  ├─ skills.ts               # SKILL.md scan/parse/CRUD
│  ├─ store.ts                # agent/session persistence + API key
│  └─ types.ts                # shared types
├─ src/                       # frontend (Vue 2.7 + Pinia)
│  ├─ components/             # Sidebar/ChatView/Trajectory/SkillManager/ToolManager...
│  ├─ store.ts                # Pinia store
│  ├─ api.ts                  # REST + SSE wrapper
│  ├─ markdown.ts             # markdown-it + highlight.js
│  └─ styles.css              # design system (gradient/glass/animations)
├─ skills/                    # skills (SKILL.md, Agent Skills format)
│  ├─ browser-ops/SKILL.md
│  └─ file-ops/SKILL.md
├─ mcp-servers/               # MCP server configs (JSON)
│  ├─ filesystem.json
│  └─ playwright.json
├─ data/                      # runtime data (SQLite DB, gitignored)
├─ workspace/                 # the only directory agents can access (gitignored)
├─ docs/                      # developer documentation (architecture/dev guide/changelog)
└─ package.json
```

---

## ⚙️ Configuration

| Env var | Default | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | LLM API key (fallback if no external key file) |
| `NOVA_AGENT_PORT` | `8787` | Backend port |
| `NOVA_AGENT_COMPACT_MIN` | `40` | Auto-compact trigger: compress when messages exceed this |
| `NOVA_AGENT_COMPACT_KEEP` | `20` | Messages kept after compaction (earlier ones are summarized) |
---

## 🔧 Extending (no code required)

### Add an Agent
Sidebar → Agents → ＋ → name/persona → check tools & skills → create. Double-click to edit.

### Add a Skill (zero code)
**From the UI**: sidebar → Skill Manager → ＋ → fill the form → create.
**Or manually**: drop a `skills/<name>/SKILL.md` folder:

```markdown
---
name: skill name
description: short description
when_to_use: when to use it
---
Instructions body (injected into the system prompt)
```

### Add a Tool (zero code)
Drop a JSON config into `mcp-servers/` to connect any MCP server:

```json
{
  "id": "my-server",
  "name": "My Tools",
  "command": "npx",
  "args": ["-y", "some-mcp-server"],
  "timeoutMs": 30000
}
```

### Bundled MCP Servers

| id | Description |
|---|---|
| `playwright` | [@playwright/mcp](https://github.com/microsoft/playwright-mcp): browser automation (open/click/screenshot/read) |
| `filesystem` | [@modelcontextprotocol/server-filesystem](https://github.com/modelcontextprotocol/servers): file read/write (**workspace/ only**) |

### Bundled Skills

| id | Description |
|---|---|
| `browser-ops` | Browser operations expert (pairs with playwright) |
| `file-ops` | File operations assistant (pairs with filesystem) |

---

## 🔒 Security Model

| Layer | Protection |
|---|---|
| **Workspace isolation** | filesystem MCP only allows `workspace/`; agents cannot read project code |
| **External key** | API key stored outside the project (`.nova-agent-key.json`), unreachable by agents |
| **XSS protection** | markdown-it with `html: false`; raw HTML disabled |
| **Confirm dialogs** | destructive operations require custom confirmation |
| **Timeout guard** | tool calls default to 120s timeout; structured errors returned to the model |

---

## 📄 API Reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/agents` | List agents |
| POST | `/api/agents` | Create agent |
| PUT/DELETE | `/api/agents/:id` | Update/delete agent (cascades sessions) |
| GET | `/api/mcp-servers` | List MCP servers |
| GET | `/api/tools` | All tools + schemas |
| GET/POST/DELETE | `/api/skills` | Skill CRUD |
| GET/POST | `/api/sessions` | List/create sessions |
| PUT/DELETE | `/api/sessions/:id` | Rename/delete session |
| GET | `/api/sessions/:id` | Get session (with messages) |
| POST | `/api/sessions/:id/compact` | Manually compact context (LLM summarization) |
| GET/POST/PUT/DELETE | `/api/tasks` | Scheduled task CRUD |
| POST | `/api/tasks/:id/run` | Run a task on demand |
| **POST** | **`/api/chat`** | **SSE streaming chat (core)** |
| POST | `/api/chat/stop` | Abort current run |
| GET/POST | `/api/config` | API key status/save |

---

## 🗺️ Roadmap

- **Virtual scrolling** for very long sessions (>500 messages)
- **Multi-agent orchestration**: `POST /api/subagent` route (subagents with result aggregation)
- **Model registry** for multi-provider routing

---

## 🛠️ Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vue 2.7 + Pinia + Vite | Mature ecosystem, minimal footprint |
| Backend | Express | One-file simple routing |
| LLM | Vercel AI SDK + `@ai-sdk/deepseek` | Thin wrapper, framework-agnostic |
| Tools | **MCP protocol** | Industry standard ("USB-C for AI") |
| Skills | **Agent Skills** (SKILL.md) | De-facto standard (Claude Code / Cursor) |
| Animations | Vue built-in transitions | Zero dependencies |

**Why not LangChain/LangGraph/CrewAI?** See [docs/TECH-DECISION.md](./docs/TECH-DECISION.md) — measured on this machine: LangChain 48.9MB / 5,577 files vs. our agent logic layer at 11.5MB; standard protocols beat framework abstractions.

**Engineering practices** (CI/CD, PR flow, project management research): see [docs/CICD-RESEARCH.md](./docs/CICD-RESEARCH.md) — trunk-based development, CI quality gates, conventional commits, Kanban/Milestone workflow.

**Documentation**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) (architecture for beginners) · [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) (zero-to-run guide) · [docs/CHANGELOG.md](./docs/CHANGELOG.md) (human-readable changelog) · [中文文档](./docs/README.zh-CN.md)

---

## 📄 License

[MIT](./LICENSE) © 2026 [Syotick](https://github.com/Syotick)
