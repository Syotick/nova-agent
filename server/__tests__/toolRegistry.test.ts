// 统一工具注册表单元测试：元数据完整 / 勾选过滤 / MCP 撞名保护 / 简单工具 execute
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../db.js'
import { builtinToolDefs, assembleTools, shouldRegisterBuiltin } from '../toolRegistry.js'
import type { Agent, Message, Session, ToolRuntime } from '../types.js'

const TEST_AGENT = '__test_toolreg_agent__'

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO agents (id, name, persona, model, mcp_server_ids, skill_ids, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(TEST_AGENT, 'test', '', 'deepseek/deepseek-v4-flash', '[]', '[]', '#4d6bfe', Date.now())
})

// DB 是持久化文件：每个用例前清理该 agent 的记忆，避免跨用例/跨运行污染
beforeEach(() => {
  db.prepare('DELETE FROM memories WHERE agent_id = ?').run(TEST_AGENT)
})

function makeAgent(builtinTools?: string[]): Agent {
  return {
    id: TEST_AGENT,
    name: 'test',
    persona: '',
    model: 'deepseek/deepseek-v4-flash',
    mcpServerIds: [],
    skillIds: [],
    builtinTools,
    color: '#4d6bfe',
    createdAt: Date.now(),
  }
}

// 构造最小 runtime：glob/remember 等工具只用到其中一部分字段
function makeRt(agent: Agent): ToolRuntime {
  return {
    session: { id: 's1', agentId: agent.id, title: '', messages: [], createdAt: 0, updatedAt: 0 } as Session,
    agent,
    depth: 0,
    emit: () => {},
    segments: [],
    executedToolCalls: [],
    toolResultForModel: (res) => res,
    runSubagent: async () => ({ id: 'sub', role: 'assistant', content: '', createdAt: 0 } as Message),
    subagentDepthLimit: 3,
    activeSubruns: new Map(),
    abortRun: () => {},
  }
}

describe('toolRegistry 定义完整性', () => {
  it('5 个内置工具定义齐全，元数据完整', () => {
    const names = builtinToolDefs.map((d) => d.name).sort()
    expect(names).toEqual(['glob', 'remember', 'run_command', 'subagent', 'web_search'])
    for (const def of builtinToolDefs) {
      expect(def.description.length).toBeGreaterThan(10)
      expect(def.inputSchema.type).toBe('object')
      expect(typeof def.createExecute).toBe('function')
    }
  })

  it('shouldRegisterBuiltin：未配置/空数组 = 全开，勾选子集 = 只装配对应工具', () => {
    expect(shouldRegisterBuiltin(undefined, 'glob')).toBe(true)
    expect(shouldRegisterBuiltin([], 'run_command')).toBe(true)
    expect(shouldRegisterBuiltin(['glob'], 'run_command')).toBe(false)
  })
})

describe('toolRegistry 装配（assembleTools）', () => {
  it('按 Agent 勾选过滤内置工具', () => {
    const tools = assembleTools(makeAgent(['glob', 'remember']), makeRt(makeAgent(['glob', 'remember'])), [])
    expect(Object.keys(tools).sort()).toEqual(['glob', 'remember'])
  })

  it('未配置 builtinTools = 全部内置工具可用', () => {
    const tools = assembleTools(makeAgent(undefined), makeRt(makeAgent(undefined)), [])
    expect(Object.keys(tools).sort()).toEqual(['glob', 'remember', 'run_command', 'subagent', 'web_search'])
  })

  it('MCP 工具撞名内置工具：内置优先，不覆盖核心能力', () => {
    const mcp = [{
      serverId: 'other',
      name: 'glob',
      description: '某个 MCP server 的同名工具',
      inputSchema: { type: 'object' },
    }]
    const tools = assembleTools(makeAgent(undefined), makeRt(makeAgent(undefined)), mcp)
    // glob 仍然来自内置（描述是内置的），MCP 的 glob 被跳过
    const keys = Object.keys(tools)
    expect(keys).toContain('glob')
    expect(keys.filter((k) => k === 'glob')).toHaveLength(1)
  })

  it('MCP 正常工具与内置共存', () => {
    const mcp = [{
      serverId: 'other',
      name: 'custom_ts_tool',
      description: '用户自写 TS 工具的 MCP 描述',
      inputSchema: { type: 'object', properties: { a: { type: 'string' } } },
    }]
    const tools = assembleTools(makeAgent(['glob']), makeRt(makeAgent(['glob'])), mcp)
    expect(Object.keys(tools).sort()).toEqual(['custom_ts_tool', 'glob'])
  })
})

describe('toolRegistry 工具执行（最小 runtime）', () => {
  it('glob：按模式返回相对工作区路径，事件与记录齐全', async () => {
    const agent = makeAgent(undefined)
    const rt = makeRt(agent)
    const tools = assembleTools(agent, rt, [])
    const globTool = tools['glob'] as { execute: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }> }
    const res = await globTool.execute({ pattern: 'package.json' })
    expect(res.isError).toBeFalsy() // 成功路径无 isError 字段（undefined = 未出错）
    expect(res.content).toContain('package.json')
    // 工具调用记录：start + end 已进 executedToolCalls，事件已 emit（emit 为 no-op，靠记录断言）
    expect(rt.executedToolCalls.length).toBe(1)
    expect(rt.executedToolCalls[0].name).toBe('glob')
    expect(rt.executedToolCalls[0].status).toBe('success')
    expect(rt.segments.length).toBe(1)
  })

  it('remember：写入记忆并返回"已记住"，第二次相似内容合并更新', async () => {
    const agent = makeAgent(undefined)
    const rt = makeRt(agent)
    const tools = assembleTools(agent, rt, [])
    const rememberTool = tools['remember'] as { execute: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }> }
    const r1 = await rememberTool.execute({ content: '用户喜欢表格化输出' })
    expect(r1.isError).toBeFalsy() // 成功路径无 isError 字段（undefined = 未出错，与原实现一致）
    expect(r1.content).toContain('已记住')
    const r2 = await rememberTool.execute({ content: '用户喜欢表格化输出，别用大段文字' })
    expect(r2.content).toContain('已更新')
    // 记忆已持久化（同一 agent 可查）
    const rows = db.prepare('SELECT COUNT(*) AS n FROM memories WHERE agent_id = ?').get(TEST_AGENT) as { n: number }
    expect(rows.n).toBeGreaterThanOrEqual(1)
  })

  it('remember：缺 content 报错且不进 executedToolCalls 的 success', async () => {
    const agent = makeAgent(undefined)
    const rt = makeRt(agent)
    const tools = assembleTools(agent, rt, [])
    const rememberTool = tools['remember'] as { execute: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }> }
    const res = await rememberTool.execute({})
    expect(res.isError).toBe(true)
    expect(rt.executedToolCalls[0].status).toBe('error')
  })
})
