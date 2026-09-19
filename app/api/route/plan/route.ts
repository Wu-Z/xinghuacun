import type { PlanRequest } from '@/lib/core/model'
import { optimizeOrder } from '@/lib/core/optimize'
import { buildLegModes } from '@/lib/core/route-mode'
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
    // 勾选先后不代表出行顺序，用户要的是「帮我规划最优路线」。
    // 终点固定收尾，不参与排序，但它的最后一跳计入代价。
    const ordered = optimizeOrder({ origin: body.origin, stops: body.stops, end: body.end })

    // 逐段定出行方式：很近的一段走路、远的一段坐地铁。高德没有跨方式的
    // 路径规划接口（每种方式一个地址，没有「逐段指定方式」的参数），
    // 「两个地方太近就别坐地铁」只能在本地定 —— 规则与实测依据见
    // lib/core/route-mode。body.mode 是用户明确选过的，传了就整条按那一种走。
    const legModes = buildLegModes(
      [body.origin, ...ordered.map((s) => s.point), ...(body.end ? [body.end] : [])],
      body.mode ?? null,
    )

    const route = await getRouteProvider().planRoute({
      origin: body.origin,
      stops: ordered,
      legModes,
      end: body.end,
    })

    return Response.json(route)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: `路线规划失败：${message}` }, { status: 502 })
  }
}
