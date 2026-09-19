import { describe, expect, it } from 'vitest'
import { mapPlaceSearch } from './place-search'

/** 用一个固定时刻，免得用例在夜里跑绿、在白天跑红 */
const NOON = new Date('2026-09-19T12:00:00')
const MIDNIGHT = new Date('2026-09-19T03:00:00')

function poi(over: Record<string, unknown> = {}) {
  return {
    name: '集美万达广场',
    address: '福建省厦门市集美区银江路 168 号',
    location: '118.097,24.573',
    // 高德真实形状：由粗到细
    type: '购物服务;商场;购物中心',
    ...over,
  }
}

describe('mapPlaceSearch', () => {
  it('顺序原样保留 —— 我们改不了高德的排序，就不要假装排过', () => {
    const hits = mapPlaceSearch(
      {
        pois: [
          poi({ name: '第一条' }),
          poi({ name: '第二条' }),
          poi({ name: '第三条' }),
        ],
      },
      NOON,
    )

    expect(hits.map((h) => h.name)).toEqual(['第一条', '第二条', '第三条'])
  })

  it('坐标与地址摊平', () => {
    const [hit] = mapPlaceSearch({ pois: [poi()] }, NOON)

    expect(hit.point).toEqual({ lng: 118.097, lat: 24.573 })
    expect(hit.address).toBe('福建省厦门市集美区银江路 168 号')
  })

  it('类型取最具体的那一段 —— 第一段是「购物服务」，摆给用户看等于没说', () => {
    expect(mapPlaceSearch({ pois: [poi()] }, NOON)[0].category).toBe('购物中心')

    // 只有一段时就是它自己
    expect(mapPlaceSearch({ pois: [poi({ type: '风景名胜' })] }, NOON)[0].category).toBe('风景名胜')
    // 没有类型字段时留空，不编
    expect(mapPlaceSearch({ pois: [poi({ type: [] })] }, NOON)[0].category).toBe('')
  })

  it('没有坐标的结果不发出去 —— 点了也落不了地', () => {
    const hits = mapPlaceSearch(
      { pois: [poi({ name: '有坐标' }), poi({ name: '没坐标', location: [] })] },
      NOON,
    )

    expect(hits.map((h) => h.name)).toEqual(['有坐标'])
  })

  it('没有名字的结果同样不发', () => {
    const hits = mapPlaceSearch({ pois: [poi({ name: [] })] }, NOON)
    expect(hits).toEqual([])
  })

  it('没给 pois 时返回空列表，不抛', () => {
    expect(mapPlaceSearch({}, NOON)).toEqual([])
    expect(mapPlaceSearch({ pois: undefined }, NOON)).toEqual([])
  })

  describe('营业状态', () => {
    it('当前在营业时间内 → open', () => {
      const [hit] = mapPlaceSearch(
        { pois: [poi({ biz_ext: { open_time: '09:00-22:00' } })] },
        NOON,
      )
      expect(hit.openStatus).toBe('open')
    })

    it('当前不在营业时间内 → closed（是「已打烊」，不是「已停业」）', () => {
      const [hit] = mapPlaceSearch(
        { pois: [poi({ biz_ext: { open_time: '09:00-22:00' } })] },
        MIDNIGHT,
      )
      expect(hit.openStatus).toBe('closed')
    })

    it('没有营业时间就 unknown —— 不把「不知道」当成「已打烊」', () => {
      expect(mapPlaceSearch({ pois: [poi()] }, NOON)[0].openStatus).toBe('unknown')
      expect(mapPlaceSearch({ pois: [poi({ biz_ext: {} })] }, NOON)[0].openStatus).toBe('unknown')
      // 高德用 [] 表示空字段
      expect(mapPlaceSearch({ pois: [poi({ biz_ext: [] })] }, NOON)[0].openStatus).toBe('unknown')
    })

    it('新版字段名 opentime2 也认', () => {
      const [hit] = mapPlaceSearch(
        { pois: [poi({ biz_ext: { opentime2: '09:00-22:00' } })] },
        NOON,
      )
      expect(hit.openStatus).toBe('open')
    })
  })
})
