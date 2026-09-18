import type { RecommendRequest } from '@/lib/core/model'
import { recommend } from '@/lib/recommend'

// 推荐要跑一次 LLM 调用加联网检索，比普通接口慢得多
export const maxDuration = 120

export async function POST(req: Request) {
  let body: RecommendRequest
  try {
    body = (await req.json()) as RecommendRequest
  } catch {
    return Response.json({ error: '推荐失败', reason: '请求体不是合法 JSON' }, { status: 400 })
  }

  if (!body?.origin?.point || !body?.preferences) {
    return Response.json({ error: '推荐失败', reason: '缺少出发点或偏好' }, { status: 400 })
  }

  try {
    const out = await recommend(body)
    if (!out.ok) {
      return Response.json({ error: '推荐失败', reason: out.failure.reason }, { status: 502 })
    }
    return Response.json(out.value)
  } catch (error) {
    // 不静默吞错：上一轮 QPS 事故里，正因为 catch 吞掉错误，
    // 一个限流失败被伪装成了「0 分钟 0.0 公里」的路线
    console.error('[api/recommend] 未预期错误', error)
    const reason = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: '推荐失败', reason }, { status: 502 })
  }
}
