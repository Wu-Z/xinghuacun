'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { loadAmap } from '@/lib/amap/loader'
import type { LatLng, RecommendPlace, Route } from '@/lib/core/model'
import { buildRoutePolyline, buildStopMarkers, type StopMarkerSpec } from './RouteOverlay'

/** 地图初始中心：用户还没选点、也没定位时显示的区域 */
const DEFAULT_CENTER: LatLng = { lng: 118.097, lat: 24.573 } // 厦门集美

type Props = {
  origin: LatLng | null
  places: RecommendPlace[]
  /** 拜访顺序，存的是地点名。顺序由服务端算最优后返回 */
  visitOrder: string[]
  route: Route | null
  picking: boolean
  onPickLocation: (point: LatLng) => void
}

export default function MapCanvas({
  origin,
  places,
  visitOrder,
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
          // 用户选点之前地图显示哪片区域。原先硬编码成北京是随意的；
          // 演示数据在厦门集美，所以这里指向那里。
          center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
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
      visitOrder.forEach((name, index) => {
        const place = places.find((p) => p.name === name)
        // 未能核实的地点没有坐标，上不了图
        if (place?.point) specs.push({ point: place.point, label: place.name, order: index + 1 })
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
  }, [origin, places, visitOrder, route])

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
