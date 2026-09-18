import type { LatLng, Poi, ReverseGeocodeResult, TravelMode } from '@/lib/core/model'

export type SearchNearbyInput = {
  origin: LatLng
  radiusMeters: number
  mode: TravelMode
  limit: number
}

export type PoiProvider = {
  searchNearby(input: SearchNearbyInput): Promise<Poi[]>
  getDetail(id: string): Promise<Poi | null>
  /** 逆地理编码。返回的 label 必须已经模糊到不细于街区 */
  reverseGeocode(point: LatLng): Promise<ReverseGeocodeResult>
}
