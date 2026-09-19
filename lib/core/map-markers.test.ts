import { describe, expect, it } from 'vitest'
import { buildPlaceMarkers } from './map-markers'
import type { RecommendPlace } from './model'

function place(name: string, over: Partial<RecommendPlace> = {}): RecommendPlace {
  return {
    rank: 1,
    tier: '备选',
    name,
    category: '公园',
    address: '示例路 1 号',
    fit: [{ tag: '拍照', why: '理由' }],
    amapUrl: 'https://uri.amap.com/search?keyword=x',
    point: { lng: 118.1, lat: 24.57 },
    verified: true,
    ...over,
  }
}

describe('buildPlaceMarkers · 谁能上图', () => {
  it('核实通过的地点都上图 —— 不只是被勾选的那几个', () => {
    // 「只有高德核实通过的地点才能上图」这条规则的兑现面是**整张列表**：
    // 之前地图只画了已勾选的，候选一个都不显示，「能上图」只兑现了一半
    const markers = buildPlaceMarkers([place('龙舟池'), place('集美大社')], [])

    expect(markers.map((m) => m.name)).toEqual(['龙舟池', '集美大社'])
    expect(markers.every((m) => m.kind === 'candidate')).toBe(true)
  })

  it('高德没核实到的不上图（它还在列表里，只是没有位置可画）', () => {
    const markers = buildPlaceMarkers(
      [place('龙舟池'), place('某家没收录的小店', { point: null, verified: false })],
      [],
    )

    expect(markers.map((m) => m.name)).toEqual(['龙舟池'])
  })

  it('没核实通过就是没通过 —— 哪怕它带着一个坐标', () => {
    // 今天这两个字段同进同退（见 lib/providers/verify/amap），
    // 但规则写的是「核实通过才能上图」，所以判据必须落在 verified 上：
    // 哪天核实层给了坐标却没通过，地图也不该替它做主
    const markers = buildPlaceMarkers([place('存疑的地方', { verified: false })], [])

    expect(markers).toEqual([])
  })

  it('核实通过但没坐标的也不上图，不炸', () => {
    expect(buildPlaceMarkers([place('坐标缺失', { point: null })], [])).toEqual([])
  })
})

describe('buildPlaceMarkers · 编号只给已选', () => {
  it('在路线里的带编号，编号就是在路线里的名次', () => {
    const markers = buildPlaceMarkers(
      [place('龙舟池'), place('集美大社'), place('海堤路')],
      ['集美大社', '龙舟池'],
    )

    const named = Object.fromEntries(markers.map((m) => [m.name, m.order]))
    expect(named['集美大社']).toBe(1)
    expect(named['龙舟池']).toBe(2)
    // 没被勾的那条不给编号 —— 列表上它此刻写的还是「+」
    expect(named['海堤路']).toBeNull()
  })

  it('备选排在前、已选排在后（后加的盖在上面，编号才不会被空心点压住）', () => {
    const markers = buildPlaceMarkers(
      [place('龙舟池'), place('集美大社'), place('海堤路')],
      ['海堤路'],
    )

    expect(markers.map((m) => m.kind)).toEqual(['candidate', 'candidate', 'selected'])
  })

  it('路线里有、列表里没有的名字不进标记集合', () => {
    // visitOrder 是服务端算完的最优顺序，理论上与列表同源；
    // 但真的出现对不上的名字时，宁可少画一个点，也不要画一个没名字的
    const markers = buildPlaceMarkers([place('龙舟池')], ['龙舟池', '不存在的地方'])

    expect(markers.map((m) => m.name)).toEqual(['龙舟池'])
  })

  it('不改动传进来的数组', () => {
    const places = [place('龙舟池')]
    const visitOrder = ['龙舟池']
    buildPlaceMarkers(places, visitOrder)

    expect(places).toHaveLength(1)
    expect(visitOrder).toEqual(['龙舟池'])
  })
})
