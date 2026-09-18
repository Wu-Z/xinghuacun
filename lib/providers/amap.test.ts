import { describe, expect, it } from 'vitest'
import { mapAmapPoi, parseAmapPolyline } from './poi/amap'

const NOW = new Date(2026, 8, 18, 10, 0)
const ORIGIN = { lng: 116.4, lat: 39.9 }

const RAW = {
  id: 'B0FFH12345',
  name: '示例公园',
  type: '风景名胜;公园广场;公园',
  typecode: '110101',
  location: '116.401,39.901',
  distance: '1234',
  address: '示例路 1 号',
  tel: '010-12345678',
  biz_ext: { rating: '4.5', open_time: '09:00-17:00' },
}

describe('mapAmapPoi', () => {
  it('字段映射齐全', () => {
    const p = mapAmapPoi(RAW, ORIGIN, 'fallback', NOW)
    expect(p.id).toBe('B0FFH12345')
    expect(p.name).toBe('示例公园')
    expect(p.point).toEqual({ lng: 116.401, lat: 39.901 })
    expect(p.distanceMeters).toBe(1234)
    expect(p.rating).toBe(4.5)
    expect(p.openStatus).toBe('open')
  })

  it('type 只取第一段作为归一化大类', () => {
    expect(mapAmapPoi(RAW, ORIGIN, 'f', NOW).category).toBe('风景名胜')
  })

  it('rating 为空串时视为没有评分', () => {
    const p = mapAmapPoi({ ...RAW, biz_ext: { rating: '' } }, ORIGIN, 'f', NOW)
    expect(p.rating).toBeUndefined()
  })

  it('biz_ext 整个缺失时不炸，营业状态为 unknown', () => {
    const { biz_ext, ...withoutExt } = RAW
    const p = mapAmapPoi(withoutExt, ORIGIN, 'f', NOW)
    expect(p.openStatus).toBe('unknown')
    expect(p.rating).toBeUndefined()
  })

  it('location 缺失时回落到传入的 origin，且距离重算', () => {
    const { location, distance, ...withoutLoc } = RAW
    const p = mapAmapPoi(withoutLoc, ORIGIN, 'f', NOW)
    expect(p.point).toEqual({ lng: 116.4, lat: 39.9 })
    expect(p.distanceMeters).toBe(0)
  })

  it('id 缺失时用传入的 fallbackId 兜底', () => {
    const { id, ...withoutId } = RAW
    expect(mapAmapPoi(withoutId, ORIGIN, 'fallback-7', NOW).id).toBe('fallback-7')
  })

  it('距离缺失时用坐标现算', () => {
    const { distance, ...withoutDistance } = RAW
    const p = mapAmapPoi(withoutDistance, ORIGIN, 'f', NOW)
    expect(p.distanceMeters).toBeGreaterThan(0)
    expect(p.distanceMeters).toBeLessThan(300)
  })

  it('空 name 给兜底名称，不留空标题', () => {
    const p = mapAmapPoi({ ...RAW, name: '' }, ORIGIN, 'f', NOW)
    expect(p.name.length).toBeGreaterThan(0)
  })

  // 以下两条来自真实高德返回：它用 [] 表示空字段，不保证是字符串
  it('高德用空数组表示空字段时不炸，全部回落到兜底值', () => {
    const p = mapAmapPoi(
      { id: [], name: [], type: [], location: [], distance: [], address: [] },
      ORIGIN,
      'fallback',
      NOW,
    )
    expect(p.id).toBe('fallback')
    expect(p.name).toBe('未命名地点')
    expect(p.category).toBe('其他')
    expect(p.distanceMeters).toBe(0)
    expect(p.address).toBe('')
    expect(p.openStatus).toBe('unknown')
  })

  it('biz_ext 里的 rating 与 open_time 是数组时也能解析', () => {
    const p = mapAmapPoi(
      { ...RAW, biz_ext: { rating: ['4.5'], open_time: ['09:00-17:00'] } },
      ORIGIN,
      'f',
      NOW,
    )
    expect(p.rating).toBe(4.5)
    expect(p.openStatus).toBe('open')
  })
})

describe('parseAmapPolyline', () => {
  it('解析分号分隔的 lng,lat 串', () => {
    expect(parseAmapPolyline('116.4,39.9;116.41,39.91')).toEqual([
      { lng: 116.4, lat: 39.9 },
      { lng: 116.41, lat: 39.91 },
    ])
  })

  it('空串给空数组', () => {
    expect(parseAmapPolyline('')).toEqual([])
  })

  it('跳过格式不对的片段而不是抛错', () => {
    expect(parseAmapPolyline('116.4,39.9;坏数据;116.41,39.91')).toHaveLength(2)
  })
})
