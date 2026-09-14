// 统一工具注册表：内置工具 + MCP 工具走同一条装配管道，供 agentLoop 一次性取用。
//
// 为什么要有这一层（解耦）：
//   - 之前内置工具的定义散落在 agentLoop 的 runTurn 里（依赖它的局部状态），想增删一个
//     内置工具要动主循环；MCP 工具又是另一套包装——两套体系，不可插拔。
//   - 现在：内置工具 = { id, name, description, inputSchema, createExecute(runtime) } 集中声明，
//     runtime 由 runTurn 注入（session/emit/segments/...），execute 不再直接碰 agentLoop 内部状态；
//     MCP 工具由 assembleTools 用同一套 record/emit/修剪包装注册。主循环只剩一行装配。
//   - 可分配：Agent 配置页按工具勾选（shouldRegisterBuiltin）控制内置；按 server 勾选控制 MCP。
import { tool, jsonSchema } from 'ai'
import type { JSONSchema7 } from '@ai-sdk/provider'
import type { ChatEvent, Agent, Message, Session, ToolCallRecord, MessageSegment, Attachment, ReasoningOption } from './types.js'
import { callMcpTool } from './mcp.js'
import type { McpTool } from './mcp.js'
import { builtinTools as webSearchBuiltins, shouldRegisterBuiltin } from './builtinTools.js'
import { executeCommand } from './terminal.js'
import { executeGlob } from './glob.js'
import { newId } from './store.js'
import { addMemory } from './memory.js'
import { loadSkillContent } from './skills.js'
import {
  createSubagent, getSubagent, findSubagentBySessionId, listSubagents,
  appendNotice, saveSubagent, setSubagentAbort, clearSubagentAbort, interruptSubagent,
} from './subagents.js'
import type { SubagentRecord } from './subagents.js'

// 工具调用 id（与事件/轨迹共用同一 id，前端靠它关联工具卡）
function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// runTurn 注入给工具的运行时依赖——execute 只通过它访问会话/事件/中断，不直接碰主循环内部。
// 新增工具需要什么，就往这里加一个字段（而不是让工具 import agentLoop）。
export interface ToolRuntime {
  session: Session
  agent: Agent
  /** 子任务嵌套深度（主 turn = 0） */
  depth: number
  emit: (e: ChatEvent) => void
  segments: MessageSegment[]
  executedToolCalls: ToolCallRecord[]
  /** 工具结果"喂给模型"前的修剪出口（超长裁 head+marker+tail，见 compact.ts） */
  toolResultForModel: (res: { content: string; isError?: boolean }, record?: ToolCallRecord) => { content: string; isError?: boolean }
  /** 子 Agent 递归：agentLoop 注入 runTurn 引用（避免本模块 import agentLoop 造成循环依赖）；签名与 runTurn 一致 */
  runSubagent: (sub: Session, ag: Agent, task: string, noop: () => void, attachments?: Attachment[], reasoning?: ReasoningOption, depth?: number) => Promise<Message>
  /** 子任务嵌套上限（agentLoop 的 MAX_SUBAGENT_DEPTH） */
  subagentDepthLimit: number
  /** 子任务中断注册表（主 turn 中断时连带 abort 子任务，防幽灵执行） */
  activeSubruns: Map<string, Set<() => void>>
  abortRun: (sessionId: string) => void
}

