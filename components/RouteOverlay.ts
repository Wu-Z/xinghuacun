/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MapMarkerKind, MapMarkerSpec } from '@/lib/core/map-markers'
import type { LatLng, Route } from '@/lib/core/model'

/** 折线画在所有覆盖物最上层，保证压在标记和底图之上 */
export function buildRoutePolyline(AMap: any, route: Route): any {
  const path = route.legs.flatMap((leg) => leg.polyline)

  return new AMap.Polyline({
    path: path.map((p) => [p.lng, p.lat]),
    // 深青：高德底图是暖米黄/白，青色在其上对比强，且没有地图产品用青色画路线
    strokeColor: '#0F6E6E',
    strokeWeight: 6,
    strokeOpacity: 0.95,
    lineJoin: 'round',
    zIndex: 200,
  })
}

/**
 * 标记的外框固定 32×32，圆画在里面。
 *
 * 悬停时圆会变大（备选 18 → 22）。外框要是跟着变，标记的中心就会挪 2px ——
 * 鼠标原地不动而点在动，看着像地图在抖。所以外边这层永远 32，只换里面的圆。
 * 高德的 offset 也因此是一组固定值。
 */
const BOX = 32
const HALF_BOX = BOX / 2

/** 备选比已选小一圈：它是背景信息，编号才是主角 */
const DOT: Record<MapMarkerKind, number> = { origin: 28, selected: 28, candidate: 18 }

/*
 * 颜色是写死的，不是懒 —— 这里是拼给高德的 HTML 字符串，Tailwind 的类名
 * 对它无效（那些类挂不到地图容器里的节点上）。值取自 @theme：
 * jade #0f6e6e、line-2 #d2cec5、纸白 #ffffff。
 * 改 token 时记得回来看这一处。
 */
const JADE = '#0f6e6e'
const WHITE = '#ffffff'
/** 阴影用暖黑（#18140c）而不是纯黑，跟全站四级阴影同一套 */
const SHADOW = '0 1px 4px rgba(24,20,12,.3)'

function ring(alpha: number): string {
  return `0 0 0 5px rgba(15,110,110,${alpha})`
}

/**
 * 圆的直径。
 *
 * 悬停时**只有备选会长** —— 编号圆点上写着数字，尺寸一变字也跟着跳；
 * 而备选只是一个空圈，放大 4px 不会有别的东西跟着动。
 */
function dotSize(kind: MapMarkerKind, hovered: boolean): number {
  return kind === 'candidate' && hovered ? DOT.candidate + 4 : DOT[kind]
}

/**
 * 一个标记长什么样。
 *
 * 三种形态沿用列表上编号圆点的判据：**实体 = 已选、空心 = 备选**。
 * 悬停只是把轮廓加粗加一圈光晕 —— **绝不把空心的填成实心**：
 * 一填，用户就分不清「我刚指到的那个」和「我已经选好的那个」了，
 * 而这两个判据在整份稿子里是同一句话。
 */
export function buildMarkerHtml(spec: MapMarkerSpec, hovered: boolean): string {
  // 能点的才给手型。出发点不是列表里的一条，点了没有任何事发生
  const cursor = spec.name ? 'cursor:pointer;' : ''
  const box = `display:flex;align-items:center;justify-content:center;width:${BOX}px;height:${BOX}px;${cursor}`

  if (spec.kind === 'candidate') {
    const dot = dotSize(spec.kind, hovered)
    const inner = `width:${dot}px;height:${dot}px;border-radius:9999px;background:${WHITE};border:${
      hovered ? 3 : 2
    }px solid ${JADE};box-shadow:${hovered ? `${ring(0.16)},${SHADOW}` : SHADOW};`

    return `<div style="${box}"><div style="${inner}"></div></div>`
  }

  // 起点写「起」，已选写它在路线里的名次
  const badge = spec.kind === 'origin' ? '起' : String(spec.order)
  const dot = dotSize(spec.kind, hovered)
  const inner = `display:flex;align-items:center;justify-content:center;width:${dot}px;height:${dot}px;border-radius:9999px;background:${JADE};color:${WHITE};font-size:13px;font-weight:600;border:2px solid ${WHITE};box-shadow:${hovered ? `${SHADOW},${ring(0.22)}` : SHADOW};`

  return `<div style="${box}"><div style="${inner}">${badge}</div></div>`
}

export type BuiltMarker = { name: string; spec: MapMarkerSpec; marker: any }
export type MarkerWire = {
  /** 鼠标进出标记。null = 离开了所有标记 */
  onHover?: (name: string | null) => void
  /** 点了标记。只有列表里的地点会调它 */
  onOpen?: (name: string) => void
}

/**
 * 建标记。
 *
 * 返回 { name, spec, marker } 而不是一堆裸 marker：调用方要按名字找回某一个
 * 去改它的样子（悬停时只重画那一个，不重建整层覆盖物）。
 */
export function buildStopMarkers(
  AMap: any,
  specs: MapMarkerSpec[],
  wire: MarkerWire = {},
): BuiltMarker[] {
  return specs.map((spec) => {
    const marker = new AMap.Marker({
      position: [spec.point.lng, spec.point.lat],
      // 备选在编号圆点之下：同一位置既有点又被选了的时候，看得见的该是编号
      zIndex: spec.kind === 'candidate' ? 250 : 300,
      content: buildMarkerHtml(spec, false),
      offset: new AMap.Pixel(-HALF_BOX, -HALF_BOX),
      title: spec.label,
    })

    // 起点没有名字，也就没有联动可接
    if (spec.name) {
      marker.on('mouseover', () => wire.onHover?.(spec.name))
      marker.on('mouseout', () => wire.onHover?.(null))
      marker.on('click', () => wire.onOpen?.(spec.name))
    }

    return { name: spec.name, spec, marker }
  })
}

/** 起点 / 选点时的当前位置。它们不是列表里的一条，所以单独造 */
export function originMarker(point: LatLng, label: string): MapMarkerSpec {
  return { name: '', label, point, kind: 'origin', order: null }
}
