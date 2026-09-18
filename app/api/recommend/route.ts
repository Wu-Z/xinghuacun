import type { RecommendRequest } from '@/lib/core/model'
import { prepareRecommend, recommend } from '@/lib/recommend'
import { streamRecommend, type RecommendStreamEvent } from '@/lib/recommend/stream'

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
  if (body.task !== 'initial' && body.task !== 'refine' && body.task !== 'finalize') {
    return Response.json({ error: '推荐失败', reason: '未知的任务类型' }, { status: 400 })
  }
  if (body.task === 'refine' && !body.followup?.trim()) {
    return Response.json({ error: '推荐失败', reason: '追问内容为空' }, { status: 400 })
  }
  if (body.task === 'finalize' && !body.selected?.length) {
    return Response.json({ error: '推荐失败', reason: '没有选中的地点' }, { status: 400 })
  }

  // refine 是 diff、通常只有一两条，流式没有收益，保持一次性返回
  if (body.task === 'refine') {
    try {
      const out = await recommend(body)
      if (!out.ok) {
        // 这些 reason 是我们自己写的，安全且可操作，直接回给用户
        return Response.json({ error: '推荐失败', reason: out.failure.reason }, { status: 502 })
      }
      if ('refine' in out) return Response.json({ kind: 'refine', ...out.refine })
      return Response.json({ kind: 'result', ...out.value })
    } catch (error) {
      console.error('[api/recommend] 未预期错误', error)
      return Response.json(
        { error: '推荐失败', reason: '服务内部错误，详情见服务端日志' },
        { status: 502 },
      )
    }
  }

  // initial / finalize 走流式：边生成边核实边推，第一张卡能早十几秒出现
  const prepared = await prepareRecommend(body)
  if (!prepared.ok) {
    return Response.json({ error: '推荐失败', reason: prepared.failure.reason }, { status: 502 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RecommendStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }
      try {
        for await (const event of streamRecommend({
          req: body,
          place: prepared.place,
          userMessage: prepared.userMessage,
        })) {
          send(event)
        }
      } catch (error) {
        // 不静默吞错：上一轮 QPS 事故里，正因为 catch 吞掉错误，
        // 一个限流失败被伪装成了「0 分钟 0.0 公里」的路线
        console.error('[api/recommend] 流式未预期错误', error)
        send({ type: 'error', reason: '服务内部错误，详情见服务端日志' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      // 关掉缓冲，否则前面的时间省下来又被中间层攒回去了
      'x-accel-buffering': 'no',
    },
  })
}