// 内置工具定义：元数据集中声明 + 工厂函数生成 execute。
// createExecute(runtime) 返回真正的执行函数——每个 turn 构建一次 runtime，装配时调用。
export interface ToolDef {
  id: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
  createExecute: (rt: ToolRuntime) => (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>
  /** 条件装配：返回 false 时该工具不注册（如 load_skill 只在 agent 勾选过技能时才有意义） */
  when?: (agent: Agent) => boolean
}

// 创建一条"工具调用记录"并广播 start（内置工具公共样板）
function startRecord(rt: ToolRuntime, name: string, input: unknown): ToolCallRecord {
  const record: ToolCallRecord = {
    id: uid(),
    name,
    input,
    output: '',
    status: 'running',
    startedAt: Date.now(),
    durationMs: 0,
  }
  rt.segments.push({ kind: 'tool', call: record })
  rt.emit({ type: 'tool_call_start', sessionId: rt.session.id, call: record })
  return record
}

// 收尾一条工具调用记录：状态 + 耗时 + 进 executedToolCalls + 广播 end
function endRecord(rt: ToolRuntime, record: ToolCallRecord, status: 'success' | 'error', output: string) {
  record.status = status
  record.output = output
  record.durationMs = Date.now() - record.startedAt
  rt.executedToolCalls.push(record)
  rt.emit({ type: 'tool_call_end', sessionId: rt.session.id, call: record })
}

// ---------- 内置工具定义 ----------

const runCommandDef: ToolDef = {
  id: 'run_command',
  name: 'run_command',
  description:
    '在工作区（你的项目目录）执行 shell 命令（npm / git / node 等），返回命令输出。' +
    '改完代码后用这个工具跑构建/测试/启动（如 npm run build / npm test / npm run dev）验证你的改动。' +
    '命令必须非交互（不能等待输入）；超时（默认 120s）会自动终止进程并保留已收集的输出，启动类命令通常按超时处理——根据输出判断服务是否已经启动成功。',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的 shell 命令（非交互）' },
      cwd: { type: 'string', description: '工作区内的子目录（可选；默认工作区根）' },
      timeoutMs: { type: 'number', description: '超时毫秒（可选；默认 120000，上限 600000）' },
    },
    required: ['command'],
  },
  createExecute: (rt) => async (args) => {
    const record = startRecord(rt, 'run_command', args)
    try {
      const res = await executeCommand(rt.session.id, args as never)
      endRecord(rt, record, res.isError ? 'error' : 'success', res.content)
      return rt.toolResultForModel(res, record)
    } catch (err) {
      endRecord(rt, record, 'error', `ERROR: ${(err as Error).message}`)
      return { content: `Error: 命令执行失败（${(err as Error).message}）`, isError: true }
    }
  },
}

const globDef: ToolDef = {
  id: 'glob',
  name: 'glob',
  description:
    '按文件名模式在工作区中查找文件，返回相对工作区的路径列表。' +
    '支持 glob 语法：*（一段内任意字符）、**（跨任意层目录）、?（单个字符），如 "**/*.ts"、"src/**/*.md"、"package.json"。' +
    '适合先了解项目结构/定位要修改的文件（按文件名），搜索文件内容请用 search_files。',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'glob 文件名模式（如 **/*.ts）' },
      cwd: { type: 'string', description: '相对工作区的搜索起点（可选；默认工作区根）' },
    },
    required: ['pattern'],
  },
  createExecute: (rt) => async (args) => {
    const record = startRecord(rt, 'glob', args)
    try {
      const res = executeGlob(args as never)
      endRecord(rt, record, res.isError ? 'error' : 'success', res.content)
      return rt.toolResultForModel(res, record)
    } catch (err) {
      endRecord(rt, record, 'error', `ERROR: ${(err as Error).message}`)
      return { content: `Error: 匹配失败（${(err as Error).message}）`, isError: true }
    }
  },
}

const rememberDef: ToolDef = {
  id: 'remember',
  name: 'remember',
  description:
    '把用户明确表达的、值得长期记住的信息（个人偏好、项目事实、长期约定等）存入跨会话记忆。' +
    '之后所有会话都会自动参考这些记忆。仅在用户明确表达、且对未来对话有长期价值时使用，不要滥用（不要记住临时性内容）。',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '要记住的内容（一句话，简洁完整，如"用户喜欢简洁的回答"）' },
    },
    required: ['content'],
  },
  createExecute: (rt) => async (args) => {
    const content = String((args as { content?: unknown }).content ?? '').trim()
    const record = startRecord(rt, 'remember', args)
    try {
      if (!content) {
        endRecord(rt, record, 'error', 'ERROR: content required')
        return { content: 'Error: content 参数必填', isError: true }
      }
      const result = addMemory(rt.agent.id, content, 'auto')
      const verb = result.merged ? '已更新' : '已记住'
      endRecord(rt, record, 'success', `${verb}：${result.memory.content}`)
      return { content: `${verb}（将影响后续所有会话）：${result.memory.content}${result.merged ? '（内容与原记忆相似，已合并更新）' : ''}` }
    } catch (err) {
      endRecord(rt, record, 'error', `ERROR: ${(err as Error).message}`)
      return { content: `Error: 记忆保存失败（${(err as Error).message}）`, isError: true }
    }
  },
}

