import { describe, expect, it } from 'vitest'
import { parseOpenStatus } from './open-hours'

const at = (h: number, m = 0) => new Date(2026, 8, 18, h, m)

describe('parseOpenStatus', () => {
  it('字段缺失给 unknown，不给 closed', () => {
    expect(parseOpenStatus(undefined, at(10))).toBe('unknown')
    expect(parseOpenStatus('', at(10))).toBe('unknown')
  })

  it('识别不出来给 unknown', () => {
    expect(parseOpenStatus('详情咨询商家', at(10))).toBe('unknown')
  })

  it('在营业时段内给 open', () => {
    expect(parseOpenStatus('09:00-17:00', at(10))).toBe('open')
  })

  it('在营业时段外给 closed', () => {
    expect(parseOpenStatus('09:00-17:00', at(20))).toBe('closed')
  })

  it('边界：开始时刻算 open，结束时刻算 closed', () => {
    expect(parseOpenStatus('09:00-17:00', at(9))).toBe('open')
    expect(parseOpenStatus('09:00-17:00', at(17))).toBe('closed')
  })

  it('24 小时营业给 open', () => {
    expect(parseOpenStatus('24小时营业', at(3))).toBe('open')
  })

  it('跨夜时段在凌晨算 open', () => {
    expect(parseOpenStatus('20:00-02:00', at(1))).toBe('open')
    expect(parseOpenStatus('20:00-02:00', at(15))).toBe('closed')
  })

  it('多个时段用分号分隔，命中任一即 open', () => {
    expect(parseOpenStatus('09:00-12:00;14:00-18:00', at(15))).toBe('open')
    expect(parseOpenStatus('09:00-12:00;14:00-18:00', at(13))).toBe('closed')
  })

  // 以下三条来自真实高德返回：这些字段不保证是字符串
  it('营业时间是数组时取第一个', () => {
    expect(parseOpenStatus(['09:00-17:00'], at(10))).toBe('open')
  })

  it('营业时间是空数组（高德用 [] 表示没值）时给 unknown', () => {
    expect(parseOpenStatus([], at(10))).toBe('unknown')
  })

  it('营业时间不是字符串时不抛错，给 unknown', () => {
    expect(parseOpenStatus(123, at(10))).toBe('unknown')
    expect(parseOpenStatus({}, at(10))).toBe('unknown')
    expect(parseOpenStatus([[]], at(10))).toBe('unknown')
  })
})
