import { deriveActivities } from '@/lib/core/derive'
import { getPoiProvider } from '@/lib/providers/poi'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Next 15 起 params 是 Promise，Next 16 已完全移除同步访问
  const { id } = await ctx.params

  try {
    const poi = await getPoiProvider().getDetail(id)
    if (!poi) return Response.json({ error: '找不到该地点' }, { status: 404 })

    return Response.json({ ...poi, ...deriveActivities(poi) })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: `获取详情失败：${message}` }, { status: 502 })
  }
}
