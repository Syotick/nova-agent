// 上下文压缩：真实 summarization（LLM 总结旧消息）+ 自动触发策略
import { generateText } from 'ai'
import type { Agent, Message, Session } from './types.js'
import { createModel } from './models.js'

// 策略参数（可用环境变量覆盖）
export const COMPACT_MIN_MESSAGES = Number(process.env.NOVA_AGENT_COMPACT_MIN ?? 40) // 超过该条数才压缩
export const COMPACT_KEEP = Number(process.env.NOVA_AGENT_COMPACT_KEEP ?? 20) // 保留最近 N 条消息
const SUMMARY_MAX_CHARS = 2000 // 摘要长度上限（字符）

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

// 判断是否需要压缩
export function shouldCompact(session: Session): boolean {
  return session.messages.length > COMPACT_MIN_MESSAGES
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
