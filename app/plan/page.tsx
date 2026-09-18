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
import type { LatLng, RecommendPlace, Route } from '@/lib/core/model'

const ROUTE_DEBOUNCE_MS = 400

type RecommendMeta = { assumptions: string[]; unverified: string[] }
type LastExchange = { answer: string; removed: { name: string; reason: string }[] }

const EMPTY_META: RecommendMeta = { assumptions: [], unverified: [] }
// 模块级常量：写成 `?? []` 会让每次渲染都产生新引用，依赖它们的 effect 每帧都重跑
const NO_PLACES: RecommendPlace[] = []
const NO_EXCLUDED: { name: string; reason: string }[] = []

export default function PlanPage() {
  const draft = usePlan()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [result, setResult] = useState<{
    key: string
    places: RecommendPlace[]
    excluded: { name: string; reason: string }[]
    meta: RecommendMeta
  } | null>(null)
  const [lastExchange, setLastExchange] = useState<LastExchange | null>(null)

  /** null = 关闭；{ name: null } = 整批追问；{ name: '某地' } = 单点追问 */
  const [askTarget, setAskTarget] = useState<{ name: string | null } | null>(null)

  const [selectedOrder, setSelectedOrder] = useState<string[]>([])
  const [routeState, setRouteState] = useState<{ key: string; route: Route } | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  const reqIdRef = useRef(0)
  const startedRef = useRef(false)

  const current = result
  const places = current?.places ?? NO_PLACES
  const excluded = current?.excluded ?? NO_EXCLUDED
  const meta = current?.meta ?? EMPTY_META

  const post = useCallback(
    async (task: 'initial' | 'refine' | 'finalize', extra: Record<string, unknown> = {}) => {
      if (!draft) throw new Error('没有出发点')
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.reason ?? '未知原因')
      return data
    },
    [draft],
  )

  const runInitial = useCallback(async () => {
    if (!draft) return
    const id = ++reqIdRef.current
    setBusy(true)
    setError(null)
    try {
      const data = await post('initial')
      if (id !== reqIdRef.current) return
      setResult({
        key: `${draft.point.lng},${draft.point.lat}`,
        places: data.places ?? [],
        excluded: data.excluded ?? [],
        meta: data.meta ?? EMPTY_META,
      })
      setLastExchange(null)
      setSelectedOrder([])
      setDetailName(null)
      setAskTarget(null)
    } catch (e) {
      if (id !== reqIdRef.current) return
      setError(e instanceof Error ? e.message : '未知原因')
    } finally {
      if (id === reqIdRef.current) setBusy(false)
    }
  }, [draft, post])

  // 首页点了「帮我推荐」才跳过来，所以落地即开跑；用 ref 保证只跑一次
  useEffect(() => {
    if (!draft || startedRef.current) return
    startedRef.current = true
    void runInitial()
  }, [draft, runInitial])

  // ── 追问：单点与整批走同一条路，都是「拿回 diff 再应用」 ──
  const runFollowup = useCallback(
    async (text: string) => {
      if (!current || !askTarget || !draft) return
      const id = ++reqIdRef.current
      const focusName = askTarget.name
      setBusy(true)
      setError(null)

      try {
        const focusPlace = focusName ? places.find((p) => p.name === focusName) : null
        const data = await post('refine', {
          focus: focusPlace
            ? { name: focusPlace.name, address: focusPlace.address, category: focusPlace.category }
            : null,
          // 单点追问也要带上完整列表：skill 需要靠它判断新增的地点是否与
          // 已有重复，否则平台会把重复项直接 append 进列表显示给用户
          previous: places.map((p) => ({ name: p.name, tier: p.tier, category: p.category })),
          followup: text,
        })
        if (id !== reqIdRef.current) return

        const removedNames = new Set((data.removed ?? []).map((r: { name: string }) => r.name))

        setResult((prev) =>
          prev
            ? {
                ...prev,
                places: [
                  // 新增的默认不选中 —— 用户没要求过它
                  ...prev.places.filter((p) => !removedNames.has(p.name)),
                  ...(data.added ?? []),
                ],
              }
            : prev,
        )
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
    [current, askTarget, draft, places, post],
  )

  // ── 细化：复合地点拆成子点，单一地点透传；子点继承父级的选择 ──
  const runFinalize = useCallback(async () => {
    if (!current || selectedOrder.length === 0) return
    const id = ++reqIdRef.current
    setBusy(true)
    setError(null)

    try {
      const selected = selectedOrder
        .map((name) => places.find((p) => p.name === name))
        .filter((p): p is RecommendPlace => Boolean(p))
        .map((p) => ({
          name: p.name,
          address: p.address,
          category: p.category,
          contains: p.contains,
        }))

      const data = await post('finalize', { selected })
      if (id !== reqIdRef.current) return

      const next: RecommendPlace[] = data.places ?? []

      // 子点继承父级的选中状态：用户的意图不该因为拆解而丢失。
      // 不属于任何已选父级的点（skill 新增的）默认不选。
      const inherited = next
        .filter((p) => p.parent && selectedOrder.includes(p.parent))
        .map((p) => p.name)
      const passedThrough = next
        .filter((p) => !p.parent && selectedOrder.includes(p.name))
        .map((p) => p.name)

      setResult((prev) =>
        prev
          ? { ...prev, places: next, excluded: data.excluded ?? [], meta: data.meta ?? EMPTY_META }
          : prev,
      )
      setSelectedOrder([...inherited, ...passedThrough])
      setLastExchange(null)
      setAskTarget(null)
    } catch (e) {
      if (id !== reqIdRef.current) return
      setError(e instanceof Error ? e.message : '未知原因')
    } finally {
      if (id === reqIdRef.current) setBusy(false)
    }
  }, [current, selectedOrder, places, post])

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

  return (
    <main className="flex h-dvh overflow-hidden">
      <aside className="relative flex w-[430px] shrink-0 flex-col border-r border-line bg-paper">
        <div className="shrink-0 border-b border-line px-4 py-4">
          <div className="mb-3 flex items-baseline gap-3">
            <Link href="/" className="text-sm font-semibold text-ink hover:text-jade">
              周边去哪
            </Link>
          </div>
          <RecommendSummary
            location={draft.label}
            value={draft.prefs}
            onEdit={() => undefined}
            editHref="/"
          />
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
          {busy && (
            <p className="px-4 py-6 text-sm text-ink-soft">
              正在处理…（要跑一次联网检索，需要几秒）
            </p>
          )}

          {!busy && error && (
            <div className="px-4 py-6 text-sm">
              <p className="font-medium text-red-700">推荐失败</p>
              <p className="mt-1 text-ink-soft">{error}</p>
              <button
                onClick={runInitial}
                className="mt-3 rounded-md bg-mist px-3 py-1.5 text-xs text-ink hover:bg-line"
              >
                重试
              </button>
            </div>
          )}

          {!busy && !error && places.length > 0 && (
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