// ---------- 后台子代理（continuable）泵 ----------
// 把子代理跑成一连串"轮"：首轮 = task，之后 = inbox 队首；一轮结束若队列空则 idle 收工，
// 队列非空则继续。每轮 settle 时把结果 appendNotice 给父（父下一轮组装 history 时自动注入）。
async function runSubagentTurn(rt: ToolRuntime, rec: SubagentRecord, content: string, depth: number) {
  const session: Session = {
    id: rec.id,
    agentId: rec.agentId,
    title: `[子代理] ${rec.task.slice(0, 30)}`,
    messages: rec.messages, // 引用共享：runTurn push 后 rec.messages 同步
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  }
  const agent = rec.model ? { ...rt.agent, model: rec.model } : rt.agent
  try {
    const msg = await rt.runSubagent(session, agent, content, () => {}, undefined, undefined, depth)
    appendNotice(rec.id, `[子代理 ${rec.id} 已空闲]\n${msg.content?.trim() ? msg.content : '（无输出）'}`)
  } catch (err) {
    appendNotice(rec.id, `[子代理 ${rec.id} 失败：${(err as Error).message}]`)
  }
  saveSubagent(rec)
}

async function pumpSubagent(rt: ToolRuntime, id: string) {
  let rec = getSubagent(id)
  if (!rec) return
  saveSubagent({ ...rec, status: 'running' })
  setSubagentAbort(id, () => rt.abortRun(id))
  // 中断传播：父 turn 中断时连带停子（防幽灵后台执行）
  const subs = rt.activeSubruns.get(rt.session.id) ?? new Set<() => void>()
  rt.activeSubruns.set(rt.session.id, subs)
  const abortChild = () => rt.abortRun(id)
  subs.add(abortChild)
  try {
    let first = true
    while (rec) {
      const content = first ? rec.task : (rec.inbox.shift()?.content ?? '')
      first = false
      if (!content.trim()) break
      await runSubagentTurn(rt, rec, content, rt.depth + 1)
      rec = getSubagent(id) // 一轮后读最新（send_message 可能新排队）
      if (!rec) break
      if (rec.inbox.length === 0) break
    }
  } finally {
    const latest = getSubagent(id)
    if (latest) saveSubagent({ ...latest, status: 'idle' })
    clearSubagentAbort(id)
    subs.delete(abortChild)
    if (subs.size === 0) rt.activeSubruns.delete(rt.session.id)
  }
}

