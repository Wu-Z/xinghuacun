import { describe, expect, it } from 'vitest'
import { parseAmapPolyline } from './amap-polyline'

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

  it('空数组（高德常用 [] 表示空值）给空数组，而不是抛错', () => {
    // 调用处写的是 `s.polyline ?? ''`，那个守卫挡不住 []。
    // 高德一旦返回 []，这里若抛错就会让该段路线静默降级。
    expect(parseAmapPolyline([])).toEqual([])
    expect(parseAmapPolyline(null)).toEqual([])
    expect(parseAmapPolyline(undefined)).toEqual([])
  })

  it('单个点也能解析', () => {
    expect(parseAmapPolyline('116.4,39.9')).toEqual([{ lng: 116.4, lat: 39.9 }])
  })
})
