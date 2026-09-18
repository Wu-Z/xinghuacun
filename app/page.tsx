'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import MapCanvas from '@/components/MapCanvas'
import OriginPicker from '@/components/OriginPicker'
import PreferenceForm, { EMPTY_PREFERENCES, type Preferences } from '@/components/PreferenceForm'
import RecommendList from '@/components/RecommendList'
import RecommendSummary from '@/components/RecommendSummary'
import RouteSummaryBar from '@/components/RouteSummaryBar'
import StopDetail from '@/components/StopDetail'
import { toGcj02 } from '@/lib/core/coordinate'
import type { LatLng, Origin, RecommendPlace, Route } from '@/lib/core/model'

const GEO_TIMEOUT_MS = 5000
const PENDING_LABEL = '已选位置'
// 高德 QPS 是按秒掐的，等手停下来再请求，避免连点造成请求风暴
const ROUTE_DEBOUNCE_MS = 400

type RecommendMeta = { assumptions: string[]; unverified: string[] }

// 模块级常量：写成 `?? []` 会让每次渲染都产生新引用，
// 进而让依赖它们的 effect 每帧都重跑
const EMPTY_META: RecommendMeta = { assumptions: [], unverified: [] }
const NO_PLACES: RecommendPlace[] = []
const NO_EXCLUDED: { name: string; reason: string }[] = []

export default function Home() {
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [locating, setLocating] = useState(false)
  const [picking, setPicking] = useState(false)

  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFERENCES)
  const [formOpen, setFormOpen] = useState(true)
  const [recommending, setRecommending] = useState(false)
  const [recommendError, setRecommendError] = useState<string | null>(null)

  // 结果与产生它的条件绑在一起。条件一变，旧结果在渲染时即被判为过期 ——
  // 不需要 effect 去清，也就不会出现「旧结果闪一下」。
  const [result, setResult] = useState<{
    key: string
    places: RecommendPlace[]
    excluded: { name: string; reason: string }[]
    meta: RecommendMeta
  } | null>(null)

  const [selectedOrder, setSelectedOrder] = useState<string[]>([])
  const [routeState, setRouteState] = useState<{ key: string; route: Route } | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  const recommendIdRef = useRef(0)

  const conditionsKey = origin ? `${origin.point.lng},${origin.point.lat}|${JSON.stringify(prefs)}` : null
  const current = result && result.key === conditionsKey ? result : null
  const places = current?.places ?? NO_PLACES
  const excluded = current?.excluded ?? NO_EXCLUDED
  const meta = current?.meta ?? EMPTY_META

  // ── 显式触发推荐。skill 是 LLM 调用，慢且花钱，不能跟着输入自动跑 ──
  const runRecommend = useCallback(async () => {
    if (!origin) {
      setRecommendError('先选一个出发点')
      return
    }

    const id = ++recommendIdRef.current
    setRecommending(true)
    setRecommendError(null)

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.reason ?? '未知原因')
      if (id !== recommendIdRef.current) return

      setResult({
        key: `${origin.point.lng},${origin.point.lat}|${JSON.stringify(prefs)}`,
        places: data.places ?? [],
        excluded: data.excluded ?? [],
        meta: data.meta ?? EMPTY_META,
      })
      setSelectedOrder([])
      setDetailName(null)
      // 表单的使命结束，把空间让给结果
      setFormOpen(false)
    } catch (e) {
      if (id !== recommendIdRef.current) return
      setRecommendError(e instanceof Error ? e.message : '未知原因')
    } finally {
      if (id === recommendIdRef.current) setRecommending(false)
    }
  }, [origin, prefs])

  const useGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setRecommendError('这个浏览器拿不到定位，直接在地图上选点吧')
      return
    }

    setLocating(true)
    let settled = false

    // 5 秒没回来就放行，不阻塞页面
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      setLocating(false)
      setRecommendError('定位超时了，直接在地图上选点吧')
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
        setRecommendError('没拿到定位权限，直接在地图上选点吧')
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
  // 编号用拜访顺序，不是勾选顺序 —— 否则用户看到的编号与实际路线不符
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
    setSelectedOrder((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]))
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
            <PreferenceForm
              value={prefs}
              onChange={changePrefs}
              onSubmit={runRecommend}
              busy={recommending}
            />
          ) : (
            <RecommendSummary
              location={origin?.label ?? '未选出发点'}
              value={prefs}
              onEdit={() => setFormOpen(true)}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {recommending && (
            <p className="px-4 py-6 text-sm text-ink-soft">
              正在找附近值得去的地方…（要跑一次联网检索，需要几秒）
            </p>
          )}

          {!recommending && recommendError && (
            <div className="px-4 py-6 text-sm">
              <p className="font-medium text-red-700">推荐失败</p>
              <p className="mt-1 text-ink-soft">{recommendError}</p>
              <button
                onClick={runRecommend}
                className="mt-3 rounded-md bg-mist px-3 py-1.5 text-xs text-ink hover:bg-line"
              >
                重试
              </button>
            </div>
          )}

          {!recommending && !recommendError && places.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-soft">
              选好出发点和偏好，点「帮我推荐」
            </p>
          )}

          {!recommending && places.length > 0 && (
            <RecommendList
              places={places}
              visitOrder={visitOrder}
              excluded={excluded}
              meta={meta}
              onToggle={togglePlace}
              onOpenDetail={setDetailName}
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
