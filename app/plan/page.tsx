'use client'

import Link from 'next/link'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FollowupBar from '@/components/FollowupBar'
import MapCanvas from '@/components/MapCanvas'
import MapPicker from '@/components/MapPicker'
import PlaceCardSkeleton from '@/components/PlaceCardSkeleton'
import RecommendList from '@/components/RecommendList'
import SelectionTray from '@/components/SelectionTray'
import ShareCardDialog from '@/components/ShareCardDialog'
import SparkleIcon from '@/components/SparkleIcon'
import StopDetail from '@/components/StopDetail'
import TripTimeline from '@/components/TripTimeline'
import ViewSwitch from '@/components/ViewSwitch'
import { patchShare, usePlan } from '@/lib/client/plan-session'
import { readRecommendStream } from '@/lib/client/recommend-stream'
import { useWeather } from '@/lib/client/weather'
import { summarizeModes } from '@/lib/core/format'
import { buildItinerary } from '@/lib/core/itinerary'
import { pickRouteMode } from '@/lib/core/route-mode'
import { buildShareCard, defaultShareTitle, shareContextLabel } from '@/lib/core/share-card'
import { splitWeather } from '@/lib/core/weather'
import { applyDiff } from '@/lib/recommend/apply-diff'
import { canFinalize } from '@/lib/recommend/can-finalize'
import { inheritSelection } from '@/lib/recommend/inherit-selection'
import type { LatLng, RecommendPlace, Route } from '@/lib/core/model'

const ROUTE_DEBOUNCE_MS = 400

type RecommendMeta = { assumptions: string[]; unverified: string[] }
type LastExchange = { answer: string; removed: { name: string; reason: string }[] }
type Stage = 'thinking' | 'generating' | null

const EMPTY_META: RecommendMeta = { assumptions: [], unverified: [] }
// 模块级常量：写成 `?? []` 会让每次渲染都产生新引用，依赖它们的 effect 每帧都重跑
const NO_PLACES: RecommendPlace[] = []
const NO_EXCLUDED: { name: string; reason: string }[] = []

/**
 * 等待模型返回时的反馈。
 *
 * 星芒用发按钮上那颗（`SparkleIcon`），并让它动起来 —— 用户刚点完那颗星芒，
 * 下一页看到同一颗在转，因果是连着的。原来那颗静止的脉冲小圆点做不到这件事，
 * 而首屏可能要等二十秒，界面一动不动会被当成卡死。
 *
 * role="status" 是给屏幕阅读器的：纯视觉动画不播报，读屏用户会全程听不到任何动静。
 */
function Working({ children }: { children: ReactNode }) {
  return (
    <span role="status" className="flex items-center gap-2">
      <SparkleIcon className="anim-sparkle h-4 w-4 shrink-0 text-jade" />
      {children}
    </span>
  )
}

/** 停下来 / 断线之后的共同出口：按上次的任务类型重跑一遍，把没拿到的补齐 */
function ResumeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-xs border border-current px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75"
    >
      补完剩下的
    </button>
  )
}

