import type { PlanRequest } from '@/lib/core/model'
import { optimizeOrder } from '@/lib/core/optimize'
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
    // 用户勾选的是「一组点」，拜访顺序由我们算最优 ——
    // 勾选先后不代表出行顺序，用户要的是「帮我规划最优路线」
    const ordered = optimizeOrder(body.origin, body.stops)

    return Response.json(
      await getRouteProvider().planRoute({
        origin: body.origin,
        stops: ordered,
        mode: body.mode ?? 'driving',
        departAt: body.departAt,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: `路线规划失败：${message}` }, { status: 502 })
  }
}
