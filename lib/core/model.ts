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
  /** 复合地点包含的子点。有值时界面会提示「细化后会拆开」 */
  contains?: string[]
  /** 细化后：属于哪个复合地点。null 表示本身就是单一地点，原样透传 */
  parent?: string | null
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

/** 平台给 skill 的三种任务 */
export type RecommendTask = 'initial' | 'refine' | 'finalize'

export type Preferences = {
  intents: string[]
  timeBudget: string | null
  travelMode: string[]
  companions: number | null
  crowdTolerance: 'low' | 'medium' | 'high' | null
  /** 输入框的自由文本。与预设标签并存，都传给 skill */
  rawRequest: string
  /** 「想去哪」。留空则由服务端组装成 mode: 'nearby' */
  destination: string
}

/** 前端发来的推荐请求。城市与地名由服务端逆地理编码得出，客户端不知道也不该猜。 */
export type RecommendRequest = {
  task: RecommendTask
  origin: {
    /** 恒为 GCJ-02 —— 平台在发出前已统一转换 */
    point: LatLng | null
  }
  destination: {
    /** 用户填了「想去哪」→ specified，留空 → nearby */
    mode: 'nearby' | 'specified'
    requested: string | null
  }
  preferences: Preferences
  /** task=refine 且作用于单点时给 */
  focus?: { name: string; address: string; category: string } | null
  /** task=refine 且作用于整批时给 */
  previous?: { name: string; tier: string; category: string }[] | null
  /** task=refine 时用户追问的原话 */
  followup?: string | null
  /** task=finalize 时用户选中的那批（含 contains，供 skill 拆解） */
  selected?: { name: string; address: string; category: string; contains?: string[] }[] | null
}

/**
 * 追问返回的是 diff 而不是新列表。
 * 整批替换会让用户已经认可的推荐无缘无故消失或改名，用户会以为系统抽风；
 * diff 让变化可见、可解释，也保住了用户的决策。
 */
export type RefineResult = {
  answer: string
  added: RecommendPlace[]
  removed: { name: string; reason: string }[]
}
