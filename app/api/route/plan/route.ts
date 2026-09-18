import type { PlanRequest } from '@/lib/core/model'
import { getRouteProvider } from '@/lib/providers/route'

export async function POST(req: Request) {
  let body: PlanRequest
  try {
    body = (await req.json()) as PlanRequest
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  if (!body?.origin || !Array.isArray(body.stops) || body.stops.length < 2) {
    return Response.json({ error: '至少需要 2 个停靠点才能规划路线' }, { status: 400 })
  }

  try {
    return Response.json(
      await getRouteProvider().planRoute({
        origin: body.origin,
        stops: body.stops,
        mode: body.mode ?? 'driving',
        departAt: body.departAt,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: `路线规划失败：${message}` }, { status: 502 })
  }
}
