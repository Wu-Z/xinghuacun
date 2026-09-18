'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { loadAmap } from '@/lib/amap/loader'
import type { LatLng, Poi, Route } from '@/lib/core/model'
import { buildRoutePolyline, buildStopMarkers, type StopMarkerSpec } from './RouteOverlay'

type Props = {
  origin: LatLng | null
  pois: Poi[]
  selectedOrder: string[]
  route: Route | null
  picking: boolean
  onPickLocation: (point: LatLng) => void
}

export default function MapCanvas({
  origin,
  pois,
  selectedOrder,
  route,
  picking,
  onPickLocation,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const [error, setError] = useState<string | null>(null)

  // 用 ref 存回调，避免因为函数标识变化而重建地图
  const pickRef = useRef(onPickLocation)
  useEffect(() => {
    pickRef.current = onPickLocation
  }, [onPickLocation])

  // 初始化地图，只做一次
  useEffect(() => {
    let cancelled = false

    loadAmap()
      .then((AMap) => {
        if (cancelled || !containerRef.current || mapRef.current) return

        const map = new AMap.Map(containerRef.current, {
          zoom: 12,
          center: [116.4, 39.9],
          viewMode: '2D',
        })
        map.on('click', (e: any) => {
          pickRef.current({ lng: e.lnglat.getLng(), lat: e.lnglat.getLat() })
        })
        mapRef.current = map
      })
      .catch((e: Error) => setError(e.message))

    return () => {
      cancelled = true
      mapRef.current?.destroy?.()
      mapRef.current = null
    }
  }, [])

  // 同步覆盖物
  useEffect(() => {
    const AMap = typeof window !== 'undefined' ? window.AMap : undefined
    const map = mapRef.current
    if (!AMap || !map) return

    map.remove(overlaysRef.current)
    overlaysRef.current = []

    const specs: StopMarkerSpec[] = []
    if (origin) {
      specs.push({ point: origin, label: '出发点', order: 0 })
      selectedOrder.forEach((id, index) => {
        const poi = pois.find((p) => p.id === id)
        if (poi) specs.push({ point: poi.point, label: poi.name, order: index + 1 })
      })
    }
    overlaysRef.current.push(...buildStopMarkers(AMap, specs))

    if (route) {
      // 后 add 的在上面，所以折线最后加
      overlaysRef.current.push(buildRoutePolyline(AMap, route))
    }

    map.add(overlaysRef.current)

    if (origin && !route) map.setCenter([origin.lng, origin.lat])
    if (overlaysRef.current.length > 0) {
      // 上边留得多一些，避开地图顶部的路线浮层
      map.setFitView(overlaysRef.current, false, [80, 80, 140, 80])
    }
  }, [origin, pois, selectedOrder, route])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className={`h-full w-full ${picking ? 'cursor-crosshair' : ''}`} />

      {picking && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-jade px-4 py-2 text-sm font-medium text-white shadow-lg">
          在地图上点一下，作为出发点
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 bottom-4 rounded-md bg-paper px-3 py-2 text-sm text-red-700 shadow-lg ring-1 ring-line">
          地图加载失败：{error}
        </div>
      )}
    </div>
  )
}
