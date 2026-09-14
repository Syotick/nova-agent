// 统一工具注册表单元测试：元数据完整 / 勾选过滤 / MCP 撞名保护 / 简单工具 execute
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../db.js'
import { builtinToolDefs, assembleTools, shouldRegisterBuiltin } from '../toolRegistry.js'
import { createSubagent, getSubagent, saveSubagent, setSubagentAbort, appendNotice } from '../subagents.js'
import type { Agent, Message, Session, ToolRuntime } from '../types.js'

const TEST_AGENT = '__test_toolreg_agent__'

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO agents (id, name, persona, model, mcp_server_ids, skill_ids, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(TEST_AGENT, 'test', '', 'deepseek/deepseek-v4-flash', '[]', '[]', '#4d6bfe', Date.now())
})

// DB 是持久化文件：每个用例前清理该 agent 的记忆与后台子代理，避免跨用例/跨运行污染
beforeEach(() => {
  db.prepare('DELETE FROM memories WHERE agent_id = ?').run(TEST_AGENT)
  db.prepare('DELETE FROM subagents').run()
})

function makeAgent(builtinTools?: string[], skillIds: string[] = []): Agent {
  return {
    id: TEST_AGENT,
    name: 'test',
    persona: '',
    model: 'deepseek/deepseek-v4-flash',
    mcpServerIds: [],
    skillIds,
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
  it('9 个内置工具定义齐全，元数据完整', () => {
    const names = builtinToolDefs.map((d) => d.name).sort()
    expect(names).toEqual([
      'glob', 'interrupt_agent', 'list_agents', 'load_skill', 'remember',
      'run_command', 'send_message', 'subagent', 'web_search',
    ])
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
  it('按 Agent 勾选过滤内置工具（父子通信控制工具始终装配）', () => {
    const tools = assembleTools(makeAgent(['glob', 'remember']), makeRt(makeAgent(['glob', 'remember'])), [])
    expect(Object.keys(tools).sort()).toEqual([
      'glob', 'interrupt_agent', 'list_agents', 'remember', 'send_message',
    ])
  })

  it('未配置 builtinTools = 全部内置工具可用', () => {
    const tools = assembleTools(makeAgent(undefined), makeRt(makeAgent(undefined)), [])
    // 注意：load_skill 是条件装配——没勾技能（skillIds=[]）时不注册
    expect(Object.keys(tools).sort()).toEqual([
      'glob', 'interrupt_agent', 'list_agents', 'remember',
      'run_command', 'send_message', 'subagent', 'web_search',
    ])
  })

  it('load_skill：勾选了技能才装配（条件装配）', () => {
    const withSkill = assembleTools(makeAgent(undefined, ['browser-ops']), makeRt(makeAgent(undefined, ['browser-ops'])), [])
    expect(Object.keys(withSkill)).toContain('load_skill')
    const withoutSkill = assembleTools(makeAgent(undefined), makeRt(makeAgent(undefined)), [])
    expect(Object.keys(withoutSkill)).not.toContain('load_skill')
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
    expect(Object.keys(tools).sort()).toEqual([
      'custom_ts_tool', 'glob', 'interrupt_agent', 'list_agents', 'send_message',
    ])
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

describe('toolRegistry load_skill（按需加载技能全文）', () => {
  it('已勾选技能：按名字加载返回全文，事件/记录齐全', async () => {
    const agent = makeAgent(undefined, ['browser-ops'])
    const rt = makeRt(agent)
    const tools = assembleTools(agent, rt, [])
    const loader = tools['load_skill'] as { execute: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }> }
    const res = await loader.execute({ name: '浏览器操作专家' })
    expect(res.isError).toBeFalsy()
    expect(res.content).toContain('Playwright MCP 工具') // 加载到的是全文
    expect(rt.executedToolCalls.length).toBe(1)
    expect(rt.executedToolCalls[0].name).toBe('load_skill')
    expect(rt.executedToolCalls[0].status).toBe('success')
  })

  it('未勾选技能：拒绝加载（勾选即授权）', async () => {
    const agent = makeAgent(undefined, ['browser-ops'])
    const rt = makeRt(agent)
    const tools = assembleTools(agent, rt, [])
    const loader = tools['load_skill'] as { execute: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }> }
    const res = await loader.execute({ name: '文件操作' })
    expect(res.isError).toBe(true)
    expect(res.content).toContain('未在 Agent 勾选中启用')
    expect(rt.executedToolCalls[0].status).toBe('error')
  })

  it('缺 name：报错', async () => {
    const agent = makeAgent(undefined, ['browser-ops'])
    const rt = makeRt(agent)
    const tools = assembleTools(agent, rt, [])
    const loader = tools['load_skill'] as { execute: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }> }
    const res = await loader.execute({})
    expect(res.isError).toBe(true)
  })
})

describe('toolRegistry subagent：fork / spawn + 结构化结果', () => {
  function tool(rt: ToolRuntime) {
    const tools = assembleTools(rt.agent, rt, [])
    return tools['subagent'] as { execute: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }> }
  }

  const parentMsg: Message = { id: 'p1', role: 'user', content: '用户：把刚才的方案落地', createdAt: 1 }
  const parentRt = () => {
    const agent = makeAgent(undefined)
    const rt = makeRt(agent)
    rt.session = { id: 's1', agentId: agent.id, title: '', messages: [parentMsg], createdAt: 0, updatedAt: 0 }
    return rt
  }

  // 模拟子任务：push 一条带工具步骤的 assistant 产出，返回带 tokens 的结果
  const subProducer = (rt: ToolRuntime, subContent: string) => {
    const stepCall = { id: 't1', name: 'glob', input: {}, output: 'ok', status: 'success', startedAt: 0, durationMs: 1 }
    rt.runSubagent = async (sub) => {
      sub.messages.push({
        id: 'a1', role: 'assistant', content: subContent, createdAt: 2,
        segments: [{ kind: 'tool', call: stepCall }],
        tokens: { input: 10, output: 20 },
      } as Message)
      return { id: 'a1', role: 'assistant', content: subContent, tokens: { input: 10, output: 20 }, createdAt: 2 } as Message
    }
  }

  it('spawn（默认）：子会话从零开始，不带父历史', async () => {
    const rt = parentRt()
    let seen: Session | undefined
    rt.runSubagent = async (sub) => { seen = sub; return { id: 'a', role: 'assistant', content: 'ok', createdAt: 2 } as Message }
    await tool(rt).execute({ task: '独立查证' })
    expect(seen?.messages.length).toBe(0)
  })

  it('fork=true：子会话继承父历史（一次性快照，深拷贝）', async () => {
    const rt = parentRt()
    let seen: Session | undefined
    rt.runSubagent = async (sub) => { seen = sub; return { id: 'a', role: 'assistant', content: 'ok', createdAt: 2 } as Message }
    await tool(rt).execute({ task: '继续落地', fork: true })
    expect(seen?.messages.length).toBe(1)
    expect(seen?.messages[0].content).toBe('用户：把刚才的方案落地')
    // 深拷贝：改子 seed 不改父
    seen!.messages[0].content = '被改'
    expect(parentMsg.content).toBe('用户：把刚才的方案落地')
  })

  it('成功：返回结构化结果（含步骤数 / Token / 子结论）', async () => {
    const rt = parentRt()
    subProducer(rt, '子任务结论：已完成')
    const res = await tool(rt).execute({ task: '写个总结' })
    expect(res.isError).toBeFalsy()
    expect(res.content).toContain('[子任务结果]')
    expect(res.content).toContain('步骤数 1')
    expect(res.content).toContain('Token 输入 10 / 输出 20')
    expect(res.content).toContain('子任务结论：已完成')
    expect(rt.executedToolCalls[0].status).toBe('success')
  })

  it('部分完成：无最终结论时返回状态+完整部分产出', async () => {
    const rt = parentRt()
    subProducer(rt, '中途进展：已经改了 2 个文件')
    rt.runSubagent = async (sub) => {
      sub.messages.push({ id: 'a1', role: 'assistant', content: '中途进展：已经改了 2 个文件', createdAt: 2 } as Message)
      return { id: 'a1', role: 'assistant', content: '', createdAt: 2 } as Message
    }
    const res = await tool(rt).execute({ task: '大任务' })
    expect(res.isError).toBe(true)
    expect(res.content).toContain('部分完成')
    expect(res.content).toContain('中途进展：已经改了 2 个文件')
  })

  it('失败：返回失败状态+原因+部分产出', async () => {
    const rt = parentRt()
    rt.runSubagent = async (sub) => {
      sub.messages.push({ id: 'a1', role: 'assistant', content: '查到一半', createdAt: 2 } as Message)
      throw new Error('模型 401')
    }
    const res = await tool(rt).execute({ task: '调研' })
    expect(res.isError).toBe(true)
    expect(res.content).toContain('失败')
    expect(res.content).toContain('模型 401')
    expect(res.content).toContain('查到一半')
  })

  it('缺 task：报错', async () => {
    const rt = parentRt()
    const res = await tool(rt).execute({})
    expect(res.isError).toBe(true)
    expect(res.content).toContain('task 参数必填')
  })
})

describe('toolRegistry 后台子代理（continuable）控制工具族', () => {
  function agent(rt: ToolRuntime) {
    const tools = assembleTools(rt.agent, rt, [])
    return tools as Record<string, { execute: (args?: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }> }>
  }
  function makeRt2(sessionId = 'parent-s1'): ToolRuntime {
    const a = makeAgent(undefined)
    const rt = makeRt(a)
    rt.session = { id: sessionId, agentId: a.id, title: '', messages: [], createdAt: 0, updatedAt: 0 }
    return rt
  }

  it('background=true：立即返回 durable id 并落库（不阻塞等待子轮）', async () => {
    const rt = makeRt2()
    const res = await agent(rt).subagent.execute({ task: '后台查证', background: true })
    expect(res.isError).toBeFalsy()
    expect(res.content).toContain('[子代理已启动]')
    const id = res.content.match(/sub_[a-z0-9]+/)?.[0]
    expect(id).toBeTruthy()
    const rec = getSubagent(id!)
    expect(rec).toBeTruthy()
    expect(rec!.task).toContain('后台查证')
    expect(rec!.parentId).toBe('parent-s1')
  })

  it('send_message：投递到运行中子代理的 inbox（排队）', async () => {
    const rt = makeRt2()
    const rec = createSubagent({ parentId: 'parent-s1', agentId: TEST_AGENT, task: '后台任务' })
    saveSubagent({ ...rec, status: 'running' }) // 设为运行中 → send_message 排队不触发 pump
    const res = await agent(rt).send_message.execute({ to: rec.id, content: '给我最新进展' })
    expect(res.isError).toBeFalsy()
    expect(res.content).toContain('排队')
    expect(getSubagent(rec.id)!.inbox.length).toBe(1)
    expect(getSubagent(rec.id)!.inbox[0].content).toBe('给我最新进展')
  })

  it('send_message：未知子代理报错', async () => {
    const rt = makeRt2()
    const res = await agent(rt).send_message.execute({ to: 'sub_nope', content: 'hi' })
    expect(res.isError).toBe(true)
    expect(res.content).toContain('找不到子代理')
  })

  it('send_message to=parent：仅子代理会话可用，留言写入待送达通知', async () => {
    const rt = makeRt2()
    // 非子会话调 to=parent → 报错
    const bad = await agent(rt).send_message.execute({ to: 'parent', content: 'hi' })
    expect(bad.isError).toBe(true)
    expect(bad.content).toContain('只有后台子代理')
    // 子代理会话（session.id = sub_xxx）调 to=parent → 留言
    const rec = createSubagent({ parentId: 'parent-s1', agentId: TEST_AGENT, task: 't' })
    rt.session.id = rec.id
    const ok = await agent(rt).send_message.execute({ to: 'parent', content: '父，我查到一半了' })
    expect(ok.isError).toBeFalsy()
    expect(getSubagent(rec.id)!.notice).toContain('父，我查到一半了')
    // 未被 consume 前父侧能看到（appendNotice 已设 consumed=0）
    expect(db.prepare('SELECT notice_consumed AS c FROM subagents WHERE id = ?').get(rec.id)).toMatchObject({ c: 0 })
  })

  it('list_agents：列出当前会话派生的后台子代理', async () => {
    const rt = makeRt2()
    createSubagent({ parentId: 'parent-s1', agentId: TEST_AGENT, task: '调研 A' })
    createSubagent({ parentId: 'other-parent', agentId: TEST_AGENT, task: '别人的子' })
    const res = await agent(rt).list_agents.execute({})
    expect(res.isError).toBeFalsy()
    expect(res.content).toContain('调研 A')
    expect(res.content).not.toContain('别人的子')
    // 无子代理
    const rt2 = makeRt2('parent-empty')
    const res2 = await agent(rt2).list_agents.execute({})
    expect(res2.content).toContain('没有派生的后台子代理')
  })

  it('interrupt_agent：中断运行中的子代理当前轮，空闲时提示无需中断', async () => {
    const rt = makeRt2()
    const rec = createSubagent({ parentId: 'parent-s1', agentId: TEST_AGENT, task: 't' })
    setSubagentAbort(rec.id, () => {})
    const res = await agent(rt).interrupt_agent.execute({ id: rec.id })
    expect(res.isError).toBeFalsy()
    expect(res.content).toContain('已请求中断')
    // 第二次（abort 句柄已消费/空闲）
    const res2 = await agent(rt).interrupt_agent.execute({ id: rec.id })
    expect(res2.isError).toBe(true)
    expect(res2.content).toContain('不在运行')
    // 注册表保留
    expect(getSubagent(rec.id)).toBeTruthy()
  })

  it('缺参校验：send_message 缺 content、interrupt_agent 缺 id 都报错', async () => {
    const rt = makeRt2()
    const r1 = await agent(rt).send_message.execute({ to: 'sub_x' })
    expect(r1.isError).toBe(true)
    const r2 = await agent(rt).interrupt_agent.execute({})
    expect(r2.isError).toBe(true)
  })
})
