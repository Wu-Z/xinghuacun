'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAmap } from '@/lib/amap/loader'
import { buildPlaceMarkers, type MapMarkerSpec } from '@/lib/core/map-markers'
import type { LatLng, RecommendPlace, Route } from '@/lib/core/model'
import { buildMarkerHtml, buildRoutePolyline, buildStopMarkers, originMarker } from './RouteOverlay'

/** 地图初始中心：用户还没选点、也没定位时显示的区域 */
const DEFAULT_CENTER: LatLng = { lng: 118.097, lat: 24.573 } // 厦门集美

/**
 * 停一下再取景。
 *
 * 卡片是逐条流式到达的。每来一条就重新取一次景，地图会一直在动，
 * 而真正有用的那次取景是「这批点都说完了」那一次。
 * 400ms 与路线请求的防抖同值 —— 两处都是同一件事：等这一批说完再算。
 */
const FIT_DEBOUNCE_MS = 400

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
  /**
   * 列表上鼠标停在哪一条。
   *
   * 列表里有十几条，地图上有十几个点 —— 没有这个联动，两边就是两份对不上的
   * 东西：用户看得见一个点，却不知道它是哪一条。传 null 表示没有人在被指着。
   */
  highlightName?: string | null
  /** 反向：鼠标停到了地图的某个标记上。调用方拿它去点亮列表里那一条 */
  onHighlight?: (name: string | null) => void
  /** 点了地图上的标记 → 打开那条的详情。只有列表里的地点会触发 */
  onMarkerClick?: (name: string) => void
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
  highlightName,
  onHighlight,
  onMarkerClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  /** 按名字找回某个标记，悬停时只重画它一个 */
  const markersRef = useRef(new Map<string, { marker: any; spec: MapMarkerSpec }>())
  /** 已经被点亮的那个。用来只重画发生变化的两端，而不是整层重建 */
  const paintedRef = useRef<string | null>(null)
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 首帧只落一次出发点，之后不再抢用户拖走的视野 */
  const framedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * 地图是不是已经建好了。
   *
   * 高德是异步加载的，第一次渲染时它还没到 —— 那次同步什么都被没画。
   * 没有这个状态，加载完成前到达的数据就永远画不出来（之后没人再触发同步）。
   */
  const [ready, setReady] = useState(false)

  // 用 ref 存回调，避免因为函数标识变化而重建地图
  const pickRef = useRef(onPickLocation)
  useEffect(() => {
    pickRef.current = onPickLocation
  }, [onPickLocation])

  const hoverCbRef = useRef(onHighlight)
  useEffect(() => {
    hoverCbRef.current = onHighlight
  }, [onHighlight])

  const clickCbRef = useRef(onMarkerClick)
  useEffect(() => {
    clickCbRef.current = onMarkerClick
  }, [onMarkerClick])

  // 初始中心同理：它只在挂载那一次用得上，之后按选中的点走
  const centerRef = useRef(center)
  useEffect(() => {
    centerRef.current = center
  }, [center])

  const highlightRef = useRef(highlightName ?? null)

  /**
   * 点亮 / 熄掉名字对应的那个标记。
   *
   * 只重画这两个（熄掉旧的、点亮新的），**不重建整层覆盖物** ——
   * 重建会让地图闪一下，还会把折线一起重画。
   */
  const applyHighlight = useCallback((next: string | null) => {
    const prev = paintedRef.current
    if (prev === next) return

    for (const name of [prev, next]) {
      if (!name) continue
      const entry = markersRef.current.get(name)
      if (entry) entry.marker.setContent?.(buildMarkerHtml(entry.spec, name === next))
    }

    paintedRef.current = next
  }, [])

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
        setReady(true)

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
      if (fitTimerRef.current) {
        clearTimeout(fitTimerRef.current)
        fitTimerRef.current = null
      }
      mapRef.current?.destroy?.()
      mapRef.current = null
    }
  }, [])

  // 同步覆盖物
  useEffect(() => {
    const AMap = typeof window !== 'undefined' ? window.AMap : undefined
    const map = mapRef.current
    if (!AMap || !map || !ready) return

    map.remove(overlaysRef.current)
    overlaysRef.current = []

    const specs: MapMarkerSpec[] = []
    // 选点时的当前选中点：先画它，用户点一下地图立刻看见标记落到哪
    if (picking && pickedPoint) specs.push(originMarker(pickedPoint, '所选位置'))
    if (origin) specs.push(originMarker(origin, '出发点'))
    // 列表里**核实通过的**地点都上图，不只是勾中的那几个（见 lib/core/map-markers）
    specs.push(...buildPlaceMarkers(places, visitOrder))

    const built = buildStopMarkers(AMap, specs, {
      onHover: (name) => hoverCbRef.current?.(name),
      onOpen: (name) => clickCbRef.current?.(name),
    })
    overlaysRef.current = built.map((b) => b.marker)
    // 起点没有名字，不参与联动，所以不进这张表
    markersRef.current = new Map(
      built.filter((b) => b.name).map((b) => [b.name, { marker: b.marker, spec: b.spec }]),
    )

    if (route) {
      // 后 add 的在上面，所以折线最后加
      overlaysRef.current.push(buildRoutePolyline(AMap, route))
    }

    map.add(overlaysRef.current)

    // 刚建出来的标记都是「没被指着」的样子，把当前的高亮补回去
    paintedRef.current = null
    applyHighlight(highlightRef.current)

    // 首帧先落在出发点上：地图默认中心是演示区，未必是用户所在的城市
    if (origin && !framedRef.current) {
      framedRef.current = true
      map.setCenter([origin.lng, origin.lat])
    }

    // 选中的点可能是从搜索结果里选的、本来不在视野里 —— 把它挪到中间，
    // 但保持当前缩放（缩放也跟着跳会让人失去空间感）
    if (picking && pickedPoint) {
      map.setZoomAndCenter(map.getZoom(), [pickedPoint.lng, pickedPoint.lat])
    }

    /*
     * 取景。
     *
     * 选点时不套视野：那时候满图只有刚点的那一个标记，
     * setFitView 会为了「装下」它而把地图顶到最大缩放。
     */
    if (!picking) {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
      fitTimerRef.current = setTimeout(() => {
        fitTimerRef.current = null
        const overlays = overlaysRef.current
        if (overlays.length > 0) {
          // 上边留得多一些，避开地图顶部的路线浮层
          map.setFitView(overlays, false, [80, 80, 140, 80])
        }
      }, FIT_DEBOUNCE_MS)
    }

    return () => {
      if (fitTimerRef.current) {
        clearTimeout(fitTimerRef.current)
        fitTimerRef.current = null
      }
    }
  }, [origin, places, visitOrder, route, picking, pickedPoint, ready, applyHighlight])

  // 高亮变化只改那一个标记的样子，不碰覆盖物的结构
  useEffect(() => {
    highlightRef.current = highlightName ?? null
    applyHighlight(highlightRef.current)
  }, [highlightName, applyHighlight])

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
