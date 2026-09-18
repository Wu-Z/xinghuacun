import { blurAddress } from '@/lib/core/address'
import { asText } from '@/lib/core/coerce'
import { haversineMeters } from '@/lib/core/geo'
import type { LatLng, Poi, ReverseGeocodeResult } from '@/lib/core/model'
import { parseOpenStatus } from '@/lib/core/open-hours'
import { amapGet } from '../amap-fetch'
import type { PoiProvider } from './types'

/**
 * 字段全部按 unknown 收：高德对空字段返回 `[]`，有的字段返回数组或数字。
 * 统一交给 asText 收敛，绝不在调用点直接 .trim()。
 */
export type AmapRawPoi = {
  id?: unknown
  name?: unknown
  type?: unknown
  typecode?: unknown
  location?: unknown
  distance?: unknown
  address?: unknown
  tel?: unknown
  biz_ext?: unknown
}

type BizExt = { rating?: unknown; open_time?: unknown; opentime2?: unknown }

/** biz_ext 也可能是 [] 或字符串，只有确实是普通对象时才当对象用 */
function readBizExt(raw: AmapRawPoi): BizExt {
  const v = raw.biz_ext
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as BizExt
  return {}
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

export function parseAmapPolyline(text: string): LatLng[] {
  if (!text) return []
  const out: LatLng[] = []
  for (const chunk of text.split(';')) {
    const point = parseLocation(chunk.trim())
    if (point) out.push(point)
  }
  return out
}

export function mapAmapPoi(raw: AmapRawPoi, origin: LatLng, fallbackId: string, now: Date): Poi {
  const point = parseLocation(raw.location) ?? { ...origin }

  const distanceText = asText(raw.distance)
  const rawDistance = Number(distanceText)
  const distanceMeters =
    distanceText !== '' && Number.isFinite(rawDistance)
      ? Math.round(rawDistance)
      : haversineMeters(origin, point)

  const biz = readBizExt(raw)
  const ratingText = asText(biz.rating)
  const rating = Number(ratingText)
  const openTime = asText(biz.open_time) || asText(biz.opentime2)

  const typeText = asText(raw.type)
  const category = typeText.split(';')[0]?.trim() || '其他'

  return {
    id: asText(raw.id) || fallbackId,
    name: asText(raw.name) || '未命名地点',
    category,
    categoryRaw: typeText,
    point,
    distanceMeters,
    address: asText(raw.address),
    openStatus: parseOpenStatus(openTime, now),
    rating: ratingText !== '' && Number.isFinite(rating) && rating > 0 ? rating : undefined,
  }
}

type AroundResponse = { pois?: AmapRawPoi[] }
type DetailResponse = { pois?: AmapRawPoi[] }
type RegeoResponse = {
  regeocode?: {
    formatted_address?: unknown
    addressComponent?: {
      province?: unknown
      city?: unknown
      district?: unknown
      township?: unknown
      streetNumber?: { street?: unknown } | unknown
    }
  }
}

function readStreet(streetNumber: unknown): string | undefined {
  if (streetNumber && typeof streetNumber === 'object' && !Array.isArray(streetNumber)) {
    const street = asText((streetNumber as { street?: unknown }).street)
    return street || undefined
  }
  return undefined
}

export const amapPoiProvider: PoiProvider = {
  async searchNearby({ origin, radiusMeters, limit }) {
    const data = await amapGet<AroundResponse>('/v3/place/around', {
      location: `${origin.lng},${origin.lat}`,
      radius: Math.min(Math.round(radiusMeters), 50000),
      offset: Math.min(limit * 4, 25),
      page: 1,
      extensions: 'all',
    })

    const now = new Date()
    return (data.pois ?? []).map((raw, i) => mapAmapPoi(raw, origin, `amap-${i + 1}`, now))
  },

  async getDetail(id) {
    const data = await amapGet<DetailResponse>('/v3/place/detail', { id })
    const raw = data.pois?.[0]
    if (!raw) return null

    const point = parseLocation(raw.location) ?? { lng: 0, lat: 0 }
    return mapAmapPoi(raw, point, id, new Date())
  },

  async reverseGeocode(point): Promise<ReverseGeocodeResult> {
    const data = await amapGet<RegeoResponse>('/v3/geocode/regeo', {
      location: `${point.lng},${point.lat}`,
      extensions: 'base',
    })

    const comp = data.regeocode?.addressComponent
    // 直辖市会返回 city 为空数组而不是字符串，这是高德返回结构里真实存在的坑
    const cityText = asText(comp?.city)

    return {
      label: blurAddress({
        province: asText(comp?.province),
        city: cityText,
        district: asText(comp?.district),
        township: asText(comp?.township),
        street: readStreet(comp?.streetNumber),
      }),
      city: cityText || asText(comp?.province),
    }
  },
}
