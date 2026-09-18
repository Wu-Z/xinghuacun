'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FollowupBar from '@/components/FollowupBar'
import MapCanvas from '@/components/MapCanvas'
import OriginPicker from '@/components/OriginPicker'
import PreferenceForm, { EMPTY_PREFERENCES } from '@/components/PreferenceForm'
import RecommendList from '@/components/RecommendList'
import RecommendSummary from '@/components/RecommendSummary'
import RouteSummaryBar from '@/components/RouteSummaryBar'
import StopDetail from '@/components/StopDetail'
import { toGcj02 } from '@/lib/core/coordinate'
import type {
  LatLng,
  Origin,
  Preferences,
  RecommendPlace,
  Route,
} from '@/lib/core/model'

const GEO_TIMEOUT_MS = 5000
const PENDING_LABEL = '已选位置'
const ROUTE_DEBOUNCE_MS = 400

type RecommendMeta = { assumptions: string[]; unverified: string[] }
type LastExchange = { answer: string; removed: { name: string; reason: string }[] }

const EMPTY_META: RecommendMeta = { assumptions: [], unverified: [] }
// 模块级常量：写成 `?? []` 会让每次渲染都产生新引用，依赖它们的 effect 每帧都重跑
const NO_PLACES: RecommendPlace[] = []
const NO_EXCLUDED: { name: string; reason: string }[] = []

