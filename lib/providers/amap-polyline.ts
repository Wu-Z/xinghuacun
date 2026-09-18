import { asText } from '@/lib/core/coerce'
import type { LatLng } from '@/lib/core/model'

function parseLocation(value: unknown): LatLng | null {
  const text = asText(value)
  if (!text) return null

  const [lngText, latText] = text.split(',')
  const lng = Number(lngText)
  const lat = Number(latText)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  return { lng, lat }
}

/**
 * 解析高德的折线字段：分号分隔的 `lng,lat` 串。
 * 格式不对的片段跳过而不是抛错 —— 上游返回脏数据不该让整条路线失败。
 *
 * 入参是 unknown 而不是 string：高德用 `[]` 表示空值，而调用处常见的
 * `s.polyline ?? ''` 只挡得住 null/undefined，**挡不住空数组**。
 * 这个坑已经踩过一次（open_time 返回数组导致整个周边搜索 502），
 * 所以这里统一走 asText 收敛。
 */
export function parseAmapPolyline(value: unknown): LatLng[] {
  const text = asText(value)
  if (!text) return []

  const out: LatLng[] = []
  for (const chunk of text.split(';')) {
    const point = parseLocation(chunk.trim())
    if (point) out.push(point)
  }
  return out
}
