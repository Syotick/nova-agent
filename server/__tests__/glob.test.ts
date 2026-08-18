import { describe, it, expect } from 'vitest'
import { globToRegExp } from '../glob.js'

describe('glob → 正则（globToRegExp）', () => {
  const re = (p: string) => globToRegExp(p)

  it('*：单段内匹配，不跨目录', () => {
    expect(re('*.ts').test('a.ts')).toBe(true)
    expect(re('*.ts').test('a/b.ts')).toBe(false)
    expect(re('src/*.js').test('src/a.js')).toBe(true)
    expect(re('src/*.js').test('src/a/b.js')).toBe(false)
  })

  it('**：跨任意层（含零层）', () => {
    expect(re('**/*.ts').test('a.ts')).toBe(true)
    expect(re('**/*.ts').test('src/a/b.ts')).toBe(true)
    expect(re('src/**/x.ts').test('src/x.ts')).toBe(true)
    expect(re('src/**/x.ts').test('src/a/b/x.ts')).toBe(true)
    expect(re('src/**/x.ts').test('lib/x.ts')).toBe(false)
  })

  it('?：单字符', () => {
    expect(re('a?.ts').test('ab.ts')).toBe(true)
    expect(re('a?.ts').test('a.ts')).toBe(false)
  })

  it('特殊字符正确转义', () => {
    expect(re('package.json').test('package.json')).toBe(true)
    expect(re('a+.ts').test('a+.ts')).toBe(true)
    expect(re('[x].ts').test('[x].ts')).toBe(true)
  })

  it('反斜杠路径写法被统一为 /（Windows 习惯）', () => {
    expect(globToRegExp('src\\**\\*.ts').test('src/a.ts')).toBe(true)
  })
})