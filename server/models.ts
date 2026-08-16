// 模型注册表：多 provider 支持
// 配置在根目录 models.json（同 mcp-servers 风格，前端只读）+ 设置页自定义提供商（SQLite）
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { resolveApiKey, resolveProviderKey, listCustomProviders } from './store.js'
import type { Agent } from './types.js'

export interface ModelEntry {
  id: string
  name?: string
  /** 该模型支持的思考强度档位（reasoningEffort）。缺省/空 = 仅支持 thinking 开关（adaptive/off） */
  reasoningEfforts?: string[]
}

export interface ModelProvider {
  id: string
  name: string
  /** OpenAI 兼容 API 地址（留空则用 @ai-sdk/deepseek 官方客户端） */
  baseUrl?: string
  /** 该 provider 的 API key 环境变量名（留空则用全局外部 key） */
  apiKeyEnv?: string
  models: ModelEntry[]
}

const MODELS_PATH = join(process.cwd(), 'models.json')

// 自定义供应商的模型默认开放全部思考档位（未显式声明时）：
// 支持 reasoning_effort 的服务会生效，不支持的通常忽略该参数
const DEFAULT_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

let cached: ModelProvider[] | null = null
let cachedMtime = 0

function loadBuiltinProviders(): ModelProvider[] {
  let result: ModelProvider[] = []
  try {
    if (existsSync(MODELS_PATH)) {
      const raw = JSON.parse(readFileSync(MODELS_PATH, 'utf8'))
      const list = Array.isArray(raw) ? raw : raw.providers ?? []
      result = list.filter((p: ModelProvider) => p && p.id && Array.isArray(p.models) && p.models.length > 0)
    }
  } catch {
    // 配置损坏按空处理
  }
  return result
}

export function loadModelProviders(): ModelProvider[] {
  // mtime 感知缓存：models.json 文件一变就自动重载（改文件无需重启后端）
  const mtime = existsSync(MODELS_PATH) ? statSync(MODELS_PATH).mtimeMs : 0
  if (!cached || mtime !== cachedMtime) {
    // 内置（models.json）+ 自定义（设置页管理，追加在后）
    // 自定义供应商的模型未声明思考档位时补默认全档
    const builtin = loadBuiltinProviders()
    const custom = listCustomProviders().map((p) => ({
      ...p,
      models: p.models.map((m) => ({
        ...m,
        reasoningEfforts: m.reasoningEfforts ?? DEFAULT_REASONING_EFFORTS,
      })),
    }))
    cached = [...builtin, ...custom]
    cachedMtime = mtime
  }
  return cached
}

/** 设置页增删自定义提供商后调用，让注册表立即生效（不重启服务） */
export function invalidateModelProvidersCache() {
  cached = null
}

/** 完整目录（前端展示用，不含敏感字段） */
export function listModelCatalog() {
  return loadModelProviders().map((p) => ({
    id: p.id,
    name: p.name ?? p.id,
    baseUrl: p.baseUrl ?? '',
    models: p.models.map((m) => ({ id: m.id, name: m.name ?? m.id, reasoningEfforts: m.reasoningEfforts })),
  }))
}

export interface ResolvedModel {
  provider: ModelProvider
  modelId: string
}

/** 解析 Agent.model（格式 "providerId/modelId" 或向后兼容裸模型名 → 默认 provider） */
export function resolveModel(model: string): ResolvedModel | null {
  const providers = loadModelProviders()
  if (!providers.length) return null

  // 格式 1: "deepseek/deepseek-v4-flash"（显式指定 provider）
  const slashIdx = model.indexOf('/')
  if (slashIdx > 0) {
    const pid = model.slice(0, slashIdx)
    const mid = model.slice(slashIdx + 1)
    const provider = providers.find((p) => p.id === pid)
    // 显式指定的 provider/模型必须精确存在，否则返回 null（不做静默替换）
    if (provider && provider.models.some((m) => m.id === mid)) {
      return { provider, modelId: mid }
    }
    return null
  }
  // 格式 2: 裸模型名 → 在第一个 provider 里找
  for (const p of providers) {
    if (p.models.some((m) => m.id === model)) {
      return { provider: p, modelId: model }
    }
  }
  // 裸名无匹配：兜底第一个 provider 的第一个模型（保持向后兼容旧数据）
  return { provider: providers[0], modelId: providers[0].models[0].id }
}

/** 解析该 provider 的 API key，优先级：项目外文件专属 key > apiKeyEnv 环境变量 > 全局 key */
export function resolveModelApiKey(provider: ModelProvider, globalKey?: string): string | undefined {
  const fileKey = resolveProviderKey(provider.id)
  if (fileKey) return fileKey
  if (provider.apiKeyEnv && process.env[provider.apiKeyEnv]) {
    return process.env[provider.apiKeyEnv]
  }
  return globalKey
}

// 按模型标识创建模型实例（支持任意 OpenAI 兼容 provider）
export function createModel(model: string) {
  const resolved = resolveModel(model)
  if (!resolved) {
    // 有注册表但模型无效：显式报错（提示配置问题，不做静默替换）
    if (loadModelProviders().length) {
      throw new Error(`模型配置无效: "${model}" 不在 models.json 注册表中，请在 Agent 配置中重新选择模型`)
    }
    // 无 models.json 配置时退回 DeepSeek 默认
    return createDeepSeek({ apiKey: resolveApiKey() })(model)
  }
  const { provider, modelId } = resolved
  const apiKey = resolveModelApiKey(provider, resolveApiKey())

  // DeepSeek 官方客户端（自动处理 baseURL/模型路由）
  if (provider.id === 'deepseek') {
    // 无 key 提前给出可读错误（否则 AI SDK 只报隐晦的 "No output generated"）
    if (!apiKey) {
      throw new Error('API Key 未配置：请打开侧边栏「模型渠道」页填写 DeepSeek API Key 后再试')
    }
    return createDeepSeek({ apiKey })(modelId)
  }
  // 其他 OpenAI 兼容服务（Ollama/OpenAI/千问/Kimi/GLM/OpenRouter/火山方舟等）
  const baseURL = provider.baseUrl ?? 'http://localhost:11434/v1'
  return createOpenAICompatible({
    name: provider.id,
    baseURL,
    apiKey: apiKey ?? 'not-needed',
  })(modelId)
}

export function createModelForAgent(agent: Agent) {
  return createModel(agent.model)
}
