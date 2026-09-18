import { simplifyPolyline } from '@/lib/core/geo'
import type { Route, RouteLeg } from '@/lib/core/model'
import { amapGet } from '../amap-fetch'
import { parseAmapPolyline } from '../amap-polyline'
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
  async planRoute({ origin, stops, mode, end }): Promise<Route> {
    // 终点作为最后一个点参与逐段规划，但不进 order —— 它是一站的收尾，不是途中一站
    const points = [origin, ...stops.map((s) => s.point), ...(end ? [end] : [])]
    const legs: RouteLeg[] = []

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      const fromIndex = i - 1
      const toIndex = i

      try {
        // 刻意不传 depart_at：它不是 /v3/direction 的文档化参数，
        // 实测传合法未来时间结果毫无变化、传非法值直接返回空。
        // 出发时间只用于时间轴的时刻推算，不送给高德。
        const data = await amapGet<DirectionResponse>(ENDPOINT[mode], {
          origin: `${from.lng},${from.lat}`,
          destination: `${to.lng},${to.lat}`,
          extensions: 'all',
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
      } catch (error) {
        // 单段失败降级成直线，不让整条路线失败。
        // 但必须留痕：之前这里静默吞错，导致线上出现「0 分钟 0.0 公里」时无从查起。
        console.error(
          `[route/amap] 第 ${i} 段规划失败，降级为直线 | ${from.lng},${from.lat} -> ${to.lng},${to.lat} |`,
          error,
        )
        legs.push({
          fromIndex,
          toIndex,
          distanceMeters: 0,
          durationSeconds: 0,
          polyline: [from, to],
          // 明确标记，让界面能说「这段没规划出来」，而不是拿 0 冒充结果
          degraded: true,
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
