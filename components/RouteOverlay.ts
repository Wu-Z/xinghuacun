/* eslint-disable @typescript-eslint/no-explicit-any */
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

export type StopMarkerSpec = { point: LatLng; label: string; order: number }

/** order 从 1 开始；出发点传 0，渲染成「起」 */
export function buildStopMarkers(AMap: any, specs: StopMarkerSpec[]): any[] {
  return specs.map((spec) => {
    const badge = spec.order === 0 ? '起' : String(spec.order)

    return new AMap.Marker({
      position: [spec.point.lng, spec.point.lat],
      zIndex: 300,
      content: `<div style="
        display:flex;align-items:center;justify-content:center;
        width:28px;height:28px;border-radius:9999px;
        background:#0F6E6E;color:#fff;font-size:13px;font-weight:600;
        border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);
      ">${badge}</div>`,
      offset: new AMap.Pixel(-14, -14),
      title: spec.label,
    })
  })
}
