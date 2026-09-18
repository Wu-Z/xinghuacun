import { blurAddress } from '@/lib/core/address'
import { haversineMeters } from '@/lib/core/geo'
import type { LatLng, Poi, ReverseGeocodeResult } from '@/lib/core/model'
import { parseOpenStatus } from '@/lib/core/open-hours'
import { amapGet } from '../amap-fetch'
import type { PoiProvider } from './types'

export type AmapRawPoi = {
  id?: string
  name?: string
  type?: string
  typecode?: string
  location?: string
  distance?: string
  address?: string
  tel?: string
  biz_ext?: { rating?: string; open_time?: string; opentime2?: string }
}

function parseLocation(text: string | undefined): LatLng | null {
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

  const rawDistance = Number(raw.distance)
  const distanceMeters =
    Number.isFinite(rawDistance) && raw.distance !== ''
      ? Math.round(rawDistance)
      : haversineMeters(origin, point)

  const rawRating = raw.biz_ext?.rating
  const rating = rawRating ? Number(rawRating) : Number.NaN
  const openTime = raw.biz_ext?.open_time ?? raw.biz_ext?.opentime2

  const typeText = raw.type ?? ''
  const category = typeText.split(';')[0]?.trim() || '其他'

  return {
    id: raw.id?.trim() || fallbackId,
    name: raw.name?.trim() || '未命名地点',
    category,
    categoryRaw: typeText,
    point,
    distanceMeters,
    address: raw.address?.trim() ?? '',
    openStatus: parseOpenStatus(openTime, now),
    rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
  }
}

type AroundResponse = { pois?: AmapRawPoi[] }
type DetailResponse = { pois?: AmapRawPoi[] }
type RegeoResponse = {
  regeocode?: {
    formatted_address?: string
    addressComponent?: {
      province?: string
      city?: string
      district?: string
      township?: string
      streetNumber?: { street?: string }
    }
  }
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
    const cityText = typeof comp?.city === 'string' ? comp.city : ''

    return {
      label: blurAddress({
        province: comp?.province,
        city: cityText,
        district: comp?.district,
        township: comp?.township,
        street: comp?.streetNumber?.street,
      }),
      city: cityText || comp?.province || '',
    }
  },
}
