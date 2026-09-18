import { describe, expect, it } from 'vitest'
import { toGcj02 } from './coordinate'
import { haversineMeters } from './geo'

const BEIJING = { lng: 116.397, lat: 39.909 } // 天安门
const TOKYO = { lng: 139.7671, lat: 35.6812 } // 境外

describe('toGcj02', () => {
  it('地图选点已是 GCJ-02，必须原样返回', () => {
    expect(toGcj02(BEIJING, 'map-pick')).toEqual(BEIJING)
  })

  it('搜索得到的地点已是 GCJ-02，原样返回', () => {
    expect(toGcj02(BEIJING, 'search')).toEqual(BEIJING)
  })

  it('浏览器定位是 WGS-84，需转换', () => {
    const out = toGcj02(BEIJING, 'geolocation')
    expect(out).not.toEqual(BEIJING)
  })

  it('转换后偏移量落在国内的 100~700 米区间内', () => {
    const out = toGcj02(BEIJING, 'geolocation')
    const d = haversineMeters(BEIJING, out)
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(700)
  })

  it('境外坐标不做偏移（法规只约束国内）', () => {
    const out = toGcj02(TOKYO, 'geolocation')
    expect(haversineMeters(TOKYO, out)).toBeLessThan(5)
  })

  it('同样输入永远同样输出', () => {
    expect(toGcj02(BEIJING, 'geolocation')).toEqual(toGcj02(BEIJING, 'geolocation'))
  })

  it('不修改入参', () => {
    const input = { ...BEIJING }
    const snapshot = JSON.stringify(input)
    toGcj02(input, 'geolocation')
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})
