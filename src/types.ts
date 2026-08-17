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
  /** 上下文窗口大小（token）。缺省 = 128000 */
  contextWindow?: number
}
export interface ModelProvider {
  id: string
  name: string
  baseUrl: string
  apiKeyEnv?: string
  contextWindow?: number
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
  /** 供应商级上下文窗口（token，可选；缺省 1M） */
  contextWindow?: number
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
  /** 最近一次压缩移除的消息数（内存态，不落盘） */
  lastCompactRemoved?: number
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

/** 工作区（Agent 文件权限边界，filesystem MCP 挂载根） */
export interface WorkspaceInfo {
  /** 用户配置的原始值（null = 默认 workspace/） */
  configured: string | null
  /** 解析后的绝对路径 */
  resolved: string
  /** 目录当前是否存在 */
  exists: boolean
  /** 是否为默认（未自定义） */
  isDefault: boolean
  /** 保存后面临的重连结果（仅 PUT 响应携带；挂载工作区的 MCP server） */
  reconnected?: Array<{ serverId: string; ok: boolean; error?: string }>
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
