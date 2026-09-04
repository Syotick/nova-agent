// Agent Loop：AI SDK v7 streamText + MCP 工具 + SSE 事件推送 + 中断支持
import { streamText, tool, jsonSchema, isStepCount } from 'ai'
import type { SharedV4ProviderOptions } from '@ai-sdk/provider'
import { join } from 'node:path'
import { getWorkspacePath } from './workspace.js'
import type { ChatEvent, Agent, Message, Session, ToolCallRecord, Attachment, ReasoningOption, MessageSegment } from './types.js'
import { listToolsFor } from './mcp.js'
import { injectSkills } from './skills.js'
import { shouldCompact, compactSession, maybePruneToolOutput, isContextWindowExceededError } from './compact.js'
import { createModelForAgent, resolveModel } from './models.js'
import { assembleTools, shouldRegisterBuiltin } from './toolRegistry.js'
import { newId } from './store.js'
import { buildMemoryBlock, loadProjectMemory } from './memory.js'
import { killSessionProcesses } from './terminal.js'

// 步骤上限：浏览器/文件任务动辄 10-20 步，8 步会被截断导致任务无闭环
// （可环境变量覆盖：NOVA_AGENT_MAX_STEPS）
const MAX_STEPS = Number(process.env.NOVA_AGENT_MAX_STEPS ?? 24)

// 子 Agent 嵌套深度上限：主(0) → 子(1) → 孙(2) → 曾孙(3)，最多 3 层
const MAX_SUBAGENT_DEPTH = Number(process.env.NOVA_AGENT_MAX_SUBAGENT_DEPTH ?? 3)

// 上下文溢出恢复时"保留更少"的条数（正常压缩默认 COMPACT_KEEP；溢出时保底这点条数，尽快腾出空间）
const OVERFLOW_COMPACT_KEEP = 6

// 工具结果"喂给模型"前的统一出口：超长输出修剪为 head + 标记 + tail（借鉴 DSH 的
// tool-result pruner）。完整输出保留在 record.output 供前端展示/轨迹回放；
// 修剪过则打 modelPruned 标记。错误信息很短，不修剪。
function toolResultForModel(
  res: { content: string; isError?: boolean },
  record?: ToolCallRecord,
): { content: string; isError?: boolean } {
  if (res.isError) return res
  const pruned = maybePruneToolOutput(res.content)
  if (pruned === res.content) return res
  if (record) record.modelPruned = true
  return { ...res, content: pruned }
}

// 中断注册表：sessionId -> abort
const activeRuns = new Map<string, { abort: () => void }>()
// 子任务注册表：主 sessionId -> 子任务 abort 集合（主中断时连带中断子任务，防幽灵执行）
const activeSubruns = new Map<string, Set<() => void>>()

export function abortRun(sessionId: string) {
  const run = activeRuns.get(sessionId)
  if (run) run.abort()
  // 连带终止该会话正在运行的命令进程（防中断后命令继续跑/占端口）
  void killSessionProcesses(sessionId)
  // 连带中断该主 turn 的所有活动子任务
  const subs = activeSubruns.get(sessionId)
  if (subs) {
    for (const abortChild of subs) abortChild()
    activeSubruns.delete(sessionId)
  }
}

