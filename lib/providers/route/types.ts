import type { LatLng, Route, TravelMode } from '@/lib/core/model'

export type PlanRouteInput = {
  origin: LatLng
  stops: { id: string; point: LatLng }[]
  mode: TravelMode
  /**
   * 终点。给了就作为最后一个点规划一段（不参与 order，它是收尾不是一站）。
   * 不给则末站即结束，不规划返程。
   */
  end?: LatLng
}

export type RouteProvider = {
  planRoute(input: PlanRouteInput): Promise<Route>
}
