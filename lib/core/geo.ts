import type { LatLng, TravelMode } from './model'

const EARTH_RADIUS_M = 6371008.8
const METERS_PER_DEGREE = 111320

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)))
}

export const MODE_SPEED_KMH: Record<TravelMode, number> = {
  driving: 30,
  transit: 20,
  walking: 4.5,
  bicycling: 12,
}

export function minutesToMeters(minutes: number, mode: TravelMode): number {
  return Math.round((MODE_SPEED_KMH[mode] * 1000 * minutes) / 60)
}

/** 点到线段的垂距（米）。用平面近似，几百米量级足够 */
function perpendicularMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const scale = Math.cos(toRad((a.lat + b.lat) / 2))
  const px = (p.lng - a.lng) * scale
  const py = p.lat - a.lat
  const bx = (b.lng - a.lng) * scale
  const by = b.lat - a.lat
  const lenSq = bx * bx + by * by
  if (lenSq === 0) return haversineMeters(p, a)

  let t = (px * bx + py * by) / lenSq
  t = Math.max(0, Math.min(1, t))
  const dx = px - t * bx
  const dy = py - t * by
  return Math.sqrt(dx * dx + dy * dy) * METERS_PER_DEGREE
}

/** Douglas-Peucker，按容差丢掉近似共线的点 */
export function simplifyPolyline(points: LatLng[], toleranceMeters: number): LatLng[] {
  if (points.length < 3) return points.slice()

  let maxDist = 0
  let index = 0
  const last = points.length - 1

  for (let i = 1; i < last; i++) {
    const d = perpendicularMeters(points[i], points[0], points[last])
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }

  if (maxDist <= toleranceMeters) return [points[0], points[last]]

  const left = simplifyPolyline(points.slice(0, index + 1), toleranceMeters)
  const right = simplifyPolyline(points.slice(index), toleranceMeters)
  return left.slice(0, -1).concat(right)
}
