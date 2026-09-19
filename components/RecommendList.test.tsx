// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecommendPlace } from '@/lib/core/model'
import RecommendList from './RecommendList'

afterEach(cleanup)

function place(name: string, over: Partial<RecommendPlace> = {}): RecommendPlace {
  return {
    rank: 1,
    tier: '备选',
    name,
    category: '公园',
    address: '示例路 1 号',
    fit: [{ tag: '拍照', why: '理由' }],
    amapUrl: 'https://uri.amap.com/search?keyword=x',
    point: { lng: 1, lat: 1 },
    verified: true,
    ...over,
  }
}

type Props = Parameters<typeof RecommendList>[0]

function renderList(over: Partial<Props> = {}) {
  const props: Props = {
    places: [place('公园A')],
    visitOrder: [],
    excluded: [],
    meta: { assumptions: [], unverified: [] },
    lastExchange: null,
    busy: false,
    finalizeNote: null,
    onToggle: vi.fn(),
    onOpenDetail: vi.fn(),
    onAsk: vi.fn(),
    ...over,
  }
  return render(<RecommendList {...props} />)
}

// 细化按钮本身已挪到结果页的固定底栏，那部分的显示条件由
// app/plan/page.test.tsx 覆盖；这里只管列表自己的内容。

/**
 * 说明条里的数字是加粗的（`<b>`），按单个文本节点匹配会漏掉它们 ——
 * 整段读一遍，去掉空白再断言。
 */
const allText = () => document.body.textContent?.replace(/\s+/g, '') ?? ''

describe('RecommendList · 细化后的说明文案', () => {
  it('数字取的是「用户当初选了几个」，不是继承后的数量', () => {
    // 实测踩到的坑：selectedCount 是继承后重算的，拿它当「用户选了几个」
    // 会得出「选了 4 个」这种与事实不符的说法（用户只选了 2 个）
    renderList({
      places: [place('龙舟池', { parent: '集美学村' })],
      finalizeNote: { before: 3, selected: 2, after: 4 }, // 用户当初只选了 2 个
    })
    expect(allText()).toContain('已把选中的2个细化为4个站点')
    expect(allText()).not.toContain('已把选中的4个')
  })

  it('有未选中的地点时，明确说它们被移除了', () => {
    renderList({
      places: [place('龙舟池', { parent: '集美学村' })],
      finalizeNote: { before: 5, selected: 2, after: 3 },
    })
    expect(allText()).toContain('没选的3个已从列表移除')
  })

  it('列表里所有地点都被选中时，不提「移除」', () => {
    renderList({
      places: [place('龙舟池', { parent: '集美学村' })],
      finalizeNote: { before: 2, selected: 2, after: 3 },
    })
    expect(allText()).not.toContain('已从列表移除')
  })

  it('没细化过时不显示这段说明', () => {
    renderList({ places: [place('公园A')], finalizeNote: null })
    expect(screen.queryByText(/已把选中的/)).toBeNull()
  })
})

describe('RecommendList · 分组', () => {
  it('细化后按 parent 分组显示父级标题', () => {
    renderList({
      places: [
        place('龙舟池', { parent: '集美学村' }),
        place('集美大社', { parent: '集美学村' }),
        place('园博园', { parent: null }),
      ],
      finalizeNote: { before: 2, selected: 2, after: 3 },
    })
    expect(screen.getByText(/集美学村/)).toBeTruthy()
    // 只有 2 个带 parent（园博园是 parent: null，独立列出）
    expect(screen.getByText(/·\s*2\s*个站点（由 1 个复合地点拆出）/)).toBeTruthy()
  })

  it('单点追问新增的项，挂在锚点那条下面', () => {
    renderList({
      places: [place('集美大社'), place('园博园'), place('味友鸭肉面线', { askedFrom: '园博园' })],
    })
    expect(screen.getByText('「园博园」的追问新增')).toBeTruthy()
  })

  it('追问新增项被 skill 误标了 parent 时，仍然挂在锚点下', () => {
    // refine 里出现 parent 是 skill 违约（那是 finalize 的字段）。
    // 真让它生效，这条「追问新增」会掉进「集美学村 · N 个站点（由 1 个复合地点拆出）」
    // 的分组里 —— 而那句话是假的：根本没有发生过拆解。
    renderList({
      places: [place('集美学村'), place('沙茶面', { askedFrom: '集美学村', parent: '集美学村' })],
    })
    expect(screen.getByText('「集美学村」的追问新增')).toBeTruthy()
    expect(screen.queryByText(/由 1 个复合地点拆出/)).toBeNull()
  })

  it('锚点已不在列表里时，这些项退回平铺，不悬挂', () => {
    // 后续追问可能把锚点删掉；挂在一个不存在的父级下会让人以为列表坏了
    renderList({
      places: [place('集美大社'), place('味友鸭肉面线', { askedFrom: '园博园' })],
    })
    expect(screen.queryByText(/追问新增/)).toBeNull()
  })

  it('选中锚点不会连带选中它下面的新增项', () => {
    // 与细化的 parent 不同：那个是「拆开」，子点继承父级选中是合理的；
    // 这里只是「在它附近找的」，两者是各自独立的行程项
    renderList({
      places: [place('园博园'), place('味友鸭肉面线', { askedFrom: '园博园' })],
      visitOrder: ['园博园'],
    })
    expect(screen.getByRole('button', { name: '取消选择 园博园' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '选择 味友鸭肉面线' })).toBeTruthy()
  })

  it('未核实的地点标注出来，且不占路线编号', () => {
    renderList({
      places: [
        place('确实存在', { verified: true }),
        place('查不到的地方', { verified: false, point: null }),
      ],
      visitOrder: ['确实存在'],
    })
    // 计数与「N 条推荐」在同一个文本节点组里，用正则匹配
    expect(screen.getByText(/1 条未能核实/)).toBeTruthy()
    expect(screen.getByText(/高德未能核实到该地点/)).toBeTruthy()
  })
})

describe('RecommendList · 追问提示', () => {
  it('有追问回答时显示在顶部，并列出移除了什么', () => {
    renderList({
      places: [place('公园A')],
      lastExchange: {
        answer: '已按你说的调整',
        removed: [{ name: '商业街', reason: '人流密集' }],
      },
    })
    expect(screen.getByText('已按你说的调整')).toBeTruthy()
    expect(screen.getByText('商业街')).toBeTruthy()
    expect(screen.getByText(/人流密集/)).toBeTruthy()
  })

  it('没有追问记录时不显示那一块', () => {
    renderList({ lastExchange: null })
    expect(screen.queryByText(/已按你说的调整/)).toBeNull()
  })
})
