// Agent Loop：AI SDK v7 streamText + MCP 工具 + SSE 事件推送 + 中断支持
import { streamText, tool, jsonSchema, isStepCount } from 'ai'
import type { SharedV4ProviderOptions } from '@ai-sdk/provider'
import { join } from 'node:path'
import type { ChatEvent, Agent, Message, Session, ToolCallRecord, Attachment, ReasoningOption, MessageSegment } from './types.js'
import { listToolsFor, callMcpTool } from './mcp.js'
import { injectSkills } from './skills.js'
import { shouldCompact, compactSession } from './compact.js'
import { createModelForAgent, resolveModel } from './models.js'
import { builtinTools } from './builtinTools.js'

// 步骤上限：浏览器/文件任务动辄 10-20 步，8 步会被截断导致任务无闭环
// （可环境变量覆盖：NOVA_AGENT_MAX_STEPS）
const MAX_STEPS = Number(process.env.NOVA_AGENT_MAX_STEPS ?? 24)

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
  attachments?: Attachment[],
  reasoning?: ReasoningOption,
): Promise<Message> {
  const emit = push

  // 自动压缩：turn 开始前检查消息数，超过阈值先总结旧消息再继续
  // （压缩本身也消耗一轮 LLM 调用，仅当历史超长时触发；先压缩再追加本轮用户消息）
  if (shouldCompact(session)) {
    try {
      const result = await compactSession(session, agent)
      if (result) {
        emit({ type: 'compact', sessionId: session.id, summary: result.summary, removed: result.removed, kept: result.kept })
        console.log(`[compact] session ${session.id}: removed ${result.removed}, kept ${result.kept}`)
      }
    } catch (err) {
      // 压缩失败不阻塞对话（保留原历史继续）
      console.warn(`[compact] failed: ${(err as Error).message}`)
    }
  }

  // 检查点 1：用户消息落盘（压缩之后，保证新消息不被压缩）
  const userMsg: Message = {
    id: uid(),
    role: 'user',
    content: userText,
    attachments,
    createdAt: Date.now(),
  }
  session.messages.push(userMsg)

  // 附件注入模型上下文：追加说明 + 绝对路径（filesystem 工具可直接读）
  let modelUserText = userText
  if (attachments?.length) {
    const wsRoot = join(process.cwd(), 'workspace')
    const list = attachments
      .map((a) => `- ${a.name}（${fmtSize(a.size)}，类型 ${a.mime}，完整路径 ${join(wsRoot, a.path)}）`)
      .join('\n')
    modelUserText = `${userText}\n\n[用户上传了 ${attachments.length} 个附件，可用文件系统工具读取：]\n${list}`
  }

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
        segments.push({ kind: 'tool', call: record })
        emit({ type: 'tool_call_start', sessionId: session.id, call: record })
        try {
          const out = await callMcpTool(t.serverId, t.name, args, t.timeoutMs ?? 120000)
          record.output = out
          record.status = 'success'
          record.durationMs = Date.now() - record.startedAt
          emit({ type: 'tool_call_end', sessionId: session.id, call: record })
          return { content: out }
        } catch (err) {
          record.output = `ERROR: ${(err as Error).message}`
          record.status = 'error'
          record.durationMs = Date.now() - record.startedAt
          emit({ type: 'tool_call_end', sessionId: session.id, call: record })
          return { content: `Error: ${(err as Error).message}`, isError: true }
        }
      },
    })
  }

  // 内置工具：web_search（所有 Agent 自动拥有）
  for (const bt of builtinTools) {
    tools[bt.name] = tool({
      description: bt.description,
      inputSchema: jsonSchema(bt.inputSchema),
      execute: async (args) => {
        return bt.execute(args as Record<string, unknown>, {
          onStart: (record) => {
            segments.push({ kind: 'tool', call: record })
            emit({ type: 'tool_call_start', sessionId: session.id, call: record })
          },
          onEnd: (record) => emit({ type: 'tool_call_end', sessionId: session.id, call: record }),
        })
      },
    })
  }

  // system prompt = persona + 技能注入 + 历史摘要（压缩后存在）+ 执行约束 + 工具选择策略
  const summaryBlock = session.summary
    ? `\n\n---\n\n# 历史对话摘要\n以下是对较早对话的压缩摘要，请基于它继续，不要重复已确认的内容：\n${session.summary}`
    : ''
  const stepBudget = `\n\n---\n\n# 执行约束\n- 本轮最多执行 ${MAX_STEPS} 次工具调用。请高效规划：能一次做完的不要分多步。\n- 必须给出最终结论：完成任务后用 1-3 句话向用户总结结果（不要说"请稍等"就结束）。\n- 若接近步骤上限仍未完成，先输出已获得的部分结果，并说明剩余部分未完成的原因。\n- 工具失败时按类型分级处理，不要一刀切：网络错误（ERROR）用同参数重试 1 次；空结果换更具体的关键词（最多 2 次）；结果不相关换表述（最多 1 次）。仍失败立即停止并给替代建议，禁止反复重试同一工具。\n\n# 工具选择策略（重要）\n- 查资讯、找资料、搜索网页：一律使用 web_search 工具，不要打开浏览器。\n- 浏览器工具（browser_*）只在用户明确要求"打开浏览器/打开网页/在浏览器里操作"时才使用；其他情况禁用。\n- web_search 一次可获取多条结果，通常 1-2 次搜索足够；先搜索，再基于结果回答，避免反复搜索。`
  const system = `${agent.persona}\n${injectSkills(agent.skillIds)}${summaryBlock}${stepBudget}`

  // 历史消息（AI SDK 格式）
  const history = session.messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }))
  history.push({ role: 'user', content: modelUserText })

  let assistantText = ''
  let step = 0
  let inputTokens = 0
  let outputTokens = 0
  // 时间线分段：文本与工具按发生顺序交错（DSH 风格）
  const segments: MessageSegment[] = []

  // 中断控制器（abort 来源：用户点停止 / 客户端断开 / 页面刷新导致 SSE 连接关闭）
  const abortController = new AbortController()
  let interrupted = false
  abortController.signal.addEventListener('abort', () => { interrupted = true })
  activeRuns.set(session.id, { abort: () => abortController.abort() })

  const result = await streamText({
    model: createModelForAgent(agent),
    system,
    messages: history,
    tools: Object.keys(tools).length ? (tools as never) : undefined,
    stopWhen: isStepCount(MAX_STEPS),
    abortSignal: abortController.signal,
    // 思考模式（reasoning）：仅 DeepSeek 渠道支持；其他 provider 不传（避免请求报错）
    providerOptions: buildProviderOptions(agent, reasoning),
    onChunk: ({ chunk }) => {
      if (chunk.type === 'text-delta') {
        assistantText += chunk.text
        const last = segments[segments.length - 1]
        if (last && last.kind === 'text') last.text += chunk.text
        else segments.push({ kind: 'text', text: chunk.text })
        emit({ type: 'text', sessionId: session.id, delta: chunk.text })
      }
    },
    onStepEnd: (stepResult) => {
      step += 1
      emit({ type: 'step', sessionId: session.id, step })
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
  let modelError: Error | null = null
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
  } catch (err) {
    // 模型调用失败（401 无 key / 网络 / 模型失效等）发生在这里（AI SDK 懒执行）。
    // 不能吞掉：否则前端只会收到一条空消息、没有任何错误提示。
    // 用户主动中断（abort）不算错误，静默返回。
    if (!interrupted) modelError = err as Error
  }

  // 最终文本（若 onChunk 因中断未完整，取 result.text）
  if (!assistantText) {
    try {
      assistantText = await result.text
    } catch (err) {
      // 中断时 result.text 不可用；有部分文本则保留，无文本则不落盘占位符
      if (!interrupted && !modelError) modelError = err as Error
    }
  }

  // 模型调用失败：发 error 事件让前端翻译成用户可读的提示（不落盘空消息）
  if (modelError && !interrupted) {
    activeRuns.delete(session.id)
    emit({ type: 'error', sessionId: session.id, message: modelError.message })
    return { id: uid(), role: 'assistant', content: '', createdAt: Date.now() }
  }

  // 中断且没有任何输出：不落盘 "(已中断)" 占位消息、不发 done。
  // 中断的展示由前端负责（cancelStream 已把流式尾部/占位写入前端状态），
  // 后端若再落盘一条会导致刷新后看到重复的"已中断"。
  if (interrupted && !assistantText) {
    activeRuns.delete(session.id)
    return { id: uid(), role: 'assistant', content: '', createdAt: Date.now() }
  }

  const finalMsg: Message = {
    id: uid(),
    role: 'assistant',
    content: assistantText,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    tokens: { input: inputTokens, output: outputTokens },
    createdAt: Date.now(),
    segments: segments.length ? segments : undefined,
  }
  session.messages.push(finalMsg)
  emit({ type: 'usage', sessionId: session.id, input: inputTokens, output: outputTokens })
  emit({ type: 'done', sessionId: session.id, message: finalMsg })

  activeRuns.delete(session.id)
  return finalMsg
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// 思考模式 → providerOptions
function buildProviderOptions(agent: Agent, reasoning?: ReasoningOption): SharedV4ProviderOptions | undefined {
  if (!reasoning) return undefined
  const providerId = resolveModel(agent.model)?.provider.id
  if (!providerId) return undefined

  // DeepSeek 官方客户端：thinking 开关 + reasoningEffort（V4 reasoning 模型）
  if (providerId === 'deepseek') {
    const opt: { thinking: { type: string }; reasoningEffort?: string } = { thinking: { type: reasoning.type } }
    if (reasoning.type === 'enabled' && reasoning.effort) opt.reasoningEffort = reasoning.effort
    return { deepseek: opt }
  }
  // OpenAI 兼容渠道（含自定义供应商）：透传标准 reasoning_effort 参数
  // （openai-compatible SDK 会把 providerOptions[providerId] 直接合并进请求体；
  //   不支持的模型/服务通常会忽略该字段）
  if (reasoning.type === 'enabled' && reasoning.effort) {
    return { [providerId]: { reasoning_effort: reasoning.effort } }
  }
  return undefined
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
