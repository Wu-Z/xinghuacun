import { describe, expect, it } from 'vitest'
import type { RecommendPlace } from '@/lib/core/model'
import { applyDiff } from './apply-diff'

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

describe('applyDiff', () => {
  it('新增追加到末尾', () => {
    const out = applyDiff([place('A'), place('B')], { added: [place('C')], removed: [] })
    expect(out.places.map((p) => p.name)).toEqual(['A', 'B', 'C'])
  })

  it('added 只报「真正追加」的名字，同名 upsert 归 updated', () => {
    // 调用方靠这个区分「新增项」与「更新项」：只有新增项才需要记下它
    // 是从哪次追问来的（锚点），更新项位置没变，不该被重新归属
    const out = applyDiff([place('A'), place('B')], {
      added: [place('B', { tier: '更新过' }), place('C')],
      removed: [],
    })
    expect(out.added).toEqual(['C'])
    expect(out.updated).toEqual(['B'])
  })

  it('移除顶层地点', () => {
    const out = applyDiff([place('A'), place('B')], { added: [], removed: [{ name: 'B', reason: 'x' }] })
    expect(out.places.map((p) => p.name)).toEqual(['A'])
    expect(out.removedTopLevel).toEqual(['B'])
  })

  it('同名新增视为「更新」，原地替换而不是产生重复项', () => {
    const out = applyDiff([place('A', { tier: '首选' }), place('B')], {
      added: [place('A', { tier: '更新过' })],
      removed: [],
    })
    expect(out.places.map((p) => p.name)).toEqual(['A', 'B'])
    expect(out.places[0].tier).toBe('更新过')
    expect(out.updated).toEqual(['A'])
  })

  it('更新复合地点时 contains 随之变化 —— 这是「删掉一个子点」的表达通道', () => {
    const before = place('集美学村', { contains: ['龙舟池', '集美大社', '嘉庚建筑群'] })
    const after = place('集美学村', { contains: ['集美大社', '嘉庚建筑群'] })
    const out = applyDiff([before], { added: [after], removed: [] })
    expect(out.places).toHaveLength(1)
    expect(out.places[0].contains).toEqual(['集美大社', '嘉庚建筑群'])
  })

  it('removed 里的名字匹配不到顶层时，从子点里剔除', () => {
    const out = applyDiff(
      [place('集美学村', { contains: ['龙舟池', '集美大社'] }), place('园博园')],
      { added: [], removed: [{ name: '龙舟池', reason: '不想去' }] },
    )
    expect(out.places.map((p) => p.name)).toEqual(['集美学村', '园博园'])
    expect(out.places[0].contains).toEqual(['集美大社'])
    expect(out.removedSubPoints).toEqual(['龙舟池'])
  })

  it('顶层与子点同名时，优先按顶层移除', () => {
    const out = applyDiff([place('A'), place('B', { contains: ['A'] })], {
      added: [],
      removed: [{ name: 'A', reason: 'x' }],
    })
    expect(out.places.map((p) => p.name)).toEqual(['B'])
    expect(out.places[0].contains).toEqual(['A'])
    expect(out.removedTopLevel).toEqual(['A'])
    expect(out.removedSubPoints).toEqual([])
  })

  it('子点被清空时，contains 变成 undefined 而不是空数组', () => {
    const out = applyDiff([place('A', { contains: ['x'] })], {
      added: [],
      removed: [{ name: 'x', reason: 'y' }],
    })
    expect(out.places[0].contains).toBeUndefined()
  })

  it('不改动入参', () => {
    const input = [place('A', { contains: ['x', 'y'] })]
    const snapshot = JSON.stringify(input)
    applyDiff(input, { added: [], removed: [{ name: 'x', reason: 'r' }] })
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('新增里带 parent 的细化子点也能追加（refine 不该产生，但别炸）', () => {
    const out = applyDiff([place('A')], { added: [place('龙舟池', { parent: '集美学村' })], removed: [] })
    expect(out.places.map((p) => p.name)).toEqual(['A', '龙舟池'])
  })

  it('removed 与 added 同时存在时，先移除再 upsert', () => {
    const out = applyDiff([place('A'), place('B')], {
      added: [place('B', { tier: '更新过' })],
      removed: [{ name: 'B', reason: 'x' }],
    })
    // B 被移除后又被 upsert 回来，位置按新插入处理
    expect(out.places.map((p) => p.name)).toEqual(['A', 'B'])
    expect(out.places[1].tier).toBe('更新过')
  })
})
