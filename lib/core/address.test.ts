import { describe, expect, it } from 'vitest'
import { areaLabel } from './address'

describe('areaLabel', () => {
  it('站在 AOI 里时用区域名，而不是街道名', () => {
    // 用户站在软件园三期里。「厦门市集美区后溪镇」话没说错，
    // 但对「我在哪」这个问题等于没回答
    expect(
      areaLabel({
        city: '厦门市',
        district: '集美区',
        township: '后溪镇',
        area: '软件园B区',
        areaDistanceMeters: 0,
      }),
    ).toBe('厦门市集美区软件园B区')
  })

  it('AOI 在两百米开外就不算「你在的地方」，退回行政区划', () => {
    expect(
      areaLabel({
        city: '厦门市',
        district: '思明区',
        township: '莲前街道',
        area: '安费诺电子装配(厦门)有限公司',
        areaDistanceMeters: 260,
      }),
    ).toBe('厦门市思明区莲前街道')
  })

  it('没有 AOI 时退回行政区划', () => {
    expect(areaLabel({ city: '厦门市', district: '集美区', township: '灌口镇' })).toBe(
      '厦门市集美区灌口镇',
    )
  })

  it('直辖市省市同名只保留一份', () => {
    expect(areaLabel({ city: '上海市', district: '徐汇区', township: '徐家汇街道' })).toBe(
      '上海市徐汇区徐家汇街道',
    )
  })

  it('字段缺失时跳过，不留空档', () => {
    expect(areaLabel({ city: '杭州市', district: '西湖区' })).toBe('杭州市西湖区')
  })

  it('全都缺失时给兜底文案', () => {
    expect(areaLabel({})).toBe('已选位置')
  })
})
