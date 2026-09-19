import { describe, expect, it } from 'vitest'
import type { Itinerary } from './itinerary'
import type { RecommendPlace } from './model'
import {
  buildShareCard,
  cityDistrict,
  defaultShareTitle,
  shareContextLabel,
  shareFileName,
} from './share-card'

function itinerary(over: Partial<Itinerary> = {}): Itinerary {
  return {
    stops: [
      { kind: 'start', name: '当前位置', point: { lng: 0, lat: 0 }, stopId: null },
      { kind: 'stop', name: '龙舟池畔', point: { lng: 1, lat: 1 }, stopId: '龙舟池畔' },
      { kind: 'stop', name: '集美大社', point: { lng: 2, lat: 2 }, stopId: '集美大社' },
    ],
    legs: [
      { fromName: '当前位置', toName: '龙舟池畔', mode: 'walking', durationSeconds: 480, distanceMeters: 600, degraded: false },
      { fromName: '龙舟池畔', toName: '集美大社', mode: 'bicycling', durationSeconds: 600, distanceMeters: 1900, degraded: false },
    ],
    totalTravelMinutes: 18,
    totalDistanceMeters: 2500,
    hasDegradedLeg: false,
    ...over,
  }
}

function place(name: string, why?: string): RecommendPlace {
  return {
    rank: 1,
    tier: '首选',
    name,
    category: '老街区',
    address: '厦门市集美区',
    fit: why ? [{ tag: '人少', why }] : [],
    amapUrl: '',
    point: { lng: 1, lat: 1 },
    verified: true,
  }
}

describe('buildShareCard · 卡面内容', () => {
  it('起点不进卡，编号从 1 开始按站序排', () => {
    const card = buildShareCard({
      itinerary: itinerary(),
      places: [place('龙舟池畔'), place('集美大社')],
      title: '学村半日闲走',
      when: null,
    })

    expect(card.stops.map((s) => s.order)).toEqual([1, 2])
    expect(card.stops.map((s) => s.name)).toEqual(['龙舟池畔', '集美大社'])
    // 「当前位置」是出发的地方，不是这张路书上的一站
    expect(card.stops.some((s) => s.name === '当前位置')).toBe(false)
  })

  it('每站带的是「上一站到本站」那一段，首站没有', () => {
    const card = buildShareCard({
      itinerary: itinerary(),
      places: [],
      title: 't',
      when: null,
    })

    expect(card.stops[0].leg).toBeNull()
    expect(card.stops[1].leg).toBe('骑行 10 分钟 · 1.9 公里')
  })

  it('why 用 skill 给的理由原文，取不到就留空而不是编一句', () => {
    const card = buildShareCard({
      itinerary: itinerary(),
      places: [place('龙舟池畔', '午后几乎没旅行团，池边石栏可以坐很久')],
      title: 't',
      when: null,
    })

    expect(card.stops[0].why).toBe('午后几乎没旅行团，池边石栏可以坐很久')
    expect(card.stops[1].why).toBe('')
  })

  it('汇总行写站数 + 逐段方式 + 总里程', () => {
    const card = buildShareCard({ itinerary: itinerary(), places: [], title: 't', when: null })
    expect(card.summary).toBe('2 站 · 步行 + 骑行 · 约 2.5 公里')
  })

  it('出行时间只有真的写了才上卡', () => {
    const withWhen = buildShareCard({
      itinerary: itinerary(),
      places: [],
      title: 't',
      when: ' 本周六 14:00 ',
    })
    expect(withWhen.when).toBe('本周六 14:00')

    const blank = buildShareCard({ itinerary: itinerary(), places: [], title: 't', when: '   ' })
    expect(blank.when).toBeNull()
  })

  it('卡上固定带核实口径那行', () => {
    const card = buildShareCard({ itinerary: itinerary(), places: [], title: 't', when: null })
    expect(card.disclaimer).toBe('地点经高德核实 · 距离为直线口径')
  })
})

describe('defaultShareTitle', () => {
  it('用能确认的两件事命名：从哪一站起、一共几站', () => {
    expect(defaultShareTitle('龙舟池畔', 3)).toBe('龙舟池畔起 · 3 站')
  })
})

describe('cityDistrict', () => {
  it('从出发点的说法里挑出市与区', () => {
    expect(cityDistrict('厦门市集美区软件园B区')).toEqual({ city: '厦门', district: '集美' })
    expect(cityDistrict('北京市朝阳区望京')).toEqual({ city: '北京', district: '朝阳' })
  })

  it('认不出来就返回空 —— 宁可少一行，也不写一句猜的', () => {
    expect(cityDistrict('当前位置')).toEqual({ city: '', district: '' })
    expect(cityDistrict('')).toEqual({ city: '', district: '' })
  })

  it('只有市没有区时也只给市', () => {
    expect(cityDistrict('厦门市')).toEqual({ city: '厦门', district: '' })
  })
})

describe('shareContextLabel', () => {
  it('城市 + 今天 + 天气，天气归「今天」不归出行时间', () => {
    expect(shareContextLabel({ label: '厦门市集美区软件园B区', weather: '26° 晴' })).toBe(
      '厦门 · 集美 · 今天 · 26° 晴',
    )
  })

  it('认不出城市时只写今天与天气', () => {
    expect(shareContextLabel({ label: '当前位置', weather: '26° 晴' })).toBe('今天 · 26° 晴')
  })

  it('城市与天气都拿不到就整行不给 —— 光秃秃一个「今天」比没有更让人困惑', () => {
    expect(shareContextLabel({ label: '当前位置', weather: null })).toBeNull()
    expect(shareContextLabel({ label: '当前位置' })).toBeNull()
  })
})

describe('shareFileName', () => {
  it('把文件名里不能用的字符换掉', () => {
    expect(shareFileName('学村半日闲走')).toBe('学村半日闲走.png')
    expect(shareFileName('周六 / 集美 · 半日')).toBe('周六-集美-·-半日.png')
    expect(shareFileName('  a/b:c  ')).toBe('a-b-c.png')
  })

  it('名字被清空时退回一个能认出来的默认名', () => {
    expect(shareFileName('   ')).toBe('周边去哪-行程.png')
    expect(shareFileName('///')).toBe('周边去哪-行程.png')
  })
})
