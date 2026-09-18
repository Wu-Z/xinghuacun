import { haversineMeters } from '@/lib/core/geo'
import type { LatLng, OpenStatus, Poi, ReverseGeocodeResult } from '@/lib/core/model'
import type { PoiProvider } from './types'

const CATEGORIES = ['公园', '博物馆', '餐饮', '购物', '亲子', '风景名胜'] as const

/** 确定性假数据：同一出发点永远得到同一批 POI，便于反复验证交互 */
export function mockPoisAround(origin: LatLng, count = 24, maxRadiusMeters = 20000): Poi[] {
  const out: Poi[] = []
  const latScale = Math.cos((origin.lat * Math.PI) / 180)

  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[i % CATEGORIES.length]
    // 黄金角铺开，避免所有点挤在一条线上
    const ring = 600 + (i % 7) * (maxRadiusMeters / 12)
    const angle = (i * 137.508 * Math.PI) / 180
    const point: LatLng = {
      lng: origin.lng + (ring * Math.sin(angle)) / (111320 * latScale),
      lat: origin.lat + (ring * Math.cos(angle)) / 111320,
    }

    const openStatus: OpenStatus = i % 9 === 0 ? 'closed' : i % 7 === 0 ? 'unknown' : 'open'

    out.push({
      id: `mock-${i + 1}`,
      name: `${category}示例地 ${i + 1}`,
      category,
      categoryRaw: `mock;${category}`,
      point,
      distanceMeters: haversineMeters(origin, point),
      address: `示例路 ${i + 1} 号`,
      openStatus,
      rating: i % 5 === 0 ? undefined : Number((3.4 + (i % 16) / 10).toFixed(1)),
    })
  }

  return out
}

export const mockPoiProvider: PoiProvider = {
  async searchNearby({ origin, radiusMeters, limit }) {
    return mockPoisAround(origin, 24, radiusMeters)
      .filter((p) => p.distanceMeters <= radiusMeters)
      .slice(0, limit)
  },

  async getDetail(id) {
    const all = mockPoisAround({ lng: 116.4, lat: 39.9 }, 24)
    return all.find((p) => p.id === id) ?? null
  },

  async reverseGeocode(): Promise<ReverseGeocodeResult> {
    return { label: '示例市中心区域', city: '示例市' }
  },
}
