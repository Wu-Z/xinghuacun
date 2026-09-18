import { describe, expect, it } from 'vitest'
import { mockRouteProvider } from './route/mock'

const ORIGIN = { lng: 116.4, lat: 39.9 }

const stops = [
  { id: 'a', point: { lng: 116.41, lat: 39.9 } },
  { id: 'b', point: { lng: 116.42, lat: 39.9 } },
]

describe('mock Route provider', () => {
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
