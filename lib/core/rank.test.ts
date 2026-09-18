import { describe, expect, it } from 'vitest'
import type { OpenStatus, Poi } from './model'
import { rankPois } from './rank'

function poi(over: Partial<Poi> & { id: string }): Poi {
  return {
    name: over.id,
    category: '公园',
    categoryRaw: '风景名胜;公园广场;公园',
    point: { lng: 116.4, lat: 39.9 },
    distanceMeters: 1000,
    address: '示例路 1 号',
    openStatus: 'open' as OpenStatus,
    ...over,
  }
}

const OPTS = { radiusMeters: 10000 }

describe('rankPois', () => {
  it('已关闭的 POI 被硬过滤掉', () => {
    const out = rankPois([poi({ id: 'a' }), poi({ id: 'b', openStatus: 'closed' })], OPTS)
    expect(out.map((p) => p.id)).toEqual(['a'])
  })

  it('其他条件相同时近的排前面', () => {
    const out = rankPois(
      [poi({ id: 'far', distanceMeters: 8000 }), poi({ id: 'near', distanceMeters: 500 })],
      OPTS,
    )
    expect(out[0].id).toBe('near')
  })

  it('营业中的排在营业状态未知的前面', () => {
    const out = rankPois(
      [
        poi({ id: 'unknown', openStatus: 'unknown', distanceMeters: 500 }),
        poi({ id: 'open', openStatus: 'open', distanceMeters: 500 }),
      ],
      OPTS,
    )
    expect(out[0].id).toBe('open')
  })

  it('同类别第 3 张会被压到其他类别后面', () => {
    const list = [
      poi({ id: 'park1', category: '公园', distanceMeters: 100 }),
      poi({ id: 'park2', category: '公园', distanceMeters: 110 }),
      poi({ id: 'park3', category: '公园', distanceMeters: 120 }),
      poi({ id: 'museum1', category: '博物馆', distanceMeters: 300 }),
    ]
    const out = rankPois(list, OPTS)
    // museum1 距离更远但类别未满，应当挤到 park3 前面
    expect(out.map((p) => p.id)).toEqual(['park1', 'park2', 'museum1', 'park3'])
  })

  it('每个结果都带上 score 与 scoreParts 便于调参', () => {
    const out = rankPois([poi({ id: 'a' })], OPTS)
    expect(out[0].score).toBeGreaterThan(0)
    expect(Object.keys(out[0].scoreParts ?? {}).sort()).toEqual([
      'distance',
      'openStatus',
      'popularity',
    ])
  })

  it('不改动入参数组与对象', () => {
    const input = [poi({ id: 'a' }), poi({ id: 'b' })]
    const snapshot = JSON.stringify(input)
    rankPois(input, OPTS)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('全部没有评分时不炸，热度取中性值', () => {
    const out = rankPois([poi({ id: 'a' }), poi({ id: 'b', distanceMeters: 2000 })], OPTS)
    expect(out).toHaveLength(2)
    expect(out[0].scoreParts?.popularity).toBe(0.5)
  })

  it('超出半径的 POI 距离分被夹到 0 而不是负数', () => {
    const out = rankPois([poi({ id: 'a', distanceMeters: 20000 })], OPTS)
    expect(out[0].scoreParts?.distance).toBe(0)
  })
})
