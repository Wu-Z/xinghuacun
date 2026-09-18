'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import MapCanvas from '@/components/MapCanvas'
import { toGcj02 } from '@/lib/core/coordinate'
import OriginPicker from '@/components/OriginPicker'
import PoiList from '@/components/PoiList'
import RouteSummaryBar from '@/components/RouteSummaryBar'
import StopDetail from '@/components/StopDetail'
import type {
  LatLng,
  Origin,
  OriginSource,
  Poi,
  PoiDetail,
  Route,
  SearchResponse,
  TravelMode,
} from '@/lib/core/model'

const GEO_TIMEOUT_MS = 5000
const PENDING_LABEL = '已选位置'
// 高德 QPS 限制是真实约束，等手停下来再请求，避免连点造成请求风暴
const ROUTE_DEBOUNCE_MS = 400

export default function Home() {
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [mode, setMode] = useState<TravelMode>('driving')
  const [radiusMinutes, setRadiusMinutes] = useState<30 | 60 | 120>(60)
  const [locating, setLocating] = useState(false)
  const [picking, setPicking] = useState(false)

  const [pois, setPois] = useState<Poi[]>([])
  const [selectedOrder, setSelectedOrder] = useState<string[]>([])
  const [routeState, setRouteState] = useState<{ key: string; route: Route } | null>(null)

  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [detail, setDetail] = useState<PoiDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const requestIdRef = useRef(0)
  const lastSearchedRef = useRef('')

  const search = useCallback(
    async (point: LatLng, source: OriginSource) => {
      const id = ++requestIdRef.current
      setListLoading(true)
      setListError(null)

      try {
        const res = await fetch('/api/poi/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ origin: point, source, radiusMinutes, mode }),
        })
        const data = (await res.json()) as SearchResponse & { error?: string }
        if (!res.ok) throw new Error(data.error ?? '周边搜索失败')

        // 定位、选点、改条件都会触发搜索，慢的请求回来时可能已经过期
        if (id !== requestIdRef.current) return

        setPois(data.pois)
        setOrigin({ point, label: data.origin.label, source })
        // 清了选择，路线自然失效，不需要单独清 route
        setSelectedOrder([])
      } catch (e) {
        if (id !== requestIdRef.current) return
        setListError(e instanceof Error ? e.message : '周边搜索失败')
      } finally {
        if (id === requestIdRef.current) setListLoading(false)
      }
    },
    [mode, radiusMinutes],
  )

  // 搜索只由 origin / 条件变化驱动，保证一个出发点只搜一次
  useEffect(() => {
    if (!origin) return
    const fingerprint = `${origin.point.lng},${origin.point.lat}|${mode}|${radiusMinutes}`
    if (fingerprint === lastSearchedRef.current) return

    lastSearchedRef.current = fingerprint
    void search(origin.point, origin.source)
  }, [origin, mode, radiusMinutes, search])

  // 路线的有效性与它的输入绑定：只要选中的点、顺序、出行方式或出发点变了，
  // 旧路线就在渲染时被判为过期，而不是靠 effect 去清状态
  const routeKey =
    selectedOrder.length >= 2 && origin
      ? `${selectedOrder.join(',')}|${mode}|${origin.point.lng},${origin.point.lat}`
      : null
  const route = routeState && routeState.key === routeKey ? routeState.route : null

  // 选中 2 个以上才规划路线；顺序即勾选顺序。
  //
  // 防抖是必须的，不是优化：连点 4 张卡会触发 3 次请求，每次服务端要打 N 次高德，
  // 1 秒内十几次调用就会撞上高德的 QPS 限制（CUQPS_HAS_EXCEEDED_THE_LIMIT）。
  // 等手停下来再发一次，把请求风暴从源头掐掉。
  useEffect(() => {
    if (!routeKey || !origin) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      const stops = selectedOrder
        .map((id) => pois.find((p) => p.id === id))
        .filter((p): p is Poi => Boolean(p))
        .map((p) => ({ id: p.id, point: p.point }))

      void fetch('/api/route/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin: origin.point, stops, mode }),
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
  }, [routeKey, origin, pois, selectedOrder, mode])

  const useGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setListError('这个浏览器拿不到定位，直接在地图上选点吧')
      return
    }

    setLocating(true)
    let settled = false

    // 5 秒没回来就放行，不阻塞页面
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      setLocating(false)
      setListError('定位超时了，直接在地图上选点吧')
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
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        setLocating(false)
        setListError('没拿到定位权限，直接在地图上选点吧')
      },
      { timeout: GEO_TIMEOUT_MS, enableHighAccuracy: false },
    )
  }, [])

  const handlePickLocation = useCallback(
    (point: LatLng) => {
      if (!picking) return
      setPicking(false)
      setOrigin({ point, label: PENDING_LABEL, source: 'map-pick' })
    },
    [picking],
  )

  const togglePoi = useCallback((id: string) => {
    setSelectedOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)

    try {
      const res = await fetch(`/api/poi/${encodeURIComponent(id)}`)
      const data = (await res.json()) as PoiDetail & { error?: string }
      if (!res.ok) throw new Error(data.error ?? '获取详情失败')
      setDetail(data)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : '获取详情失败')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  return (
    <main className="flex h-dvh overflow-hidden">
      <aside className="relative flex w-[400px] shrink-0 flex-col border-r border-line bg-paper">
        {/* 侧栏统一纸白，只在控件上用淡灰：控件才有可点击的形，背景不抢戏 */}
        <div className="border-b border-line bg-paper px-4 py-4">
          <h1 className="mb-3 text-sm font-semibold text-ink">周边去哪</h1>
          <OriginPicker
            origin={origin}
            locating={locating}
            mode={mode}
            radiusMinutes={radiusMinutes}
            onUseGeolocation={useGeolocation}
            onStartPick={() => setPicking((v) => !v)}
            picking={picking}
            onModeChange={setMode}
            onRadiusChange={setRadiusMinutes}
          />
        </div>

        {selectedOrder.length === 1 && (
          <p className="border-b border-line px-4 py-2 text-xs text-ink-soft">
            再选一个就能规划路线
          </p>
        )}

        <div className="flex-1 overflow-y-auto">
          <PoiList
            pois={pois}
            selectedOrder={selectedOrder}
            loading={listLoading}
            error={listError}
            hasOrigin={origin !== null}
            onToggle={togglePoi}
            onOpenDetail={openDetail}
          />
        </div>

        <StopDetail
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => {
            setDetail(null)
            setDetailError(null)
          }}
        />
      </aside>

      <div className="relative flex-1">
        <MapCanvas
          origin={origin?.point ?? null}
          pois={pois}
          selectedOrder={selectedOrder}
          route={route}
          picking={picking}
          onPickLocation={handlePickLocation}
        />
        <RouteSummaryBar selectedOrder={selectedOrder} pois={pois} route={route} />
      </div>
    </main>
  )
}
