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
  /** 选点时的初始中心。不传就用演示区（厦门集美） */
  center?: LatLng | null
  /**
   * 选点时当前选中的那个点。
   *
   * 没有它，用户点完地图上什么都不出现 —— 点在哪、离目标还差多远，全靠猜。
   */
  pickedPoint?: LatLng | null
  /** 还没选到点时的提示文案 */
  pickingHint?: string
}

export default function MapCanvas({
  origin,
  places,
  visitOrder,
  route,
  picking,
  onPickLocation,
  center,
  pickedPoint,
  pickingHint = '在地图上点一下',
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

  // 初始中心同理：它只在挂载那一次用得上，之后按选中的点走
  const centerRef = useRef(center)
  useEffect(() => {
    centerRef.current = center
  }, [center])

  // 初始化地图，只做一次
  useEffect(() => {
    let cancelled = false
    let observer: ResizeObserver | null = null

    loadAmap()
      .then((AMap) => {
        const container = containerRef.current
        if (cancelled || !container || mapRef.current) return

        const map = new AMap.Map(container, {
          zoom: 12,
          // 用户选点之前地图显示哪片区域。原先硬编码成北京是随意的；
          // 演示数据在厦门集美，所以默认指向那里。
          // 选点场景由调用方给 center（大概是出发点附近），免得要从集美手动拖过去
          center: [
            (centerRef.current ?? DEFAULT_CENTER).lng,
            (centerRef.current ?? DEFAULT_CENTER).lat,
          ],
          viewMode: '2D',
        })
        map.on('click', (e: any) => {
          pickRef.current({ lng: e.lnglat.getLng(), lat: e.lnglat.getLat() })
        })
        mapRef.current = map

        /*
         * 容器尺寸一变就让高德重算画布大小。
         *
         * 它自己只挂 window 的 resize，而窗口从半屏拉到全屏时，
         * 容器已经变宽、画布还停在旧尺寸 —— 画布被 CSS 拉伸就糊成一团，
         * 没被拉伸就在右侧留一条白。两种症状都是这一件事。
         * ResizeObserver 看的是容器本身，断点切换、布局回流都能覆盖。
         */
        observer = new ResizeObserver(() => map.resize?.())
        observer.observe(container)
      })
      .catch((e: Error) => setError(e.message))

    return () => {
      cancelled = true
      observer?.disconnect()
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
    // 选点时的当前选中点：先画它，用户点一下地图立刻看见标记落到哪
    if (picking && pickedPoint) {
      specs.push({ point: pickedPoint, label: '所选位置', order: 0 })
    }
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
    // 选中的点可能是从搜索结果里选的、本来不在视野里 —— 把它挪到中间，
    // 但保持当前缩放（缩放也跟着跳会让人失去空间感）
    if (picking && pickedPoint) {
      map.setZoomAndCenter(map.getZoom(), [pickedPoint.lng, pickedPoint.lat])
    }
    // 选点时不套视野：那时候满图只有刚点的那一个标记，
    // setFitView 会为了「装下」它而把地图顶到最大缩放
    if (!picking && overlaysRef.current.length > 0) {
      // 上边留得多一些，避开地图顶部的路线浮层
      map.setFitView(overlaysRef.current, false, [80, 80, 140, 80])
    }
  }, [origin, places, visitOrder, route, picking, pickedPoint])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className={`h-full w-full ${picking ? 'cursor-crosshair' : ''}`} />

      {/*
        还没选到点时给一句提示。一旦有选中点，提示让位给调用方的确认条 ——
        两条同时压在底部会打架，而那时候用户要看的是「选中了哪」。
      */}
      {picking && !pickedPoint && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-sm bg-jade px-4 py-2 text-sm font-medium text-white shadow-3">
          {pickingHint}
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 bottom-4 rounded-sm border border-red-line bg-surface px-3 py-2 text-[13px] text-red shadow-3">
          地图加载失败：{error}
        </div>
      )}
    </div>
  )
}
