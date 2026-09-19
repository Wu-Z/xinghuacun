import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { amapGet } from './amap-fetch'

beforeEach(() => {
  process.env.AMAP_WEB_SERVICE_KEY = 'test-key'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * 每次都造一个新的 Response：Response body 只能读一次，
 * 用 mockResolvedValue 复用同一个对象会让第二次 res.json() 抛「Body is unusable」，
 * 那是测试的假象，不是被测代码的问题。
 */
function respondWith(body: unknown) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

const QPS_FAIL = { status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT' }

describe('amapGet', () => {
  it('QPS 超限时退避重试，第二次成功', async () => {
    let call = 0
    const fetchMock = vi.fn(() => {
      call += 1
      const payload = call === 1 ? QPS_FAIL : { status: '1', pois: [] }
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const data = await amapGet<{ pois: unknown[] }>('/v3/place/around', {})

    expect(data.pois).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('QPS 持续超限时最终抛错，不会无限重试', async () => {
    const fetchMock = vi.fn(respondWith(QPS_FAIL))
    vi.stubGlobal('fetch', fetchMock)

    await expect(amapGet('/v3/place/around', {})).rejects.toThrow('CUQPS')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('非 QPS 错误不重试 —— 重试解决不了 Key 无效', async () => {
    const fetchMock = vi.fn(respondWith({ status: '0', info: 'INVALID_USER_KEY' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(amapGet('/v3/place/around', {})).rejects.toThrow('INVALID_USER_KEY')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('成功时不重试', async () => {
    const fetchMock = vi.fn(respondWith({ status: '1', pois: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await amapGet('/v3/place/around', {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('amapGet · 并发闸门', () => {
  let inFlight = 0
  let peak = 0

  /** 每个请求停 5ms —— 不停的话它们根本不重叠，测不出并发 */
  function stallingFetch() {
    return async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return new Response(JSON.stringify({ status: '1', pois: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
  }

  beforeEach(() => {
    inFlight = 0
    peak = 0
    process.env.AMAP_MAX_CONCURRENCY = '3'
    vi.stubGlobal('fetch', vi.fn(stallingFetch()))
  })

  it('同时最多只放行配置的条数', async () => {
    // 一次推荐会连着核实十几个地点。不限并发就是一串请求同时打过去、
    // 一起撞上高德的每秒限流、一起退避、再一起撞 —— 退避救不了这个节奏
    await Promise.all(Array.from({ length: 10 }, () => amapGet('/v3/place/text', {})))

    // 断言等于 3 而不是 ≤3：小于 3 说明这个测试压根没让请求重叠上，是假通过
    expect(peak).toBe(3)
  })

  it('配成 0、负数或非数字时回到默认值，不能把闸门焊死', async () => {
    // 闸门一旦是 0 就永远不放行，整个核实层会静默卡死 —— 比限流更难查
    for (const bad of ['0', '-1', 'abc', '']) {
      process.env.AMAP_MAX_CONCURRENCY = bad
      peak = 0
      await Promise.all(Array.from({ length: 6 }, () => amapGet('/v3/place/text', {})))
      expect(peak).toBe(3)
    }
  })

  it('配大了就按配的放行', async () => {
    process.env.AMAP_MAX_CONCURRENCY = '6'
    await Promise.all(Array.from({ length: 6 }, () => amapGet('/v3/place/text', {})))
    expect(peak).toBe(6)
  })
})
