// 模型调用错误 → 用户可读的自然语言提示
// 后端报错是给开发者看的（可能含模型 ID / HTTP 状态码），这里按常见模式翻译成
// 用户看得懂的中文 + 行动指引。未匹配的模式保留原文（截断），保证不丢信息。

const RULES: Array<{ test: RegExp; hint: string }> = [
  // API Key 缺失 / 无效
  {
    test: /api\s*key|apikey|401|403|unauthorized|authentication|invalid.*credential|missing.*credential|invalid_api_key|auth/i,
    hint: 'API Key 无效或未配置：请打开侧边栏「模型渠道」页，检查该渠道的 key 是否已填写、是否有效（未配置的渠道会显示「未配置」标记）。',
  },
  // 网络 / 连接
  {
    test: /fetch failed|econnrefused|econnreset|enotfound|etimedout|network|socket hang up|connect\s+error|ECONN/i,
    hint: '网络连接失败：无法访问模型服务。请检查网络，以及「模型渠道」页里该渠道的服务地址（baseUrl）是否正确。',
  },
  // 模型不存在 / 下线
  {
    test: /model\s+(not\s+found|does\s+not\s+exist|not\s+available)|404|invalid\s+model|unknown\s+model|no\s+such\s+model/i,
    hint: '模型不存在或已下线：你选的模型 ID 可能已失效，请到「模型渠道」页更新该渠道的模型列表，或换一个模型。',
  },
  // 限流
  {
    test: /429|rate\s*limit|too\s+many\s+requests|throttled/i,
    hint: '请求太频繁被限流了：请稍等片刻再试。',
  },
  // 上下文超长
  {
    test: /context\s*(length|window)|max.*token|token\s*limit|prompt\s+is\s+too\s+long|exceeds?.*context/i,
    hint: '对话内容超出模型长度限制：可以压缩当前会话（对话上方的压缩按钮），或新开一个会话。',
  },
  // 余额 / 额度
  {
    test: /insufficient|balance|quota|exceeded.*(credit|limit)|余额|额度|欠费/i,
    hint: '账户余额或额度不足：请到对应模型平台的账户页充值或查看用量。',
  },
  // 模型没有任何输出（AI SDK 对 401/空响应的隐晦报错）
  {
    test: /no output generated|empty (stream|response)|no content/i,
    hint: '模型没有返回内容：通常是 API Key 无效/未配置，或账户余额不足。请到「模型渠道」页检查 key 配置，或稍后再试。',
  },
  // 不支持的协议（如模型只支持 Responses 协议）
  {
    test: /responses|unsupported|not\s+supported|bad\s+request|400/i,
    hint: '模型服务拒绝了请求：该渠道/模型可能不兼容当前调用方式（如仅支持 Responses 协议），或请求参数有误。',
  },
]

export function translateModelError(raw: string): string {
  const msg = (raw ?? '').trim()
  if (!msg) return ''
  for (const { test, hint } of RULES) {
    if (test.test(msg)) return hint
  }
  // 未识别：保留原文（截断 + 脱敏），至少用户知道发生了什么
  const safe = msg.length > 200 ? `${msg.slice(0, 200)}…` : msg
  return `模型调用失败：${safe}`
}