const subagentDef: ToolDef = {
  id: 'subagent',
  name: 'subagent',
  description:
    '派生一个子 Agent 独立执行子任务（并行调研/独立验证/耗时任务），返回结构化结果（状态/步骤数/Token/结论/部分产出）。' +
    '两种模式：background=false（默认）一次性子任务，跑完等结果；' +
    'background=true 后台常驻子代理（continuable）：立即返回 durable id（sub_xxx），子代理后台独立运行，' +
    '可随时用 send_message 与它对话、用 list_agents 查看、用 interrupt_agent 中断；它空闲/完成时会自动通知你。' +
    '适合：多个方向并行探索、独立审查、把大任务拆成小任务。task 必须是自包含的描述（目标+约束+交付格式）。' +
    'fork=false（默认）：子任务从零开始，task 必须自包含；fork=true：子任务继承父会话历史（已完成对话+当前用户消息），' +
    '适合"基于刚才的讨论继续"——注意 fork 是创建时的一次性快照，父之后的进展不会再带给子。' +
    '失败处理：子任务返回状态=失败/部分完成时——有明确原因就修正 task 后重试最多 1 次；有部分产出就基于部分产出继续；不可恢复就停止并告知用户，禁止编造子任务结果。',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '子任务描述（自包含：目标 + 约束 + 交付格式）' },
      model: { type: 'string', description: '可选：子 Agent 模型（provider/model），默认继承当前 Agent' },
      fork: { type: 'boolean', description: '可选（仅 background=false）：true 时子任务继承父会话历史（默认 false 从零开始）' },
      background: { type: 'boolean', description: '可选：true 时创建后台常驻子代理（立即返回 durable id，不阻塞当前轮）；默认 false 一次性等待结果' },
    },
    required: ['task'],
  },
  createExecute: (rt) => async (args) => {
    const task = String((args as { task?: unknown }).task ?? '').trim()
    const modelOverride = String((args as { model?: unknown }).model ?? '').trim() || undefined
    const fork = Boolean((args as { fork?: unknown }).fork)
    const background = Boolean((args as { background?: unknown }).background)
    const record = startRecord(rt, 'subagent', args)
    try {
      if (!task) {
        endRecord(rt, record, 'error', 'ERROR: task required')
        return { content: 'Error: task 参数必填', isError: true }
      }
      // 深度限制：防止无限递归（每层都是完整 loop，成本随深度爆炸）
      if (rt.depth >= rt.subagentDepthLimit) {
        endRecord(rt, record, 'error', `ERROR: 子任务嵌套过深（最多 ${rt.subagentDepthLimit} 层）`)
        return { content: `Error: 子任务嵌套过深（最多 ${rt.subagentDepthLimit} 层），请直接在当前层完成`, isError: true }
      }

      // background=true：后台常驻子代理（continuable）——立即返回 id，子代理后台异步泵轮
      if (background) {
        const rec = createSubagent({ parentId: rt.session.id, agentId: rt.agent.id, task, model: modelOverride })
        void pumpSubagent(rt, rec.id)
        const out =
          `[子代理已启动] id: ${rec.id}（后台运行中）。\n` +
          `任务：${task.slice(0, 120)}\n` +
          `可随时用 send_message（to: ${rec.id}）与它对话，用 list_agents 查看状态，用 interrupt_agent 中断；它空闲/完成时会自动通知你。`
        endRecord(rt, record, 'success', out)
        return rt.toolResultForModel({ content: out }, record)
      }

      // background=false：一次性子任务（spawn / fork + 结构化结果，原逻辑）
      // 子任务：内存临时会话（不入库），完整独立 loop，静默执行（no-op emit）
      const subSession: Session = {
        id: newId('sub'),
        agentId: rt.agent.id,
        title: `[子任务] ${task.slice(0, 30)}`,
        // fork：继承父会话已完成历史 + 当前用户消息（一次性快照；深拷贝防子 compact 改写污染父）
        // spawn（默认）：从零开始，task 必须自包含
        messages: fork ? structuredClone(rt.session.messages) : [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const subAgent = modelOverride ? { ...rt.agent, model: modelOverride } : rt.agent

      // 中断传播：主 turn 中断时连带 abort 子任务（防幽灵执行）
      const subs = rt.activeSubruns.get(rt.session.id) ?? new Set<() => void>()
      rt.activeSubruns.set(rt.session.id, subs)
      const abortChild = () => rt.abortRun(subSession.id)
      subs.add(abortChild)

      // 子会话统计（结构化结果用）：工具步骤数 + 完整部分产出
      const subStats = () => {
        let steps = 0
        const partials: string[] = []
        for (const m of subSession.messages) {
          if (m.segments) for (const seg of m.segments) if (seg.kind === 'tool') steps++
          else if (m.toolCalls) steps += m.toolCalls.length
          if (m.role === 'assistant' && m.content?.trim()) partials.push(m.content.trim())
        }
        return { steps, partial: partials.join('\n\n').slice(0, 2000) }
      }

      try {
        const msg = await rt.runSubagent(subSession, subAgent, task, () => {}, undefined, undefined, rt.depth + 1)
        const { steps } = subStats()
        if (msg.content) {
          // 结构化结果：状态隐含在 content 是否存在；显式给出步骤数 + Token，父 Agent 可据此判断"值不值"
          const stats = `步骤数 ${steps}${msg.tokens ? `，Token 输入 ${msg.tokens.input} / 输出 ${msg.tokens.output}` : ''}`
          const out = `[子任务结果]（${stats}）\n${msg.content}`
          endRecord(rt, record, 'success', out)
          return rt.toolResultForModel({ content: out }, record)
        }
        // 子任务未产出最终结论（中断等）：标记部分完成 + 完整部分产出，让父 Agent 基于已有进展继续
        const { partial } = subStats()
        const out = `[子任务结果]（状态：部分完成，步骤数 ${steps}，无最终结论）\n部分产出：\n${partial || '（无）'}`
        endRecord(rt, record, 'error', out)
        return { content: out, isError: true }
      } catch (err) {
        // 子任务执行失败（模型 401/网络等）：返回原因 + 完整部分产出（诊断上下文，避免主 Agent 盲重试/编造）
        const { partial } = subStats()
        const out = `[子任务结果]（状态：失败：${(err as Error).message}）\n部分产出：\n${partial || '（无）'}`
        endRecord(rt, record, 'error', out)
        return { content: out, isError: true }
      } finally {
        subs.delete(abortChild)
        if (subs.size === 0) rt.activeSubruns.delete(rt.session.id)
      }
    } catch (err) {
      endRecord(rt, record, 'error', `ERROR: ${(err as Error).message}`)
      return { content: `Error: 子任务调度失败（${(err as Error).message}）`, isError: true }
    }
  },
}

const webSearchDef: ToolDef = {
  id: 'web_search',
  name: 'web_search',
  description:
    '搜索互联网并返回结果（标题、链接、摘要）。实现与失败分级说明见 builtinTools.ts。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索查询词' },
    },
    required: ['query'],
  },
  createExecute: (rt) => async (args) => {
    // web_search 的实现（DeepSeek 原生 + curl 兜底链）在 builtinTools.ts 的 builtinTools[0]，
    // 通过 onStart/onEnd hooks 接进本注册表的 record/事件/修剪管道——实现与装配解耦。
    const impl = webSearchBuiltins.find((b) => b.name === 'web_search')
    if (!impl) return { content: 'Error: web_search 实现未找到', isError: true }
    let current: ToolCallRecord | null = null
    const res = await impl.execute(args as never, {
      onStart: (record) => {
        current = record
        rt.segments.push({ kind: 'tool', call: record })
        rt.emit({ type: 'tool_call_start', sessionId: rt.session.id, call: record })
      },
      onEnd: (record) => {
        rt.executedToolCalls.push(record)
        rt.emit({ type: 'tool_call_end', sessionId: rt.session.id, call: record })
      },
    })
    return rt.toolResultForModel(res, current ?? undefined)
  },
}

