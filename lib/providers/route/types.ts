import type { LatLng, Route, TravelMode } from '@/lib/core/model'

export type PlanRouteInput = {
  origin: LatLng
  stops: { id: string; point: LatLng }[]
  /**
   * 每一段依次试哪些方式，长度与段数相同（第 i 段 = points[i] → points[i+1]）。
   * 由 lib/core/route-mode 的 buildLegModes 按段长算出来 —— 为什么要逐段，
   * 见那里的注释。每个元素都非空。
   */
  legModes: TravelMode[][]
  /**
   * 终点。给了就作为最后一个点规划一段（不参与 order，它是收尾不是一站）。
   * 不给则末站即结束，不规划返程。
   */
  end?: LatLng
}

export type RouteProvider = {
  planRoute(input: PlanRouteInput): Promise<Route>
}
