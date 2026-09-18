import { blurAddress } from '@/lib/core/address'
import { asText } from '@/lib/core/coerce'
import { haversineMeters } from '@/lib/core/geo'
import type { LatLng, OpenStatus } from '@/lib/core/model'
import { parseOpenStatus } from '@/lib/core/open-hours'
import { amapGet } from '../amap-fetch'
import type { Verification, VerifyInput, VerifyProvider } from './types'

type GeocodeResponse = {
  geocodes?: { location?: unknown; formatted_address?: unknown }[]
}

function parseLocation(value: unknown): LatLng | null {
  const text = asText(value)
  if (!text) return null

  const [lngText, latText] = text.split(',')
  const lng = Number(lngText)
  const lat = Number(latText)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  return { lng, lat }
}

/** 从地理编码响应映射成核实结果。纯函数，便于单测。 */
export function mapGeocode(data: GeocodeResponse, origin: LatLng): Verification {
  const first = data.geocodes?.[0]
  const point = parseLocation(first?.location)

  if (!point) return { point: null, verified: false }

  return {
    point,
    verified: true,
    verifiedName: asText(first?.formatted_address) || undefined,
    // 直线距离，不是驾车距离。界面必须标明，否则会被当成里程
    distanceMeters: haversineMeters(origin, point),
  }
}

type AroundResponse = { pois?: { biz_ext?: unknown }[] }

/** 从周边搜索响应里取营业状态。判不出来一律 unknown。 */
export function mapPoiBusiness(data: AroundResponse, now: Date): OpenStatus {
  const biz = data.pois?.[0]?.biz_ext
  if (!biz || typeof biz !== 'object' || Array.isArray(biz)) return 'unknown'

  const record = biz as { open_time?: unknown; opentime2?: unknown }
  const openTime = asText(record.open_time) || asText(record.opentime2)
  return parseOpenStatus(openTime, now)
}

export const amapVerifyProvider: VerifyProvider = {
  async verify({ name, address, city, origin }: VerifyInput): Promise<Verification> {
    const geo = await amapGet<GeocodeResponse>('/v3/geocode/geo', {
      address: address || [name, city].filter(Boolean).join(' '),
      city,
    })

    const result = mapGeocode(geo, origin)
    if (!result.verified || !result.point) return result

    try {
      const around = await amapGet<AroundResponse>('/v3/place/around', {
        location: `${result.point.lng},${result.point.lat}`,
        radius: 200,
        offset: 1,
        page: 1,
        extensions: 'all',
      })
      return { ...result, openStatus: mapPoiBusiness(around, new Date()) }
    } catch (error) {
      // 营业状态只是锦上添花，拿不到不该让整条核实失败。
      // 但必须留痕，不能静默吞错。
      console.error(`[verify/amap] 取营业状态失败：${name}`, error)
      return { ...result, openStatus: 'unknown' }
    }
  },

  async reverseGeocode(point) {
    type RegeoResponse = {
      regeocode?: {
        addressComponent?: {
          province?: unknown
          city?: unknown
          district?: unknown
          township?: unknown
          streetNumber?: unknown
        }
      }
    }

    const data = await amapGet<RegeoResponse>('/v3/geocode/regeo', {
      location: `${point.lng},${point.lat}`,
      extensions: 'base',
    })

    const comp = data.regeocode?.addressComponent
    // 直辖市会返回 city 为空数组而不是字符串，这是高德返回结构里真实存在的坑
    const cityText = asText(comp?.city)

    const streetNumber = comp?.streetNumber
    const street =
      streetNumber && typeof streetNumber === 'object' && !Array.isArray(streetNumber)
        ? asText((streetNumber as { street?: unknown }).street)
        : ''

    return {
      label: blurAddress({
        province: asText(comp?.province),
        city: cityText,
        district: asText(comp?.district),
        township: asText(comp?.township),
        street,
      }),
      city: cityText || asText(comp?.province),
    }
  },
}
