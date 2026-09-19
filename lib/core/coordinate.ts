import gcoord from 'gcoord'
import type { LatLng, OriginSource } from './model'

/**
 * 从请求体里取出合法坐标。
 *
 * 客户端传来的坐标要过这一道：`{lng: NaN}`、缺字段、类型错，
 * 任何一种漏到高德那边都会变成一次浪费掉的调用，而报错信息很难回溯到这里。
 */
export function parseLatLng(value: unknown): LatLng | null {
  if (!value || typeof value !== 'object') return null

  const { lng, lat } = value as { lng?: unknown; lat?: unknown }
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  return { lng: lng as number, lat: lat as number }
}

/**
 * 统一到高德用的 GCJ-02。
 *
 * 只有浏览器定位是 WGS-84 需要转换；地图选点与搜索得到的坐标直接来自高德底图，
 * 已经是 GCJ-02，**再转一次会转坏** —— 官方文档把「原始坐标系判断错误」
 * 列为定位偏移的常见原因之一。所以转换严格绑定 source，绝不全局套用。
 *
 * 不转换的后果不只是标记画歪：skill 会按偏了 100~700 米的位置去检索，
 * 推荐出一批别处的地方。
 */
export function toGcj02(point: LatLng, source: OriginSource): LatLng {
  if (source !== 'geolocation') return { ...point }

  const [lng, lat] = gcoord.transform([point.lng, point.lat], gcoord.WGS84, gcoord.GCJ02)
  return { lng, lat }
}
