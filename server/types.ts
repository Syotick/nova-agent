// 共享类型定义

export interface McpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  timeoutMs?: number
}

export interface SkillMeta {
  id: string
  name: string
  description: string
  whenToUse?: string
  content: string // SKILL.md 正文（注入 system prompt 用）
}

export interface Agent {
  id: string
  name: string
  persona: string
  model: string
  mcpServerIds: string[]
  skillIds: string[]
  /** 可用的内置工具 id（空数组/缺失 = 全部可用，向后兼容）。内置工具：web_search / run_command / glob / remember / subagent */
  builtinTools?: string[]
  color: string
  createdAt: number
}

export interface ToolCallRecord {
  id: string
  name: string
  input: unknown
  output: string
  status: 'running' | 'success' | 'error'
  startedAt: number
  durationMs: number
}

/** 消息附件（用户上传，存 workspace/uploads/，Agent 可经 filesystem 工具读取） */
export interface Attachment {
  id: string
  name: string
  /** 相对 workspace 的路径，如 uploads/abc.png */
  path: string
  size: number
  mime: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallRecord[]
  attachments?: Attachment[]
  tokens?: { input: number; output: number }
  createdAt: number
  /** 时间线分段：文本与工具调用按发生顺序交错（DSH 风格渲染）。缺省 = 旧数据（content + toolCalls） */
  segments?: MessageSegment[]
}

/** 消息时间线段：文本块 或 工具调用块（按发生顺序） */
export type MessageSegment =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; call: ToolCallRecord }

export interface Session {
  id: string
  agentId: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  /** 最近一次压缩生成的上下文摘要（自动压缩后写入） */
  summary?: string
}

// 定时任务（5 段 cron：分 时 日 月 周；如 "0 每5分钟" 示例见 scheduler.ts）
export interface Task {
  id: string
  name: string
  agentId: string
  cron: string
  prompt: string
  enabled: boolean
  /** 任务专用会话（首次执行自动创建，之后复用保证上下文连续） */
  sessionId?: string
  lastRunAt?: number
  nextRunAt?: number
  lastResult?: string
  runCount: number
  createdAt: number
}

// SSE 事件类型（统一带 sessionId，前端据此路由事件，避免会话竞态）
export type ChatEvent =
  | { type: 'text'; sessionId: string; delta: string }
  | { type: 'tool_call_start'; sessionId: string; call: ToolCallRecord }
  | { type: 'tool_call_end'; sessionId: string; call: ToolCallRecord }
  | { type: 'step'; sessionId: string; step: number }
  | { type: 'usage'; sessionId: string; input: number; output: number }
  | { type: 'done'; sessionId: string; message: Message }
  | { type: 'compact'; sessionId: string; summary: string; removed: number; kept: number }
  | { type: 'error'; sessionId: string; message: string }
  // vibe 自治循环事件（目标驱动多轮执行）
  | { type: 'vibe_start'; sessionId: string; goal: string; maxRounds: number }
  | { type: 'vibe_round'; sessionId: string; round: number; note: string }
  | { type: 'vibe_done'; sessionId: string; converged: boolean; rounds: number; note: string }

/** 思考模式（reasoning）配置：DeepSeek 渠道专用 */
export interface ReasoningOption {
  /** adaptive=自动按需思考 / enabled=强制思考 / disabled=关闭 */
  type: 'adaptive' | 'enabled' | 'disabled'
  /** 思考强度（type=enabled 时生效） */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}
