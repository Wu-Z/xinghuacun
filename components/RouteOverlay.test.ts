import { describe, expect, it } from 'vitest'
import { buildMarkerHtml, originMarker } from './RouteOverlay'
import type { MapMarkerSpec } from '@/lib/core/map-markers'

const POINT = { lng: 118.1, lat: 24.57 }

const selected: MapMarkerSpec = {
  name: '龙舟池',
  label: '龙舟池',
  point: POINT,
  kind: 'selected',
  order: 2,
}
const candidate: MapMarkerSpec = {
  name: '海堤路',
  label: '海堤路',
  point: POINT,
  kind: 'candidate',
  order: null,
}

/** 高德吃的是 HTML 字符串，Tailwind 类名挂不上去，所以判据只能落在这段字符串上 */
describe('buildMarkerHtml · 三种形态', () => {
  it('已选：玉色实心 + 它在这条路线里的名次', () => {
    const html = buildMarkerHtml(selected, false)

    expect(html).toContain('>2<')
    expect(html).toContain('background:#0f6e6e')
  })

  it('备选：白底空心，**不带编号**', () => {
    const html = buildMarkerHtml(candidate, false)

    // 编号只属于已经选进路线的那几个；备选在列表里写的还是「+」
    expect(html).not.toMatch(/>\d</)
    expect(html).toContain('background:#ffffff')
    expect(html).not.toContain('background:#0f6e6e')
  })

  it('起点：一个「起」字，不是编号', () => {
    const html = buildMarkerHtml(originMarker(POINT, '出发点'), false)

    expect(html).toContain('>起<')
    expect(html).not.toMatch(/>\d</)
  })
})

describe('buildMarkerHtml · 悬停只改轮廓，不改判据', () => {
  it('悬停备选仍是空心的 —— 填实就与「已选」混了', () => {
    const html = buildMarkerHtml(candidate, true)

    // 「实体 = 已选、空心 = 备选」是稿子里同一句话，悬停不许把它糊掉
    expect(html).toContain('background:#ffffff')
    expect(html).not.toContain('background:#0f6e6e')
    expect(html).not.toMatch(/>\d</)
  })

  it('悬停备选：边更粗、圆更大、外面多一圈光晕', () => {
    const quiet = buildMarkerHtml(candidate, false)
    const loud = buildMarkerHtml(candidate, true)

    expect(quiet).not.toContain('rgba(15,110,110,0.16)')
    expect(loud).toContain('rgba(15,110,110,0.16)')
    expect(quiet).toContain('width:18px')
    expect(loud).toContain('width:22px')
    expect(quiet).toContain('border:2px solid #0f6e6e')
    expect(loud).toContain('border:3px solid #0f6e6e')
  })

  it('悬停已选：还是那个编号实心圆，只是多了光晕', () => {
    const html = buildMarkerHtml(selected, true)

    expect(html).toContain('>2<')
    expect(html).toContain('background:#0f6e6e')
    expect(html).toContain('rgba(15,110,110,0.22)')
  })

  it('外框恒定 32、圆永远比它小 —— 悬停前后中心不挪', () => {
    // 高德的 offset 是常量，按外框算中心。外框一旦跟着圆变，标记中心就会偏几像素：
    // 鼠标没动而点在动，看着像地图在抖
    for (const spec of [candidate, selected, originMarker(POINT, '出发点')]) {
      for (const hovered of [false, true]) {
        expect(buildMarkerHtml(spec, hovered).match(/width:32px/g)).toHaveLength(1)
      }
    }
  })
})

describe('buildMarkerHtml · 能点的才给手型', () => {
  it('列表里的地点可以点开详情，给手型', () => {
    expect(buildMarkerHtml(candidate, false)).toContain('cursor:pointer')
    expect(buildMarkerHtml(selected, false)).toContain('cursor:pointer')
  })

  it('出发点不给 —— 点了没有任何事发生，给手型就是骗人', () => {
    expect(buildMarkerHtml(originMarker(POINT, '出发点'), false)).not.toContain('cursor:pointer')
  })
})
