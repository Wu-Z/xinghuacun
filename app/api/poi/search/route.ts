import { minutesToMeters } from '@/lib/core/geo'
import type { SearchRequest, SearchResponse } from '@/lib/core/model'
import { rankPois } from '@/lib/core/rank'
import { getPoiProvider } from '@/lib/providers/poi'

// 不能 export —— Next 会校验 route 文件的导出，多余的导出会导致构建失败
const MAX_CARDS = 6

export async function POST(req: Request) {
  let body: SearchRequest
  try {
    body = (await req.json()) as SearchRequest
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  if (!body?.origin || !Number.isFinite(body.origin.lng) || !Number.isFinite(body.origin.lat)) {
    return Response.json({ error: '缺少合法的出发点坐标' }, { status: 400 })
  }

  const radiusMinutes = body.radiusMinutes ?? 60
  const mode = body.mode ?? 'driving'
  const radiusMeters = minutesToMeters(radiusMinutes, mode)
  const provider = getPoiProvider()

  try {
    const [pois, geocode] = await Promise.all([
      provider.searchNearby({ origin: body.origin, radiusMeters, mode, limit: MAX_CARDS * 4 }),
      provider.reverseGeocode(body.origin),
    ])

    const result: SearchResponse = {
      origin: { point: body.origin, label: geocode.label, source: body.source ?? 'map-pick' },
      pois: rankPois(pois, { radiusMeters }).slice(0, MAX_CARDS),
    }
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: `周边搜索失败：${message}` }, { status: 502 })
  }
}
