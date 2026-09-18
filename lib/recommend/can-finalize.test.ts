import { describe, expect, it } from 'vitest'
import type { RecommendPlace } from '@/lib/core/model'
import { canFinalize } from './can-finalize'

function place(name: string, contains?: string[]): RecommendPlace {
  return {
    rank: 1,
    tier: '备选',
    name,
    category: '未分类',
    address: '',
    fit: [{ tag: 'x', why: 'y' }],
    contains,
    amapUrl: 'https://uri.amap.com/search?keyword=x',
    point: null,
    verified: false,
  }
}

describe('canFinalize', () => {
  it('选了复合地点 → 可以细化', () => {
    const places = [place('集美学村', ['龙舟池', '集美大社'])]
    expect(canFinalize(places, ['集美学村'])).toBe(true)
  })

  it('只选了非复合地点 → 不可以细化', () => {
    // 这是实测踩到的坑：全都透传、没有 parent，界面却仍然显示细化按钮，
    // 点下去看起来毫无反应，用户可以无限点
    const places = [place('海堤路（集美段）'), place('集美鳌园')]
    expect(canFinalize(places, ['海堤路（集美段）'])).toBe(false)
  })

  it('选中的是细化后产生的子点（没有 contains）→ 不可以再细化', () => {
    const places = [place('龙舟池', undefined)]
    expect(canFinalize(places, ['龙舟池'])).toBe(false)
  })

  it('没选任何东西 → 不可以', () => {
    const places = [place('集美学村', ['龙舟池'])]
    expect(canFinalize(places, [])).toBe(false)
  })

  it('混选时只要有一个复合就允许', () => {
    const places = [place('集美学村', ['龙舟池']), place('海堤路（集美段）')]
    expect(canFinalize(places, ['海堤路（集美段）', '集美学村'])).toBe(true)
  })

  it('contains 为空数组视同非复合', () => {
    const places = [place('某地', [])]
    expect(canFinalize(places, ['某地'])).toBe(false)
  })

  it('选中的名字在列表里找不到时忽略它', () => {
    const places = [place('海堤路（集美段）')]
    expect(canFinalize(places, ['不存在的名字'])).toBe(false)
  })
})
