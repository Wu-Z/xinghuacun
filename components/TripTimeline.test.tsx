// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildItinerary } from '@/lib/core/itinerary'
import type { RecommendPlace } from '@/lib/core/model'
import TripTimeline from './TripTimeline'

afterEach(cleanup)

function place(name: string, over: Partial<RecommendPlace> = {}): RecommendPlace {
  return {
    rank: 1,
    tier: '备选',
    name,
    category: '公园',
    address: '',
    fit: [{ tag: 'x', why: 'y' }],
    amapUrl: 'https://uri.amap.com/search?keyword=x',
    point: { lng: 1, lat: 1 },
    verified: true,
    ...over,
  }
}

const ORIGIN = { name: '我家', point: { lng: 0, lat: 0 } }
const STOPS = [
  { id: '公园A', name: '公园A', point: { lng: 1, lat: 1 } },
  { id: '博物馆B', name: '博物馆B', point: { lng: 2, lat: 2 } },
]
const LEGS = [
  { mode: 'driving' as const, durationSeconds: 600, distanceMeters: 3000 },
  { mode: 'driving' as const, durationSeconds: 1800, distanceMeters: 8000 },
]

function renderTimeline(over: Partial<Parameters<typeof TripTimeline>[0]> = {}) {
  const itinerary =
    over.itinerary ??
    buildItinerary({
      origin: ORIGIN,
      end: null,
      stops: STOPS,
      legs: LEGS,
    })

  const props = {
    itinerary,
    places: [place('公园A', { tier: '首选' }), place('博物馆B', { tier: '备选 · 最清净' })],
    hasEnd: false,
    onSetEnd: vi.fn(),
    onClearEnd: vi.fn(),
    onOpenDetail: vi.fn(),
    ...over,
  }
  return { ...render(<TripTimeline {...props} />), props }
}

describe('TripTimeline', () => {
  it('按顺序列出起点与各站', () => {
    renderTimeline()
    expect(screen.getByText('我家')).toBeTruthy()
    expect(screen.getByText('公园A')).toBeTruthy()
    expect(screen.getByText('博物馆B')).toBeTruthy()
    expect(screen.getByText('起点')).toBeTruthy()
  })

  it('每段标出出行方式、时长与距离', () => {
    renderTimeline()
    expect(screen.getByText(/驾车 10 分钟 · 3\.0 公里/)).toBeTruthy()
    expect(screen.getByText(/驾车 30 分钟 · 8\.0 公里/)).toBeTruthy()
  })

  it('混用方式时逐段显示各自的方式，合计处说全', () => {
    // 出行方式是逐段定的（近的走路、远的坐地铁）。拿整条的方式去说每一段，
    // 用户在时间轴上看到的就和实际不符 —— 这里钉住「每段用自己的」
    const itinerary = buildItinerary({
      origin: ORIGIN,
      end: null,
      stops: STOPS,
      legs: [
        { mode: 'walking', durationSeconds: 600, distanceMeters: 700 },
        { mode: 'transit', durationSeconds: 1800, distanceMeters: 8000 },
      ],
    })
    renderTimeline({ itinerary })

    expect(screen.getByText(/步行 10 分钟 · 700 米/)).toBeTruthy()
    expect(screen.getByText(/公交\/地铁 30 分钟 · 8\.0 公里/)).toBeTruthy()
    // 合计处不挑一个代表：单一方式会被误读成整条都是它
    expect(screen.getByText('步行 + 公交/地铁')).toBeTruthy()
  })

  it('站点带上档位与类别', () => {
    renderTimeline()
    expect(screen.getByText(/首选 · 公园/)).toBeTruthy()
    expect(screen.getByText(/备选 · 最清净 · 公园/)).toBeTruthy()
  })

  it('合计只算路上时间与里程', () => {
    renderTimeline()
    expect(screen.getByText(/路上共/)).toBeTruthy()
    expect(screen.getByText('40 分钟')).toBeTruthy()
    expect(screen.getByText('11.0 公里')).toBeTruthy()
  })

  it('未设终点时说明「到这里就结束了」，并给出设置入口', () => {
    renderTimeline({ hasEnd: false })
    expect(screen.getByText('到这里就结束了')).toBeTruthy()
    expect(screen.getByRole('button', { name: /设置终点/ })).toBeTruthy()
  })

  it('有终点时显示终点名与「改终点 / 取消终点」', () => {
    const itinerary = buildItinerary({
      origin: ORIGIN,
      end: { name: '公司', point: { lng: 9, lat: 9 } },
      stops: STOPS,
      legs: [...LEGS, { mode: 'driving', durationSeconds: 900, distanceMeters: 4000 }],
    })
    renderTimeline({ itinerary, hasEnd: true })
    expect(screen.getByText('公司')).toBeTruthy()
    expect(screen.getByRole('button', { name: '改终点' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消终点' })).toBeTruthy()
    expect(screen.queryByText('到这里就结束了')).toBeNull()
  })

  it('有路段降级时给出提示，并逐段标注', () => {
    const itinerary = buildItinerary({
      origin: ORIGIN,
      end: null,
      stops: STOPS,
      legs: [{ mode: 'walking', durationSeconds: 0, distanceMeters: 0, degraded: true }, LEGS[1]],
    })
    renderTimeline({ itinerary })
    expect(screen.getByText(/有路段没规划出来/)).toBeTruthy()
    expect(screen.getByText(/（直线估算）/)).toBeTruthy()
  })

  it('不出现任何时刻 —— 本版不排时间表', () => {
    const { container } = renderTimeline()
    expect(container.textContent).not.toMatch(/\d{1,2}:\d{2}/)
  })
})
