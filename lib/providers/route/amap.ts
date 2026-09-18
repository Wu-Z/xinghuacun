import { simplifyPolyline } from '@/lib/core/geo'
import type { Route, RouteLeg } from '@/lib/core/model'
import { amapGet } from '../amap-fetch'
import { parseAmapPolyline } from '../poi/amap'
import type { RouteProvider } from './types'

type DirectionResponse = {
  route?: {
    paths?: {
      distance?: string
      duration?: string
      steps?: { polyline?: string; duration?: string; distance?: string }[]
    }[]
  }
}

const ENDPOINT = {
  driving: '/v3/direction/driving',
  walking: '/v3/direction/walking',
  bicycling: '/v3/direction/bicycling',
  transit: '/v3/direction/transit/integrated',
} as const

/**
 * 逐段规划：每段一次请求。这样每段的时长/折线天然分开，
 * 且某一段失败时可以只降级那一段（见 spec 第 9 节）。
 */
export const amapRouteProvider: RouteProvider = {
  async planRoute({ origin, stops, mode, departAt }): Promise<Route> {
    const points = [origin, ...stops.map((s) => s.point)]
    const legs: RouteLeg[] = []

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      const fromIndex = i - 1
      const toIndex = i

      try {
        const data = await amapGet<DirectionResponse>(ENDPOINT[mode], {
          origin: `${from.lng},${from.lat}`,
          destination: `${to.lng},${to.lat}`,
          extensions: 'all',
          depart_at: departAt,
        })

        const path = data.route?.paths?.[0]
        if (!path) throw new Error('高德未返回可用路径')

        const polyline = (path.steps ?? []).flatMap((s) => parseAmapPolyline(s.polyline ?? ''))
        legs.push({
          fromIndex,
          toIndex,
          distanceMeters: Math.round(Number(path.distance) || 0),
          durationSeconds: Math.round(Number(path.duration) || 0),
          polyline: simplifyPolyline(polyline, 5),
        })
      } catch {
        // 单段失败降级成直线，不让整条路线失败
        legs.push({
          fromIndex,
          toIndex,
          distanceMeters: 0,
          durationSeconds: 0,
          polyline: [from, to],
        })
      }
    }

    return {
      mode,
      order: stops.map((s) => s.id),
      legs,
      totalDurationSeconds: legs.reduce((a, l) => a + l.durationSeconds, 0),
      totalDistanceMeters: legs.reduce((a, l) => a + l.distanceMeters, 0),
      polyline: points,
    }
  },
}
