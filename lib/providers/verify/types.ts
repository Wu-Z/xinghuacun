import type { LatLng, OpenStatus } from '@/lib/core/model'

export type VerifyInput = {
  name: string
  /**
   * 展示用的地址，**不参与坐标解析**。
   *
   * 曾经拿它去地理编码，那是坐标错的根源：它是模型写的，且地理编码回答的是
   * 「这个地址在哪」而不是「这个 POI 在哪」。现在坐标一律用 `name` 走 POI 搜索。
   */
  address: string
  city: string
  origin: LatLng
}

export type Verification = {
  /** POI 关键字搜索得到的坐标；null 表示高德未能核实 */
  point: LatLng | null
  verified: boolean
  /** 高德返回的正式名称，可能与 skill 给的写法不同 */
  verifiedName?: string
  /** 与出发点的直线距离 —— 不是驾车距离，界面必须标明 */
  distanceMeters?: number
  openStatus?: OpenStatus
}

export type VerifyProvider = {
  verify(input: VerifyInput): Promise<Verification>
  /**
   * 逆地理编码。label 是给人看的「你所在的那一片」，形如
   * 「厦门市集美区软件园B区」—— 市 + 区 + 区域名，不含门牌号。
   */
  /**
   * 逆地理编码。label 是给人看的「你所在的那一片」，形如
   * 「厦门市集美区软件园B区」—— 市 + 区 + 区域名，不含门牌号。
   *
   * adcode 是同一份响应里顺手带出来的：高德查天气要的是城市编码而不是城市名，
   * 而有 adcode 就不必再去一次行政区划接口。拿不到时允许为空。
   */
  reverseGeocode(point: LatLng): Promise<{ label: string; city: string; adcode?: string }>
}
