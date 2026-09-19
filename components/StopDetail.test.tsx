// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecommendPlace } from '@/lib/core/model'
import StopDetail from './StopDetail'

afterEach(cleanup)

function place(over: Partial<RecommendPlace> = {}): RecommendPlace {
  return {
    rank: 1,
    tier: '首选',
    name: '集美大社',
    category: '老街区',
    address: '福建省厦门市集美区大社路',
    fit: [{ tag: '人少', why: '戏台边的骑楼长廊有风有座位' }],
    amapUrl: 'https://uri.amap.com/search?keyword=x',
    point: { lng: 118.1, lat: 24.5 },
    verified: true,
    distanceMeters: 3100,
    cost: '免费',
    openStatus: 'open',
    ...over,
  }
}

function renderDetail(over: Partial<Parameters<typeof StopDetail>[0]> = {}) {
  const props = {
    place: place(),
    order: 2,
    selected: true,
    onToggle: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  return { ...render(<StopDetail {...props} />), props }
}

describe('StopDetail · 编号', () => {
  it('加入路线时显示它在路线里的编号', () => {
    renderDetail({ order: 2 })
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('还没加入时给虚线圈里的「!」，不是留空', () => {
    renderDetail({ order: null })
    expect(screen.getByText('!')).toBeTruthy()
    expect(screen.queryByText('2')).toBeNull()
  })
})

describe('StopDetail · 关键数字提到标题下', () => {
  it('距离、费用、营业状态跟着名字出现，且距离标明「直线」', () => {
    renderDetail()

    expect(screen.getByText(/3\.1 公里 · 直线/)).toBeTruthy()
    expect(screen.getByText('免费')).toBeTruthy()
    expect(screen.getByText('营业中')).toBeTruthy()
  })

  it('未核实的地点不给这一行 —— 没有坐标就没有距离可谈', () => {
    renderDetail({
      place: place({ verified: false, point: null, distanceMeters: undefined, openStatus: 'unknown' }),
      order: null,
    })

    expect(screen.queryByText(/· 直线/)).toBeNull()
    expect(screen.getByText(/高德未能核实到该地点/)).toBeTruthy()
  })
})

describe('StopDetail · 可信度常驻', () => {
  it('坐标 / 营业状态 / 距离三行不折叠，直接可读', () => {
    renderDetail()

    expect(screen.getByText('可信度')).toBeTruthy()
    expect(screen.getByText('高德已核实')).toBeTruthy()
    expect(screen.getByText('高德实况 · 营业中')).toBeTruthy()
    expect(screen.getByText(/直线 3\.1 公里，真实里程以路线规划为准/)).toBeTruthy()
  })

  it('没有坐标时不编一个距离', () => {
    renderDetail({ place: place({ verified: false, point: null, distanceMeters: undefined }) })

    expect(screen.getByText('高德未能核实')).toBeTruthy()
    expect(screen.getByText('没有坐标，算不出距离')).toBeTruthy()
  })

  it('高德没给营业时间就说没给，不写成「已打烊」', () => {
    renderDetail({ place: place({ openStatus: 'unknown' }) })
    expect(screen.getByText('高德未提供营业时间')).toBeTruthy()
  })
})

describe('StopDetail · 底部动作', () => {
  it('已选时主按钮是「从路线中移除」，未选时是「加入路线」', () => {
    renderDetail({ selected: true })
    expect(screen.getByRole('button', { name: '从路线中移除' })).toBeTruthy()

    cleanup()
    renderDetail({ selected: false })
    expect(screen.getByRole('button', { name: '加入路线' })).toBeTruthy()
  })

  it('未核实的地点按钮禁用，但「在高德打开」照给 —— 出口不能一起封死', () => {
    renderDetail({ place: place({ verified: false, point: null }), order: null })

    expect((screen.getByRole('button', { name: '无法加入路线' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText('在高德打开')).toBeTruthy()
  })
})