export default function PlanPage() {
  const draft = usePlan()

  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<Stage>(null)
  const [error, setError] = useState<string | null>(null)
  /** 流中途断了：已生成的部分保留，但要说清楚它是残缺的 */
  const [partialError, setPartialError] = useState<string | null>(null)
  /** 用户自己按的停止。它不是故障，不该跟「失败」用同一套说法 */
  const [stopped, setStopped] = useState(false)

  const [places, setPlaces] = useState<RecommendPlace[]>(NO_PLACES)
  const [excluded, setExcluded] = useState<{ name: string; reason: string }[]>(NO_EXCLUDED)
  const [meta, setMeta] = useState<RecommendMeta>(EMPTY_META)
  const [lastExchange, setLastExchange] = useState<LastExchange | null>(null)
  /** 刚细化完的账，用来向用户交代「未选的已移除」 */
  const [finalizeNote, setFinalizeNote] = useState<{
    before: number
    selected: number
    after: number
  } | null>(null)

  /** null = 关闭；{ name: null } = 整批追问；{ name: '某地' } = 单点追问 */
  const [askTarget, setAskTarget] = useState<{ name: string | null } | null>(null)

  const [selectedOrder, setSelectedOrder] = useState<string[]>([])
  const [routeState, setRouteState] = useState<{ key: string; route: Route } | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  /**
   * 列表与地图之间那条线：正被指着的是哪一条。
   *
   * 两个方向共用这一个状态 —— 鼠标停在列表某张卡上、或者停在地图某个点上，
   * 说的都是同一件事「我现在说的是这一个」。分开存两份就会出现
   * 「地图亮着 A、列表亮着 B」这种自相矛盾的画面。
   */
  const [hoverName, setHoverName] = useState<string | null>(null)

  /** 终点。默认不设 —— 用户不去别处时末站就是结束 */
  const [end, setEnd] = useState<{ point: LatLng; label: string } | null>(null)
  const [pickingEnd, setPickingEnd] = useState(false)
  const [view, setView] = useState<'list' | 'timeline'>('list')
  /** 分享卡浮层。行程定了才有得分享，所以它只从行程视图的托盘进 */
  const [sharing, setSharing] = useState(false)

  /*
   * 分享卡第一行要写天气（「… · 今天 · 26° 晴」）。
   * 这一页原来不取天气 —— 那是首页那些字的事。
   *
   * 只在打开分享卡时才拉：这一页平时根本没有用到天气的地方，
   * 为了一个可能永远不会打开的浮层先发一次请求是白花额度（还要占高德的并发闸门）。
   * 拿不到就不写那一截（useWeather 永远不给错误态，见它的注释）。
   */
  const weather = useWeather(sharing ? (draft?.point ?? null) : null)

  const reqIdRef = useRef(0)
  const startedRef = useRef(false)
  /** 细化前选中的父级名字，用来给子点继承选中态 */
  const inheritFromRef = useRef<string[]>([])
  /** 用户按了「停止」：把这次的异常当成主动取消，而不是故障 */
  const stoppedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  /**
   * 上一次流式请求的内容，供「重试」原样重跑。
   *
   * 不能靠「列表里有没有带 parent 的点」去反推该重试哪个任务 ——
   * 若细化在第一个地点到达前就失败，列表是空的，那个推断会得出
   * 「该重试 initial」，于是把用户的整份列表换掉、白花一次 LLM 调用。
   */
  const lastStreamRef = useRef<{ task: 'initial' | 'finalize'; extra: Record<string, unknown> }>({
    task: 'initial',
    extra: {},
  })

  const baseBody = useCallback(
    (task: string, extra: Record<string, unknown> = {}) => {
      if (!draft) return null
      return {
        task,
        origin: { point: draft.point },
        destination: {
          mode: draft.prefs.destination.trim() ? 'specified' : 'nearby',
          requested: draft.prefs.destination.trim() || null,
        },
        preferences: {
          intents: draft.prefs.intents,
          timeBudget: draft.prefs.timeBudget,
          travelMode: draft.prefs.travelMode,
          companions: draft.prefs.companions,
          crowdTolerance: draft.prefs.crowdTolerance,
          rawRequest: draft.prefs.rawRequest,
        },
        ...extra,
      }
    },
    [draft],
  )

  /** 流式跑 initial / finalize：卡片随生成逐张出现，核实与生成重叠 */
  const runStreaming = useCallback(
    async (task: 'initial' | 'finalize', extra: Record<string, unknown> = {}) => {
      const body = baseBody(task, extra)
      if (!body) return

      const id = ++reqIdRef.current
      const before = places.length
      const controller = new AbortController()
      abortRef.current = controller
      stoppedRef.current = false
      lastStreamRef.current = { task, extra }
      setBusy(true)
      setStage(null)
      setError(null)
      setPartialError(null)
      setStopped(false)
      setFinalizeNote(null)
      setPlaces(NO_PLACES)
      setExcluded(NO_EXCLUDED)
      setMeta(EMPTY_META)
      if (task === 'initial') {
        setLastExchange(null)
        setSelectedOrder([])
        setDetailName(null)
        setAskTarget(null)
        // 整份列表要换掉了：留着上次那条的名字，可能会点亮同名的**新**卡片
        setHoverName(null)
      }

      const acc: RecommendPlace[] = []
      let streamError: string | null = null

      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.reason ?? '未知原因')
        }

        for await (const ev of readRecommendStream(res)) {
          if (id !== reqIdRef.current) return

          if (ev.type === 'stage') {
            setStage(ev.stage)
          } else if (ev.type === 'place') {
            acc.push(ev.place)
            setPlaces([...acc])
          } else if (ev.type === 'done') {
            setExcluded(ev.value.excluded)
            setMeta(ev.value.meta)
          } else if (ev.type === 'error') {
            streamError = ev.reason
          }
        }

        if (streamError) setPartialError(streamError)

        // 细化完成后，子点继承父级的选中状态 —— 用户的意图不该因为拆解而丢失
        if (task === 'finalize') {
          setSelectedOrder(inheritSelection(acc, inheritFromRef.current))
          // selected 取细化前的选择数：inheritFromRef 是细化前的快照，
          // 而 selectedOrder 此时已经被继承重算过了
          setFinalizeNote({
            before,
            selected: inheritFromRef.current.length,
            after: acc.length,
          })
        }
      } catch (e) {
        if (id !== reqIdRef.current) return
        if (stoppedRef.current) {
          // 用户按的停止：这是他下的命令，不是系统出错
          setStopped(true)
        } else if (acc.length > 0) {
          // 已有卡片时不整批丢弃 —— 用户看到的是真实生成出来的东西
          setPartialError(e instanceof Error ? e.message : '生成中断')
        } else {
          setError(e instanceof Error ? e.message : '未知原因')
        }
      } finally {
        if (id === reqIdRef.current) {
          setBusy(false)
          setStage(null)
          abortRef.current = null
        }
      }
    },
    // places 只为取细化前的条数，用于向用户交代「未选的已移除」
    [baseBody, places],
  )

  /** 停止与断线共用同一个出口：按上次的任务类型重跑，把没拿到的补齐 */
  const resume = useCallback(() => {
    const last = lastStreamRef.current
    void runStreaming(last.task, last.extra)
  }, [runStreaming])

  const stop = useCallback(() => {
    stoppedRef.current = true
    abortRef.current?.abort()
  }, [])

  // 首页点了「帮我推荐」才跳过来，所以落地即开跑；用 ref 保证只跑一次
  useEffect(() => {
    if (!draft || startedRef.current) return
    startedRef.current = true
    void runStreaming('initial')
  }, [draft, runStreaming])

  // ── 追问：diff 很小，保持一次性返回 ──
  const runFollowup = useCallback(
    async (text: string) => {
      if (!draft || !askTarget) return
      const id = ++reqIdRef.current
      const focusName = askTarget.name
      setBusy(true)
      setError(null)

      try {
        const focusPlace = focusName ? places.find((p) => p.name === focusName) : null
        const body = baseBody('refine', {
          focus: focusPlace
            ? { name: focusPlace.name, address: focusPlace.address, category: focusPlace.category }
            : null,
          // 单点追问也要带上完整列表，且要带 contains：
          // skill 靠它判断新增的是否与已有重复，包括复合地点里的子点
          previous: places.map((p) => ({
            name: p.name,
            tier: p.tier,
            category: p.category,
            contains: p.contains,
          })),
          followup: text,
        })

        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.reason ?? '未知原因')
        if (id !== reqIdRef.current) return

        // diff 的应用不再是「filter + 拼接」：要支持同名 upsert（复合地点
        // 更新 contains）与子点层匹配，见 apply-diff.ts
        const applied = applyDiff(places, {
          added: data.added ?? [],
          removed: data.removed ?? [],
        })
        // 单点追问新增的项，记下它是在哪个地点旁边找到的 —— 列表靠它把这几条
        // 挂在那条下面。只认「真正新追加」的：同名 upsert 的本来就在列表里，
        // 位置没变，重新归属会把它从原处挪走。整批追问没有锚点，保持平铺。
        setPlaces(
          focusName
            ? applied.places.map((p) =>
                applied.added.includes(p.name) ? { ...p, askedFrom: focusName } : p,
              )
            : applied.places,
        )

        // 被移除的如果正被选中，必须一并取消，否则会出现「还在选中但已不在列表里」
        const gone = new Set([...applied.removedTopLevel, ...applied.removedSubPoints])
        setSelectedOrder((prev) => prev.filter((n) => !gone.has(n)))
        setLastExchange({ answer: data.answer ?? '', removed: data.removed ?? [] })
        setAskTarget(null)
      } catch (e) {
        if (id !== reqIdRef.current) return
        setError(e instanceof Error ? e.message : '未知原因')
      } finally {
        if (id === reqIdRef.current) setBusy(false)
      }
    },
    [draft, askTarget, places, baseBody],
  )

  const runFinalize = useCallback(() => {
    if (selectedOrder.length === 0) return
    inheritFromRef.current = selectedOrder
    const selected = selectedOrder
      .map((name) => places.find((p) => p.name === name))
      .filter((p): p is RecommendPlace => Boolean(p))
      .map((p) => ({
        name: p.name,
        address: p.address,
        category: p.category,
        contains: p.contains,
      }))
    setLastExchange(null)
    setAskTarget(null)
    void runStreaming('finalize', { selected })
  }, [selectedOrder, places, runStreaming])

  // ── 路线：勾选的是「一组点」，拜访顺序由服务端算最优后返回 ──
  const endKey = end ? `${end.point.lng},${end.point.lat}` : ''
  const routeKey =
    selectedOrder.length >= 2 && draft
      ? `${selectedOrder.join(',')}|${draft.point.lng},${draft.point.lat}|${endKey}`
      : null
  const route = routeState && routeState.key === routeKey ? routeState.route : null
  const visitOrder = route?.order ?? selectedOrder

  useEffect(() => {
    if (!routeKey || !draft) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      const stops = selectedOrder
        .map((name) => places.find((p) => p.name === name))
        .filter((p): p is RecommendPlace => Boolean(p?.point))
        .map((p) => ({ id: p.name, point: p.point as LatLng }))

      void fetch('/api/route/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 路线方式跟着用户选的出行方式走 —— 之前这里写死 driving，
        // 结果选了「步行」画的也是驾车路线
        body: JSON.stringify({
          origin: draft.point,
          stops,
          // 没选过就不传：由服务端按 地铁 → 骑行 → 自驾 依次试。
          // 在这里替用户写死一种，就等于把「没偏好」说成了「偏好这种」
          mode: pickRouteMode(draft.prefs.travelMode) ?? undefined,
          ...(end ? { end: end.point } : {}),
        }),
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data: Route & { error?: string }) => {
          if (controller.signal.aborted || data.error) return
          setRouteState({ key: routeKey, route: data })
        })
        .catch(() => undefined)
    }, ROUTE_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [routeKey, draft, places, selectedOrder, end])

  /** 出行时间轴：由路线各段拼成，只给能确证的行程，不排时间表 */
  const itinerary = useMemo(() => {
    if (!route || !draft || route.order.length < 2) return null

    return buildItinerary({
      origin: { name: draft.label, point: draft.point },
      end: end ? { name: end.label, point: end.point } : null,
      stops: route.order.map((name) => {
        const place = places.find((p) => p.name === name)
        return { id: name, name, point: place?.point ?? { lng: 0, lat: 0 } }
      }),
      legs: route.legs.map((l) => ({
        mode: l.mode,
        durationSeconds: l.durationSeconds,
        distanceMeters: l.distanceMeters,
        degraded: l.degraded,
      })),
    })
  }, [route, draft, end, places])

  /*
   * 分享卡的内容。装配在 lib/core/share-card（纯函数、有测试），
   * 这里只管把「当前这一条行程」给它 —— 名字与出行时间取自草稿，
   * 所以关掉浮层再打开，用户改过的名字还在。
   */
  const shareCard = useMemo(() => {
    if (!itinerary) return null

    const stops = itinerary.stops.filter((s) => s.kind === 'stop')
    const typed = draft?.share?.title ?? ''

    return buildShareCard({
      itinerary,
      places,
      // 名字被清空时回落到系统给的那个：卡上不能没有标题，
      // 不然导出的是一张没名字的图，收到的人不知道这是什么
      title: typed.trim() || defaultShareTitle(stops[0]?.name ?? '这次出行', stops.length),
      when: draft?.share?.when ?? null,
    })
  }, [itinerary, places, draft])

  const shareContext = useMemo(() => {
    if (!draft) return null
    return shareContextLabel({
      label: draft.label,
      weather: weather ? splitWeather(weather).head : null,
    })
  }, [draft, weather])

  /*
   * 取消勾选把站点减到 2 个以下时路线就没了；此时若还停在「行程」上，
   * 用户看到的会是一块空白 —— 拉回列表。
   *
   * 用「渲染期间调整状态」而不是放进 effect：effect 里改状态要等这一帧提交完，
   * 而这一帧本身正是那块空白。放在渲染里，React 会当场重算，不提交空白帧。
   */
  const [hadRoute, setHadRoute] = useState(false)
  if (hadRoute !== Boolean(itinerary)) {
    setHadRoute(Boolean(itinerary))
    if (!itinerary) setView('list')
  }

  const togglePlace = useCallback((name: string) => {
    setSelectedOrder((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    )
  }, [])

  // 直接输 /plan 或刷新页面会拿不到草稿 —— 明确给出回首页的出口，而不是白屏
  if (!draft) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper px-6">
        <div className="max-w-[320px] text-center">
          <p className="text-sm font-medium text-ink">还没有出发点和偏好</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
            先告诉我从哪出发、想怎么玩。
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-10 items-center rounded-sm bg-jade px-4 text-[13px] font-medium text-white transition-colors hover:bg-jade-deep"
          >
            去首页填一下
          </Link>
        </div>
      </main>
    )
  }

  const detail = detailName ? (places.find((p) => p.name === detailName) ?? null) : null
  // 详情里的编号与列表、地图上那个编号同源：同一个「2」指的是同一个地方
  const detailOrder = detail ? visitOrder.indexOf(detail.name) : -1
  const canRefine = canFinalize(places, selectedOrder)

  return (
    /*
      手机上是「地图一条 + 列表铺满」，平板起才分栏。
      用 flex-col-reverse 而不是改 DOM 顺序：键盘与读屏的先后仍是
      「先列表、后地图」，视觉上地图在上。
    */
    <main className="flex h-dvh flex-col-reverse overflow-hidden bg-paper md:flex-row">
      <aside className="relative flex min-h-0 w-full flex-1 flex-col border-line bg-surface md:w-[360px] md:flex-none md:border-r lg:w-[420px]">
        {/*
          这里原来挂着「出发点 + 偏好的摘要卡 + 修改」。用户不需要在挑地方的时候
          再看见一遍自己从哪出发 —— 那是在首页说过的事，重复一遍只是占版面。
          回首页改填的出口是左上角那个品牌名。

          但**生成期间它必须锁住**：此刻列表还在往下长，改了需求就等于让
          已经收到的卡片按旧条件留在屏幕上，用户没法判断哪几条还算数。
          想改就先按「停止」（或等它跑完），那时入口自己会回来 ——
          所以这里不是禁用样式，而是整块换成一句说明：点了没反应比没有更糟。
        */}
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
          {busy ? (
            <span className="text-[13.5px] font-semibold text-ink">周边去哪</span>
          ) : (
            <Link href="/" className="text-[13.5px] font-semibold text-ink hover:text-jade">
              周边去哪
            </Link>
          )}
          {busy && (
            <span className="ml-auto rounded-full bg-mist px-2.5 py-0.5 text-[11.5px] text-ink-3">
              生成中不可修改
            </span>
          )}
        </div>

        {askTarget && (
          <FollowupBar
            focusName={askTarget.name}
            busy={busy}
            onSubmit={runFollowup}
            onCancel={() => setAskTarget(null)}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          {/* 首屏：阶段文案 + 骨架卡片 + 停止。
              等二十秒的界面不能一动不动，也不能只给一句「正在处理」——
              那样看不出它在哪一步、还剩多少 */}
          {busy && places.length === 0 && (
            <div>
              <div className="flex items-center gap-3 border-b border-line px-4 py-3 text-[13px] text-ink-2">
                <Working>
                  {stage === 'generating' ? '正在生成地点…' : '正在检索与思考…'}
                </Working>
                <button
                  onClick={stop}
                  className="ml-auto h-8 shrink-0 rounded-sm border border-line-2 px-3 text-xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                >
                  停止
                </button>
              </div>
              <div className="divide-y divide-line">
                <PlaceCardSkeleton />
                <PlaceCardSkeleton />
                <PlaceCardSkeleton />
              </div>
            </div>
          )}

          {busy && places.length > 0 && (
            <div className="flex items-center gap-3 border-b border-line bg-mist px-4 py-2 text-xs text-ink-2">
              <Working>已生成 {places.length} 条，还在继续…</Working>
              <button
                onClick={stop}
                className="ml-auto shrink-0 rounded-xs px-2 py-1 text-ink-2 transition-colors hover:bg-mist-2 hover:text-ink"
              >
                停止
              </button>
            </div>
          )}

          {/* 用户自己按的停止：说清停在哪、剩下的还能拿 */}
          {!busy && stopped && (
            <div className="flex items-center gap-3 border-b border-line bg-mist px-4 py-2.5 text-xs leading-[1.6] text-ink-2">
              <span>
                已停止。
                {places.length > 0
                  ? `下面是已经收到的 ${places.length} 条，可能不完整。`
                  : '这次一条都还没收到。'}
              </span>
              <div className="ml-auto text-jade">
                <ResumeButton onClick={resume} />
              </div>
            </div>
          )}

          {/* 生成中断用琥珀：数据不确定，但已有的内容还能用，不是「失败」 */}
          {partialError && (
            <div className="flex items-start gap-3 border-b border-amber-line bg-amber-bg px-4 py-2.5 text-xs leading-[1.6] text-amber">
              <span>
                生成中断：{partialError}
                <br />
                下面是已经生成出来的部分，可能不完整。
              </span>
              <div className="ml-auto shrink-0">
                <ResumeButton onClick={resume} />
              </div>
            </div>
          )}

          {/* 一条都没生成出来才是真失败：用红，并且必须给重试 */}
          {!busy && error && (
            <div className="px-4 py-5">
              <div className="rounded-sm border border-red-line bg-red-bg px-4 py-3.5 text-[12.5px] leading-[1.65] text-red">
                <p className="font-semibold">推荐没跑出来</p>
                <p className="mt-1">{error}</p>
                <button
                  onClick={() => runStreaming('initial')}
                  className="mt-3 h-9 rounded-sm bg-surface px-3.5 text-[13px] font-medium text-red shadow-[inset_0_0_0_1px_var(--color-red-line)]"
                >
                  重试
                </button>
              </div>
            </div>
          )}

          {/* 有路线了才给切换：没路线时时间轴是空的，没必要露出来 */}
          {itinerary && view === 'timeline' && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-paper px-4 py-2.5 text-xs text-ink-3">
              <span>
                {itinerary.stops.filter((s) => s.kind === 'stop').length} 站 ·{' '}
                {summarizeModes(itinerary.legs)}
              </span>
              <div className="ml-auto">
                <ViewSwitch view={view} onChange={setView} />
              </div>
            </div>
          )}

          {/* key={view} 让切换时重新挂载，从而触发一次淡入 ——
              说明「这是同一个东西的另一种看法」，而不是跳转到了别处 */}
          <div key={view} className="anim-fade">
            {view === 'timeline' && itinerary && (
              <TripTimeline
                itinerary={itinerary}
                places={places}
                hasEnd={end !== null}
                onSetEnd={() => setPickingEnd(true)}
                onClearEnd={() => setEnd(null)}
                onOpenDetail={setDetailName}
              />
            )}

            {view === 'list' && places.length > 0 && (
              <RecommendList
                places={places}
                visitOrder={visitOrder}
                excluded={excluded}
                meta={meta}
                lastExchange={lastExchange}
                busy={busy}
                finalizeNote={finalizeNote}
                viewSwitch={itinerary ? { view: 'list', onChange: setView } : undefined}
                hovered={hoverName}
                onHover={setHoverName}
                onToggle={togglePlace}
                onOpenDetail={setDetailName}
                onAsk={(name) => setAskTarget({ name })}
              />
            )}
          </div>
        </div>

        {/*
          两个「下一步」入口收在一个固定底栏里。
          之前它们一个在列表底部（要滚动才看见）、一个在列表上方（很容易错过），
          用户勾完地点不知道接下来该干嘛 —— 这是「难用」的主要来源之一。
        */}
        <SelectionTray
          selectedCount={selectedOrder.length}
          unit={finalizeNote ? '个站点' : '个地方'}
          canFinalize={view === 'list' && canRefine}
          busy={busy}
          showViewButton={view === 'list'}
          trip={
            view === 'timeline' && itinerary
              ? { onBackToList: () => setView('list'), onShare: () => setSharing(true) }
              : undefined
          }
          onClear={() => setSelectedOrder([])}
          onView={() => setView('timeline')}
          onFinalize={runFinalize}
        />

        <StopDetail
          place={detail}
          order={detailOrder >= 0 ? detailOrder + 1 : null}
          selected={detail ? selectedOrder.includes(detail.name) : false}
          onToggle={togglePlace}
          onClose={() => setDetailName(null)}
        />
      </aside>

      {/*
        地图上原来压着一张「1→2→3」顺序卡。已经撤掉：
        它是地图上半部唯一被遮住的地方，而编号本来就丢不了 ——
        地图标记和列表卡片上的圆圈都带着。汇总数字在行程页有（「路上共 …」）。

        地图画的也不再只是勾中的那几个：列表里**核实通过的**地点全在上面
        （备选是空心点、已选带编号），否则「能上图」那句话只兑现了一半 ——
        用户看着一张推荐列表，却不知道它们各自在哪。
      */}
      <div className="relative h-[38vh] shrink-0 md:h-auto md:min-h-0 md:flex-1">
        <MapCanvas
          origin={draft.point}
          places={places}
          visitOrder={visitOrder}
          route={route}
          picking={false}
          onPickLocation={() => undefined}
          highlightName={hoverName}
          onHighlight={setHoverName}
          onMarkerClick={setDetailName}
        />
      </div>

      {/* 分享卡浮层：卡面预览 + 改名 + 出行时间（可选）+ 保存图片 */}
      {sharing && shareCard && (
        <ShareCardDialog
          card={shareCard}
          contextLabel={shareContext}
          onChangeTitle={(title) => patchShare({ title })}
          onChangeWhen={(when) => patchShare({ when })}
          onClose={() => setSharing(false)}
        />
      )}

      {/* 终点选点：与首页的出发点选点共用同一个浮层（同一件事：选一个坐标出来） */}
      {pickingEnd && (
        <MapPicker
          target="终点"
          near={draft.point}
          // 把出发点标出来当参照：选终点时「离家多远」正是要看的东西
          origin={draft.point}
          initial={end ? { point: end.point, label: end.label } : null}
          onConfirm={(p, name) => {
            setEnd({ point: p, label: name })
            setPickingEnd(false)
          }}
          onClose={() => setPickingEnd(false)}
        />
      )}
    </main>
  )
}
