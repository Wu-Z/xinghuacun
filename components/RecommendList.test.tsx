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
    selectedCount: 0,
    busy: false,
    canFinalize: false,
    finalizeNote: null,
    onToggle: vi.fn(),
    onOpenDetail: vi.fn(),
    onAsk: vi.fn(),
    onFinalize: vi.fn(),
    ...over,
  }
  return render(<RecommendList {...props} />)
}

const finalizeButton = () =>
  screen.queryByRole('button', { name: /细化成站点/ })

describe('RecommendList · 细化按钮的显示条件', () => {
  it('没有可选中的复合地点时，压根不给细化按钮', () => {
    // 实测踩到的坑：选了非复合地点，细化把它们原样透传（parent 仍是 null），
    // 于是「已细化」的推断永远不成立，按钮不消失、可以无限点，且点了毫无反应
    renderList({ places: [place('海堤路')], selectedCount: 1, canFinalize: false })
    expect(finalizeButton()).toBeNull()
  })

  it('选中的里有可拆的复合地点时才给按钮', () => {
    renderList({
      places: [place('集美学村', { contains: ['龙舟池', '集美大社'] })],
      selectedCount: 1,
      canFinalize: true,
    })
    expect(finalizeButton()).not.toBeNull()
    expect(screen.getByText('把选中的 1 个细化成站点')).toBeTruthy()
  })

  it('细化完之后按钮消失', () => {
    renderList({
      places: [place('龙舟池', { parent: '集美学村' })],
      selectedCount: 1,
      canFinalize: false,
      finalizeNote: { before: 3, selected: 1, after: 3 },
    })
    expect(finalizeButton()).toBeNull()
  })

  it('一个都没选时不给按钮', () => {
    renderList({
      places: [place('集美学村', { contains: ['龙舟池'] })],
      selectedCount: 0,
      canFinalize: true,
    })
    expect(finalizeButton()).toBeNull()
  })
})

describe('RecommendList · 细化后的说明文案', () => {
  it('数字取的是「用户当初选了几个」，不是继承后的数量', () => {
    // 实测踩到的坑：selectedCount 是继承后重算的，拿它当「用户选了几个」
    // 会得出「选了 4 个」这种与事实不符的说法（用户只选了 2 个）
    renderList({
      places: [place('龙舟池', { parent: '集美学村' })],
      selectedCount: 4, // 继承后重算出来的
      canFinalize: false,
      finalizeNote: { before: 3, selected: 2, after: 4 }, // 用户当初只选了 2 个
    })
    expect(screen.getByText(/已把选中的 2 个细化为 4 个站点/)).toBeTruthy()
    expect(screen.queryByText(/选中的 4 个细化/)).toBeNull()
  })

  it('有未选中的地点时，明确说它们被移除了', () => {
    renderList({
      places: [place('龙舟池', { parent: '集美学村' })],
      selectedCount: 2,
      canFinalize: false,
      finalizeNote: { before: 5, selected: 2, after: 3 },
    })
    expect(screen.getByText(/其余 3 个未选的地点已移除/)).toBeTruthy()
  })

  it('列表里所有地点都被选中时，不提「移除」', () => {
    renderList({
      places: [place('龙舟池', { parent: '集美学村' })],
      selectedCount: 2,
      canFinalize: false,
      finalizeNote: { before: 2, selected: 2, after: 3 },
    })
    expect(screen.queryByText(/未选的地点已移除/)).toBeNull()
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
    expect(screen.getByText(/↓\s*2\s*个站点/)).toBeTruthy()
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
