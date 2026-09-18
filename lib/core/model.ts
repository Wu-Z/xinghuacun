export type LatLng = { lng: number; lat: number }

export type TravelMode = 'driving' | 'transit' | 'walking' | 'bicycling'

export type OriginSource = 'geolocation' | 'map-pick' | 'search'

export type Origin = {
  point: LatLng
  label: string
  source: OriginSource
  /** 城市名。skill 要它来消歧同名地点；拿不到时传空串，由服务端兜底 */
  city?: string
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
  /**
   * 这一段规划失败、已降级成直线。
   * 存在的意义是让界面能说实话：没有它，失败会伪装成「0 分钟 0.0 公里」。
   */
  degraded?: boolean
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

/** skill 给出的推荐，合并高德核实结果后的形态 */
export type RecommendPlace = {
  rank: number
  tier: string
  name: string
  category: string
  address: string
  fit: { tag: string; why: string }[]
  crowdLevel?: string
  crowdNote?: string
  indoorOutdoor?: string
  bestTime?: string
  cost?: string
  transitHint?: string
  itinerary?: { time: string; action: string }[]
  pickIf?: string
  tradeOff?: string
  amapUrl: string
  confidence?: string
  source?: string
  // 以下由高德核实层补充
  point: LatLng | null
  verified: boolean
  verifiedName?: string
  /** 直线距离 —— 不是驾车距离，界面必须标明 */
  distanceMeters?: number
  openStatus?: OpenStatus
}

export type RecommendResult = {
  places: RecommendPlace[]
  excluded: { name: string; reason: string }[]
  meta: { assumptions: string[]; unverified: string[]; disclaimer?: string }
}

/** 前端发来的推荐请求。城市与地名由服务端逆地理编码得出，客户端不知道也不该猜。 */
export type RecommendRequest = {
  origin: {
    /** 恒为 GCJ-02 —— 平台在发出前已统一转换 */
    point: LatLng | null
  }
  destination: {
    /** 用户填了「想去哪」→ specified，留空 → nearby */
    mode: 'nearby' | 'specified'
    requested: string | null
  }
  preferences: {
    intents: string[]
    timeBudget: string | null
    travelMode: string[]
    companions: number | null
    crowdTolerance: 'low' | 'medium' | 'high' | null
  }
}
