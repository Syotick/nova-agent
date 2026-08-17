import { describe, it, expect } from 'vitest'
import { resolveWorkspace, resolveMcpArgs, validateWorkspaceRaw } from '../workspace.js'

const cwd = process.cwd()

describe('工作区解析', () => {
  it('resolveWorkspace：空/未配置 → 项目根/workspace（兜底）', () => {
    expect(resolveWorkspace(null)).toBe(`${cwd}\\workspace` || `${cwd}/workspace`)
    expect(resolveWorkspace('')).toBe(resolveWorkspace(null))
    expect(resolveWorkspace('   ')).toBe(resolveWorkspace(null))
  })

  it('resolveWorkspace：相对路径按项目根解析', () => {
    const r = resolveWorkspace('my-folder')
    expect(r).toBe(`${cwd}\\my-folder` || `${cwd}/my-folder`)
    expect(resolveWorkspace('./sub')).toBe(`${cwd}\\sub` || `${cwd}/sub`)
  })

  it('resolveWorkspace：绝对路径原样保留（仅规范化分隔符）', () => {
    const abs = resolveWorkspace('D:/some/abs/dir')
    expect(abs.startsWith('D:')).toBe(true)
    expect(abs).toContain('some')
    expect(abs).toContain('abs')
    expect(abs).toContain('dir')
    expect(abs).not.toContain('workspace')
  })

  it('resolveMcpArgs：{{workspace}} 占位符替换为当前工作区绝对路径', () => {
    const resolved = resolveMcpArgs(['node', 'x.js', '{{workspace}}'])
    expect(resolved[2]).toBe(resolveWorkspace(null))
    expect(resolved[0]).toBe('node')
    expect(resolved[1]).toBe('x.js')
  })

  it('resolveMcpArgs：可嵌参数中间 + ./ 相对路径解析 + 普通参数不变（分隔符被规范化）', () => {
    const resolved = resolveMcpArgs(['-p', '{{workspace}}/uploads', './config.json', '--flag'])
    expect(resolved[1]).toBe(`${resolveWorkspace(null)}\\uploads` || `${resolveWorkspace(null)}/uploads`)
    expect(resolved[2]).toBe(`${cwd}\\config.json` || `${cwd}/config.json`)
    expect(resolved[3]).toBe('--flag')
    // 占位符拼接产生的混合分隔符被 normalize 为单一风格
    expect(resolved[1]).not.toContain('workspace/')
  })

  it('resolveMcpArgs：无占位符/相对路径时原样返回', () => {
    expect(resolveMcpArgs(['-y', '@playwright/mcp'])).toEqual(['-y', '@playwright/mcp'])
  })
})

describe('工作区校验（validateWorkspaceRaw）', () => {
  it('空串合法（重置语义）', () => {
    expect(validateWorkspaceRaw('')).toBeNull()
    expect(validateWorkspaceRaw('   ')).toBeNull()
  })

  it('正常相对/绝对路径合法', () => {
    expect(validateWorkspaceRaw('my-workspace')).toBeNull()
    expect(validateWorkspaceRaw('D:/some/abs/dir')).toBeNull()
  })

  it('拒绝项目根（含大小写变体绕过）', () => {
    expect(validateWorkspaceRaw('./')).not.toBeNull()
    expect(validateWorkspaceRaw(cwd)).not.toBeNull()
    // 小写盘符/大小写混写：解析后与项目根同一目录，必须拒绝
    const lowerVariant = cwd.replace(/^[A-Z]:/, (m) => m.toLowerCase())
    expect(validateWorkspaceRaw(lowerVariant)).not.toBeNull()
  })

  it('拒绝项目上级目录（API key 文件所在区域）及其祖先', () => {
    expect(validateWorkspaceRaw('..')).not.toBeNull()
    expect(validateWorkspaceRaw('../..')).not.toBeNull()
    expect(validateWorkspaceRaw('..\\..')).not.toBeNull()
  })

  it('拒绝 NUL 与超长路径', () => {
    expect(validateWorkspaceRaw('a\u0000b')).not.toBeNull()
    expect(validateWorkspaceRaw('x'.repeat(1025))).not.toBeNull()
  })
})