import { amapPoiProvider } from './amap'
import { mockPoiProvider } from './mock'
import type { PoiProvider } from './types'

export function getPoiProvider(): PoiProvider {
  return process.env.POI_PROVIDER === 'mock' ? mockPoiProvider : amapPoiProvider
}

export type { PoiProvider, SearchNearbyInput } from './types'
