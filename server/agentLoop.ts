// Agent Loop：AI SDK v7 streamText + MCP 工具 + SSE 事件推送 + 中断支持
import { streamText, tool, jsonSchema, isStepCount } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import type { ChatEvent, Agent, Message, Session, ToolCallRecord } from './types.js'
import { listToolsFor, callMcpTool } from './mcp.js'
import { injectSkills } from './skills.js'
import { resolveApiKey } from './store.js'

const MAX_STEPS = 8

// 中断注册表：sessionId -> abort
const activeRuns = new Map<string, { abort: () => void }>()

export function abortRun(sessionId: string) {
  const run = activeRuns.get(sessionId)
  if (run) run.abort()
}

export async function runTurn(
  session: Session,
  agent: Agent,
  userText: string,
  push: (e: ChatEvent) => void,
): Promise<Message> {
  // 检查点 1：用户消息落盘
  const userMsg: Message = { id: uid(), role: 'user', content: userText, createdAt: Date.now() }
  session.messages.push(userMsg)

  const emit = push

  // 组装 MCP 工具
  const mcpTools = await listToolsFor(agent.mcpServerIds)
  const tools: Record<string, unknown> = {}
  for (const t of mcpTools) {
    tools[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(t.inputSchema as Record<string, unknown>),
      execute: async (args) => {
        const record: ToolCallRecord = {
          id: uid(),
          name: t.name,
          input: args,
          output: '',
          status: 'running',
          startedAt: Date.now(),
          durationMs: 0,
        }
        emit({ type: 'tool_call_start', call: record })
        try {
          const out = await callMcpTool(t.serverId, t.name, args, t.timeoutMs ?? 120000)
          record.output = out
          record.status = 'success'
          record.durationMs = Date.now() - record.startedAt
          emit({ type: 'tool_call_end', call: record })
          return { content: out }
        } catch (err) {
          record.output = `ERROR: ${(err as Error).message}`
          record.status = 'error'
          record.durationMs = Date.now() - record.startedAt
          emit({ type: 'tool_call_end', call: record })
          return { content: `Error: ${(err as Error).message}`, isError: true }
        }
      },
    })
  }

  // system prompt = persona + 技能注入
  const system = `${agent.persona}\n${injectSkills(agent.skillIds)}`

  // 历史消息（AI SDK 格式）
  const history = session.messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }))
  history.push({ role: 'user', content: userText })

  let assistantText = ''
  let step = 0
  let inputTokens = 0
  let outputTokens = 0

  // 中断控制器
  const abortController = new AbortController()
  activeRuns.set(session.id, { abort: () => abortController.abort() })

  const result = await streamText({
    model: createDeepSeek({ apiKey: resolveApiKey() })(agent.model),
    system,
    messages: history,
    tools: Object.keys(tools).length ? (tools as never) : undefined,
    stopWhen: isStepCount(MAX_STEPS),
    abortSignal: abortController.signal,
    onChunk: ({ chunk }) => {
      if (chunk.type === 'text-delta') {
        assistantText += chunk.text
        emit({ type: 'text', delta: chunk.text })
      }
    },
    onStepEnd: (stepResult) => {
      step += 1
      emit({ type: 'step', step })
      if (stepResult.usage) {
        inputTokens += stepResult.usage.inputTokens ?? 0
        outputTokens += stepResult.usage.outputTokens ?? 0
      }
    },
    onEnd: (finish) => {
      if (finish.usage) {
        inputTokens = finish.usage.inputTokens ?? inputTokens
        outputTokens = finish.usage.outputTokens ?? outputTokens
      }
    },
  })

  // 等待并收集所有步骤的工具调用记录
  const toolCalls: ToolCallRecord[] = []
  try {
    const steps = await result.steps
    for (const s of steps) {
      const calls = await s.toolCalls
      for (const tc of calls) {
        const anyTc = tc as unknown as {
          toolName: string
          input: unknown
          result?: { content?: unknown }
        }
        const content = anyTc.result?.content
        const text = Array.isArray(content)
          ? content.map((c) => (c as { text?: string }).text ?? '').join('\n')
          : String(content ?? '')
        toolCalls.push({
          id: uid(),
          name: anyTc.toolName,
          input: anyTc.input,
          output: text,
          status: 'success',
          startedAt: 0,
          durationMs: 0,
        })
      }
    }
  } catch {
    // 中断或解析失败时忽略工具记录收集
  }

  // 最终文本（若 onChunk 因中断未完整，取 result.text）
  if (!assistantText) {
    try {
      assistantText = await result.text
    } catch {
      assistantText = assistantText || '(已中断)'
    }
  }

  const finalMsg: Message = {
    id: uid(),
    role: 'assistant',
    content: assistantText,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    tokens: { input: inputTokens, output: outputTokens },
    createdAt: Date.now(),
  }
  session.messages.push(finalMsg)
  emit({ type: 'usage', input: inputTokens, output: outputTokens })
  emit({ type: 'done', message: finalMsg })

  activeRuns.delete(session.id)
  return finalMsg
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
