import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { amapRouteProvider } from './amap'

const ORIGIN = { lng: 116.4, lat: 39.9 }
const STOPS = [
  { id: 'a', point: { lng: 116.41, lat: 39.91 } },
  { id: 'b', point: { lng: 116.42, lat: 39.92 } },
]

const OK_PATH = {
  status: '1',
  route: {
    paths: [{ distance: '1200', duration: '300', steps: [{ polyline: '116.4,39.9;116.41,39.91' }] }],
  },
}

const QPS_FAIL = { status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT' }

beforeEach(() => {
  process.env.AMAP_WEB_SERVICE_KEY = 'test-key'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 每次调用返回全新的 Response —— body 只能读一次，复用会抛 Body is unusable */
function respondWith(body: unknown) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

describe('amapRouteProvider', () => {
  it('全部成功时不带 degraded 标记', async () => {
    vi.stubGlobal('fetch', vi.fn(respondWith(OK_PATH)))

    const route = await amapRouteProvider.planRoute({ origin: ORIGIN, stops: STOPS, mode: 'driving' })

    expect(route.legs).toHaveLength(2)
    expect(route.legs.every((l) => !l.degraded)).toBe(true)
    expect(route.totalDistanceMeters).toBe(2400)
  })

  it('某段失败时只降级那一段，并标记 degraded', async () => {
    let call = 0
    const fetchMock = vi.fn(() => {
      call += 1
      // 第 1 段：QPS 两次都超限（含重试）→ 降级；第 2 段：成功
      const payload = call <= 2 ? QPS_FAIL : OK_PATH
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const route = await amapRouteProvider.planRoute({ origin: ORIGIN, stops: STOPS, mode: 'driving' })
    consoleError.mockRestore()

    expect(route.legs[0].degraded).toBe(true)
    expect(route.legs[0].distanceMeters).toBe(0)
    expect(route.legs[0].polyline).toHaveLength(2)

    expect(route.legs[1].degraded).toBeFalsy()
    expect(route.legs[1].distanceMeters).toBe(1200)

    // 整条路线不因为一段失败而失败
    expect(route.totalDistanceMeters).toBe(1200)
  })

  it('降级时必须留痕，不能静默吞错', async () => {
    vi.stubGlobal('fetch', vi.fn(respondWith(QPS_FAIL)))

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await amapRouteProvider.planRoute({ origin: ORIGIN, stops: STOPS, mode: 'driving' })

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