const loadSkillDef: ToolDef = {
  id: 'load_skill',
  name: 'load_skill',
  description:
    '按名字加载一个技能的完整指令（懒加载）。目录只给了技能名和一句话描述，真正要照做时必须先加载全文。' +
    '只能加载当前 Agent 勾选启用的技能；未勾选或名字打错会返回错误原因。',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '技能名字（见目录，如"浏览器操作专家"）' },
    },
    required: ['name'],
  },
  // 条件装配：没勾任何技能就没有目录，load_skill 也无意义——别给模型一个用不上的工具
  when: (agent) => agent.skillIds.length > 0,
  createExecute: (rt) => async (args) => {
    const name = String((args as { name?: unknown }).name ?? '').trim()
    const record = startRecord(rt, 'load_skill', args)
    if (!name) {
      endRecord(rt, record, 'error', 'ERROR: name required')
      return { content: 'Error: name 参数必填（技能名字）', isError: true }
    }
    const res = loadSkillContent(rt.agent.skillIds, name)
    if (!res.ok) {
      endRecord(rt, record, 'error', `ERROR: ${res.reason}`)
      return { content: `Error: ${res.reason}`, isError: true }
    }
    const out = `## Skill: ${res.name}（id: ${res.id}）\n${res.whenToUse ? `(使用时机: ${res.whenToUse})\n` : ''}${res.content}`
    endRecord(rt, record, 'success', out)
    return rt.toolResultForModel({ content: out }, record)
  },
}

// ---------- 后台子代理控制工具族（continuable 通信） ----------

