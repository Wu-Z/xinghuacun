import { describe, expect, it } from 'vitest'
import { buildItinerary, type ItineraryInput } from './itinerary'

const ORIGIN = { name: '我家', point: { lng: 0, lat: 0 } }
const END = { name: '回家', point: { lng: 9, lat: 9 } }

function input(over: Partial<ItineraryInput> = {}): ItineraryInput {
  return {
    origin: ORIGIN,
    end: END,
    stops: [
      { id: 'a', name: '公园', point: { lng: 1, lat: 1 } },
      { id: 'b', name: '博物馆', point: { lng: 2, lat: 2 } },
    ],
    // origin→a, a→b, b→end
    legs: [
      { mode: 'driving', durationSeconds: 600, distanceMeters: 3000 },
      { mode: 'driving', durationSeconds: 300, distanceMeters: 1500 },
      { mode: 'driving', durationSeconds: 900, distanceMeters: 4000 },
    ],
    ...over,
  }
}

describe('buildItinerary', () => {
  it('地点顺序 = 起点 + 各站 + 终点', () => {
    const t = buildItinerary(input())
    expect(t.stops.map((s) => [s.kind, s.name])).toEqual([
      ['start', '我家'],
      ['stop', '公园'],
      ['stop', '博物馆'],
      ['end', '回家'],
    ])
  })

  it('段与点对应：每段标出从哪到哪', () => {
    const t = buildItinerary(input())
    expect(t.legs.map((l) => `${l.fromName}→${l.toName}`)).toEqual([
      '我家→公园',
      '公园→博物馆',
      '博物馆→回家',
    ])
  })

  it('没有终点时最后一段不存在', () => {
    const t = buildItinerary(
      input({
        end: null,
        legs: [
          { mode: 'driving', durationSeconds: 600, distanceMeters: 3000 },
          { mode: 'driving', durationSeconds: 300, distanceMeters: 1500 },
        ],
      }),
    )
    expect(t.stops.map((s) => s.kind)).toEqual(['start', 'stop', 'stop'])
    expect(t.legs.map((l) => `${l.fromName}→${l.toName}`)).toEqual(['我家→公园', '公园→博物馆'])
  })

  it('每段各自带自己的出行方式 —— 近的走路、远的坐地铁', () => {
    // 出行方式是逐段定的。汇总处若拿一种方式去说每一段，
    // 用户在时间轴上看到的方式就和数据对不上了
    const t = buildItinerary(
      input({
        legs: [
          { mode: 'walking', durationSeconds: 600, distanceMeters: 700 },
          { mode: 'transit', durationSeconds: 1200, distanceMeters: 8000 },
          { mode: 'walking', durationSeconds: 300, distanceMeters: 400 },
        ],
      }),
    )

    expect(t.legs.map((l) => l.mode)).toEqual(['walking', 'transit', 'walking'])
  })

  it('总耗时与总里程是各段之和', () => {
    const t = buildItinerary(input())
    expect(t.totalTravelMinutes).toBe(30) // 10 + 5 + 15
    expect(t.totalDistanceMeters).toBe(8500)
  })

  it('结果里没有任何时刻字段 —— 本版不排时间表', () => {
    const t = buildItinerary(input())
    expect(Object.keys(t).sort()).toEqual([
      'hasDegradedLeg',
      'legs',
      'stops',
      'totalDistanceMeters',
      'totalTravelMinutes',
    ])
    for (const s of t.stops) {
      expect(Object.keys(s).sort()).toEqual(['kind', 'name', 'point', 'stopId'])
    }
  })

  it('缺段数据时不崩，只是没有段可列', () => {
    const t = buildItinerary(input({ legs: [] }))
    expect(t.stops).toHaveLength(4)
    expect(t.legs).toHaveLength(0)
    expect(t.totalTravelMinutes).toBe(0)
    expect(t.totalDistanceMeters).toBe(0)
  })

  it('段数少于地点数时不崩（缺的那段不显示）', () => {
    const t = buildItinerary(
      input({ legs: [{ mode: 'driving', durationSeconds: 600, distanceMeters: 3000 }] }),
    )
    expect(t.legs).toHaveLength(1)
    expect(t.legs[0].toName).toBe('公园')
  })

  it('标记出降级的段', () => {
    const t = buildItinerary(
      input({
        legs: [
          { mode: 'walking', durationSeconds: 0, distanceMeters: 0, degraded: true },
          { mode: 'driving', durationSeconds: 300, distanceMeters: 1500 },
          { mode: 'driving', durationSeconds: 900, distanceMeters: 4000 },
        ],
      }),
    )
    expect(t.legs[0].degraded).toBe(true)
    expect(t.hasDegradedLeg).toBe(true)
  })

  it('站点带得住对应的推荐 id，供界面回查', () => {
    const t = buildItinerary(input())
    expect(t.stops[1].stopId).toBe('a')
    expect(t.stops[0].stopId).toBeNull()
    expect(t.stops[3].stopId).toBeNull()
  })

  it('不改动入参', () => {
    const stops = [{ id: 'a', name: '公园', point: { lng: 1, lat: 1 } }]
    const snapshot = JSON.stringify(stops)
    buildItinerary(
      input({ stops, legs: [{ mode: 'driving', durationSeconds: 600, distanceMeters: 3000 }] }),
    )
    expect(JSON.stringify(stops)).toBe(snapshot)
  })
})
