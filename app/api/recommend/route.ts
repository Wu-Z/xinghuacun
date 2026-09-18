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
      // 这些 reason 是我们自己写的（「未配置 DEEPSEEK_MODEL…」这类），
      // 安全且可操作，直接回给用户 —— 失败必须说清原因，不能只给个错误码
      return Response.json({ error: '推荐失败', reason: out.failure.reason }, { status: 502 })
    }
    return Response.json(out.value)
  } catch (error) {
    // 不静默吞错：上一轮 QPS 事故里，正因为 catch 吞掉错误，
    // 一个限流失败被伪装成了「0 分钟 0.0 公里」的路线。
    // 但未预期的异常信息可能含内部路径等细节，只留日志，不回显给客户端。
    console.error('[api/recommend] 未预期错误', error)
    return Response.json(
      { error: '推荐失败', reason: '服务内部错误，详情见服务端日志' },
      { status: 502 },
    )
  }
}
