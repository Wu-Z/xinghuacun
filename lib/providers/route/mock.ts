import { MODE_SPEED_KMH, haversineMeters } from '@/lib/core/geo'
import type { LatLng, Route, RouteLeg } from '@/lib/core/model'
import type { RouteProvider } from './types'

function interpolate(a: LatLng, b: LatLng, steps = 8): LatLng[] {
  const out: LatLng[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    out.push({ lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t })
  }
  return out
}

export const mockRouteProvider: RouteProvider = {
  async planRoute({ origin, stops, legModes, end }): Promise<Route> {
    const points = [origin, ...stops.map((s) => s.point), ...(end ? [end] : [])]
    const legs: RouteLeg[] = []

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      // 取每段的第一候选，跟真实 provider 一致 —— 假数据也要逐段定方式，
      // 否则本地 mock 跑出来的界面和真实的不一样，看不出混用的排版问题
      const mode = legModes[i]?.[0]
      if (!mode) throw new Error(`第 ${i + 1} 段没有候选出行方式`)

      const distanceMeters = haversineMeters(from, to)
      const speedMs = (MODE_SPEED_KMH[mode] * 1000) / 3600

      legs.push({
        fromIndex: i - 1,
        toIndex: i,
        mode,
        distanceMeters,
        durationSeconds: speedMs > 0 ? Math.round(distanceMeters / speedMs) : 0,
        polyline: interpolate(from, to),
      })
    }

    return {
      order: stops.map((s) => s.id),
      legs,
      totalDurationSeconds: legs.reduce((a, l) => a + l.durationSeconds, 0),
      totalDistanceMeters: legs.reduce((a, l) => a + l.distanceMeters, 0),
      polyline: points,
    }
  },
}
