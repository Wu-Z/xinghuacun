// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecommendPlace } from '@/lib/core/model'
import RecommendCard from './RecommendCard'

afterEach(cleanup)

function place(over: Partial<RecommendPlace> = {}): RecommendPlace {
  return {
    rank: 9,
    tier: '备选',
    name: '某地',
    category: '公园',
    address: '示例路 1 号',
    fit: [{ tag: '拍照', why: '理由' }],
    amapUrl: 'https://uri.amap.com/search?keyword=x',
    point: { lng: 1, lat: 1 },
    verified: true,
    ...over,
  }
}

function renderCard(p: RecommendPlace, order: number | null = null, busy = false) {
  return render(
    <RecommendCard
      place={p}
      order={order}
      busy={busy}
      onToggle={vi.fn()}
      onOpenDetail={vi.fn()}
      onAsk={vi.fn()}
    />,
  )
}

const tierSpan = (text: string) => screen.getByText(text)

describe('RecommendCard · 档位高亮', () => {
  it('「首选」高亮', () => {
    renderCard(place({ rank: 1, tier: '首选' }))
    expect(tierSpan('首选').className).toContain('bg-jade-50')
  })

  it('「备选」不高亮', () => {
    renderCard(place({ rank: 2, tier: '备选 · 最清净' }))
    expect(tierSpan('备选 · 最清净').className).not.toContain('bg-jade-50')
  })

  it('rank 为 1 但档位不是首选时也不高亮', () => {
    // 实测踩到的坑：判据原本是 `rank === 1`，而 parseSkillOutput 在 rank 缺失时
    // 会按 i+1 补位 —— 于是「追问中途补进来的沙茶面」会被高亮成「首选」。
    // 判据改成跟 tier 走之后，rank 写什么都不影响。
    renderCard(place({ rank: 1, tier: '追问新增' }))
    expect(tierSpan('追问新增').className).not.toContain('bg-jade-50')
  })

  it('rank 不是 1 但档位是首选时照样高亮', () => {
    renderCard(place({ rank: 99, tier: '首选' }))
    expect(tierSpan('首选').className).toContain('bg-jade-50')
  })
})

describe('RecommendCard · 复合地点提示', () => {
  it('含子点的地点提示会拆开', () => {
    renderCard(place({ contains: ['龙舟池', '集美大社'] }))
    expect(screen.getByText(/含 2 个可玩点：龙舟池 \/ 集美大社/)).toBeTruthy()
  })

  it('单一地点不显示这条提示', () => {
    renderCard(place())
    expect(screen.queryByText(/可玩点/)).toBeNull()
  })
})

describe('RecommendCard · 未核实', () => {
  // 直接用原生 disabled，不引 jest-dom 只为两个断言
  const isDisabled = (name: string | RegExp) =>
    (screen.getByRole('button', { name }) as HTMLButtonElement).disabled

  it('未核实的给出说明与高德链接，且不可勾选', () => {
    renderCard(place({ name: '查不到', verified: false, point: null }))
    expect(screen.getByText(/高德未能核实到该地点/)).toBeTruthy()
    expect(isDisabled(/未能核实，无法加入路线/)).toBe(true)
  })

  it('已核实的可以勾选', () => {
    renderCard(place({ name: '正常' }))
    expect(isDisabled('选择 正常')).toBe(false)
  })

  it('编号位给「!」而不是留空 —— 空白会被读成渲染失败', () => {
    renderCard(place({ name: '查不到', verified: false, point: null }))
    const badge = screen.getByRole('button', { name: /未能核实，无法加入路线/ })
    expect(badge.textContent).toBe('!')
  })

  it('用斜纹底 + 虚线圈 + 文字三重表达，不单靠颜色', () => {
    // 琥珀和红分不清、灰度打印、色觉障碍 —— 三种情况都得读得出来，
    // 所以同一个意思要落在三种不同的视觉信号上
    const { container } = renderCard(place({ name: '查不到', verified: false, point: null }))
    expect(container.querySelector('.stripe-locked')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: /未能核实，无法加入路线/ }) as HTMLElement).className,
    ).toContain('border-dashed')
    expect(screen.getByText(/高德未能核实到该地点/).className).toContain('text-amber')
  })

  it('已核实的卡片没有斜纹底', () => {
    const { container } = renderCard(place({ name: '正常' }))
    expect(container.querySelector('.stripe-locked')).toBeNull()
  })
})

describe('RecommendCard · 生成中只许看不许动', () => {
  const isDisabled = (name: string | RegExp) =>
    (screen.getByRole('button', { name }) as HTMLButtonElement).disabled

  it('生成中不能勾选', () => {
    renderCard(place({ name: '正常' }), null, true)
    expect(isDisabled('选择 正常')).toBe(true)
  })

  it('生成中不能追问（同时只允许一条在飞）', () => {
    renderCard(place({ name: '正常' }), null, true)
    expect(isDisabled('追问')).toBe(true)
  })

  it('生成中仍然能看详情 —— 只读的东西锁了只会让人以为页面卡了', () => {
    renderCard(place({ name: '正常' }), null, true)
    expect(isDisabled('详情')).toBe(false)
  })

  it('不在生成中时勾选与追问都可用', () => {
    renderCard(place({ name: '正常' }))
    expect(isDisabled('选择 正常')).toBe(false)
    expect(isDisabled('追问')).toBe(false)
  })
})

describe('RecommendCard · 距离标注', () => {
  it('距离必须标出「直线」，免得被当成行车里程', () => {
    renderCard(place({ distanceMeters: 2400 }))
    expect(screen.getByText(/2\.4 公里 · 直线/)).toBeTruthy()
  })
})
