import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RecommendPlace, RecommendRequest, RecommendResult } from '@/lib/core/model'
import { getVerifyProvider } from '@/lib/providers/verify'
import { ArrayItemStream } from './array-item-stream'
import { DeepseekStreamError, streamDeepseekJson } from './deepseek'
import { mockSkillStream } from './mock'
import { parseSkillOutput } from './schema'

export type RecommendStreamEvent =
  | { type: 'stage'; stage: 'thinking' | 'generating' }
  | { type: 'place'; place: RecommendPlace }
  | { type: 'skipped'; name: string; reason: string }
  | { type: 'done'; value: RecommendResult }
  | { type: 'error'; reason: string }

type Options = {
  req: RecommendRequest
  /** 已解析出的「位置名 + 城市」，调用方先做逆地理编码 */
  place: { label: string; city: string }
  userMessage: string
}

function isMock(): boolean {
  return process.env.RECOMMEND_PROVIDER === 'mock'
}

/**
 * 流式推荐：边收 LLM 输出、边核实、边推给客户端。
 *
 * 收益不是「结果逐条出现」那么简单 —— 实测 LLM 侧推理占 40%、写 JSON 占 60%，
 * 而核实（逆地理编码 + 每点一次地理编码）本来要等整份 JSON 写完才开始。
 * 这里让两者重叠：某个地点一写完就立刻去核实，等最后一条写完时，
 * 前面几条通常已经核实完了。
 *
 * 单条不合法只跳过那一条并告知，不让整次失败 —— 流式下「已生成的部分」
 * 是有价值的，因为一条缺字段就丢掉全部，比非流式还糟。
 */
export async function* streamRecommend(opts: Options): AsyncGenerator<RecommendStreamEvent> {
  const { req, place, userMessage } = opts
  const verify = getVerifyProvider()
  const origin = req.origin.point ?? { lng: 0, lat: 0 }

  const stream = isMock()
    ? mockSkillStream(req)
    : streamDeepseekJson({
        apiKey: process.env.DEEPSEEK_API_KEY ?? '',
        baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        model: process.env.DEEPSEEK_MODEL ?? '',
        system: loadPrompt(),
        user: userMessage,
        maxTokens: resolveMaxTokens(),
      })

  let announcedThinking = false
  let announcedGenerating = false

  // 两个任务的目标数组都是 recommendations
  const items = new ArrayItemStream('recommendations')
  const places: RecommendPlace[] = []
  const skipped: { name: string; reason: string }[] = []

  try {
    for await (const ev of stream) {
      if (ev.type === 'reasoning') {
        if (!announcedThinking) {
          announcedThinking = true
          yield { type: 'stage', stage: 'thinking' }
        }
        continue
      }

      if (ev.type === 'done') break

      if (!announcedGenerating) {
        announcedGenerating = true
        yield { type: 'stage', stage: 'generating' }
      }

      for (const raw of items.push(ev.text)) {
        let parsedRaw: unknown
        try {
          parsedRaw = JSON.parse(raw)
        } catch {
          continue // 切出来的片段理论上一定合法，防御一下
        }

        // 逐条走与整体相同的校验规则（amap_url 白名单、fit tag 唯一等）
        const one = parseSkillOutput({
          recommendations: [parsedRaw],
          excluded: [],
          meta: {},
        })
        if (!one.ok) {
          const name =
            typeof (parsedRaw as { name?: unknown })?.name === 'string'
              ? String((parsedRaw as { name: string }).name)
              : '未命名地点'
          skipped.push({ name, reason: one.problems[0] })
          yield { type: 'skipped', name, reason: one.problems[0] }
          continue
        }

        const rec = one.value.recommendations[0]
        const verified = await verifyOne(rec, place, origin, verify)
        places.push(verified)
        yield { type: 'place', place: verified }
      }
    }
  } catch (error) {
    if (error instanceof DeepseekStreamError) {
      // 已经推出去的地点不撤回 —— 用户看到的是真实生成出来的东西，
      // 整批丢弃等于因为我们的网络问题抹掉模型已经产出的结果
      yield { type: 'error', reason: error.failure.detail }
      return
    }
    console.error('[recommend/stream] 未预期错误', error)
    yield { type: 'error', reason: '生成过程出错，已生成的部分保留在列表中' }
    return
  }

  if (places.length === 0 && skipped.length === 0) {
    yield { type: 'error', reason: '没有生成任何可用地点' }
    return
  }

  yield {
    type: 'done',
    value: {
      places,
      excluded: skipped,
      meta: {
        assumptions: [],
        unverified: [],
        disclaimer: '本次为流式生成，未生成完整前即已展示。',
      },
    },
  }
}

async function verifyOne(
  rec: Omit<RecommendPlace, 'point' | 'verified'>,
  place: { label: string; city: string },
  origin: { lng: number; lat: number },
  verify: ReturnType<typeof getVerifyProvider>,
): Promise<RecommendPlace> {
  try {
    const v = await verify.verify({
      name: rec.name,
      address: rec.address,
      city: place.city,
      origin,
    })
    return { ...rec, ...v }
  } catch (error) {
    // 单条核实失败不该让整次失败：未核实本身就是一个合法状态
    console.error(`[recommend/stream] 核实失败：${rec.name}`, error)
    return { ...rec, point: null, verified: false }
  }
}

function resolveMaxTokens(): number | undefined {
  const envMax = Number(process.env.DEEPSEEK_MAX_TOKENS)
  return Number.isFinite(envMax) && envMax > 0 ? envMax : undefined
}

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'lib/recommend/prompt.md'), 'utf8')
}
