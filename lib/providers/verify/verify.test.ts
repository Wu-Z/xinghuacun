import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapGeocode, mapPoiBusiness } from './amap'

const ORIGIN = { lng: 116.4, lat: 39.9 }

describe('mapGeocode', () => {
  it('命中时给出坐标与高德正式名称', () => {
    const v = mapGeocode(
      { geocodes: [{ location: '116.404,39.915', formatted_address: '北京市东城区天安门' }] },
      ORIGIN,
    )
    expect(v.verified).toBe(true)
    expect(v.point).toEqual({ lng: 116.404, lat: 39.915 })
    expect(v.verifiedName).toBe('北京市东城区天安门')
    expect(v.distanceMeters).toBeGreaterThan(0)
  })

  it('geocodes 为空时未核实，point 为 null', () => {
    const v = mapGeocode({ geocodes: [] }, ORIGIN)
    expect(v.verified).toBe(false)
    expect(v.point).toBeNull()
  })

  it('geocodes 缺失时不炸', () => {
    expect(mapGeocode({}, ORIGIN).verified).toBe(false)
  })

  it('location 是空数组（高德常用 [] 表示空值）时未核实', () => {
    expect(mapGeocode({ geocodes: [{ location: [] }] }, ORIGIN).verified).toBe(false)
  })

  it('location 格式不对时未核实而不是抛错', () => {
    expect(mapGeocode({ geocodes: [{ location: '坏数据' }] }, ORIGIN).verified).toBe(false)
  })

  it('与出发点重合时距离为 0', () => {
    const v = mapGeocode({ geocodes: [{ location: '116.4,39.9' }] }, ORIGIN)
    expect(v.distanceMeters).toBe(0)
  })
})

describe('mapPoiBusiness', () => {
  const at = (h: number) => new Date(2026, 8, 19, h, 0)

  it('取到营业时间并解析出状态', () => {
    expect(mapPoiBusiness({ pois: [{ biz_ext: { open_time: '09:00-22:00' } }] }, at(12))).toBe('open')
    expect(mapPoiBusiness({ pois: [{ biz_ext: { open_time: '09:00-22:00' } }] }, at(23))).toBe('closed')
  })

  it('查不到 POI 时给 unknown，绝不当成已关闭', () => {
    expect(mapPoiBusiness({ pois: [] }, at(12))).toBe('unknown')
    expect(mapPoiBusiness({}, at(12))).toBe('unknown')
  })

  it('biz_ext 缺失或为空数组时给 unknown', () => {
    expect(mapPoiBusiness({ pois: [{}] }, at(12))).toBe('unknown')
    expect(mapPoiBusiness({ pois: [{ biz_ext: [] }] }, at(12))).toBe('unknown')
  })

  it('opentime2 作为 open_time 的备选', () => {
    expect(mapPoiBusiness({ pois: [{ biz_ext: { opentime2: '09:00-22:00' } }] }, at(12))).toBe('open')
  })
})

describe('amapVerifyProvider', () => {
  beforeEach(() => {
    process.env.AMAP_WEB_SERVICE_KEY = 'test-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  it('地理编码未命中时不再查询营业状态', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ status: '1', geocodes: [] })))
    vi.stubGlobal('fetch', fetchMock)

    const { amapVerifyProvider } = await import('./amap')
    const v = await amapVerifyProvider.verify({
      name: '不存在的地方',
      address: '某路 1 号',
      city: '北京',
      origin: ORIGIN,
    })

    expect(v.verified).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('命中时继续查营业状态', async () => {
    let call = 0
    const fetchMock = vi.fn(() => {
      call += 1
      return Promise.resolve(
        jsonResponse(
          call === 1
            ? { status: '1', geocodes: [{ location: '116.404,39.915' }] }
            : { status: '1', pois: [{ biz_ext: { open_time: '00:00-23:59' } }] },
        ),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const { amapVerifyProvider } = await import('./amap')
    const v = await amapVerifyProvider.verify({
      name: '天安门',
      address: '',
      city: '北京',
      origin: ORIGIN,
    })

    expect(v.verified).toBe(true)
    expect(v.openStatus).toBe('open')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('营业状态查询失败时不让整条核实失败', async () => {
    let call = 0
    const fetchMock = vi.fn(() => {
      call += 1
      return Promise.resolve(
        call === 1
          ? jsonResponse({ status: '1', geocodes: [{ location: '116.404,39.915' }] })
          : jsonResponse({ status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT' }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { amapVerifyProvider } = await import('./amap')
    const v = await amapVerifyProvider.verify({
      name: '天安门',
      address: '',
      city: '北京',
      origin: ORIGIN,
    })
    consoleError.mockRestore()

    expect(v.verified).toBe(true)
    expect(v.openStatus).toBe('unknown')
  })
})
