import { describe, expect, it } from 'vitest'
import type { TravelMode } from '@/lib/core/model'
import { mockRouteProvider } from './route/mock'

const ORIGIN = { lng: 116.4, lat: 39.9 }

const stops = [
  { id: 'a', point: { lng: 116.41, lat: 39.9 } },
  { id: 'b', point: { lng: 116.42, lat: 39.9 } },
]

/** 两段都是驾车 */
const DRIVING: TravelMode[][] = [['driving'], ['driving']]

describe('mock Route provider', () => {
  it('按传入顺序生成段，fromIndex 起点为 -1', async () => {
    const route = await mockRouteProvider.planRoute({
      origin: ORIGIN,
      stops,
      legModes: DRIVING,
    })
    expect(route.order).toEqual(['a', 'b'])
    expect(route.legs).toHaveLength(2)
    expect(route.legs[0].fromIndex).toBe(-1)
    expect(route.legs[0].toIndex).toBe(0)
    expect(route.legs[1].fromIndex).toBe(0)
    expect(route.legs[1].toIndex).toBe(1)
  })

  it('总时长与总距离等于各段之和', async () => {
    const route = await mockRouteProvider.planRoute({
      origin: ORIGIN,
      stops,
      legModes: DRIVING,
    })
    const dur = route.legs.reduce((a, l) => a + l.durationSeconds, 0)
    const dist = route.legs.reduce((a, l) => a + l.distanceMeters, 0)
    expect(route.totalDurationSeconds).toBe(dur)
    expect(route.totalDistanceMeters).toBe(dist)
  })

  it('折线点数不少于停靠点数', async () => {
    const route = await mockRouteProvider.planRoute({
      origin: ORIGIN,
      stops,
      legModes: [['walking'], ['walking']],
    })
    expect(route.polyline.length).toBeGreaterThanOrEqual(stops.length)
  })

  it('少于 2 个停靠点也能返回，不抛错', async () => {
    const route = await mockRouteProvider.planRoute({
      origin: ORIGIN,
      stops: [stops[0]],
      legModes: [['driving']],
    })
    expect(route.legs).toHaveLength(1)
  })

  it('每一段用自己那一种方式，一条路线可以混用', async () => {
    // 本地 mock 也要逐段定方式，否则跑出来的界面和真实的不一样，
    // 混用时的排版问题在本地根本看不见
    const route = await mockRouteProvider.planRoute({
      origin: ORIGIN,
      stops,
      legModes: [['walking'], ['driving']],
    })

    expect(route.legs.map((l) => l.mode)).toEqual(['walking', 'driving'])
    // 方式真的生效了：同样距离，走路那段耗时该比驾车那段长得多
    expect(route.legs[0].distanceMeters).toBe(route.legs[1].distanceMeters)
    expect(route.legs[0].durationSeconds).toBeGreaterThan(route.legs[1].durationSeconds)
  })

  it('某段没有候选方式时直接报错，不编一个默认方式顶上', async () => {
    await expect(
      mockRouteProvider.planRoute({ origin: ORIGIN, stops, legModes: [[]] }),
    ).rejects.toThrow(/没有候选/)
  })
})
