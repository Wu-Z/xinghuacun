import { amapRouteProvider } from './amap'
import { mockRouteProvider } from './mock'
import type { RouteProvider } from './types'

export function getRouteProvider(): RouteProvider {
  return process.env.ROUTE_PROVIDER === 'mock' ? mockRouteProvider : amapRouteProvider
}

export type { PlanRouteInput, RouteProvider } from './types'
