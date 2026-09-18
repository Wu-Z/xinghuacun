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
  /** 逆地理编码。label 必须已经模糊到不细于街区 */
  reverseGeocode(point: LatLng): Promise<{ label: string; city: string }>
}
