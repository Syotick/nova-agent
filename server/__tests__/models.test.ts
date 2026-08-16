// 模型注册表单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveModel, resolveModelApiKey, loadModelProviders } from '../models.js'
import { readFileSync, existsSync } from 'node:fs'

// 打桩 models.json 内容
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn((p: string) => (String(p).endsWith('models.json') ? true : actual.existsSync(p))),
    readFileSync: vi.fn((p: string) => {
      if (String(p).endsWith('models.json')) {
        return JSON.stringify([
          {
            id: 'deepseek',
            name: 'DeepSeek',
            baseUrl: 'https://api.deepseek.com',
            apiKeyEnv: 'DEEPSEEK_API_KEY',
            models: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }],
          },
          {
            id: 'ollama',
            name: 'Ollama',
            baseUrl: 'http://localhost:11434/v1',
            models: [{ id: 'llama3.1' }],
          },
        ])
      }
      return actual.readFileSync(p)
    }),
  }
})

// 打桩外部 key 文件读取：仅 qwen 渠道存在项目外专属 key；自定义提供商返回空（隔离真实 SQLite）
vi.mock('../store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store.js')>()
  return {
    ...actual,
    resolveProviderKey: vi.fn((providerId: string) => (providerId === 'qwen' ? 'file-key' : undefined)),
    listCustomProviders: vi.fn(() => []),
  }
})

// 重置缓存，保证每个用例重新加载
beforeEach(() => {
  vi.resetModules()
})

describe('loadModelProviders', () => {
  it('加载 models.json 并过滤空配置', () => {
    const providers = loadModelProviders()
    expect(providers).toHaveLength(2)
    expect(providers[0].id).toBe('deepseek')
  })
})

describe('resolveModel', () => {
  it('解析 "provider/model" 格式', () => {
    const r = resolveModel('deepseek/deepseek-v4-pro')
    expect(r?.provider.id).toBe('deepseek')
    expect(r?.modelId).toBe('deepseek-v4-pro')
  })

  it('解析裸模型名（向后兼容）→ 找到包含它的 provider', () => {
    const r = resolveModel('llama3.1')
    expect(r?.provider.id).toBe('ollama')
    expect(r?.modelId).toBe('llama3.1')
  })

  it('provider 存在但模型不在表内 → 返回 null（不做静默替换）', () => {
    const r = resolveModel('deepseek/not-exist')
    expect(r).toBeNull()
  })

  it('完全未知模型 → 兜底第一个 provider 的第一个模型', () => {
    const r = resolveModel('totally-unknown-model')
    expect(r?.provider.id).toBe('deepseek')
    expect(r?.modelId).toBe('deepseek-v4-flash')
  })
})

describe('resolveModelApiKey', () => {
  it('provider.apiKeyEnv 优先于全局 key', () => {
    const provider = { id: 'deepseek', name: 'D', apiKeyEnv: 'DEEPSEEK_API_KEY', models: [] }
    const old = process.env.DEEPSEEK_API_KEY
    process.env.DEEPSEEK_API_KEY = 'provider-key'
    expect(resolveModelApiKey(provider, 'global-key')).toBe('provider-key')
    if (old === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = old
  })

  it('无 apiKeyEnv 时回退全局 key', () => {
    const provider = { id: 'ollama', name: 'O', models: [] }
    expect(resolveModelApiKey(provider, 'global-key')).toBe('global-key')
  })

  it('项目外文件专属 key 优先于 apiKeyEnv 环境变量（多渠道设置页配置）', () => {
    const provider = { id: 'qwen', name: 'Q', apiKeyEnv: 'QWEN_API_KEY', models: [] }
    process.env.QWEN_API_KEY = 'env-key'
    expect(resolveModelApiKey(provider, 'global-key')).toBe('file-key')
    delete process.env.QWEN_API_KEY
  })
})
