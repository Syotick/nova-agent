// 上下文压缩：真实 summarization（LLM 总结旧消息）+ 自动触发策略
import { generateText } from 'ai'
import type { Agent, Message, Session } from './types.js'
import { createModel, resolveModel } from './models.js'

// 策略参数（可用环境变量覆盖）
export const COMPACT_MIN_MESSAGES = Number(process.env.NOVA_AGENT_COMPACT_MIN ?? 40) // 消息数兜底：超过该条数强制压缩（与 token 阈值双条件）
export const COMPACT_KEEP = Number(process.env.NOVA_AGENT_COMPACT_KEEP ?? 20) // 保留最近 N 条消息
const SUMMARY_MAX_CHARS = 2000 // 摘要长度上限（字符）
const DEFAULT_CONTEXT_WINDOW = 1_000_000 // 模型上下文缺省值（主流模型普遍 1M）
// 自动压缩阈值：上下文用量的百分比（成熟项目做法：接近上限才压；Claude Code 默认 ~95%）
// 可用 NOVA_AGENT_COMPACT_PCT 覆盖（1-100）
export const COMPACT_PCT = Math.min(100, Math.max(1, Number(process.env.NOVA_AGENT_COMPACT_PCT ?? 90)))

// 会话当前上下文占用（真实计数优先）：
// 最后一条带 tokens 的 assistant 消息的 input 是"那次请求的完整输入"（API 真实计数，含全部历史），
// 以其为基准 + 其后新增消息的估算
export function contextUsage(messages: Array<{ role: string; content: string; tokens?: { input?: number; output?: number } }>): number {
  let base = 0
  let baseIdx = -1
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.tokens && (m.tokens.input ?? 0) > 0) {
      base = m.tokens.input ?? 0
      baseIdx = i
    }
  }
  let used = base
  for (let i = baseIdx + 1; i < messages.length; i++) {
    const m = messages[i]
    if (m.tokens) used += (m.tokens.output ?? 0)
    else used += estimateTokens(m.content)
  }
  return used
}

// 文本 token 估算：中文约 0.7 token/字，其他约 0.25 token/字符（user 消息无真实计数）
export function estimateTokens(text: string): number {
  let cn = 0
  let other = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) cn++
    else other++
  }
  return Math.ceil(cn * 0.7 + other / 4)
}

// 上下文窗口兜底：非法值（0/负数/非数字）回退缺省，防止进度条/压缩阈值异常
export function sanitizeContextWindow(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CONTEXT_WINDOW
}

// 当前模型的上下文窗口（models.json 注册表内置；未配/非法 → 缺省 1M）
export function contextWindowFor(model: string): number {
  const resolved = resolveModel(model)
  const entry = resolved?.provider.models.find((m) => m.id === resolved.modelId)
  return sanitizeContextWindow(entry?.contextWindow)
}

export interface CompactResult {
  summary: string
  removed: number
  kept: number
}

// 用 LLM 把一批消息总结成摘要（结构化提示词，输出纯文本）
export async function summarizeMessages(messages: Message[], model: string): Promise<string> {
  // 构造对话文本：只保留角色与内容（工具调用细节省略，保留关键结果）
  const transcript = messages
    .map((m) => {
      const header = m.role === 'user' ? '用户' : '助手'
      let body = m.content || '(无文本)'
      if (m.toolCalls?.length) {
        const calls = m.toolCalls
          .map((c) => `  - 调用了工具 ${c.name}${c.status === 'error' ? '（失败）' : ''}`)
          .join('\n')
        body += `\n${calls}`
      }
      return `## ${header}\n${body}`
    })
    .join('\n\n')
    .slice(-30000) // 截断超长输入，防止超出模型上下文

  const { text } = await generateText({
    model: createModel(model),
    system:
      '你是对话摘要引擎。请把用户提供的对话记录压缩成一份简洁的上下文摘要，供后续对话继续使用。要求：\n' +
      '1. 保留：用户的目标与需求、关键事实/决定、已完成的工作、未完成或待办事项、重要数据与结论\n' +
      '2. 省略：寒暄、重复内容、工具调用的机械细节（但记录关键结果）\n' +
      '3. 使用与对话相同的语言；以"对话摘要："开头\n' +
      `4. 总长度不超过 ${SUMMARY_MAX_CHARS} 字符，直接输出摘要正文，不要解释`,
    prompt: transcript,
  })

  const summary = text.trim()
  return summary.length > SUMMARY_MAX_CHARS ? summary.slice(0, SUMMARY_MAX_CHARS) : summary
}

// 判断是否需要压缩：消息条数超限（保守兜底）或 当前上下文占用超过窗口 × COMPACT_PCT%
export function shouldCompact(session: Session, model?: string): boolean {
  if (session.messages.length > COMPACT_MIN_MESSAGES) return true
  if (!model || !session.messages.length) return false
  const window = contextWindowFor(model)
  return contextUsage(session.messages) > (window * COMPACT_PCT) / 100
}

// 执行压缩：总结最早的消息（保留最近 KEEP 条），摘要存 session.summary
// （摘要不进消息列表，由 agentLoop 注入 system prompt；前端横幅读取 summary）
// 返回 null 表示无需压缩
export async function compactSession(session: Session, agent: Agent): Promise<CompactResult | null> {
  const messages = session.messages
  if (messages.length <= COMPACT_MIN_MESSAGES) return null

  const keepFrom = messages.length - COMPACT_KEEP
  const toSummarize = messages.slice(0, keepFrom)
  const kept = messages.slice(keepFrom)

  const summary = await summarizeMessages(toSummarize, agent.model)

  session.messages = kept
  session.summary = summary

  return { summary, removed: toSummarize.length, kept: kept.length }
}
