import { describe, expect, it } from 'vitest'
import { legSummary, summarizeModes } from './format'

describe('legSummary · 一段怎么走', () => {
  it('正常段给方式 + 时长 + 里程', () => {
    expect(
      legSummary({ mode: 'walking', durationSeconds: 480, distanceMeters: 600 }),
    ).toBe('步行 8 分钟 · 600 米')
  })

  it('降级段只给方式与直线估算的里程，**不出现时长**', () => {
    const text = legSummary({
      mode: 'bicycling',
      durationSeconds: 600,
      distanceMeters: 1900,
      degraded: true,
    })

    expect(text).toBe('骑行 · 直线估算 · 约 1.9 公里')
    // 时长是拿直线距离估出来的，印上去等于把估算说成了实测
    expect(text).not.toContain('分钟')
  })

  it('降级段也不装成 0 —— 「0 分钟 0.0 公里」曾经就是这么冒出来的', () => {
    const text = legSummary({
      mode: 'driving',
      durationSeconds: 0,
      distanceMeters: 0,
      degraded: true,
    })

    expect(text).toContain('直线估算')
    expect(text).not.toContain('0 分钟')
  })
})

describe('summarizeModes · 一条路线混用几种方式', () => {
  it('单一方式就是一个词', () => {
    expect(summarizeModes([{ mode: 'walking' }, { mode: 'walking' }])).toBe('步行')
  })

  it('混用时都写出来，不挑一个代表 —— 挑一个就跟逐段的显示对不上', () => {
    expect(summarizeModes([{ mode: 'walking' }, { mode: 'transit' }, { mode: 'walking' }])).toBe(
      '步行 + 公交/地铁',
    )
  })
})
