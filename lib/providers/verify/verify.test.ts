import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapPoiBusiness, mapPoiSearch } from './amap'

const ORIGIN = { lng: 116.4, lat: 39.9 }

describe('mapPoiSearch', () => {
  it('命中时给出坐标与高德 POI 名称', () => {
    const v = mapPoiSearch(
      { pois: [{ location: '116.404,39.915', name: '天安门' }] },
      ORIGIN,
    )
    expect(v.verified).toBe(true)
    expect(v.point).toEqual({ lng: 116.404, lat: 39.915 })
    expect(v.verifiedName).toBe('天安门')
    expect(v.distanceMeters).toBeGreaterThan(0)
  })

  it('pois 为空时未核实，point 为 null', () => {
    const v = mapPoiSearch({ pois: [] }, ORIGIN)
    expect(v.verified).toBe(false)
    expect(v.point).toBeNull()
  })

  it('pois 缺失时不炸', () => {
    expect(mapPoiSearch({}, ORIGIN).verified).toBe(false)
  })

  it('location 是空数组（高德常用 [] 表示空值）时未核实', () => {
    expect(mapPoiSearch({ pois: [{ location: [] }] }, ORIGIN).verified).toBe(false)
  })

  it('location 格式不对时未核实而不是抛错', () => {
    expect(mapPoiSearch({ pois: [{ location: '坏数据' }] }, ORIGIN).verified).toBe(false)
  })

  it('与出发点重合时距离为 0', () => {
    const v = mapPoiSearch({ pois: [{ location: '116.4,39.9' }] }, ORIGIN)
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

  it('用 POI 关键字搜索解析坐标，而不是地理编码', async () => {
    // 实测踩到的坑：地理编码是「地址 → 坐标」，拿它解析 POI 名字会解析到同名的别处。
    // 「海堤路（集美段）」被放到了集美学村里的塘埔路上，离真正的海堤路 1.5 公里
    // ——逆地理编码那个点，返回的是「集美街道塘埔路」，不是海堤路。
    const calls: string[] = []
    const fetchMock = vi.fn((url: string) => {
      calls.push(String(url))
      if (String(url).includes('/v3/place/text')) {
        return Promise.resolve(
          jsonResponse({
            status: '1',
            pois: [{ location: '118.097690,24.558801', name: '海堤路' }],
          }),
        )
      }
      return Promise.resolve(jsonResponse({ status: '1', pois: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { amapVerifyProvider } = await import('./amap')
    const v = await amapVerifyProvider.verify({
      name: '海堤路（集美段）',
      address: '厦门市集美区海堤路（集美段）',
      city: '厦门',
      origin: ORIGIN,
    })

    expect(v.point).toEqual({ lng: 118.09769, lat: 24.558801 })
    expect(v.verified).toBe(true)
    expect(calls.some((u) => u.includes('/v3/place/text'))).toBe(true)
    // 关键：绝不能再退回地理编码 —— 它会给出一个「已验证」的错点
    expect(calls.some((u) => u.includes('/v3/geocode/geo'))).toBe(false)
  })

  it('POI 搜索未命中时标记未核实，不退而求其次用地理编码', async () => {
    // 一个自信的错点比一个诚实的「未核实」更糟：错点会画上图、算错距离，
    // 而「未核实」由界面如实标注、不占编号、不参与路线
    const calls: string[] = []
    const fetchMock = vi.fn((url: string) => {
      calls.push(String(url))
      if (String(url).includes('/v3/geocode/geo')) {
        return Promise.resolve(
          jsonResponse({ status: '1', geocodes: [{ location: '118.1,24.5' }] }),
        )
      }
      return Promise.resolve(jsonResponse({ status: '1', pois: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { amapVerifyProvider } = await import('./amap')
    const v = await amapVerifyProvider.verify({
      name: '不存在的地方',
      address: '某路 1 号',
      city: '北京',
      origin: ORIGIN,
    })

    expect(v.verified).toBe(false)
    expect(v.point).toBeNull()
    expect(calls.some((u) => u.includes('/v3/geocode/geo'))).toBe(false)
  })

  it('一次 POI 搜索就同时拿到坐标与营业状态，不再多打一次周边搜索', async () => {
    // place/text 的响应里自带 biz_ext，原来那次 /v3/place/around 是白打的。
    // 核实是首屏等待的瓶颈，少一次请求就是少一段串行等待。
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          status: '1',
          pois: [
            {
              location: '116.404,39.915',
              name: '天安门',
              biz_ext: { open_time: '00:00-23:59' },
            },
          ],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { amapVerifyProvider } = await import('./amap')
    const v = await amapVerifyProvider.verify({
      name: '天安门',
      address: '',
      city: '北京',
      origin: ORIGIN,
    })

    expect(v.verified).toBe(true)
    expect(v.point).toEqual({ lng: 116.404, lat: 39.915 })
    expect(v.openStatus).toBe('open')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('命中了但拿不到营业时间时，核实照样成立', async () => {
    // 营业状态只是锦上添花，判不出来只该是 unknown，不该影响这条地点的可用性
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({ status: '1', pois: [{ location: '116.404,39.915', name: '天安门' }] }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { amapVerifyProvider } = await import('./amap')
    const v = await amapVerifyProvider.verify({
      name: '天安门',
      address: '',
      city: '北京',
      origin: ORIGIN,
    })

    expect(v.verified).toBe(true)
    expect(v.openStatus).toBe('unknown')
  })
})
