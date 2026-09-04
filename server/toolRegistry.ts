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

const subagentDef: ToolDef = {
  id: 'subagent',
  name: 'subagent',
  description:
    '派生一个子 Agent 独立执行子任务（并行调研/独立验证/耗时任务），完成后返回其最终结论。' +
    '适合：多个方向并行探索、独立审查、把大任务拆成小任务。task 必须是自包含的描述（目标+约束+交付格式）。' +
    '失败处理：子任务返回 ERROR 时——有明确原因就修正 task 后重试最多 1 次；有部分产出就基于部分产出继续；不可恢复就停止并告知用户，禁止编造子任务结果。',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '子任务描述（自包含：目标 + 约束 + 交付格式）' },
      model: { type: 'string', description: '可选：子 Agent 模型（provider/model），默认继承当前 Agent' },
    },
    required: ['task'],
  },
  createExecute: (rt) => async (args) => {
    const task = String((args as { task?: unknown }).task ?? '').trim()
    const modelOverride = String((args as { model?: unknown }).model ?? '').trim() || undefined
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

      // 子任务：内存临时会话（不入库），完整独立 loop，静默执行（no-op emit）
      const subSession: Session = {
        id: newId('sub'),
        agentId: rt.agent.id,
        title: `[子任务] ${task.slice(0, 30)}`,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const subAgent = modelOverride ? { ...rt.agent, model: modelOverride } : rt.agent

      // 中断传播：主 turn 中断时连带 abort 子任务（防幽灵执行）
      const subs = rt.activeSubruns.get(rt.session.id) ?? new Set<() => void>()
      rt.activeSubruns.set(rt.session.id, subs)
      const abortChild = () => rt.abortRun(subSession.id)
      subs.add(abortChild)

      const partialOf = () => {
        const last = [...subSession.messages].reverse().find((m) => m.role === 'assistant')
        return last?.content?.trim() ? last.content.slice(0, 500) : ''
      }
      try {
        const msg = await rt.runSubagent(subSession, subAgent, task, () => {}, undefined, undefined, rt.depth + 1)
        if (msg.content) {
          endRecord(rt, record, 'success', msg.content)
          return rt.toolResultForModel({ content: msg.content }, record)
        }
        // 子任务未产出内容（中断等）：附上部分产出，让主 Agent 判断
        const partial = partialOf()
        const out = `Error: 子任务未产出内容${partial ? `。部分产出：${partial}` : ''}`
        endRecord(rt, record, 'error', out)
        return { content: out, isError: true }
      } catch (err) {
        // 子任务执行失败（模型 401/网络等）：返回原因 + 部分产出（诊断上下文，避免主 Agent 盲重试/编造）
        const partial = partialOf()
        const out = `Error: 子任务失败（${(err as Error).message}）${partial ? `。部分产出：${partial}` : ''}`
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

// 全部内置工具定义（Agent 配置页"内置工具"勾选的就是这些 id；未配置/空数组 = 全部启用）
export const builtinToolDefs: ToolDef[] = [runCommandDef, globDef, rememberDef, subagentDef, webSearchDef]
// 是否应为该 agent 装配某内置工具（语义与 builtinTools.shouldRegisterBuiltin 一致，re-export 统一入口）
export { shouldRegisterBuiltin }

// ---------- 装配：把"内置 + MCP"统一注册成 AI SDK 工具对象 ----------

// 内置工具装配：按 Agent 勾选过滤，生成 AI SDK tool
function registerBuiltin(agent: Agent, rt: ToolRuntime, tools: Record<string, unknown>) {
  for (const def of builtinToolDefs) {
    if (!shouldRegisterBuiltin(agent.builtinTools, def.id)) continue
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
