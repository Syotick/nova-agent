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

/** 模型注册表条目（来自后端 /api/models） */
export interface ModelEntry {
  id: string
  name?: string
  /** 该模型支持的思考强度档位（reasoningEffort）。缺省/空 = 仅支持 thinking 开关 */
  reasoningEfforts?: string[]
}
export interface ModelProvider {
  id: string
  name: string
  baseUrl: string
  apiKeyEnv?: string
  models: ModelEntry[]
}

/** API key 状态：configured（项目外文件）/ env（环境变量）/ none（未配置） */
export type KeySource = 'none' | 'env' | 'configured'

/** 自定义模型提供商（设置页管理，与内置 models.json 合并） */
export interface CustomProvider {
  id: string
  name: string
  baseUrl: string
  apiKeyEnv?: string
  models: Array<{ id: string; name?: string }>
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

/** 消息附件 */
export interface Attachment {
  id: string
  name: string
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
  /** 最近一次压缩生成的上下文摘要 */
  summary?: string
}

/** 定时任务（5 段 cron） */
export interface Task {
  id: string
  name: string
  agentId: string
  cron: string
  prompt: string
  enabled: boolean
  sessionId?: string
  lastRunAt?: number
  nextRunAt?: number
  lastResult?: string
  runCount: number
  createdAt: number
}

/** 跨会话记忆（按 Agent 隔离） */
export interface Memory {
  id: string
  agentId: string
  content: string
  source: 'auto' | 'manual'
  createdAt: number
}

export type ChatEvent =
  | { type: 'text'; sessionId: string; delta: string }
  | { type: 'tool_call_start'; sessionId: string; call: ToolCallRecord }
  | { type: 'tool_call_end'; sessionId: string; call: ToolCallRecord }
  | { type: 'step'; sessionId: string; step: number }
  | { type: 'usage'; sessionId: string; input: number; output: number }
  | { type: 'done'; sessionId: string; message: Message }
  | { type: 'compact'; sessionId: string; summary: string; removed: number; kept: number }
  | { type: 'error'; sessionId: string; message: string }

/** 思考模式（reasoning）配置：DeepSeek 渠道专用 */
export interface ReasoningOption {
  /** adaptive=自动按需思考 / enabled=强制思考 / disabled=关闭 */
  type: 'adaptive' | 'enabled' | 'disabled'
  /** 思考强度（type=enabled 时生效） */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}