const sendMessageDef: ToolDef = {
  id: 'send_message',
  name: 'send_message',
  description:
    '与后台子代理双向通信：给子代理发消息（to: sub_xxx），或向父会话留言（to: parent，仅子代理可用）。' +
    '给空闲子代理发消息会启动它新一轮处理；给运行中的发消息则排队（当前轮结束后自动处理）。' +
    '留言给父：父的下一轮会自动看到你的留言与结果。',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: '目标：后台子代理 id（sub_xxx）或 parent（向父留言）' },
      content: { type: 'string', description: '消息内容（自包含：要对方做什么/要什么信息）' },
    },
    required: ['to', 'content'],
  },
  createExecute: (rt) => async (args) => {
    const to = String((args as { to?: unknown }).to ?? '').trim()
    const content = String((args as { content?: unknown }).content ?? '').trim()
    const record = startRecord(rt, 'send_message', args)
    try {
      if (!to || !content) {
        endRecord(rt, record, 'error', 'ERROR: to and content required')
        return { content: 'Error: to（目标 id）与 content（消息内容）都必填', isError: true }
      }
      // 子 → 父：当前会话是一个后台子代理的会话（session.id = sub_xxx）
      if (to === 'parent') {
        const self = findSubagentBySessionId(rt.session.id)
        if (!self) {
          endRecord(rt, record, 'error', 'ERROR: 只有后台子代理能留言给父')
          return { content: 'Error: 只有后台子代理（子代理会话里）能用 to=parent 留言给父', isError: true }
        }
        appendNotice(self.id, `[子代理 ${self.id} 留言] ${content}`)
        endRecord(rt, record, 'success', '已留言给父会话')
        return { content: '已留言给父会话（父的下一轮会看到）' }
      }
      // 父 → 子：投递到 inbox；空闲则启动新轮，运行中则排队
      const rec = getSubagent(to)
      if (!rec) {
        endRecord(rt, record, 'error', `ERROR: 未知子代理 ${to}`)
        return { content: `Error: 找不到子代理 ${to}（可用 list_agents 查看当前子代理）`, isError: true }
      }
      rec.inbox.push({ content, at: Date.now() })
      saveSubagent(rec)
      if (rec.status === 'idle') {
        void pumpSubagent(rt, rec.id)
        endRecord(rt, record, 'success', `已投递给子代理 ${to}（已启动新轮）`)
        return { content: `已投递给子代理 ${to}，它已启动新一轮处理` }
      }
      endRecord(rt, record, 'success', `已投递给子代理 ${to}（运行中，排队）`)
      return { content: `已投递给子代理 ${to}（它正在运行，消息已排队，当前轮结束后处理）` }
    } catch (err) {
      endRecord(rt, record, 'error', `ERROR: ${(err as Error).message}`)
      return { content: `Error: 消息投递失败（${(err as Error).message}）`, isError: true }
    }
  },
}

const listAgentsDef: ToolDef = {
  id: 'list_agents',
  name: 'list_agents',
  description:
    '列出当前会话派生的全部后台子代理（durable id、运行状态、任务、待处理消息数），用于了解还有谁在后台干活。',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  createExecute: (rt) => async () => {
    const record = startRecord(rt, 'list_agents', {})
    const subs = listSubagents(rt.session.id)
    if (subs.length === 0) {
      endRecord(rt, record, 'success', '无后台子代理')
      return { content: '当前会话没有派生的后台子代理。' }
    }
    const lines = subs.map((s) => {
      const state = s.status === 'running' ? '运行中' : '空闲'
      const inboxNote = s.inbox.length ? `，待处理消息 ${s.inbox.length} 条` : ''
      return `- ${s.id}（${state}${inboxNote}）任务：${s.task.slice(0, 80)}`
    })
    const out = `当前会话派生的后台子代理（${subs.length} 个）：\n${lines.join('\n')}`
    endRecord(rt, record, 'success', out)
    return { content: out }
  },
}

