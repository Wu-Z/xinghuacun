import type { LatLng, Route, TravelMode } from '@/lib/core/model'

export type PlanRouteInput = {
  origin: LatLng
  stops: { id: string; point: LatLng }[]
  mode: TravelMode
  departAt?: string
}

export type RouteProvider = {
  planRoute(input: PlanRouteInput): Promise<Route>
}
