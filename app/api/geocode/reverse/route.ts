import { getVerifyProvider } from '@/lib/providers/verify'
import type { LatLng } from '@/lib/core/model'

/**
 * 把坐标换成一句人话（「厦门市集美区软件园B区」）。
 *
 * 客户端不能自己去问高德 —— Web 服务 key 只在服务端。
 * 这个路由只做这一件事：拿坐标，回一个位置名。
 */
function parsePoint(value: unknown): LatLng | null {
  if (!value || typeof value !== 'object') return null

  const { lng, lat } = value as { lng?: unknown; lat?: unknown }
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  return { lng: lng as number, lat: lat as number }
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ reason: '请求体不是合法 JSON' }, { status: 400 })
  }

  const point = parsePoint((body as { point?: unknown } | null)?.point)
  if (!point) return Response.json({ reason: '缺少合法的坐标' }, { status: 400 })

  try {
    const place = await getVerifyProvider().reverseGeocode(point)
    return Response.json(place)
  } catch (error) {
    // 逆地理编码失败不该拦住用户：坐标是有的，回一个兜底名字照样能出发
    console.error('[geocode] 逆地理编码失败', error)
    return Response.json({ reason: '逆地理编码失败' }, { status: 502 })
  }
}
