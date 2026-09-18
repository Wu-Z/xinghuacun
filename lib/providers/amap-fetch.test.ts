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
