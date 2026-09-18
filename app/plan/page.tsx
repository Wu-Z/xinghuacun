'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import FollowupBar from '@/components/FollowupBar'
import MapCanvas from '@/components/MapCanvas'
import RecommendList from '@/components/RecommendList'
import RecommendSummary from '@/components/RecommendSummary'
import RouteSummaryBar from '@/components/RouteSummaryBar'
import StopDetail from '@/components/StopDetail'
import { usePlan } from '@/lib/client/plan-session'
import { readRecommendStream } from '@/lib/client/recommend-stream'
import type { LatLng, RecommendPlace, Route } from '@/lib/core/model'

const ROUTE_DEBOUNCE_MS = 400

type RecommendMeta = { assumptions: string[]; unverified: string[] }
type LastExchange = { answer: string; removed: { name: string; reason: string }[] }
type Stage = 'thinking' | 'generating' | null

const EMPTY_META: RecommendMeta = { assumptions: [], unverified: [] }
// 模块级常量：写成 `?? []` 会让每次渲染都产生新引用，依赖它们的 effect 每帧都重跑
const NO_PLACES: RecommendPlace[] = []
const NO_EXCLUDED: { name: string; reason: string }[] = []

export default function PlanPage() {
  const draft = usePlan()

  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<Stage>(null)
  const [error, setError] = useState<string | null>(null)
  /** 流中途断了：已生成的部分保留，但要说清楚它是残缺的 */
  const [partialError, setPartialError] = useState<string | null>(null)

  const [places, setPlaces] = useState<RecommendPlace[]>(NO_PLACES)
  const [excluded, setExcluded] = useState<{ name: string; reason: string }[]>(NO_EXCLUDED)
  const [meta, setMeta] = useState<RecommendMeta>(EMPTY_META)
  const [lastExchange, setLastExchange] = useState<LastExchange | null>(null)

  /** null = 关闭；{ name: null } = 整批追问；{ name: '某地' } = 单点追问 */
  const [askTarget, setAskTarget] = useState<{ name: string | null } | null>(null)

  const [selectedOrder, setSelectedOrder] = useState<string[]>([])
  const [routeState, setRouteState] = useState<{ key: string; route: Route } | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  const reqIdRef = useRef(0)
  const startedRef = useRef(false)
  /** 细化前选中的父级名字，用来给子点继承选中态 */
  const inheritFromRef = useRef<string[]>([])

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
      setBusy(true)
      setStage(null)
      setError(null)
      setPartialError(null)
      setPlaces(NO_PLACES)
      setExcluded(NO_EXCLUDED)
      setMeta(EMPTY_META)
      if (task === 'initial') {
        setLastExchange(null)
        setSelectedOrder([])
        setDetailName(null)
        setAskTarget(null)
      }

      const acc: RecommendPlace[] = []
      let streamError: string | null = null

      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
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
          const from = inheritFromRef.current
          setSelectedOrder(
            acc
              .filter((p) => (p.parent ? from.includes(p.parent) : from.includes(p.name)))
              .map((p) => p.name),
          )
        }
      } catch (e) {
        if (id !== reqIdRef.current) return
        // 已有卡片时不整批丢弃 —— 用户看到的是真实生成出来的东西
        if (acc.length > 0) {
          setPartialError(e instanceof Error ? e.message : '生成中断')
        } else {
          setError(e instanceof Error ? e.message : '未知原因')
        }
      } finally {
        if (id === reqIdRef.current) {
          setBusy(false)
          setStage(null)
        }
      }
    },
    [baseBody],
  )

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
          // 单点追问也要带上完整列表：skill 需要靠它判断新增的是否与已有重复
          previous: places.map((p) => ({ name: p.name, tier: p.tier, category: p.category })),
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

        const removedNames = new Set((data.removed ?? []).map((r: { name: string }) => r.name))

        // 新增的默认不选中 —— 用户没要求过它
        setPlaces((prev) => [
          ...prev.filter((p) => !removedNames.has(p.name)),
          ...(data.added ?? []),
        ])
        // 被移除的如果正被选中，必须一并取消，否则会出现「还在选中但已不在列表里」
        setSelectedOrder((prev) => prev.filter((n) => !removedNames.has(n)))
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
  const routeKey =
    selectedOrder.length >= 2 && draft
      ? `${selectedOrder.join(',')}|${draft.point.lng},${draft.point.lat}`
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
        body: JSON.stringify({ origin: draft.point, stops, mode: 'driving' }),
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
  }, [routeKey, draft, places, selectedOrder])

  const togglePlace = useCallback((name: string) => {
    setSelectedOrder((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    )
  }, [])

  // 直接输 /plan 或刷新页面会拿不到草稿 —— 明确给出回首页的出口，而不是白屏
  if (!draft) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper px-6">
        <div className="text-center">
          <p className="text-sm text-ink">还没有出发点和偏好</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-jade px-4 py-2.5 text-sm font-medium text-white hover:bg-jade-deep"
          >
            回首页填一下
          </Link>
        </div>
      </main>
    )
  }

  const detail = detailName ? (places.find((p) => p.name === detailName) ?? null) : null
  const refines = places.some((p) => p.parent)

  return (
    <main className="flex h-dvh overflow-hidden">
      <aside className="relative flex w-[430px] shrink-0 flex-col border-r border-line bg-paper">
        <div className="shrink-0 border-b border-line px-4 py-4">
          <Link href="/" className="text-sm font-semibold text-ink hover:text-jade">
            周边去哪
          </Link>
          <div className="mt-3">
            <RecommendSummary location={draft.label} value={draft.prefs} editHref="/" />
          </div>
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
          {/* 流式：给出真实阶段，而不是一句静态的「正在处理」 */}
          {busy && places.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-ink-soft">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-jade" />
              {stage === 'generating' ? '正在生成地点…' : '正在检索与思考…'}
            </div>
          )}

          {busy && places.length > 0 && (
            <div className="flex items-center gap-2 border-b border-line bg-mist px-4 py-2 text-[11.5px] text-ink-soft">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-jade" />
              已生成 {places.length} 条，还在继续…
            </div>
          )}

          {partialError && (
            <div className="border-b border-line bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
              生成中断：{partialError}
              <br />
              下面是已经生成出来的部分，可能不完整。
              <button
                onClick={() => runStreaming(refines ? 'finalize' : 'initial')}
                className="ml-1 underline underline-offset-2"
              >
                重试
              </button>
            </div>
          )}

          {!busy && error && (
            <div className="px-4 py-6 text-sm">
              <p className="font-medium text-red-700">推荐失败</p>
              <p className="mt-1 text-ink-soft">{error}</p>
              <button
                onClick={() => runStreaming('initial')}
                className="mt-3 rounded-md bg-mist px-3 py-1.5 text-xs text-ink hover:bg-line"
              >
                重试
              </button>
            </div>
          )}

          {places.length > 0 && (
            <RecommendList
              places={places}
              visitOrder={visitOrder}
              excluded={excluded}
              meta={meta}
              lastExchange={lastExchange}
              selectedCount={selectedOrder.length}
              busy={busy}
              onToggle={togglePlace}
              onOpenDetail={setDetailName}
              onAsk={(name) => setAskTarget({ name })}
              onFinalize={runFinalize}
            />
          )}
        </div>

        <StopDetail place={detail} onClose={() => setDetailName(null)} />
      </aside>

      <div className="relative flex-1">
        <MapCanvas
          origin={draft.point}
          places={places}
          visitOrder={visitOrder}
          route={route}
          picking={false}
          onPickLocation={() => undefined}
        />
        <RouteSummaryBar visitOrder={visitOrder} route={route} />
      </div>
    </main>
  )
}
