// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecommendPlace } from '@/lib/core/model'

/**
 * 地图在 jsdom 里跑不起来（要加载高德 JS API），而且它跟这里要测的状态机无关。
 *
 * 但要留一份 props 快照：列表与地图之间那条悬停的线必须验到 ——
 * 「地图收到的到底是不是列表里正指着的那一条」，除了这儿没别的地方看得到。
 * 真画出来的东西（空心点、编号、光晕）在 RouteOverlay 的测试里验。
 */
const mapProps = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/components/MapCanvas', () => ({
  default: (props: unknown) => {
    mapProps.current = props
    return null
  },
}))

const planRef: { current: unknown } = { current: null }
/**
 * 分享卡改名 / 出行时间都走它落进草稿。
 *
 * 必须用 vi.hoisted：vi.mock 会被整体提到 import 之上，工厂里引用的
 * 顶层 const 若在声明前求值（`vi.fn()` 就是）会直接炸在提升阶段 ——
 * 症状不是「这条用例红」，而是这个文件里所有用例一起红。
 */
const mocks = vi.hoisted(() => ({ patchShare: vi.fn() }))
vi.mock('@/lib/client/plan-session', () => ({
  usePlan: () => planRef.current,
  patchShare: (patch: Record<string, unknown>) => mocks.patchShare(patch),
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

/**
 * 一条**不闭合**的流：卡片已经到，但生成还在继续。
 *
 * 要测「生成中的锁」就必须停在 busy 里，而 streamOf 会在同一帧里把
 * done 也推完 —— 那样测的其实是「跑完之后」，锁早就松开了。
 */
function openStream(places: RecommendPlace[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of places) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'place', place: p })}\n`))
      }
      // 刻意不 close：模拟「还在生成」
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

let recommendCalls: Record<string, unknown>[] = []
/** 让用例指定假路线每一段的方式。空数组 = 按请求里的 mode 给所有段 */
let routeLegModes: string[] = []
/** 天气响应体。默认 null（拿不到天气）；分享卡那几条会塞一份进来 */
let weatherPayload: unknown = null

beforeEach(() => {
  recommendCalls = []
  routeLegModes = []
  weatherPayload = null
  mocks.patchShare.mockClear()
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
      /*
       * 这一页也会问一次天气（分享卡的语境行要用）。
       *
       * 必须在这儿拦掉：下面那个分支会把**所有**非 route 的请求都当成
       * recommend 响应、从队列里取一条 —— 漏了这条，天气请求会把
       * 唯一那批复用响应吃掉，真正的 recommend 拿到空队列，
       * 于是整个文件的用例一起红（症状是「没安排响应」，看着跟天气毫无关系）。
       */
      if (String(url).includes('/api/weather')) {
        return new Response(JSON.stringify({ weather: weatherPayload }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (String(url).includes('/api/route/plan')) {
        // 按请求里的 stops 回一条路线 —— order 必须非空，
        // 否则时间轴拿不到站点，测不到「看行程」
        const req = JSON.parse(String(init?.body ?? '{}')) as {
          stops?: { id: string }[]
          mode?: string
        }
        const stops = req.stops ?? []
        const modes = routeLegModes.length > 0 ? routeLegModes : stops.map(() => req.mode ?? 'walking')
        return new Response(
          JSON.stringify({
            order: stops.map((s) => s.id),
            // 出行方式是逐段给的，界面按段显示
            legs: stops.map((_, i) => ({
              fromIndex: i - 1,
              toIndex: i,
              mode: modes[i] ?? 'walking',
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

// ── 等待反馈 ──────────────────────────────────────────────
// 首屏可能要等二十秒。这期间界面必须让人看出「它在干活」：
// 一个在动的星芒 + 一句会随阶段变的文案，而不是一行静止的字。

// 必须在用例里现取：beforeEach 才把 stub 装上，模块顶层拿到的还是原生 fetch
const fetchMock = () =>
  globalThis.fetch as unknown as { mockReturnValueOnce: (v: unknown) => void }

/** 一条能「吐一半、停住」的 NDJSON 流，用来观察流式进行中的那一帧 */
function gatedStream() {
  const encoder = new TextEncoder()
  let push: (event: unknown) => void = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
    },
  })
  return {
    res: new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }),
    push: (event: unknown) => push(event),
  }
}

describe('结果页 · 等待反馈', () => {
  it('等待首个地点时，等待区是带星芒的状态区，而不是静止的文案', async () => {
    // 把首屏请求挂住，否则这一帧根本来不及被观察到
    let release: (r: Response) => void = () => {}
    fetchMock().mockReturnValueOnce(new Promise<Response>((r) => (release = r)))

    render(<PlanPage />)

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('正在检索与思考…')
    // 星芒必须在场：等待期间没有任何东西在动，用户会以为卡死了
    expect(status.querySelector('svg')).toBeTruthy()

    release(streamOf([COMPOSITE]))
    await waitForCards(1)
  })

  it('地点逐条到达、仍在等待时，继续等待的提示同样在动', async () => {
    const gate = gatedStream()
    fetchMock().mockReturnValueOnce(Promise.resolve(gate.res))

    render(<PlanPage />)

    gate.push({ type: 'stage', stage: 'generating' })
    gate.push({ type: 'place', place: COMPOSITE })

    await waitForCards(1)
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('已生成 1 条')
    expect(status.querySelector('svg')).toBeTruthy()
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

    // 关键断言：说的是「选中的 1 个」，不是继承后的 2 个。
    // 数字在说明条里是加粗的（<b>），所以整段读、去掉空白再比
    const allText = () => document.body.textContent?.replace(/\s+/g, '') ?? ''
    await waitFor(() => expect(allText()).toContain('已把选中的1个细化为2个站点'), {
      timeout: 3000,
    })
    expect(allText()).not.toContain('已把选中的2个')
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

    // 中途断流的出口叫「补完剩下的」：整批重来会把用户已经看到的东西换掉
    await clickButton('补完剩下的')

    await waitFor(() => expect(recommendCalls).toHaveLength(3), { timeout: 3000 })
    // 第三次调用必须是 finalize —— 这正是那个 bug 会答错的地方
    expect(recommendCalls[2].task).toBe('finalize')
  })
})

describe('结果页 · 追问新增项的归属', () => {
  /** refine 不走流，返回的是一份普通 JSON */
  function refineJson(added: RecommendPlace[]): Response {
    return new Response(JSON.stringify({ answer: '补了两个地方', added, removed: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  async function askOne(index: number, text: string) {
    const asks = await screen.findAllByRole('button', { name: '追问' })
    asks[index].click()
    const input = await screen.findByPlaceholderText(/我想在这吃点东西/)
    fireEvent.change(input, { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
  }

  it('单点追问新增的项，挂在那条地点下面', async () => {
    nextResponses = [
      streamOf([COMPOSITE, PLAIN]),
      refineJson([place('味友鸭肉面线')]),
    ]
    render(<PlanPage />)
    await waitForCards(2)

    // 第 2 张卡是「海堤路」，对它单独追问
    await askOne(1, '在附近找点好吃的')

    await waitFor(() => expect(screen.getByText('「海堤路」的追问新增')).toBeTruthy(), {
      timeout: 3000,
    })
  })

  it('整批追问没有锚点，新增项平铺，不挂在任何地点下', async () => {
    // 「对这批不满意？」是对整批说的，没有「在这附近」的空间约束，
    // 硬挂到某一条下面会凭空虚指一个它并不来自的地方
    nextResponses = [streamOf([COMPOSITE, PLAIN]), refineJson([place('味友鸭肉面线')])]
    render(<PlanPage />)
    await waitForCards(2)

    fireEvent.click(await screen.findByRole('button', { name: '对这批不满意？' }))
    const input = await screen.findByPlaceholderText(/我想增加点中间可以观光的地方/)
    fireEvent.change(input, { target: { value: '换几个不那么挤的' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(screen.getByText('味友鸭肉面线')).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText(/的追问新增/)).toBeNull()
  })
})

describe('结果页 · 生成中的锁', () => {
  it('生成期间不给「修改」入口，只留一句说明', async () => {
    nextResponses = [openStream([COMPOSITE])]
    render(<PlanPage />)

    await waitFor(() => expect(screen.getByText('生成中不可修改')).toBeTruthy(), { timeout: 3000 })
    // 品牌名这时候是纯文本，不是能点回首页的链接
    expect(screen.queryByRole('link', { name: '周边去哪' })).toBeNull()
  })

  it('生成跑完，「修改」入口自己回来', async () => {
    nextResponses = [streamOf([COMPOSITE, PLAIN])]
    render(<PlanPage />)
    await waitForCards(2)

    expect(screen.getByRole('link', { name: '周边去哪' })).toBeTruthy()
    expect(screen.queryByText('生成中不可修改')).toBeNull()
  })

  it('生成期间列表上的「追问」一律禁用 —— 同时只允许一条在飞', async () => {
    nextResponses = [openStream([COMPOSITE, PLAIN])]
    render(<PlanPage />)

    await waitFor(
      () => expect(screen.getAllByRole('button', { name: '追问' })).toHaveLength(2),
      { timeout: 3000 },
    )
    for (const b of screen.getAllByRole('button', { name: '追问' })) {
      expect((b as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('生成期间勾不动：勾选按钮禁用，点了也不会进选择集', async () => {
    nextResponses = [openStream([COMPOSITE])]
    render(<PlanPage />)

    const pick = await screen.findByRole('button', { name: '选择 集美学村' }, { timeout: 3000 })
    expect((pick as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(pick)
    // 托盘靠「已选 N 个」出现，没被勾中时它就不该在
    await waitFor(() => expect(screen.queryByText(/已选/)).toBeNull())
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

  it('混用方式的路线，行程页顶部两种方式都说', async () => {
    // 出行方式逐段定之后，整条路线可能一半走路一半坐地铁。
    // 顶部只说一种（以前是 itinerary.mode），就跟下面的时间轴对不上了
    routeLegModes = ['walking', 'transit']
    nextResponses = [streamOf([COMPOSITE, PLAIN])]
    render(<PlanPage />)
    await waitForCards(2)

    await clickButton(/选择 集美学村/)
    await clickButton(/选择 海堤路/)
    await clickButton(/看行程/)

    await waitFor(
      () => expect(screen.getByText(/2 站 · 步行 \+ 公交\/地铁/)).toBeTruthy(),
      { timeout: 3000 },
    )
  })

  it('地图上不再压「1→2→3」顺序卡 —— 两个视图都不出现', async () => {
    // 这张卡曾经挂在列表页的地图顶部。撤掉是因为它占的正是地图上半部
    // 唯一被遮住的地方，而它带的信息都有别处承载：编号在地图标记与
    // 列表卡片的圆圈上，汇总数字在行程页的「路上共 …」，
    // 未规划出来的路段在时间轴的琥珀提示里。
    //
    // 断言必须发生在「路线真的算完」之后 —— 卡当初就是那一刻冒出来的，
    // 早一步断言等于什么都没钉住。路线算完的证据在行程页（列表页现在
    // 没有任何东西依赖 route，路线只画在地图上，没有可断言的文字）。
    nextResponses = [streamOf([COMPOSITE, PLAIN])]
    render(<PlanPage />)
    await waitForCards(2)

    await clickButton(/选择 集美学村/)
    await clickButton(/选择 海堤路/)

    await clickButton(/看行程/)
    await waitFor(() => expect(screen.getByText(/路上共/)).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByText(/拜访顺序/)).toBeNull()

    // 回到卡原来所在的那个视图再确认一次
    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    await waitForCards(2)
    expect(screen.queryByText(/拜访顺序/)).toBeNull()
  })
})

describe('结果页 · 分享行程', () => {
  /** 勾两个点、切到行程视图 —— 分享入口只在这一屏 */
  async function gotoItinerary() {
    nextResponses = [streamOf([COMPOSITE, PLAIN])]
    render(<PlanPage />)
    await waitForCards(2)

    await clickButton(/选择 集美学村/)
    await clickButton(/选择 海堤路/)
    await clickButton(/看行程/)
    // 路线算完的证据：行程托盘的「分享行程」出现了
    await screen.findByRole('button', { name: /分享行程/ }, { timeout: 3000 })
  }

  it('行程托盘给「分享行程」，点开是卡面', async () => {
    await gotoItinerary()

    await clickButton(/分享行程/)
    expect(await screen.findByRole('dialog', { name: '行程分享卡' })).toBeTruthy()

    // 没改过名字时，用系统按行程给的那个（从哪一站起、一共几站）
    const [faceTitle] = screen.getAllByLabelText('卡片名称') as HTMLInputElement[]
    expect(faceTitle.value).toBe('集美学村起 · 2 站')
    expect(screen.getByText('地点经高德核实 · 距离为直线口径')).toBeTruthy()
  })

  it('在卡上改名落进草稿 —— 重新分享不用再打一遍', async () => {
    await gotoItinerary()
    await clickButton(/分享行程/)

    const [faceTitle] = (await screen.findAllByLabelText('卡片名称')) as HTMLInputElement[]
    fireEvent.change(faceTitle, { target: { value: '集美半日' } })

    expect(mocks.patchShare).toHaveBeenCalledWith({ title: '集美半日' })
  })

  it('不改名时不写草稿 —— 默认名是算出来的，不该被当成用户的输入存下来', async () => {
    await gotoItinerary()
    await clickButton(/分享行程/)

    expect(await screen.findByRole('dialog', { name: '行程分享卡' })).toBeTruthy()
    expect(mocks.patchShare).not.toHaveBeenCalled()
  })
})

describe('结果页 · 列表与地图同源', () => {
  /** 地图那一侧收到的 props（上面 mock 里存下的最后一份） */
  const map = () =>
    mapProps.current as {
      places?: RecommendPlace[]
      highlightName?: string | null
      onHighlight?: (name: string | null) => void
      onMarkerClick?: (name: string) => void
    }

  const cardOf = (name: string) =>
    document.querySelector(`[data-place="${name}"]`) as HTMLElement

  async function twoCards() {
    nextResponses = [streamOf([COMPOSITE, PLAIN])]
    render(<PlanPage />)
    await waitForCards(2)
  }

  it('整份列表都交给地图 —— 不是只给勾中的那几个', async () => {
    await twoCards()

    expect(map().places?.map((p) => p.name)).toEqual(['集美学村', '海堤路'])
    expect(map().highlightName).toBeNull()
  })

  it('鼠标停在列表某条上，地图收到的就是同一条', async () => {
    // 列表十几条、地图十几个点，中间没有这条线的话，用户看得见一个点
    // 却不知道它是哪一条
    await twoCards()

    fireEvent.mouseOver(cardOf('海堤路'))
    await waitFor(() => expect(map().highlightName).toBe('海堤路'))

    fireEvent.mouseOut(cardOf('海堤路'))
    await waitFor(() => expect(map().highlightName).toBeNull())
  })

  it('反过来：鼠标停在地图的某个点上，列表里那一条跟着亮', async () => {
    await twoCards()

    act(() => map().onHighlight?.('集美学村'))
    await waitFor(() => expect(cardOf('集美学村').hasAttribute('data-pointed')).toBe(true))
    // 只亮一个 —— 两个方向共用一个状态，不该出现「地图亮 A、列表亮 B」
    expect(cardOf('海堤路').hasAttribute('data-pointed')).toBe(false)
  })

  it('点地图上的标记就是打开那条的详情', async () => {
    await twoCards()

    act(() => map().onMarkerClick?.('海堤路'))
    expect(await screen.findByRole('heading', { name: '海堤路' })).toBeTruthy()
  })
})

describe('结果页 · 带令牌', () => {
  // 令牌走 URL 而不是 cookie，代价就是每个请求都得自己带上。
  // 漏一个的表现是那条接口 401，而界面只看出「天气没了」「路线出不来」——
  // 看不出是门的错。所以在这儿一次钉死，别让下一个加接口的人踩。
  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('这一页发出的每一个请求都带着令牌', async () => {
    window.history.replaceState({}, '', '/plan?token=testtok')

    nextResponses = [streamOf([COMPOSITE, PLAIN])]
    render(<PlanPage />)
    await waitForCards(2)

    await clickButton(/选择 集美学村/)
    await clickButton(/选择 海堤路/)
    await clickButton(/看行程/)
    await waitFor(() => expect(screen.getByText(/路上共/)).toBeTruthy(), { timeout: 3000 })

    const calls = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls
    const urls = calls.map((c) => String(c[0]))
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) {
      expect(u, `这个请求没带令牌：${u}`).toContain('token=testtok')
    }
  })

  it('回首页的链接也带着令牌 —— 否则一点就撞 401，看上去像首页坏了', async () => {
    window.history.replaceState({}, '', '/plan?token=testtok')

    nextResponses = [streamOf([COMPOSITE])]
    render(<PlanPage />)
    await waitForCards(1)

    const home = screen.getAllByRole('link', { name: '周边去哪' })
    expect(home.length).toBeGreaterThan(0)
    for (const a of home) {
      expect(a.getAttribute('href'), '回首页的链接没带令牌').toContain('token=testtok')
    }
  })

  it('没有草稿时的「去首页填一下」同样带令牌', async () => {
    // 这条是另一条渲染路径：进到这个分支说明草稿是空的，
    // 用户唯一的出口就是那个链接，它不带令牌等于把人关在门外
    window.history.replaceState({}, '', '/plan?token=testtok')
    planRef.current = null

    render(<PlanPage />)

    const link = await screen.findByRole('link', { name: '去首页填一下' })
    expect(link.getAttribute('href')).toContain('token=testtok')
  })
})
