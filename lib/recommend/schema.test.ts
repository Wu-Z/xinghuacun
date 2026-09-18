import { describe, expect, it } from 'vitest'
import { parseSkillOutput } from './schema'

const good = {
  query: {
    origin: { name: '厦门市集美区', city: '厦门' },
    destination: { mode: 'nearby', requested: null },
    preferences: { intents: ['拍照'], time_budget: '3小时', travel_mode: ['地铁'] },
  },
  recommendations: [
    {
      rank: 1,
      tier: '首选',
      name: '集美学村',
      category: '历史街区',
      address: '厦门市集美区集美学村',
      fit: [{ tag: '拍照', why: '红瓦飞檐与池面倒影' }],
      amap_url: 'https://uri.amap.com/search?keyword=x',
    },
  ],
  excluded: [{ name: '园博苑', reason: '人流多' }],
  meta: { assumptions: ['免费优先'], unverified: ['实时人流'] },
}

describe('parseSkillOutput', () => {
  it('合法输入通过', () => {
    const r = parseSkillOutput(good)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.recommendations).toHaveLength(1)
  })

  it('顶层不是对象时报错', () => {
    expect(parseSkillOutput([]).ok).toBe(false)
    expect(parseSkillOutput('字符串').ok).toBe(false)
    expect(parseSkillOutput(null).ok).toBe(false)
  })

  it('缺 recommendations 时报错', () => {
    const { recommendations, ...rest } = good
    const r = parseSkillOutput(rest)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.join()).toContain('recommendations')
  })

  it('recommendations 为空数组时报错 —— 没结果的推荐等于失败', () => {
    expect(parseSkillOutput({ ...good, recommendations: [] }).ok).toBe(false)
  })

  it('缺 name 时指出是哪一条', () => {
    const bad = { ...good, recommendations: [{ ...good.recommendations[0], name: undefined }] }
    const r = parseSkillOutput(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems[0]).toContain('#1')
  })

  it('缺 amap_url 时报错 —— 未核实时用户靠它跳高德', () => {
    const bad = { ...good, recommendations: [{ ...good.recommendations[0], amap_url: '' }] }
    const r = parseSkillOutput(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.join()).toContain('amap_url')
  })

  it('fit 里同一个 tag 出现两次时报错', () => {
    const bad = {
      ...good,
      recommendations: [
        {
          ...good.recommendations[0],
          fit: [
            { tag: '拍照', why: 'a' },
            { tag: '拍照', why: 'b' },
          ],
        },
      ],
    }
    const r = parseSkillOutput(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.join()).toContain('拍照')
  })

  it('fit 为空时报错', () => {
    const bad = { ...good, recommendations: [{ ...good.recommendations[0], fit: [] }] }
    expect(parseSkillOutput(bad).ok).toBe(false)
  })

  it('可选字段缺失不影响通过', () => {
    expect(parseSkillOutput(good).ok).toBe(true)
  })

  it('excluded / meta 缺失时补成空数组而不是报错', () => {
    const { excluded, meta, ...rest } = good
    const r = parseSkillOutput(rest)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.excluded).toEqual([])
      expect(r.value.meta.assumptions).toEqual([])
      expect(r.value.meta.unverified).toEqual([])
    }
  })

  it('字段名从 snake_case 映射到 camelCase', () => {
    const r = parseSkillOutput({
      ...good,
      recommendations: [
        {
          ...good.recommendations[0],
          crowd_level: 'low',
          best_time: '15:00-18:00',
          trade_off: '咖啡馆早关',
          pick_if: '想久坐',
          transit_hint: '地铁直达',
        },
      ],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const p = r.value.recommendations[0]
      expect(p.crowdLevel).toBe('low')
      expect(p.bestTime).toBe('15:00-18:00')
      expect(p.tradeOff).toBe('咖啡馆早关')
      expect(p.pickIf).toBe('想久坐')
      expect(p.transitHint).toBe('地铁直达')
    }
  })

  it('itinerary 全为空项时映射成 undefined 而不是空数组', () => {
    const r = parseSkillOutput({
      ...good,
      recommendations: [{ ...good.recommendations[0], itinerary: [{ time: '', action: '' }] }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.recommendations[0].itinerary).toBeUndefined()
  })

  it('rank 缺失时按顺序补位', () => {
    const r = parseSkillOutput({
      ...good,
      recommendations: [{ ...good.recommendations[0], rank: undefined }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.recommendations[0].rank).toBe(1)
  })
})
