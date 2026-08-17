import { describe, it, expect } from 'vitest'
import { join, dirname, isAbsolute } from 'node:path'
import { resolveWorkspace, resolveMcpArgs, validateWorkspaceRaw } from '../workspace.js'

const cwd = process.cwd()
const isWin = process.platform === 'win32'

describe('工作区解析', () => {
  it('resolveWorkspace：空/未配置 → 项目根/workspace（兜底）', () => {
    expect(resolveWorkspace(null)).toBe(join(cwd, 'workspace'))
    expect(resolveWorkspace('')).toBe(resolveWorkspace(null))
    expect(resolveWorkspace('   ')).toBe(resolveWorkspace(null))
  })

  it('resolveWorkspace：相对路径按项目根解析', () => {
    expect(resolveWorkspace('my-folder')).toBe(join(cwd, 'my-folder'))
    expect(resolveWorkspace('./sub')).toBe(join(cwd, 'sub'))
  })

  it('resolveWorkspace：绝对路径保留（仅规范化）', () => {
    // 平台各自构造一个绝对路径：win 用盘符路径，unix 用根路径
    const absInput = isWin ? 'D:/some/abs/dir' : '/some/abs/dir'
    const abs = resolveWorkspace(absInput)
    expect(isAbsolute(abs)).toBe(true)
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
    expect(resolved[1]).toBe(join(resolveWorkspace(null), 'uploads'))
    expect(resolved[2]).toBe(join(cwd, 'config.json'))
    expect(resolved[3]).toBe('--flag')
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
    const absInput = isWin ? 'D:/some/abs/dir' : '/some/abs/dir'
    expect(validateWorkspaceRaw(absInput)).toBeNull()
  })

  it('拒绝项目根（含大小写变体绕过）', () => {
    expect(validateWorkspaceRaw('./')).not.toBeNull()
    expect(validateWorkspaceRaw(cwd)).not.toBeNull()
    // 盘符大小写变体：仅 Windows 有盘符概念
    if (isWin) {
      const lowerVariant = cwd.replace(/^[A-Z]:/, (m) => m.toLowerCase())
      expect(validateWorkspaceRaw(lowerVariant)).not.toBeNull()
    }
  })

  it('拒绝项目上级目录（API key 文件所在区域）及其祖先', () => {
    // 任何平台：项目直接上级 = 密钥文件所在目录，必须拒绝
    expect(validateWorkspaceRaw('..')).not.toBeNull()
    // 更深祖先的边界含义依赖平台布局（Windows 上密钥在项目上级；unix 同理），两平台都验证
    expect(validateWorkspaceRaw('../..')).not.toBeNull()
    // Windows 反斜杠写法仅在 Windows 有效
    if (isWin) {
      expect(validateWorkspaceRaw('..\\..')).not.toBeNull()
    }
  })

  it('拒绝 NUL 与超长路径', () => {
    expect(validateWorkspaceRaw('a\u0000b')).not.toBeNull()
    expect(validateWorkspaceRaw('x'.repeat(1025))).not.toBeNull()
  })
})