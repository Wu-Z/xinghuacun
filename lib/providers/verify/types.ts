import type { LatLng, OpenStatus } from '@/lib/core/model'

export type VerifyInput = {
  name: string
  address: string
  city: string
  origin: LatLng
}

export type Verification = {
  /** 地理编码得到的坐标；null 表示高德未能核实 */
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
}
