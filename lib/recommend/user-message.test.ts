import { describe, expect, it } from 'vitest'
import type { RecommendRequest } from '@/lib/core/model'
import { buildUserMessage } from './index'

const PREFS = {
  intents: ['拍照'],
  timeBudget: '半天',
  travelMode: ['步行'],
  companions: null,
  crowdTolerance: null,
  rawRequest: '',
  destination: '',
}

function req(over: Partial<RecommendRequest> = {}): RecommendRequest {
  return {
    task: 'refine',
    origin: { point: { lng: 118.097, lat: 24.573 } },
    destination: { mode: 'nearby', requested: null },
    preferences: PREFS,
    ...over,
  }
}

const PLACE = { label: '福建省厦门市集美区', city: '厦门市' }

describe('buildUserMessage', () => {
  it('单点追问带上类别与地址，避免同名歧义', () => {
    const text = buildUserMessage(
      req({ focus: { name: '集美大社', address: '厦门市集美区集美大社', category: '景点' } }),
      PLACE,
    )
    expect(text).toContain('追问范围：单个地点「集美大社」（景点，厦门市集美区集美大社）')
  })

  it('当前列表把复合地点的子点一起给出去', () => {
    const text = buildUserMessage(
      req({
        previous: [
          { name: '集美学村', tier: '首选', category: '历史街区', contains: ['龙舟池', '集美大社'] },
          { name: '集美塔', tier: '备选', category: '观景' },
        ],
      }),
      PLACE,
    )
    expect(text).toContain('当前列表：集美学村（含 龙舟池、集美大社）、集美塔')
  })

  it('单点追问也带当前列表 —— skill 靠它对 added 去重', () => {
    const text = buildUserMessage(
      req({
        focus: { name: '集美学村', address: 'x', category: 'y' },
        previous: [{ name: '集美学村', tier: '首选', category: '历史街区', contains: ['龙舟池'] }],
      }),
      PLACE,
    )
    expect(text).toContain('当前列表：集美学村（含 龙舟池）')
  })

  it('没有 contains 的地点不带括号', () => {
    const text = buildUserMessage(
      req({ previous: [{ name: '园博园', tier: '备选', category: '园林' }] }),
      PLACE,
    )
    expect(text).toContain('当前列表：园博园')
    expect(text).not.toContain('园博园（')
  })

  it('用户原话有值时下发', () => {
    const text = buildUserMessage(
      req({ preferences: { ...PREFS, rawRequest: '想找能坐下来的地方' } }),
      PLACE,
    )
    expect(text).toContain('用户原话：想找能坐下来的地方')
  })

  it('用户原话为空时不出现这一行', () => {
    expect(buildUserMessage(req(), PLACE)).not.toContain('用户原话')
  })
})
