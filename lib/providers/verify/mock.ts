import { haversineMeters } from '@/lib/core/geo'
import type { VerifyProvider } from './types'

/**
 * 假核实：按名称的字符和确定性地在出发点附近散一个点。
 * 名称里含「未核实」则模拟高德查不到 —— 用来验证降级展示那条路径。
 */
export const mockVerifyProvider: VerifyProvider = {
  async verify({ name, origin }) {
    if (name.includes('未核实')) return { point: null, verified: false }

    const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
    const angle = ((seed * 137.5) % 360) * (Math.PI / 180)
    const ring = 400 + (seed % 12) * 250
    const latScale = Math.cos((origin.lat * Math.PI) / 180)

    const point = {
      lng: origin.lng + (ring * Math.sin(angle)) / (111320 * latScale),
      lat: origin.lat + (ring * Math.cos(angle)) / 111320,
    }

    return {
      point,
      verified: true,
      verifiedName: name,
      distanceMeters: haversineMeters(origin, point),
      openStatus: 'open' as const,
    }
  },

  async reverseGeocode() {
    return { label: '示例市中心区域', city: '示例市', adcode: '000000' }
  },
}
