import { describe, expect, it } from 'vitest'
import { haversineMeters, minutesToMeters, simplifyPolyline } from './geo'

describe('haversineMeters', () => {
  it('同一点距离为 0', () => {
    expect(haversineMeters({ lng: 116.4, lat: 39.9 }, { lng: 116.4, lat: 39.9 })).toBe(0)
  })

  it('纬度差 0.009 度约等于 1000 米', () => {
    const d = haversineMeters({ lng: 116.4, lat: 39.9 }, { lng: 116.4, lat: 39.909 })
    expect(d).toBeGreaterThan(990)
    expect(d).toBeLessThan(1010)
  })
})

describe('minutesToMeters', () => {
  it('按方式取速度换算', () => {
    // driving 30km/h，60 分钟 = 30km = 30000 米
    expect(minutesToMeters(60, 'driving')).toBe(30000)
    // walking 4.5km/h，60 分钟 = 4500 米
    expect(minutesToMeters(60, 'walking')).toBe(4500)
  })

  it('步行的可达范围小于驾车', () => {
    expect(minutesToMeters(30, 'walking')).toBeLessThan(minutesToMeters(30, 'driving'))
  })
})

describe('simplifyPolyline', () => {
  it('少于 3 个点原样返回', () => {
    const two = [
      { lng: 0, lat: 0 },
      { lng: 1, lat: 1 },
    ]
    expect(simplifyPolyline(two, 10)).toEqual(two)
  })

  it('丢掉共线中间点', () => {
    const line = [
      { lng: 0, lat: 0 },
      { lng: 0.001, lat: 0 },
      { lng: 0.002, lat: 0 },
    ]
    expect(simplifyPolyline(line, 10)).toEqual([line[0], line[2]])
  })

  it('保留明显拐点', () => {
    const corner = [
      { lng: 0, lat: 0 },
      { lng: 0.01, lat: 0 },
      { lng: 0.01, lat: 0.01 },
    ]
    expect(simplifyPolyline(corner, 10)).toHaveLength(3)
  })
})