export async function runTurn(
  session: Session,
  agent: Agent,
  userText: string,
  push: (e: ChatEvent) => void,
  attachments?: Attachment[],
  reasoning?: ReasoningOption,
  depth = 0, // 子 Agent 嵌套深度（主 turn = 0；subagent 工具每次 +1）
): Promise<Message> {
  const emit = push

  // 自动压缩：turn 开始前检查消息数，超过阈值先总结旧消息再继续
  // （压缩本身也消耗一轮 LLM 调用，仅当历史超长时触发；先压缩再追加本轮用户消息）
  if (shouldCompact(session, agent.model)) {
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
    const wsRoot = getWorkspacePath()
    const list = attachments
      .map((a) => `- ${a.name}（${fmtSize(a.size)}，类型 ${a.mime}，完整路径 ${join(wsRoot, a.path)}）`)
      .join('\n')
    modelUserText = `${userText}\n\n[用户上传了 ${attachments.length} 个附件，可用文件系统工具读取：]\n${list}`
  }

  // 统一工具装配：内置（按 Agent 勾选）+ MCP（按 agent.mcpServerIds 拉取），见 toolRegistry.ts。
  // 想加工具 = 往 builtinToolDefs 加定义 / 配一个 MCP server，主循环零改动（可插拔、可分配、解耦）。
  // 时间线分段：文本与工具按发生顺序交错（DSH 风格）
  const segments: MessageSegment[] = []
  // 实际执行的工具调用记录（execute 端收集：output/状态/耗时完整，与前端事件同源；
  // AI SDK v7 的 step.toolCalls 不含 result，无法从中取输出）
  const executedToolCalls: ToolCallRecord[] = []
  const mcpTools = await listToolsFor(agent.mcpServerIds)
  const tools = assembleTools(
    agent,
    {
      session,
      agent,
      depth,
      emit,
      segments,
      executedToolCalls,
      toolResultForModel,
      runSubagent: runTurn,
      subagentDepthLimit: MAX_SUBAGENT_DEPTH,
      activeSubruns,
      abortRun,
    },
    mcpTools,
  )

  // ---- 模型请求（可重试）：system/history 每次尝试内重新组装 ----
  // 压缩会改写 session.summary 与 session.messages，因此组装必须放进尝试函数，
  // 溢出恢复（先压缩再重试）时才能拿到压缩后的上下文。
  // 项目记忆（AGENTS.md：项目共享约定 + AGENTS.local.md 个人私有，见 memory.ts）
  const projectMemory = loadProjectMemory()
  const projectMemoryBlock = projectMemory
    ? `\n\n---\n\n# 项目说明（来自工作区的 AGENTS.md，遵守之）\n${projectMemory}`
    : ''

  // 跨会话记忆：一键可插拔——开关复用 Agent 配置页"内置工具"里的"记忆"勾选，
  // 一个开关同时管住 remember 工具注册（上方）+ 注入（这里）+ 指令段（下方），
  // 保证"拆掉"时整条链路干净；构建逻辑收在 memory.ts（buildMemoryBlock），
  // 主循环只留开关判断——记忆改动与编排解耦。
  const memoryEnabled = shouldRegisterBuiltin(agent.builtinTools, 'remember')
  const memoryBlock = memoryEnabled ? buildMemoryBlock(agent.id, modelUserText, 5) : ''
  const stepBudget = `\n\n---\n\n# 执行约束\n- 本轮最多执行 ${MAX_STEPS} 次工具调用。请高效规划：能一次做完的不要分多步。\n- 必须给出最终结论：完成任务后用 1-3 句话向用户总结结果（不要说"请稍等"就结束）。\n- 若接近步骤上限仍未完成，先输出已获得的部分结果，并说明剩余部分未完成的原因。\n- 工具失败时按类型分级处理，不要一刀切：网络错误（ERROR）用同参数重试 1 次；空结果换更具体的关键词（最多 2 次）；结果不相关换表述（最多 1 次）。仍失败立即停止并给替代建议，禁止反复重试同一工具。

# 工具选择策略（重要）
- 查资讯、找资料、搜索网页：一律使用 web_search 工具，不要打开浏览器。
- 浏览器工具（browser_*）只在用户明确要求"打开浏览器/打开网页/在浏览器里操作"时才使用；其他情况禁用。
- web_search 一次可获取多条结果，通常 1-2 次搜索足够；先搜索，再基于结果回答，避免反复搜索。

# 任务执行与项目操作（run_command）
- 工作区就是你的项目目录：读代码用 filesystem 的 read/search 工具，改代码用 edit/write 工具，验证改动用 run_command 执行构建/测试（npm run build / npm test / node 脚本等）。
- 改完代码必须主动验证：先跑一遍构建或测试确认没有引入错误，再向用户汇报结果。
- 命令不等待输入；启动类命令（npm run dev 等）超时终止是正常的——根据输出判断服务是否启动成功即可。

# 子 Agent 编排（subagent）
- 复杂任务可派生子 Agent 并行执行（同一轮多个 subagent 调用会并行跑）：每个 task 必须自包含（目标+约束+交付格式）；可并行拆分的方向不要串行做。
- 子任务失败（返回 ERROR）时：有明确原因 → 修正 task 后重试最多 1 次；有部分产出 → 基于部分产出继续；不可恢复 → 立即停止并告知用户。禁止编造子任务结果或虚构其细节。
- 子任务结论直接引用其返回文本，不要添加未在返回中出现的具体信息。`
  // 记忆指令段：启用记忆才拼入（与 remember 工具 / 注入共用同一开关，解耦）
  const memoryInstruction = memoryEnabled
    ? `
# 跨会话记忆（remember）
- 用户明确表达个人偏好、项目事实或长期约定时，调用 remember 工具记住（一句话，简洁完整）。
- 不要记住临时性内容（本次任务细节、一次性指令）；每轮最多调用 1-2 次。
- 回答时优先参考 system prompt 中注入的长期记忆；与当前对话冲突时以当前对话为准。`
    : ''

  // 中断控制器（abort 来源：用户点停止 / 客户端断开 / 页面刷新导致 SSE 连接关闭）
  const abortController = new AbortController()
  let interrupted = false
  abortController.signal.addEventListener('abort', () => { interrupted = true })
  activeRuns.set(session.id, { abort: () => abortController.abort() })
  // 清理上一轮残留的命令进程（防异常退出的 turn 留下幽灵进程）
  void killSessionProcesses(session.id)

  let assistantText = ''
  let step = 0
  let inputTokens = 0
  let outputTokens = 0
  let modelError: Error | null = null

  // 一次完整模型请求（含流式收尾）。返回 'ok'（成功）/ 'overflow'（上下文溢出，可恢复）/ 'error'。
  // 溢出恢复借鉴 DSH compaction-basic：provider 确认上下文溢出 → 压缩 → 重试该请求。
  async function attemptModel(): Promise<'ok' | 'overflow' | 'error'> {
    // 重试前重置本轮累计（工具会重新执行并重新发事件，属溢出恢复的已知行为）
    assistantText = ''
    step = 0
    inputTokens = 0
    outputTokens = 0
    segments.length = 0
    executedToolCalls.length = 0
    modelError = null

    // 历史摘要（压缩后存在 session.summary，重试时可能刚被改写，故在此处重新读取）
    const summaryBlock = session.summary
      ? `\n\n---\n\n# 历史对话摘要\n以下是对较早对话的压缩摘要，请基于它继续，不要重复已确认的内容：\n${session.summary}`
      : ''
    // system prompt = persona + 技能注入 + 历史摘要 + 记忆注入 + 项目说明 + 执行约束 + 记忆指令
    const system = `${agent.persona}\n${injectSkills(agent.skillIds)}${summaryBlock}${memoryBlock}${projectMemoryBlock}${stepBudget}${memoryInstruction}`

    // 历史消息（AI SDK 格式）
    const history = session.messages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }))
    history.push({ role: 'user', content: modelUserText })

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

    // 等待流结束并检测模型调用错误（AI SDK 懒执行：401/网络错误在 await steps 时抛出）
    // 工具调用记录不再从 steps 解析（v7 的 toolCalls 不含 result）——用 execute 端收集的 executedToolCalls
    try {
      await result.steps
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

    if (modelError && !interrupted && isContextWindowExceededError(modelError)) return 'overflow'
    return modelError && !interrupted ? 'error' : 'ok'
  }

  let outcome = await attemptModel()
  if (outcome === 'overflow' && !interrupted) {
    // 上下文溢出恢复：强制压缩旧历史（保留更少）腾出空间，然后重试一次。
    // 只有压缩真正腾出空间才重试；压不动（如全是本轮新消息）直接透出原错误，
    // 避免白白把工具重跑一遍。DSH 的 maxOverflowRetries 默认同为 1。
    let didCompact = false
    try {
      const cres = await compactSession(session, agent, { force: true, keep: OVERFLOW_COMPACT_KEEP })
      if (cres) {
        didCompact = true
        emit({ type: 'compact', sessionId: session.id, summary: cres.summary, removed: cres.removed, kept: cres.kept, trigger: 'overflow' })
        console.log(`[compact:overflow] session ${session.id}: removed ${cres.removed}, kept ${cres.kept}`)
      }
    } catch (err) {
      // 溢出压缩失败不阻塞：保留原请求错误给前端（用户可手动压缩或新开会话）
      console.warn(`[compact:overflow] failed: ${(err as Error).message}`)
    }
    if (didCompact) outcome = await attemptModel()
  }

  // 模型调用失败：发 error 事件让前端翻译成用户可读的提示（不落盘空消息）
  if (modelError && !interrupted) {
    activeRuns.delete(session.id)
    void killSessionProcesses(session.id) // 兜底清理该会话残留命令进程（含中断路径）
    // modelError 在 attemptModel 内赋值，外层控制流收窄为 null，此处断言回 Error
    emit({ type: 'error', sessionId: session.id, message: (modelError as Error).message })
    return { id: uid(), role: 'assistant', content: '', createdAt: Date.now() }
  }

  // 中断且没有任何输出：不落盘 "(已中断)" 占位消息、不发 done。
  // 中断的展示由前端负责（cancelStream 已把流式尾部/占位写入前端状态），
  // 后端若再落盘一条会导致刷新后看到重复的"已中断"。
  if (interrupted && !assistantText) {
    activeRuns.delete(session.id)
    void killSessionProcesses(session.id) // 兜底清理该会话残留命令进程（含中断路径）
    return { id: uid(), role: 'assistant', content: '', createdAt: Date.now() }
  }

  const finalMsg: Message = {
    id: uid(),
    role: 'assistant',
    content: assistantText,
    toolCalls: executedToolCalls.length ? executedToolCalls : undefined,
    tokens: { input: inputTokens, output: outputTokens },
    createdAt: Date.now(),
    segments: segments.length ? segments : undefined,
  }
  session.messages.push(finalMsg)
  emit({ type: 'usage', sessionId: session.id, input: inputTokens, output: outputTokens })
  emit({ type: 'done', sessionId: session.id, message: finalMsg })

  activeRuns.delete(session.id)
  void killSessionProcesses(session.id) // 兜底清理该会话残留命令进程（含中断路径）
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
