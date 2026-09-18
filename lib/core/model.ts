export type LatLng = { lng: number; lat: number }

export type TravelMode = 'driving' | 'transit' | 'walking' | 'bicycling'

export type OriginSource = 'geolocation' | 'map-pick' | 'search'

export type Origin = {
  point: LatLng
  label: string
  source: OriginSource
}

export type OpenStatus = 'open' | 'closed' | 'unknown'

export type Poi = {
  id: string
  name: string
  category: string
  categoryRaw: string
  point: LatLng
  distanceMeters: number
  address: string
  openStatus: OpenStatus
  rating?: number
  score?: number
  scoreParts?: Record<string, number>
}

export type Activity = {
  title: string
  durationMinutes: number
  note?: string
}

export type PoiDetail = Poi & {
  activities: Activity[]
  suggestedDurationMinutes: number
  deriveSource: 'rules'
}

export type RouteLeg = {
  fromIndex: number
  toIndex: number
  durationSeconds: number
  distanceMeters: number
  polyline: LatLng[]
}

export type Route = {
  mode: TravelMode
  order: string[]
  legs: RouteLeg[]
  totalDurationSeconds: number
  totalDistanceMeters: number
  polyline: LatLng[]
}

export type SearchRequest = {
  origin: LatLng
  source: OriginSource
  radiusMinutes: 30 | 60 | 120
  mode: TravelMode
  departAt?: string
}

export type SearchResponse = {
  origin: Origin
  pois: Poi[]
}

export type PlanRequest = {
  origin: LatLng
  stops: { id: string; point: LatLng }[]
  mode: TravelMode
  departAt?: string
}

export type ReverseGeocodeResult = {
  label: string
  city: string
}