export default function Home() {
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [locating, setLocating] = useState(false)
  const [picking, setPicking] = useState(false)

  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFERENCES)
  const [formOpen, setFormOpen] = useState(true)
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

  const conditionsKey = origin
    ? `${origin.point.lng},${origin.point.lat}|${JSON.stringify(prefs)}`
    : null
  const current = result && result.key === conditionsKey ? result : null
  const places = current?.places ?? NO_PLACES
  const excluded = current?.excluded ?? NO_EXCLUDED
  const meta = current?.meta ?? EMPTY_META

  const buildBody = useCallback(
    (task: 'initial' | 'refine' | 'finalize', extra: Record<string, unknown> = {}) => {
      if (!origin) return null
      return {
        task,
        origin: { point: origin.point },
        destination: {
          mode: prefs.destination.trim() ? 'specified' : 'nearby',
          requested: prefs.destination.trim() || null,
        },
        preferences: {
          intents: prefs.intents,
          timeBudget: prefs.timeBudget,
          travelMode: prefs.travelMode,
          companions: prefs.companions,
          crowdTolerance: prefs.crowdTolerance,
          rawRequest: prefs.rawRequest,
        },
        ...extra,
      }
    },
    [origin, prefs],
  )

  const post = useCallback(async (task: 'initial' | 'refine' | 'finalize', extra = {}) => {
    const body = buildBody(task, extra)
    if (!body) throw new Error('先选一个出发点')

    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.reason ?? '未知原因')
    return data
  }, [buildBody])

  // ── 初次推荐 ──
  const runRecommend = useCallback(async () => {
    if (!origin) {
      setError('先选一个出发点')
      return
    }
    const id = ++reqIdRef.current
    setBusy(true)
    setError(null)

    try {
      const data = await post('initial')
      if (id !== reqIdRef.current) return

      setResult({
        key: `${origin.point.lng},${origin.point.lat}|${JSON.stringify(prefs)}`,
        places: data.places ?? [],
        excluded: data.excluded ?? [],
        meta: data.meta ?? EMPTY_META,
      })
      setLastExchange(null)
      setSelectedOrder([])
      setDetailName(null)
      setAskTarget(null)
      setFormOpen(false) // 表单的使命结束，把空间让给结果
    } catch (e) {
      if (id !== reqIdRef.current) return
      setError(e instanceof Error ? e.message : '未知原因')
    } finally {
      if (id === reqIdRef.current) setBusy(false)
    }
  }, [origin, prefs, post])

  // ── 追问：单点与整批走同一条路，都是「拿回 diff 再应用」 ──
  const runFollowup = useCallback(
    async (text: string) => {
      if (!current || !askTarget) return
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
          previous: focusName ? null : places.map((p) => ({ name: p.name, tier: p.tier, category: p.category })),
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
    [current, askTarget, places, post],
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
        .map((p) => ({ name: p.name, address: p.address, category: p.category, contains: p.contains }))

      const data = await post('finalize', { selected })
      if (id !== reqIdRef.current) return

      const next: RecommendPlace[] = data.places ?? []

      // 子点继承父级的选中状态：用户的意图不该因为拆解而丢失。
      // 不属于任何已选父级的点（skill 新增的）默认不选。
      const inherited = next
        .filter((p) => p.parent && selectedOrder.includes(p.parent))
        .map((p) => p.name)
      // 单一地点被选中且原样透传的，保持选中
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

  const useGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('这个浏览器拿不到定位，直接在地图上选点吧')
      return
    }

    setLocating(true)
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      setLocating(false)
      setError('定位超时了，直接在地图上选点吧')
    }, GEO_TIMEOUT_MS)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        setLocating(false)
        // 浏览器给的是 WGS-84，必须先转成 GCJ-02 再交给高德与 skill，
        // 否则会按偏了 100~700 米的位置去检索，推荐出一批别处的地方
        setOrigin({
          point: toGcj02({ lng: pos.coords.longitude, lat: pos.coords.latitude }, 'geolocation'),
          label: PENDING_LABEL,
          source: 'geolocation',
        })
        setFormOpen(true)
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        setLocating(false)
        setError('没拿到定位权限，直接在地图上选点吧')
      },
      { timeout: GEO_TIMEOUT_MS, enableHighAccuracy: false },
    )
  }, [])

  const handlePickLocation = useCallback(
    (point: LatLng) => {
      if (!picking) return
      setPicking(false)
      setOrigin({ point, label: PENDING_LABEL, source: 'map-pick' })
      setFormOpen(true)
    },
    [picking],
  )

  // 改偏好就是要重新推荐，所以顺手把表单展开
  const changePrefs = useCallback((next: Preferences) => {
    setPrefs(next)
    setFormOpen(true)
  }, [])

  // ── 路线：勾选的是「一组点」，拜访顺序由服务端算最优后返回 ──
  const routeKey =
    selectedOrder.length >= 2 && origin
      ? `${selectedOrder.join(',')}|${origin.point.lng},${origin.point.lat}`
      : null
  const route = routeState && routeState.key === routeKey ? routeState.route : null
  const visitOrder = route?.order ?? selectedOrder

  useEffect(() => {
    if (!routeKey || !origin) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      const stops = selectedOrder
        .map((name) => places.find((p) => p.name === name))
        .filter((p): p is RecommendPlace => Boolean(p?.point))
        .map((p) => ({ id: p.name, point: p.point as LatLng }))

      void fetch('/api/route/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin: origin.point, stops, mode: 'driving' }),
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
  }, [routeKey, origin, places, selectedOrder])

  const togglePlace = useCallback((name: string) => {
    setSelectedOrder((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    )
  }, [])

  const detail = detailName ? (places.find((p) => p.name === detailName) ?? null) : null

  return (
    <main className="flex h-dvh overflow-hidden">
      <aside className="relative flex w-[430px] shrink-0 flex-col border-r border-line bg-paper">
        <div className="shrink-0 border-b border-line px-4 py-4">
          <h1 className="mb-3 text-sm font-semibold text-ink">周边去哪</h1>
          <OriginPicker
            origin={origin}
            locating={locating}
            onUseGeolocation={useGeolocation}
            onStartPick={() => setPicking((v) => !v)}
            picking={picking}
          />
        </div>

        <div className="shrink-0 border-b border-line px-4 py-4">
          {formOpen ? (
            <PreferenceForm value={prefs} onChange={changePrefs} onSubmit={runRecommend} busy={busy} />
          ) : (
            <RecommendSummary
              location={origin?.label ?? '未选出发点'}
              value={prefs}
              onEdit={() => setFormOpen(true)}
            />
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
                onClick={runRecommend}
                className="mt-3 rounded-md bg-mist px-3 py-1.5 text-xs text-ink hover:bg-line"
              >
                重试
              </button>
            </div>
          )}

          {!busy && !error && places.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-soft">选好出发点和偏好，点「帮我推荐」</p>
          )}

          {!busy && places.length > 0 && (
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
          origin={origin?.point ?? null}
          places={places}
          visitOrder={visitOrder}
          route={route}
          picking={picking}
          onPickLocation={handlePickLocation}
        />
        <RouteSummaryBar visitOrder={visitOrder} route={route} />
      </div>
    </main>
  )
}
