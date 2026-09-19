import type { LatLng, TravelMode } from './model'

export type ItineraryStopKind = 'start' | 'stop' | 'end'

export type ItineraryStop = {
  kind: ItineraryStopKind
  name: string
  point: LatLng
  /** 站点对应的推荐条目；起点与终点为 null */
  stopId: string | null
}

export type ItineraryLeg = {
  /** 这一段从哪到哪。索引对应点列表 [origin, ...stops, end?] */
  fromName: string
  toName: string
  /** 这一段怎么走。每条段各自一种 —— 近的走路、远的坐地铁是同一条路线的常态 */
  mode: TravelMode
  durationSeconds: number
  distanceMeters: number
  /** 该段规划失败、已降级为直线 —— 时长与里程因此不可靠 */
  degraded: boolean
}

export type Itinerary = {
  stops: ItineraryStop[]
  legs: ItineraryLeg[]
  totalTravelMinutes: number
  totalDistanceMeters: number
  hasDegradedLeg: boolean
}

export type ItineraryInput = {
  origin: { name: string; point: LatLng }
  /** 终点。null 表示不去别处（末站即结束） */
  end: { name: string; point: LatLng } | null
  /** 按拜访顺序排列的站点 */
  stops: { id: string; name: string; point: LatLng }[]
  /** 按顺序的段：origin→stops[0]、stops[0]→stops[1]、…、stops[n-1]→end */
  legs: {
    mode: TravelMode
    durationSeconds: number
    distanceMeters: number
    degraded?: boolean
  }[]
}

/**
 * 把「高德算出的各段行程」拼成一条出行时间轴。
 *
 * **本版刻意不涉及时间**：不算「几点到」、也不算「每站待多久」。
 * 一是「建议游玩时间」这个数据源已去掉；二是即便有它，缺了真实营业与用餐时间，
 * 排出来的绝对时刻也只是看着精确的假象。
 *
 * 所以这条时间轴给出的都是**能确证的东西**：去哪几个地方、按什么顺序、
 * 每段怎么走、多久、多远。
 *
 * 纯函数，无副作用。
 */
export function buildItinerary(input: ItineraryInput): Itinerary {
  const stops: ItineraryStop[] = [
    { kind: 'start', name: input.origin.name, point: input.origin.point, stopId: null },
  ]

  for (const s of input.stops) {
    stops.push({ kind: 'stop', name: s.name, point: s.point, stopId: s.id })
  }

  if (input.end) {
    stops.push({ kind: 'end', name: input.end.name, point: input.end.point, stopId: null })
  }

  // 段与点一一对应：第 i 段是 points[i] → points[i+1]
  const legs: ItineraryLeg[] = input.legs.map((l, i) => ({
    fromName: stops[i]?.name ?? '',
    toName: stops[i + 1]?.name ?? '',
    mode: l.mode,
    durationSeconds: l.durationSeconds,
    distanceMeters: l.distanceMeters,
    degraded: l.degraded ?? false,
  }))

  const totalSeconds = legs.reduce((a, l) => a + l.durationSeconds, 0)

  return {
    stops,
    legs,
    totalTravelMinutes: Math.round(totalSeconds / 60),
    totalDistanceMeters: legs.reduce((a, l) => a + l.distanceMeters, 0),
    hasDegradedLeg: legs.some((l) => l.degraded),
  }
}