const interruptAgentDef: ToolDef = {
  id: 'interrupt_agent',
  name: 'interrupt_agent',
  description:
    '中断某个后台子代理的当前轮（stop 它的运行），但保留其注册表、消息历史与队列——之后还能 send_message 继续。',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要中断的后台子代理 id（sub_xxx）' },
    },
    required: ['id'],
  },
  createExecute: (rt) => async (args) => {
    const id = String((args as { id?: unknown }).id ?? '').trim()
    const record = startRecord(rt, 'interrupt_agent', args)
    if (!id) {
      endRecord(rt, record, 'error', 'ERROR: id required')
      return { content: 'Error: id 参数必填（子代理 id）', isError: true }
    }
    if (!interruptSubagent(id)) {
      endRecord(rt, record, 'error', `ERROR: 子代理 ${id} 不在运行`)
      return { content: `Error: 子代理 ${id} 当前不在运行（可能已空闲或不存在），无需中断`, isError: true }
    }
    endRecord(rt, record, 'success', `已请求中断 ${id}`)
    return { content: `已请求中断子代理 ${id}（当前轮停止，注册表与消息保留，之后可 send_message 继续）` }
  },
}

// 全部内置工具定义（Agent 配置页"内置工具"勾选的就是这些 id；未配置/空数组 = 全部启用）
export const builtinToolDefs: ToolDef[] = [runCommandDef, globDef, rememberDef, subagentDef, webSearchDef, loadSkillDef, sendMessageDef, listAgentsDef, interruptAgentDef]
// 是否应为该 agent 装配某内置工具（语义与 builtinTools.shouldRegisterBuiltin 一致，re-export 统一入口）
export { shouldRegisterBuiltin }

// ---------- 装配：把"内置 + MCP"统一注册成 AI SDK 工具对象 ----------

// 内置工具装配：按 Agent 勾选过滤 + 条件装配，生成 AI SDK tool
// 父子通信控制工具（始终装配，不参与勾选过滤）：
// agent 是否需要它们取决于"是否派生了后台子代理"（运行期动态），静态勾选表达不了；
// 且子代理随时可能留言给父（send_message to=parent），父没有它就无法应答。
const CONTROL_TOOLS = new Set(['send_message', 'list_agents', 'interrupt_agent'])

function registerBuiltin(agent: Agent, rt: ToolRuntime, tools: Record<string, unknown>) {
  for (const def of builtinToolDefs) {
    if (def.when && !def.when(agent)) continue
    if (!CONTROL_TOOLS.has(def.id) && !shouldRegisterBuiltin(agent.builtinTools, def.id)) continue
    tools[def.name] = tool({
      description: def.description,
      inputSchema: jsonSchema<Record<string, unknown>>(def.inputSchema as JSONSchema7),
      execute: def.createExecute(rt),
    })
  }
}

// MCP 工具装配：把 server 拉来的工具清单包上同一套 record/事件/修剪管道
function registerMcp(agent: Agent, rt: ToolRuntime, mcpTools: McpTool[], tools: Record<string, unknown>) {
  for (const t of mcpTools) {
    // 命名冲突保护：MCP 工具名若与内置工具撞名，以后者为准（内置优先，避免覆盖核心能力）
    if (builtinToolDefs.some((d) => d.name === t.name)) continue
    tools[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema<Record<string, unknown>>(t.inputSchema as JSONSchema7),
      execute: async (args) => {
        const record = startRecord(rt, t.name, args)
        try {
          const out = await callMcpTool(t.serverId, t.name, args, t.timeoutMs ?? 120000)
          endRecord(rt, record, 'success', out)
          return rt.toolResultForModel({ content: out }, record)
        } catch (err) {
          endRecord(rt, record, 'error', `ERROR: ${(err as Error).message}`)
          return { content: `Error: ${(err as Error).message}`, isError: true }
        }
      },
    })
  }
}

/**
 * 统一装配入口：内置工具（按勾选）+ MCP 工具（按 agent.mcpServerIds 已拉取好的清单）。
 * agentLoop 只调这一行；想加工具 = 往 builtinToolDefs 加定义 / 配一个 MCP server，
 * 主循环零改动。返回 AI SDK 的 tools 对象。
 */
export function assembleTools(
  agent: Agent,
  rt: ToolRuntime,
  mcpTools: McpTool[],
): Record<string, unknown> {
  const tools: Record<string, unknown> = {}
  registerBuiltin(agent, rt, tools)
  registerMcp(agent, rt, mcpTools, tools)
  return tools
}
