// 内置工具：web_search（在线搜索）
// 设计决策：通用网页搜索是 AI Agent 最常用的能力，避免让模型陷入
// "打开浏览器→点搜索→读快照"的重型工具循环（慢、贵、易失控）。
// 浏览器工具（playwright）保留，但仅限用户明确要求时使用（见 agentLoop 的约束提示词）。
//
// 搜索实现（借鉴 DSH 的 @deepseek-ai/dsh-web-search-deepseek 与官方 fetch MCP 的思路）：
//   主路径 —— DeepSeek 原生 web search（Anthropic Messages 兼容端点 + web_search_20250305
//   服务器工具）：官方检索、中英文质量均好、返回结构化结果（url/title/page_age + 引文摘要），
//   无需自建 HTML 解析。该工具仅 DeepSeek 官方端点提供，因此原生搜索必然绑定 DeepSeek：
//   key 优先级 NOVA_AGENT_SEARCH_API_KEY > 全局 key（项目外文件 > DEEPSEEK_API_KEY）。
//   —— 独立搜索 key 用于"聊天模型用其他 provider、搜索仍走 DeepSeek"的场景；
//   兜底 —— curl 抓取 百度（中文）/ DuckDuckGo Lite（英文）（无 DeepSeek key / 网络异常时）。
// 结果数量：统一截断到 NOVA_AGENT_WEB_SEARCH_MAX_RESULTS（默认 8，与 DSH 的默认一致）。
import type { ToolCallRecord } from './types.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveApiKey, resolveProviderKey } from './store.js'
const execFileAsync = promisify(execFile)

// curl 用系统 PATH 中的（Windows 10+ 自带）；如需自定义可用 NOVA_CURL_PATH 覆盖
const CURL_CANDIDATES = [process.env.NOVA_CURL_PATH, 'curl'].filter(Boolean) as string[]

// DeepSeek 原生搜索端点/模型/条数上限（均可被环境变量覆盖）
const DS_SEARCH_ENDPOINT = process.env.NOVA_AGENT_SEARCH_ENDPOINT ?? 'https://api.deepseek.com/anthropic/v1/messages'
const DS_SEARCH_MODEL = process.env.NOVA_AGENT_SEARCH_MODEL ?? 'deepseek-v4-flash'
const WEB_SEARCH_MAX_RESULTS = Math.max(1, Math.min(20, Number(process.env.NOVA_AGENT_WEB_SEARCH_MAX_RESULTS ?? 8)))

export interface BuiltinTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: Record<string, unknown>, hooks: {
    onStart: (record: ToolCallRecord) => void
    onEnd: (record: ToolCallRecord) => void
  }) => Promise<{ content: string; isError?: boolean }>
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

// ---------- 主源：DeepSeek 原生 web search（Anthropic Messages 协议） ----------

interface DsBlock {
  type?: string
  content?: unknown
  text?: string
  citations?: Array<{ url?: string; title?: string; cited_text?: string }>
}

function isSearchResultItem(v: unknown): v is { type: string; url: string; title: string; page_age?: string } {
  return (
    typeof v === 'object' && v !== null &&
    (v as { type?: unknown }).type === 'web_search_result' &&
    typeof (v as { url?: unknown }).url === 'string' &&
    typeof (v as { title?: unknown }).title === 'string'
  )
}

