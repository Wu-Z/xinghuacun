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
  async planRoute({ origin, stops, mode, end }): Promise<Route> {
    const points = [origin, ...stops.map((s) => s.point), ...(end ? [end] : [])]
    const legs: RouteLeg[] = []

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      const distanceMeters = haversineMeters(from, to)
      const speedMs = (MODE_SPEED_KMH[mode] * 1000) / 3600

      legs.push({
        fromIndex: i - 1,
        toIndex: i,
        distanceMeters,
        durationSeconds: speedMs > 0 ? Math.round(distanceMeters / speedMs) : 0,
        polyline: interpolate(from, to),
      })
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
