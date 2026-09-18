import type { RecommendStreamEvent } from '@/lib/recommend/stream'

/**
 * 消费 /api/recommend 的 NDJSON 流。
 *
 * 服务端一行一个事件；这里按行切开，半截的行留到下一块。
 * 与增量提取器同样的道理：**不能假设 chunk 边界正好落在事件边界上**。
 */
export async function* readRecommendStream(
  res: Response,
): AsyncGenerator<RecommendStreamEvent> {
  if (!res.body) return

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const text = line.trim()
        if (!text) continue
        try {
          yield JSON.parse(text) as RecommendStreamEvent
        } catch {
          // 半截或损坏的一行，跳过而不是整条流失败
          console.error('[recommend-stream] 无法解析的事件行')
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
