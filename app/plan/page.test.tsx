// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecommendPlace } from '@/lib/core/model'

// 地图在 jsdom 里跑不起来（要加载高德 JS API），而且它跟这里要测的状态机无关
vi.mock('@/components/MapCanvas', () => ({ default: () => null }))

const planRef: { current: unknown } = { current: null }
vi.mock('@/lib/client/plan-session', () => ({
  usePlan: () => planRef.current,
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import PlanPage from './page'

// ── 造数据 ────────────────────────────────────────────────

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
    distanceMeters: 500,
    ...over,
  }
}

const COMPOSITE = place('集美学村', { tier: '首选', contains: ['龙舟池', '集美大社'] })
const PLAIN = place('海堤路')

/** 把事件数组编成 NDJSON 流 */
function ndjson(events: unknown[]): Response {
  const text = events.map((e) => `${JSON.stringify(e)}\n`).join('')
  return new Response(text, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

/** 生成若干 place 事件后收尾 */
function streamOf(places: RecommendPlace[], tail: unknown[] = []): Response {
  return ndjson([
    { type: 'stage', stage: 'thinking' },
    { type: 'stage', stage: 'generating' },
    ...places.map((p) => ({ type: 'place', place: p })),
    ...tail,
    { type: 'done', value: { places, excluded: [], meta: { assumptions: [], unverified: [] } } },
  ])
}

let recommendCalls: Record<string, unknown>[] = []

beforeEach(() => {
  recommendCalls = []
  planRef.current = {
    point: { lng: 118.1, lat: 24.57 },
    label: '地图所选位置',
    prefs: {
      intents: ['拍照'],
      timeBudget: '半天',
      travelMode: ['步行'],
      companions: null,
      crowdTolerance: null,
      rawRequest: '',
      destination: '',
    },
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/route/plan')) {
        // 按请求里的 stops 回一条路线 —— order 必须非空，
        // 否则时间轴拿不到站点，测不到「看行程」
        const req = JSON.parse(String(init?.body ?? '{}')) as {
          stops?: { id: string }[]
          mode?: string
        }
        const stops = req.stops ?? []
        return new Response(
          JSON.stringify({
            mode: req.mode ?? 'walking',
            order: stops.map((s) => s.id),
            legs: stops.map(() => ({
              fromIndex: 0,
              toIndex: 0,
              durationSeconds: 600,
              distanceMeters: 3000,
              polyline: [],
            })),
            totalDurationSeconds: stops.length * 600,
            totalDistanceMeters: stops.length * 3000,
            polyline: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      recommendCalls.push(body)
      const queue = nextResponses.shift()
      if (!queue) throw new Error('测试没有安排这次 recommend 的响应')
      return queue
    }),
  )
})

let nextResponses: Response[] = []

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** 等首屏卡片出现 */
async function waitForCards(n: number) {
  await waitFor(
    () =>
      expect(document.querySelectorAll('button[aria-label^="选择 "], button[aria-label^="取消选择 "]')).toHaveLength(n),
    { timeout: 3000 },
  )
}

const clickButton = async (name: string | RegExp) => {
  const btn = await screen.findByRole('button', { name })
  btn.click()
}

// ── 用例 ──────────────────────────────────────────────────

describe('结果页 · 首屏流式', () => {
  it('地点随流逐条出现，不是等全部才渲染', async () => {
    nextResponses = [streamOf([COMPOSITE, PLAIN])]
    render(<PlanPage />)

    await waitForCards(2)
    expect(screen.getByText('集美学村')).toBeTruthy()
  })

  it('首屏用 initial 任务，并带上出发点', async () => {
    nextResponses = [streamOf([COMPOSITE])]
    render(<PlanPage />)
    await waitForCards(1)

    expect(recommendCalls[0].task).toBe('initial')
    expect(recommendCalls[0].origin).toEqual({ point: { lng: 118.1, lat: 24.57 } })
  })
})

describe('结果页 · 细化', () => {
  it('细化前的说明文案用「用户选的个数」，不是继承后重算的', async () => {
    // 只选 1 个复合地点 → 细化为 2 个子点（继承后变成 2 个）
    nextResponses = [
      streamOf([COMPOSITE, PLAIN]),
      streamOf([place('龙舟池', { parent: '集美学村' }), place('集美大社', { parent: '集美学村' })]),
    ]
    render(<PlanPage />)
    await waitForCards(2)

    await clickButton(/选择 集美学村/)
    await clickButton(/细化成站点/)

    // 关键断言：说的是「选中的 1 个」，不是继承后的 2 个
    await waitFor(() => expect(screen.getByText(/已把选中的 1 个细化为 2 个站点/)).toBeTruthy(), {
      timeout: 3000,
    })
  })

  it('细化后按钮消失，不会再点第二次', async () => {
    nextResponses = [
      streamOf([COMPOSITE]),
      streamOf([place('龙舟池', { parent: '集美学村' })]),
    ]
    render(<PlanPage />)
    await waitForCards(1)

    await clickButton(/选择 集美学村/)
    await clickButton(/细化成站点/)

    await waitFor(
      () => expect(screen.queryByRole('button', { name: /细化成站点/ })).toBeNull(),
      { timeout: 3000 },
    )
  })

  it('细化后子点继承父级的选中状态', async () => {
    nextResponses = [
      streamOf([COMPOSITE]),
      streamOf([place('龙舟池', { parent: '集美学村' }), place('集美大社', { parent: '集美学村' })]),
    ]
    render(<PlanPage />)
    await waitForCards(1)

    await clickButton(/选择 集美学村/)
    await clickButton(/细化成站点/)

    await waitFor(
      () =>
        expect(
          document.querySelectorAll('button[aria-label^="取消选择 "]'),
        ).toHaveLength(2),
      { timeout: 3000 },
    )
  })
})

describe('结果页 · 中途失败与重试', () => {
  it('细化中途断流时，重试跑的仍是细化，而不是整轮重新推荐', async () => {
    // 实测踩到的坑：原来靠「列表里有没有带 parent 的点」反推该重试哪个任务，
    // 而细化在第一个地点到达前就失败时列表是空的 → 会误判成 initial，
    // 把用户的整份列表换掉、白花一次 LLM 调用
    nextResponses = [
      streamOf([COMPOSITE]),
      // 细化：error 事件后收尾（一个 place 都没吐出来）
      ndjson([{ type: 'error', reason: '连接中断' }]),
      streamOf([place('龙舟池', { parent: '集美学村' })]),
    ]
    render(<PlanPage />)
    await waitForCards(1)

    await clickButton(/选择 集美学村/)
    await clickButton(/细化成站点/)

    await waitFor(() => expect(screen.getByText(/生成中断/)).toBeTruthy(), { timeout: 3000 })

    await clickButton('重试')

    await waitFor(() => expect(recommendCalls).toHaveLength(3), { timeout: 3000 })
    // 第三次调用必须是 finalize —— 这正是那个 bug 会答错的地方
    expect(recommendCalls[2].task).toBe('finalize')
  })
})

describe('结果页 · 下一步引导', () => {
  it('勾选不足 2 个时不出现「看行程」', async () => {
    nextResponses = [streamOf([COMPOSITE, PLAIN])]
    render(<PlanPage />)
    await waitForCards(2)

    await clickButton(/选择 集美学村/)
    await waitFor(() => expect(screen.queryByRole('button', { name: /看行程/ })).toBeNull())
  })

  it('勾满 2 个后「看行程」出现，点它切到时间轴', async () => {
    nextResponses = [streamOf([COMPOSITE, PLAIN])]
    render(<PlanPage />)
    await waitForCards(2)

    await clickButton(/选择 集美学村/)
    await clickButton(/选择 海堤路/)

    const cta = await screen.findByRole('button', { name: /看行程/ })
    cta.click()

    // 切过去后应该看到时间轴的合计行
    await waitFor(() => expect(screen.getByText(/路上共/)).toBeTruthy(), { timeout: 3000 })
  })
})
