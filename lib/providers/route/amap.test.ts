import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { amapRouteProvider } from './amap'

const ORIGIN = { lng: 116.4, lat: 39.9 }
const STOPS = [
  { id: 'a', point: { lng: 116.41, lat: 39.91 } },
  { id: 'b', point: { lng: 116.42, lat: 39.92 } },
]

/** 两段都走同一种方式 */
const all = (mode: 'driving' | 'walking' | 'transit' | 'bicycling') => [[mode], [mode]]

const OK_PATH = {
  status: '1',
  route: {
    paths: [{ distance: '1200', duration: '300', steps: [{ polyline: '116.4,39.9;116.41,39.91' }] }],
  },
}

/** 算得出来但一条方案都没有 —— 走不通，不是失败 */
const NO_PATH = { status: '1', route: { paths: [] } }

const QPS_FAIL = { status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT' }

/** 公共交通是独立的一套结构：paths 里没有东西，方案在 transits 里 */
const OK_TRANSIT = {
  status: '1',
  route: {
    transits: [
      {
        distance: '1841',
        duration: '1865',
        segments: [
          {
            walking: { steps: [{ polyline: '118.0973,24.5729;118.0977,24.5729' }] },
            // 地铁也走 bus.buslines，名字形如「地铁1号线(岩内--镇海路)」
            bus: {
              buslines: [
                { name: '地铁1号线(岩内--镇海路)', polyline: '118.0989,24.5728;118.0989,24.5722' },
              ],
            },
          },
          { walking: { steps: [{ polyline: '118.0985,24.5697;118.0986,24.5699' }] } },
        ],
      },
    ],
  },
}

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

/** 按请求地址分别作答，用来观察「哪一段问了哪个接口」 */
function respondByUrl(byMatch: { match: string; body: unknown }[]) {
  const urls: string[] = []
  const fetchMock = vi.fn((input: unknown) => {
    const url = String(input)
    urls.push(url)
    const hit = byMatch.find((m) => url.includes(m.match))
    return respondWith(hit ? hit.body : { status: '1', route: {} })()
  })
  return { fetchMock, urls }
}

describe('amapRouteProvider', () => {
  it('全部成功时不带 degraded 标记', async () => {
    vi.stubGlobal('fetch', vi.fn(respondWith(OK_PATH)))

    const route = await amapRouteProvider.planRoute({
      origin: ORIGIN,
      stops: STOPS,
      legModes: all('driving'),
    })

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
    const route = await amapRouteProvider.planRoute({
      origin: ORIGIN,
      stops: STOPS,
      legModes: all('driving'),
    })
    consoleError.mockRestore()

    expect(route.legs[0].degraded).toBe(true)
    expect(route.legs[0].distanceMeters).toBe(0)
    expect(route.legs[0].polyline).toHaveLength(2)
    // 降级的那段记的是「本来想用的方式」，界面靠 degraded 说「这是直线估算」
    expect(route.legs[0].mode).toBe('driving')

    expect(route.legs[1].degraded).toBeFalsy()
    expect(route.legs[1].distanceMeters).toBe(1200)

    // 整条路线不因为一段失败而失败
    expect(route.totalDistanceMeters).toBe(1200)
  })

  it('降级时必须留痕，不能静默吞错', async () => {
    vi.stubGlobal('fetch', vi.fn(respondWith(QPS_FAIL)))

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await amapRouteProvider.planRoute({ origin: ORIGIN, stops: STOPS, legModes: all('driving') })

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('公共交通读 transits 而不是 paths，并把步行与公交的折线接起来', async () => {
    // 实测踩到的坑：这里原本跟着驾车读 route.paths[0]，而公共交通的方案在
    // route.transits[] 里 —— 于是地铁方案永远被判成「未返回可用路径」，
    // 静默降级成直线。地铁优先的排序因此从来没生效过。
    vi.stubGlobal('fetch', vi.fn(respondWith(OK_TRANSIT)))

    const route = await amapRouteProvider.planRoute({
      origin: ORIGIN,
      stops: STOPS,
      legModes: all('transit'),
    })

    expect(route.legs.every((l) => !l.degraded)).toBe(true)
    expect(route.legs[0].distanceMeters).toBe(1841)
    expect(route.legs[0].durationSeconds).toBe(1865)
    expect(route.legs[0].mode).toBe('transit')

    // 折线是「步行 + 公交」拼起来的，两边都得在
    const drawn = route.legs[0].polyline.map((p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`)
    expect(drawn).toContain('118.0973,24.5729') // 第一段步行
    expect(drawn).toContain('118.0989,24.5722') // 地铁
    expect(drawn).toContain('118.0986,24.5699') // 最后一段步行
  })

  it('公共交通的方案为空时仍然降级，不拿 0 冒充', async () => {
    vi.stubGlobal('fetch', vi.fn(respondWith({ status: '1', route: { transits: [] } })))

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const route = await amapRouteProvider.planRoute({
      origin: ORIGIN,
      stops: STOPS,
      legModes: all('transit'),
    })
    consoleError.mockRestore()

    expect(route.legs.every((l) => l.degraded)).toBe(true)
  })

  it('骑行走 v5 接口并带上 show_fields —— v3 那个已经下线了', async () => {
    const { fetchMock, urls } = respondByUrl([{ match: '/v5/direction/bicycling', body: OK_PATH }])
    vi.stubGlobal('fetch', fetchMock)

    await amapRouteProvider.planRoute({ origin: ORIGIN, stops: STOPS, legModes: all('bicycling') })

    // v3 的 /v3/direction/bicycling 实测返回 SERVICE_NOT_AVAILABLE，
    // v5 还在，但折线要显式要（show_fields=polyline），否则 steps 里没有 polyline
    expect(urls.every((u) => u.includes('/v5/direction/bicycling'))).toBe(true)
    expect(urls[0]).toContain('show_fields=')
  })

  it('每一段走自己那一种方式 —— 近的走路、远的坐地铁', async () => {
    // 用户的原始需求：两个地方太近，别给他排地铁。
    // 高德没有跨方式的规划接口，所以「哪段用哪种」由调用方逐段给
    const { fetchMock, urls } = respondByUrl([
      { match: '/v3/direction/walking', body: OK_PATH },
      { match: '/v3/direction/transit/integrated', body: OK_TRANSIT },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const route = await amapRouteProvider.planRoute({
      origin: ORIGIN,
      stops: STOPS,
      legModes: [['walking'], ['transit']],
    })

    expect(route.legs.map((l) => l.mode)).toEqual(['walking', 'transit'])
    expect(urls[0]).toContain('/v3/direction/walking')
    expect(urls[1]).toContain('/v3/direction/transit/integrated')
  })

  it('第一候选算不出来时换该段的下一候选，且只影响这一段', async () => {
    const { fetchMock, urls } = respondByUrl([
      // 这一段没有步行道，走不通 —— 不是报错，是没方案
      { match: '/v3/direction/walking', body: NO_PATH },
      { match: '/v5/direction/bicycling', body: OK_PATH },
      { match: '/v3/direction/transit/integrated', body: OK_TRANSIT },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const route = await amapRouteProvider.planRoute({
      origin: ORIGIN,
      stops: STOPS,
      legModes: [
        ['walking', 'bicycling'],
        ['transit'],
      ],
    })

    // 第 1 段退到骑行，第 2 段照旧坐地铁 —— 换候选不会波及别的段
    expect(route.legs.map((l) => l.mode)).toEqual(['bicycling', 'transit'])
    expect(route.legs.every((l) => !l.degraded)).toBe(true)
    expect(urls).toHaveLength(3)

    // 换候选要留痕：不然「这段为什么是骑行」事后无从查起。
    // 断言必须在 mockRestore 之前 —— restore 会把调用记录一并清掉
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('某段一个候选方式都没有时直接报错，不编一个默认方式顶上', async () => {
    vi.stubGlobal('fetch', vi.fn(respondWith(OK_PATH)))

    await expect(
      amapRouteProvider.planRoute({ origin: ORIGIN, stops: STOPS, legModes: [[]] }),
    ).rejects.toThrow(/没有候选/)
  })
})
