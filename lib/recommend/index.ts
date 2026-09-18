import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RecommendPlace, RecommendRequest, RecommendResult } from '@/lib/core/model'
import { getVerifyProvider } from '@/lib/providers/verify'
import { callDeepseekJson } from './deepseek'
import { parseSkillOutput } from './schema'

export type RecommendFailure = { reason: string }
export type RecommendOutcome =
  | { ok: true; value: RecommendResult }
  | { ok: false; failure: RecommendFailure }

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'lib/recommend/prompt.md'), 'utf8')
}

/** 按 skill README 描述的三段式组装输入 */
export function buildUserMessage(req: RecommendRequest): string {
  return [
    `位置：${req.origin.name}（城市 ${req.origin.city}）`,
    req.origin.point
      ? `坐标：${req.origin.point.lng},${req.origin.point.lat}（坐标系 GCJ-02）`
      : '坐标：无，请以位置名称为准',
    `目的地：${
      req.destination.mode === 'specified' && req.destination.requested
        ? req.destination.requested
        : '未指定，按起点附近检索'
    }`,
    `想干什么：${req.preferences.intents.join('、') || '未说明'}`,
    `能花多久：${req.preferences.timeBudget ?? '未说明'}`,
    `怎么去：${req.preferences.travelMode.join('、') || '未说明'}`,
    `同行人：${req.preferences.companions ? `${req.preferences.companions} 人` : '未说明'}`,
    `拥挤容忍度：${req.preferences.crowdTolerance ?? '未说明'}`,
  ].join('\n')
}

export async function recommend(req: RecommendRequest): Promise<RecommendOutcome> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL

  if (!apiKey) return { ok: false, failure: { reason: '未配置 DEEPSEEK_API_KEY' } }
  if (!model) {
    return {
      ok: false,
      failure: { reason: '未配置 DEEPSEEK_MODEL，先跑 npm run models 看可用模型' },
    }
  }

  const call = await callDeepseekJson({
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model,
    system: loadPrompt(),
    user: buildUserMessage(req),
  })

  if (!call.ok) {
    console.error('[recommend] skill 调用失败', call.failure)
    return { ok: false, failure: { reason: call.failure.detail } }
  }

  let raw: unknown
  try {
    raw = JSON.parse(call.text)
  } catch {
    return { ok: false, failure: { reason: '回包不是合法 JSON' } }
  }

  const parsed = parseSkillOutput(raw)
  if (!parsed.ok) {
    console.error('[recommend] 结构校验未通过', parsed.problems)
    return { ok: false, failure: { reason: `回包结构不符合约定：${parsed.problems[0]}` } }
  }

  const verify = getVerifyProvider()
  const origin = req.origin.point ?? { lng: 0, lat: 0 }
  const places: RecommendPlace[] = []

  // 逐条核实，串行 + 小延迟：高德 QPS 是按秒掐的，
  // 见 2026-09-18 spec 第 9.1 节那次「假零公里」事故
  for (const [i, rec] of parsed.value.recommendations.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 120))

    try {
      const v = await verify.verify({
        name: rec.name,
        address: rec.address,
        city: req.origin.city,
        origin,
      })
      places.push({ ...rec, ...v })
    } catch (error) {
      // 单条核实失败不该让整次推荐失败：未核实本身就是一个合法状态
      console.error(`[recommend] 核实失败：${rec.name}`, error)
      places.push({ ...rec, point: null, verified: false })
    }
  }

  return {
    ok: true,
    value: { places, excluded: parsed.value.excluded, meta: parsed.value.meta },
  }
}
