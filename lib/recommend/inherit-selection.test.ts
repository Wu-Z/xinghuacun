import { describe, expect, it } from 'vitest'
import type { RecommendPlace } from '@/lib/core/model'
import { inheritSelection } from './inherit-selection'

function place(name: string, over: Partial<RecommendPlace> = {}): RecommendPlace {
  return {
    rank: 1,
    tier: '备选',
    name,
    category: '未分类',
    address: '',
    fit: [{ tag: 'x', why: 'y' }],
    amapUrl: 'https://uri.amap.com/search?keyword=x',
    point: null,
    verified: false,
    ...over,
  }
}

describe('inheritSelection', () => {
  it('子点继承父级的选中状态', () => {
    const after = [
      place('龙舟池', { parent: '集美学村' }),
      place('集美大社', { parent: '集美学村' }),
    ]
    expect(inheritSelection(after, ['集美学村'])).toEqual(['龙舟池', '集美大社'])
  })

  it('没选中的父级，其子点默认不选', () => {
    const after = [place('龙舟池', { parent: '集美学村' })]
    expect(inheritSelection(after, ['园博园'])).toEqual([])
  })

  it('单一地点原样透传时保持选中', () => {
    const after = [place('园博园', { parent: null })]
    expect(inheritSelection(after, ['园博园'])).toEqual(['园博园'])
  })

  it('不属于任何已选父级的点默认不选（skill 新增的）', () => {
    const after = [
      place('龙舟池', { parent: '集美学村' }),
      place('集美塔', { parent: null }),
    ]
    expect(inheritSelection(after, ['集美学村'])).toEqual(['龙舟池'])
  })

  it('混合场景：选中的复合地点拆开 + 选中的单一地点透传', () => {
    const after = [
      place('龙舟池', { parent: '集美学村' }),
      place('集美大社', { parent: '集美学村' }),
      place('园博园', { parent: null }),
      place('集美塔', { parent: null }),
    ]
    expect(inheritSelection(after, ['集美学村', '园博园'])).toEqual(['龙舟池', '集美大社', '园博园'])
  })

  it('父级没选，但子点名字恰好与被选的顶层同名时，不误选', () => {
    // 子点靠 parent 判定归属，不是靠名字撞上
    const after = [place('园博园', { parent: '集美学村' })]
    expect(inheritSelection(after, ['园博园'])).toEqual([])
  })

  it('细化前没选任何东西时结果是空', () => {
    const after = [place('龙舟池', { parent: '集美学村' })]
    expect(inheritSelection(after, [])).toEqual([])
  })

  it('保持输入顺序', () => {
    const after = [
      place('集美大社', { parent: '集美学村' }),
      place('龙舟池', { parent: '集美学村' }),
    ]
    expect(inheritSelection(after, ['集美学村'])).toEqual(['集美大社', '龙舟池'])
  })

  it('不改动入参', () => {
    const after = [place('龙舟池', { parent: '集美学村' })]
    const selected = ['集美学村']
    const a = JSON.stringify(after)
    const b = JSON.stringify(selected)
    inheritSelection(after, selected)
    expect(JSON.stringify(after)).toBe(a)
    expect(JSON.stringify(selected)).toBe(b)
  })
})
