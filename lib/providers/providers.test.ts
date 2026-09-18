import { describe, expect, it } from 'vitest'
import { mockPoiProvider, mockPoisAround } from './poi/mock'
import { mockRouteProvider } from './route/mock'

const ORIGIN = { lng: 116.4, lat: 39.9 }

describe('mock POI provider', () => {
  it('同一出发点每次生成完全一样的结果', () => {
    expect(mockPoisAround(ORIGIN, 12)).toEqual(mockPoisAround(ORIGIN, 12))
  })

  it('生成数量与请求一致', () => {
    expect(mockPoisAround(ORIGIN, 24)).toHaveLength(24)
  })

  it('每个 POI 的 distanceMeters 与坐标自洽', () => {
    for (const p of mockPoisAround(ORIGIN, 24)) {
      expect(p.distanceMeters).toBeGreaterThan(0)
      expect(Number.isFinite(p.point.lng)).toBe(true)
      expect(Number.isFinite(p.point.lat)).toBe(true)
    }
  })

  it('字段齐全，符合 Poi 契约', () => {
    for (const p of mockPoisAround(ORIGIN, 24)) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.category).toBe('string')
      expect(['open', 'closed', 'unknown']).toContain(p.openStatus)
    }
  })

  it('同时产出 open / closed / unknown 三种营业状态，好验证过滤逻辑', () => {
    const statuses = new Set(mockPoisAround(ORIGIN, 24).map((p) => p.openStatus))
    expect(statuses).toContain('open')
    expect(statuses).toContain('closed')
    expect(statuses).toContain('unknown')
  })

  it('searchNearby 按 limit 截断且不超过半径', async () => {
    const out = await mockPoiProvider.searchNearby({
      origin: ORIGIN,
      radiusMeters: 3000,
      mode: 'driving',
      limit: 6,
    })
    expect(out).toHaveLength(6)
    for (const p of out) expect(p.distanceMeters).toBeLessThanOrEqual(3000)
  })

  it('getDetail 命中已生成的 id，未知 id 返回 null', async () => {
    const known = mockPoisAround(ORIGIN, 5)[0]
    expect((await mockPoiProvider.getDetail(known.id))?.id).toBe(known.id)
    expect(await mockPoiProvider.getDetail('不存在')).toBeNull()
  })

  it('reverseGeocode 返回模糊到街区级的 label 与城市名', async () => {
    const r = await mockPoiProvider.reverseGeocode(ORIGIN)
    expect(r.label.length).toBeGreaterThan(0)
    expect(r.city.length).toBeGreaterThan(0)
    // 不允许带门牌号
    expect(r.label).not.toMatch(/\d+\s*号/)
  })
})

describe('mock Route provider', () => {
  const stops = [
    { id: 'a', point: { lng: 116.41, lat: 39.9 } },
    { id: 'b', point: { lng: 116.42, lat: 39.9 } },
  ]

  it('按传入顺序生成段，fromIndex 起点为 -1', async () => {
    const route = await mockRouteProvider.planRoute({ origin: ORIGIN, stops, mode: 'driving' })
    expect(route.order).toEqual(['a', 'b'])
    expect(route.legs).toHaveLength(2)
    expect(route.legs[0].fromIndex).toBe(-1)
    expect(route.legs[0].toIndex).toBe(0)
    expect(route.legs[1].fromIndex).toBe(0)
    expect(route.legs[1].toIndex).toBe(1)
  })

  it('总时长与总距离等于各段之和', async () => {
    const route = await mockRouteProvider.planRoute({ origin: ORIGIN, stops, mode: 'driving' })
    const dur = route.legs.reduce((a, l) => a + l.durationSeconds, 0)
    const dist = route.legs.reduce((a, l) => a + l.distanceMeters, 0)
    expect(route.totalDurationSeconds).toBe(dur)
    expect(route.totalDistanceMeters).toBe(dist)
  })

  it('折线点数不少于停靠点数', async () => {
    const route = await mockRouteProvider.planRoute({ origin: ORIGIN, stops, mode: 'walking' })
    expect(route.polyline.length).toBeGreaterThanOrEqual(stops.length)
  })

  it('少于 2 个停靠点也能返回，不抛错', async () => {
    const route = await mockRouteProvider.planRoute({
      origin: ORIGIN,
      stops: [stops[0]],
      mode: 'driving',
    })
    expect(route.legs).toHaveLength(1)
  })
})
