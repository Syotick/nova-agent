// 内置工具单元测试
import { describe, it, expect, vi, afterEach } from 'vitest'
import { builtinTools, parseBaidu, parseSo360 } from '../builtinTools.js'

describe('builtinTools 清单', () => {
  it('包含 web_search', () => {
    const names = builtinTools.map((t) => t.name)
    expect(names).toContain('web_search')
    expect(builtinTools).toHaveLength(1)
  })

  it('工具 schema 完整（query 必填）', () => {
    for (const t of builtinTools) {
      expect(t.inputSchema.type).toBe('object')
      expect((t.inputSchema.required as string[])).toContain('query')
      expect(t.description.length).toBeGreaterThan(10)
    }
  })
})

describe('web_search 参数校验', () => {
  it('空 query 返回错误', async () => {
    const ws = builtinTools.find((t) => t.name === 'web_search')!
    const r = await ws.execute({ query: '   ' }, { onStart: () => {}, onEnd: () => {} })
    expect(r.isError).toBe(true)
  })
})

describe('parseBaidu（百度结果解析）', () => {
  it('提取结果块标题/链接/摘要', () => {
    const html = `
      <div class="result c-container" id="1">
        <h3 class="t"><a href="https://www.example.com/game">2026年8月16日开服时间表：12个新区</a></h3>
        <div class="c-abstract">覆盖9款热门游戏，新区列表见内文</div>
      </div>
      <div class="result c-container" id="2">
        <h3 class="t"><a href="https://www.example.com/table">游戏发售表2026</a></h3>
      </div>
    `
    const r = parseBaidu(html)
    expect(r).toHaveLength(2)
    expect(r[0].title).toContain('开服时间表')
    expect(r[0].url).toBe('https://www.example.com/game')
    expect(r[0].snippet).toContain('覆盖9款热门游戏')
    expect(r[1].title).toContain('游戏发售表')
  })
})

describe('parseSo360（360 搜索解析）', () => {
  it('提取 h3 标题并过滤相关搜索', () => {
    const html = `
      <h3 class="res-title"><a href="javascript:;">注册即领大礼包-热门网页游戏首选</a></h3>
      <h3 class="res-title"><a href="https://www.so.com/link?m=abc">2025年7月游戏发售表_游侠网</a></h3>
      <h3><a href="https://www.so.com/s?q=related">关于xxx进一步探索更多相关内容</a></h3>
      <h3><a href="https://example.com/game">《曙光防御》7月11日正式发行_九游</a></h3>
    `
    const r = parseSo360(html)
    expect(r).toHaveLength(2)
    expect(r[0].title).toContain('游侠网')
    expect(r[1].title).toContain('曙光防御')
  })
})

describe('web_search 主路径（DeepSeek 原生搜索）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('解析 web_search_tool_result 并按上限截断结果', async () => {
    const ws = builtinTools.find((t) => t.name === 'web_search')!
    // 全局 key 已废弃：stub 独立搜索 key，确保走 DeepSeek 原生主路径（而非 curl 兜底）
    vi.stubEnv('NOVA_AGENT_SEARCH_API_KEY', 'sk-test')
    // 服务端返回 12 条，超过默认上限 8
    const items = Array.from({ length: 12 }, (_, i) => ({
      type: 'web_search_result',
      url: `https://example.com/${i}`,
      title: `测试结果 ${i}`,
      page_age: `${i}天前`,
    }))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [
          { type: 'web_search_tool_result', content: items },
          {
            type: 'text',
            text: '搜索完成',
            citations: [{ url: 'https://example.com/0', cited_text: '这是匹配的引文摘要' }],
          },
        ],
      }),
    })))

    const r = await ws.execute({ query: '测试查询' }, { onStart: () => {}, onEnd: () => {} })
    expect(r.isError).toBeFalsy()
    const numbered = r.content.split('\n\n').filter((line) => /^\d+\./.test(line))
    expect(numbered).toHaveLength(8)
    expect(r.content).toContain('测试结果 0')
    expect(r.content).toContain('https://example.com/0')
    // 引文摘要按 URL 匹配补入
    expect(r.content).toContain('这是匹配的引文摘要')
    // 超出上限的结果被截掉
    expect(r.content).not.toContain('example.com/11')
  })

  it('主路径失败时回退 curl 链（fetch 异常不抛给调用方）', async () => {
    const ws = builtinTools.find((t) => t.name === 'web_search')!
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    const r = await ws.execute({ query: '测试查询' }, { onStart: () => {}, onEnd: () => {} })
    // 不崩溃、不抛异常；fallback 结果可能为空（提示换关键词）或含内容（curl 成功）
    expect(typeof r.content).toBe('string')
    expect(r.content.length).toBeGreaterThan(0)
  }, 30_000) // 真实网络 fallback（360/百度/DDG），放宽超时

  it('key 优先级：NOVA_AGENT_SEARCH_API_KEY 优先于全局 key', async () => {
    vi.stubEnv('NOVA_AGENT_SEARCH_API_KEY', 'sk-search-independent')
    const ws = builtinTools.find((t) => t.name === 'web_search')!
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'web_search_tool_result',
            content: [{ type: 'web_search_result', url: 'https://example.com/a', title: '独立key测试' }],
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const r = await ws.execute({ query: '测试查询' }, { onStart: () => {}, onEnd: () => {} })
      expect(r.isError).toBeFalsy()
      expect(r.content).toContain('独立key测试')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
      expect(init.headers['x-api-key']).toBe('sk-search-independent')
      expect(init.headers['authorization']).toBe('Bearer sk-search-independent')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
