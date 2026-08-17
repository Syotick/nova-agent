# ✨ Nova Agent

**Nova Agent** is a small, self-contained AI agent for learning agent engineering. The whole stack — agent loop, MCP tools, Agent Skills, memory, scheduled tasks — fits in a codebase you can read in one evening, then run, then modify.

> Agent loop, MCP tools, skill system, multi-turn chat, trajectory tracing, multi-agent management, visual configuration, sandboxed security — all in one small codebase.

[中文文档](./docs/README.zh-CN.md)

---

## 🎓 Who is this for

- **University students and career-switching developers** who want to learn how agents actually work. Start at the agent loop, read the MCP client and the SKILL.md loader, then break things and fix them.
- **Self-hosting hobbyists**. Everything runs locally: private, vendor-neutral (any OpenAI-compatible model), zero telemetry, Node 22+ only.
- **DIY / second development**. Add a skill by dropping a folder; add a tool by dropping a JSON config.

> If you need a production product with a plugin ecosystem, use Claude Code, Cursor or Windsurf. This project is for learning and teaching, not for competing with them.

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
- ✅ **Context compaction**: when a session exceeds 40 messages, earlier history is summarized by the LLM (injected into the system prompt), keeping the last 20, so long conversations never overflow
- ✅ **Terminal (Codex mode)**: `run_command` runs shell commands in the workspace (npm / git / node / python...) with output capture, timeout auto-kill and whole process-tree cleanup on interrupt. Read code, edit code, verify with builds/tests, start the project — all from chat.
- ✅ **Vibe loop (autonomous goals)**: type a goal and press Vibe (🚀 in the UI). The agent plans, implements, verifies and self-heals across multiple rounds until it converges (signalled by `[DONE]`), bounded by round/time budgets and a circuit breaker that stops on repeated identical failures. Interrupting cleans up running processes.

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
- ✅ **Workspace isolation**: agents can only access the configurable workspace (default `workspace/`) — project code and API keys are unreachable
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
┌───────────── Browser (React 19) ──────────────┐
│  Sidebar (Agents/Sessions/Nav) → MainPane     │
│    ├─ ChatView (messages + tool cards + input) │
│    ├─ TrajectoryView (step timeline)           │
│    ├─ SkillManager (visual skill editing)      │
│    └─ ToolManager (tool browser)               │
│  Zustand store → api.ts (REST + SSE)           │
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
│  ├─ models.ts               # model registry (builtin + custom providers)
│  ├─ memory.ts               # long-term memory (LRU + dedup merge)
│  ├─ scheduler.ts            # scheduled tasks (5-field cron)
│  ├─ db.ts                   # SQLite init (node:sqlite)
│  ├─ builtinTools.ts         # built-in tools (web_search, memory search…)
│  ├─ store.ts                # agent/session persistence + API key
│  └─ types.ts                # shared types
├─ src/                       # frontend (React 19 + TS + Zustand)
│  ├─ components/             # Sidebar/ChatView/Trajectory/SkillManager/ToolManager...
│  ├─ store.ts                # Zustand store
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
├─ workspace/                 # default agent workspace (configurable in Settings; gitignored)
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

## 📂 Workspace (agent file boundary)

By default agents can only touch `workspace/` (inside the project). Like Codex, you can point the workspace at any folder of your choice:

- **Settings → Workspace**: enter a relative path (resolved against the project root) or an absolute path; leave empty to reset to the default `workspace/`. The first run shows a guided picker (skippable); the default `workspace/` always acts as the fallback tool area. Saving auto-reconnects MCP servers that mount the workspace (e.g. `filesystem`) — no restart needed.
- Uploaded attachments and the **filesystem** MCP server both use this root, so the agent sees exactly the folder you picked.
- MCP configs can reference it with the `{{workspace}}` placeholder (e.g. `"args": ["node", "server.js", "{{workspace}}/data"]`); args starting with `./` or `../` are resolved against the project root.
- ⚠️ The workspace *is* the agent's permission boundary. Pointing it at the project root or the API-key directory (both rejected) would grant the agent file access there; pointing it at any other sensitive directory does the same — choose deliberately. Note: switching workspaces makes previously uploaded attachments (stored under the old root) unreachable.

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
| `filesystem` | [@modelcontextprotocol/server-filesystem](https://github.com/modelcontextprotocol/servers): file read/write (**workspace root only**, configurable) |

### Bundled Skills

| id | Description |
|---|---|
| `browser-ops` | Browser operations expert (pairs with playwright) |
| `file-ops` | File operations assistant (pairs with filesystem) |

---

## 🔒 Security Model

| Layer | Protection |
|---|---|
| **Workspace isolation** | filesystem MCP only allows the configured workspace (default `workspace/`); agents cannot read project code |
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
| GET | `/api/mcp-servers/status` | MCP server health status |
| POST/PUT/DELETE | `/api/mcp-servers/:id` | Add/update/delete MCP server (live, no restart) |
| POST | `/api/mcp-servers/:id/reconnect` | Reconnect an MCP server |
| GET | `/api/tools` | All tools + schemas |
| GET | `/api/models` | Model catalog (builtin + custom providers) |
| GET/POST | `/api/providers/keys` | Per-provider API key status/save |
| GET/POST/DELETE | `/api/providers/custom` | Custom provider CRUD |
| GET/POST/DELETE | `/api/skills` | Skill CRUD |
| GET/POST | `/api/sessions` | List/create sessions |
| PUT/DELETE | `/api/sessions/:id` | Rename/delete session |
| GET | `/api/sessions/:id` | Get session (with messages) |
| POST | `/api/sessions/:id/compact` | Manually compact context (LLM summarization) |
| GET/POST/PUT/DELETE | `/api/tasks` | Scheduled task CRUD |
| POST | `/api/tasks/:id/run` | Run a task on demand |
| **POST** | **`/api/chat`** | **SSE streaming chat (core)** |
| POST | `/api/chat/stop` | Abort current run |
| GET/POST/PUT/DELETE | `/api/memories` | Long-term memory CRUD |
| GET | `/api/health` | Health check |

---

## 🛠️ Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | Type-safe, rich component ecosystem |
| Backend | Express | One-file simple routing |
| LLM | Vercel AI SDK + `@ai-sdk/deepseek` | Thin wrapper, framework-agnostic |
| Tools | **MCP protocol** | Industry standard ("USB-C for AI") |
| Skills | **Agent Skills** (SKILL.md) | De-facto standard (Claude Code / Cursor) |
| Animations | CSS keyframes (styles.css) | Zero dependencies |

**Documentation**: [中文文档](./docs/README.zh-CN.md)

---

## 📄 License

[MIT](./LICENSE) © 2026 [Syotick](https://github.com/Syotick)
