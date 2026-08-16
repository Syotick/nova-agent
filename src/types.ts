// 前端类型（与后端对应）
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
  content: string
}

export interface ToolInfo {
  serverId: string
  serverName: string
  name: string
  description: string
  inputSchema: unknown
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
}

export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call_start'; call: ToolCallRecord }
  | { type: 'tool_call_end'; call: ToolCallRecord }
  | { type: 'step'; step: number }
  | { type: 'usage'; input: number; output: number }
  | { type: 'done'; message: Message }
  | { type: 'error'; message: string }
