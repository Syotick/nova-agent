// cron 解析器单元测试
import { describe, it, expect } from 'vitest'
import { parseCron, matches } from '../scheduler.js'

describe('parseCron', () => {
  it('接受标准 5 段表达式', () => {
    const fields = parseCron('*/5 * * * *')
    expect(fields).toHaveLength(5)
  })

  it('拒绝非法段数', () => {
    expect(() => parseCron('* * *')).toThrow(/5 fields/)
    expect(() => parseCron('')).toThrow(/5 fields/)
  })

  it('拒绝非法字段内容', () => {
    expect(() => parseCron('a b c d e')).toThrow(/invalid cron field/)
  })
})

describe('matches（每分钟 */5）', () => {
  const every5min = parseCron('*/5 * * * *')
  it('10:00 匹配', () => {
    expect(matches(every5min, new Date(2026, 7, 16, 10, 0))).toBe(true)
  })
  it('10:03 不匹配', () => {
    expect(matches(every5min, new Date(2026, 7, 16, 10, 3))).toBe(false)
  })
  it('10:05 匹配', () => {
    expect(matches(every5min, new Date(2026, 7, 16, 10, 5))).toBe(true)
  })
  it('10:59 不匹配', () => {
    expect(matches(every5min, new Date(2026, 7, 16, 10, 59))).toBe(false)
  })
})

describe('matches（每 5 小时 0 */5 * * *）', () => {
  const every5h = parseCron('0 */5 * * *')
  it('05:00 匹配', () => {
    expect(matches(every5h, new Date(2026, 7, 16, 5, 0))).toBe(true)
  })
  it('10:05 不匹配（分钟必须为 0）', () => {
    expect(matches(every5h, new Date(2026, 7, 16, 10, 5))).toBe(false)
  })
})

describe('matches（工作日 0 9 * * 1-5）', () => {
  const wkday = parseCron('0 9 * * 1-5')
  it('周一 9:00 匹配', () => {
    expect(matches(wkday, new Date(2026, 7, 17, 9, 0))).toBe(true)
  })
  it('周六 9:00 不匹配', () => {
    expect(matches(wkday, new Date(2026, 7, 22, 9, 0))).toBe(false)
  })
  it('周日 9:00 不匹配', () => {
    expect(matches(wkday, new Date(2026, 7, 23, 9, 0))).toBe(false)
  })
})

describe('matches（范围步进 0 8-18/3 * * *）', () => {
  const rangeStep = parseCron('0 8-18/3 * * *')
  it('08:00 匹配', () => {
    expect(matches(rangeStep, new Date(2026, 7, 16, 8, 0))).toBe(true)
  })
  it('09:00 不匹配', () => {
    expect(matches(rangeStep, new Date(2026, 7, 16, 9, 0))).toBe(false)
  })
  it('11:00 匹配', () => {
    expect(matches(rangeStep, new Date(2026, 7, 16, 11, 0))).toBe(true)
  })
})

describe('matches（每分钟 * * * * *）', () => {
  const star = parseCron('* * * * *')
  it('任意时间匹配', () => {
    expect(matches(star, new Date(2026, 7, 16, 11, 42))).toBe(true)
  })
})