async function deepseekSearch(query: string): Promise<SearchResult[]> {
  // key 优先级：独立搜索 key > DeepSeek 渠道 key（模型渠道页）> 全局 key（旧数据兼容）
  const apiKey = process.env.NOVA_AGENT_SEARCH_API_KEY?.trim()
    || resolveProviderKey('deepseek')
    || resolveApiKey()
  if (!apiKey) throw new Error('未配置 DeepSeek API key（NOVA_AGENT_SEARCH_API_KEY 或「模型渠道」页的 DeepSeek key），无法使用原生搜索')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(DS_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        authorization: `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: DS_SEARCH_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: [{ type: 'text', text: `Perform a web search for the query: ${query}` }] }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`DeepSeek 搜索 HTTP ${res.status}`)
    const data = (await res.json()) as { content?: DsBlock[] }

    const results: SearchResult[] = []
    const citations: DsBlock['citations'] = []
    for (const block of data.content ?? []) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const item of block.content) {
          if (isSearchResultItem(item)) {
            results.push({
              title: item.title,
              url: item.url,
              snippet: item.page_age ? `（${item.page_age}）` : '',
            })
          }
        }
      } else if (block.type === 'text' && Array.isArray(block.citations)) {
        citations.push(...block.citations)
      }
    }
    // 用引文（cited_text）补充摘要，按 URL 匹配
    if (citations.length) {
      for (const r of results) {
        const c = citations.find((x) => x.url === r.url)
        if (c?.cited_text) {
          const text = c.cited_text.replace(/\s+/g, ' ').trim().slice(0, 200)
          r.snippet = r.snippet ? `${r.snippet} ${text}` : text
        }
      }
    }
    return results
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('DeepSeek 搜索超时（30s）')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 兜底：curl 抓取 360 / 百度 / DuckDuckGo Lite ----------

// 解析百度结果页（div.result.c-container：h3 > a 标题 + c-abstract 摘要）
// 百度对中文长查询的分词/匹配远好于 Bing（实测：Bing 只命中"2026年"，
// 百度完整命中"2026年8月16日 新游戏发售"）。故中文查询优先百度。
export function parseBaidu(html: string): SearchResult[] {
  const results: SearchResult[] = []
  // 定位所有结果块起点，按起点切块
  const starts: number[] = []
  const startRe = /<div[^>]*class="[^"]*result[^"]*c-container[^"]*"/gi
  let sm: RegExpExecArray | null
  while ((sm = startRe.exec(html)) !== null) starts.push(sm.index)
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : html.length
    const block = html.slice(starts[i], end)
    const titleM = /<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!titleM) continue
    const absM = /class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)
    results.push({
      url: titleM[1],
      title: stripTags(titleM[2]).trim(),
      snippet: absM ? stripTags(absM[1]).trim() : '',
    })
    if (results.length >= 10) break
  }
  return results
}


function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// 反爬拦截页检测：验证码/安全验证/访问异常页面
function isBlocked(html: string): boolean {
  if (html.length < 500) return true
  return /安全验证|访问异常|请输入验证码|captcha|verify/i.test(html)
}

// 解析 360 搜索（www.so.com）：h3 > a 标题（无摘要）。反爬宽松、中文质量与百度相当
export function parseSo360(html: string): SearchResult[] {
  const results: SearchResult[] = []
  const linkRe = /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const url = m[1]
    const title = stripTags(m[2]).trim()
    // 跳过广告与相关搜索：360 用 javascript:; 占位、相关搜索标题含"进一步探索"
    if (!title || url.startsWith('javascript:') || url.includes('/s?q=') || title.includes('进一步探索更多相关内容')) continue
    results.push({ url, title, snippet: '' })
    if (results.length >= 8) break
  }
  return results
}

// 兜底源：DuckDuckGo lite（英文查询主源；不稳定，仅百度无结果时兜底）
function parseDdgLite(html: string): SearchResult[] {
  const results: SearchResult[] = []
  const linkRe = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRe = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi
  const links: Array<{ url: string; title: string }> = []
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    links.push({ url: m[1], title: stripTags(m[2]).trim() })
  }
  const snippets: string[] = []
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(m[1]).trim())
  }
  links.forEach((l, i) => {
    results.push({ title: l.title, url: l.url, snippet: snippets[i] ?? '' })
  })
  return results
}

// curl 抓取链：中文 → 百度 → DDG；英文 → DDG → 百度。
// 代理由 curl 自行按标准环境变量（HTTPS_PROXY/HTTP_PROXY）处理；
// 瞬时失败（网络抖动/超时）自动整体重试 1 次——这是代码层兜底，不依赖模型判断。
async function fetchViaCurl(query: string): Promise<SearchResult[]> {
  const queryEnc = encodeURIComponent(query)
  async function fetchHtml(url: string, retry = true): Promise<string> {
    let lastErr = ''
    for (let attempt = 0; attempt <= (retry ? 1 : 0); attempt++) {
      for (const curl of CURL_CANDIDATES) {
        try {
          const { stdout } = await execFileAsync(curl, [
            '-s', '--max-time', '20', '--connect-timeout', '10',
            '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            '-H', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
            '-L', url,
          ], { maxBuffer: 2 * 1024 * 1024, windowsHide: true })
          if (stdout) return stdout
        } catch (err) {
          lastErr = (err as Error).message
        }
      }
      if (attempt === 0) {
        // 首轮全失败：短暂等待后重试（瞬时网络故障常见）
        await new Promise((r) => setTimeout(r, 800))
      }
    }
    throw new Error(lastErr || 'curl failed')
  }

  // 中文：360 搜索（主）→ 百度 → DDG；英文：DuckDuckGo → 360 → 百度。Bing 已移除。
  // 逐源尝试：页面被反爬拦截（验证码/安全验证）视为该源不可用；全部源都被挡或
  // 网络失败时抛"服务不可用"（区别于"真无结果"），让模型止损而不是反复换词重试。
  const hasCjk = /[\u4e00-\u9fff]/.test(query)
  const candidates: Array<{ url: string; parse: (h: string) => SearchResult[] }> = hasCjk
    ? [
        { url: `https://www.so.com/s?q=${queryEnc}`, parse: parseSo360 },
        { url: `https://www.baidu.com/s?wd=${queryEnc}`, parse: parseBaidu },
        { url: `https://lite.duckduckgo.com/lite/?q=${queryEnc}`, parse: parseDdgLite },
      ]
    : [
        { url: `https://lite.duckduckgo.com/lite/?q=${queryEnc}`, parse: parseDdgLite },
        { url: `https://www.so.com/s?q=${queryEnc}`, parse: parseSo360 },
        { url: `https://www.baidu.com/s?wd=${queryEnc}`, parse: parseBaidu },
      ]
  let pageOk = false // 至少一个源正常返回了页面（真无结果 vs 全被挡）
  for (const c of candidates) {
    try {
      const html = await fetchHtml(c.url)
      if (isBlocked(html)) continue
      pageOk = true
      const r = c.parse(html)
      if (r.length) return r
    } catch {
      continue // 该源网络失败，尝试下一个
    }
  }
  if (!pageOk) {
    throw new Error('搜索服务暂时不可用：所有搜索源均被限流或网络异常。可稍后再试，或在「模型渠道」页配置 DeepSeek API Key 启用官方搜索。')
  }
  return [] // 页面正常但无匹配结果 → 调用方返回"没有找到搜索结果"
}

