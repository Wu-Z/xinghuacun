'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import MapCanvas from '@/components/MapCanvas'
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

  // 选中 2 个以上才规划路线；顺序即勾选顺序
  useEffect(() => {
    if (!routeKey || !origin) return

    const stops = selectedOrder
      .map((id) => pois.find((p) => p.id === id))
      .filter((p): p is Poi => Boolean(p))
      .map((p) => ({ id: p.id, point: p.point }))

    let cancelled = false
    void fetch('/api/route/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin: origin.point, stops, mode }),
    })
      .then((res) => res.json())
      .then((data: Route & { error?: string }) => {
        if (cancelled || data.error) return
        setRouteState({ key: routeKey, route: data })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
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
        setOrigin({
          point: { lng: pos.coords.longitude, lat: pos.coords.latitude },
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
    <main className="flex h-dvh flex-col">
      <div className="relative h-[45%] shrink-0">
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

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
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

        {selectedOrder.length === 1 && (
          <p className="text-xs text-slate-500">再选一个就能规划路线</p>
        )}

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
    </main>
  )
}
