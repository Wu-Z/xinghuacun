import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const ORIGINAL_CODE = process.env.AMAP_JS_SECURITY_CODE

let upstream: ReturnType<typeof vi.fn>

beforeEach(() => {
  process.env.AMAP_JS_SECURITY_CODE = 'test-jscode'
  upstream = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL_CODE === undefined) delete process.env.AMAP_JS_SECURITY_CODE
  else process.env.AMAP_JS_SECURITY_CODE = ORIGINAL_CODE
})

function call(path: string[], query = '') {
  return GET(new Request(`http://localhost/_AMapService/${path.join('/')}${query}`), {
    params: Promise.resolve({ path }),
  })
}

describe('amap-service 代理 · 白名单', () => {
  it('放行实测到的那一条，并把 jscode 追加给上游', async () => {
    const res = await call(['v3', 'log', 'init'])

    expect(res.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
    const target = String(upstream.mock.calls[0][0])
    expect(target).toContain('restapi.amap.com/v3/log/init')
    expect(target).toContain('jscode=test-jscode')
  })

  it('白名单外的路径直接 403，而且**一个上游请求都不发**', async () => {
    // 断言「没发请求」和断言状态码一样重要：先转发再判断的话，
    // 403 只是个好看的壳，额度已经花出去了
    const res = await call(['v3', 'place', 'text'])

    expect(res.status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('常见的花钱接口全挡在外面', async () => {
    for (const p of [
      ['v3', 'geocode', 'regeo'],
      ['v3', 'direction', 'driving'],
      ['v4', 'map', 'styles'],
      ['v3', 'weather', 'weatherInfo'],
    ]) {
      expect((await call(p)).status, `没挡住 ${p.join('/')}`).toBe(403)
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('没配安全密钥时 500，也不发上游请求', async () => {
    delete process.env.AMAP_JS_SECURITY_CODE

    const res = await call(['v3', 'log', 'init'])

    expect(res.status).toBe(500)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('放行时原样带上调用方自己的查询参数', async () => {
    await call(['v3', 'log', 'init'], '?eventId=resource.load&s=rsv3')

    const target = new URL(String(upstream.mock.calls[0][0]))
    expect(target.searchParams.get('eventId')).toBe('resource.load')
    expect(target.searchParams.get('s')).toBe('rsv3')
  })
})