export const builtinTools: BuiltinTool[] = [
  {
    name: 'web_search',
    description:
      `搜索互联网并返回前 ${WEB_SEARCH_MAX_RESULTS} 条结果（标题、链接、摘要）。适合查资讯、找资料、确认事实。` +
      '查询词应具体（如 "Steam 2026年8月16日 新发售游戏"），必要时分多次搜索不同关键词。' +
      '失败处理分级：① 返回 ERROR（网络问题）：用相同关键词重试 1 次即可（代码层已自动重试过一次）；' +
      '② 返回"没有找到搜索结果"：关键词太泛或有歧义，换成更具体的（加年份/平台/类型/地域限定），最多 2 次；' +
      '③ 结果与问题无关：换表述（同义词、加引号精确匹配、换语言），最多 1 次；' +
      '④ 以上仍失败：立即停止，告诉用户"搜索未能找到结果"，基于已知信息给出替代建议（相关网站/方法），禁止继续搜索。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询词' },
      },
      required: ['query'],
    },
    async execute(args, { onStart, onEnd }) {
      const query = String(args.query ?? '').trim()
      if (!query) return { content: 'Error: query required', isError: true }

      const record: ToolCallRecord = {
        id: `tool_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: 'web_search',
        input: { query },
        output: '',
        status: 'running',
        startedAt: Date.now(),
        durationMs: 0,
      }
      onStart(record)
      try {
        // 主源：DeepSeek 原生搜索；失败（无 key/网络/超时/无结果）时回退 curl 链
        let results: SearchResult[] = []
        try {
          results = await deepseekSearch(query)
        } catch {
          results = await fetchViaCurl(query)
        }
        if (!results.length) {
          record.output = '（没有找到结果，换关键词再试）'
          record.status = 'success'
          record.durationMs = Date.now() - record.startedAt
          onEnd(record)
          return { content: '没有找到搜索结果。建议换更具体的关键词再搜一次。' }
        }
        const out = results
          .slice(0, WEB_SEARCH_MAX_RESULTS)
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet || '（无摘要）'}`)
          .join('\n\n')
        record.output = out
        record.status = 'success'
        record.durationMs = Date.now() - record.startedAt
        onEnd(record)
        return { content: out }
      } catch (err) {
        record.output = `ERROR: ${(err as Error).message}`
        record.status = 'error'
        record.durationMs = Date.now() - record.startedAt
        onEnd(record)
        return { content: `搜索失败: ${(err as Error).message}`, isError: true }
      }
    },
  },
]
