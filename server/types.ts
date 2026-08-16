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

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallRecord[]
  tokens?: { input: number; output: number }
  createdAt: number
}

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

// SSE 事件类型
export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call_start'; call: ToolCallRecord }
  | { type: 'tool_call_end'; call: ToolCallRecord }
  | { type: 'step'; step: number }
  | { type: 'usage'; input: number; output: number }
  | { type: 'done'; message: Message }
  | { type: 'compact'; summary: string; removed: number; kept: number }
  | { type: 'error'; message: string }
