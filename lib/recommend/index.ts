import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  RecommendPlace,
  RecommendRequest,
  RecommendResult,
  RefineResult,
} from '@/lib/core/model'
import { describeTonight, describeWeather, type Weather } from '@/lib/core/weather'
import { getVerifyProvider } from '@/lib/providers/verify'
import { getWeatherProvider } from '@/lib/providers/weather'
import { callDeepseekJson } from './deepseek'
import { mockSkillOutput } from './mock'
import { parseSkillOutput } from './schema'

export type RecommendFailure = { reason: string }

export type RecommendOutcome =
  | { ok: true; value: RecommendResult }
  | { ok: true; refine: RefineResult }
  | { ok: false; failure: RecommendFailure }

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'lib/recommend/prompt.md'), 'utf8')
}

/** 按 skill README 描述的三段式组装输入 */
export function buildUserMessage(
  req: RecommendRequest,
  place: { label: string; city: string },
  weather: Weather | null = null,
): string {
  const lines: (string | null)[] = [
    `任务：${req.task}`,
    `位置：${place.label}（城市 ${place.city}）`,
    req.origin.point
      ? `坐标：${req.origin.point.lng},${req.origin.point.lat}（坐标系 GCJ-02）`
      : '坐标：无，请以位置名称为准',
    /*
     * 天气由平台实测后再喂进来，不由 skill 自己查 —— 它没有任何可用工具，
     * 让它「查天气」等于让它凭记忆编。
     *
     * 拿不到就整行不给，而不是给一句「天气未知」：空更能触发 prompt 里
     * 「没有这一行就别据此调整」的那条规则，写上「未知」反而可能诱导它补一个。
     */
    weather
      ? `天气（平台实测，更新时间 ${weather.reportTime}）：${weather.city} ${describeWeather(weather)}${
          describeTonight(weather) ? `，${describeTonight(weather)}` : ''
        }`
      : null,
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
  ]

  if (req.preferences.rawRequest.trim()) {
    lines.push(`用户原话：${req.preferences.rawRequest.trim()}`)
  }

  if (req.task === 'refine') {
    // 单点追问必须带上地址与类别 —— 只给名字会有同名歧义
    lines.push(
      req.focus
        ? `追问范围：单个地点「${req.focus.name}」（${req.focus.category}，${req.focus.address}）`
        : '追问范围：整批',
    )
    lines.push(`追问：${req.followup ?? ''}`)
    if (req.previous?.length) {
      // 复合地点要把子点一起给出去。只给顶层名字的话，skill 看不见
      // 「集美大社」藏在「集美学村」里，会把它当新地点重复推荐。
      const listed = req.previous
        .map((p) => (p.contains?.length ? `${p.name}（含 ${p.contains.join('、')}）` : p.name))
        .join('、')
      lines.push(`当前列表：${listed}`)
    }
  }

  if (req.task === 'finalize') {
    lines.push(
      `选中的地点：${(req.selected ?? [])
        .map((s) => (s.contains?.length ? `${s.name}（含 ${s.contains.join('、')}）` : s.name))
        .join('；')}`,
    )
  }

  return lines.filter((line): line is string => line !== null).join('\n')
}

function isMock(): boolean {
  return process.env.RECOMMEND_PROVIDER === 'mock'
}

/** 逆地理编码的结果，外加查天气要用的 adcode */
type Place = { label: string; city: string; adcode?: string }

/**
 * 取天气，喂给 skill。
 *
 * 失败返回 null 而不是抛：拿不到天气不拦推荐，只是那条天气行不发。
 * prompt 里有一条规则专门管「没有天气行」这种情况 —— 让 skill 别自己猜。
 */
async function getWeather(adcode?: string): Promise<Weather | null> {
  const code = adcode?.trim()
  if (!code) return null

  try {
    return await getWeatherProvider().getWeather({ adcode: code })
  } catch (error) {
    console.error('[recommend] 天气获取失败，按未知处理', error)
    return null
  }
}

/**
 * 取 skill 的原始 JSON 输出。
 *
 * mock 与真实 DeepSeek **只在这一个点分叉** —— 之后的解析、结构校验、
 * 高德核实走的是完全相同的一条路。mock 只替换「生成推荐」这一步，
 * 不替换整条流水线，否则演示就绕过了契约、失去了验证意义。
 */
async function getSkillOutput(
  req: RecommendRequest,
  place: Place,
  weather: Weather | null,
): Promise<{ ok: true; raw: unknown } | { ok: false; failure: RecommendFailure }> {
  if (isMock()) {
    return { ok: true, raw: await mockSkillOutput(req) }
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL
  if (!apiKey) return { ok: false, failure: { reason: '未配置 DEEPSEEK_API_KEY' } }
  if (!model) {
    return { ok: false, failure: { reason: '未配置 DEEPSEEK_MODEL，先跑 npm run models 看可用模型' } }
  }

  const envMax = Number(process.env.DEEPSEEK_MAX_TOKENS)
  const maxTokens = Number.isFinite(envMax) && envMax > 0 ? envMax : undefined

  const call = await callDeepseekJson({
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model,
    system: loadPrompt(),
    user: buildUserMessage(req, place, weather),
    maxTokens,
  })

  if (!call.ok) {
    console.error('[recommend] skill 调用失败', call.failure)
    return { ok: false, failure: { reason: call.failure.detail } }
  }

  try {
    return { ok: true, raw: JSON.parse(call.text) }
  } catch {
    return { ok: false, failure: { reason: '回包不是合法 JSON' } }
  }
}

/**
 * 流式路径的前置：逆地理编码拿到「位置名 + 城市」，并组装给 skill 的输入文本。
 * 单独抽出来是因为流式与非流式两条路都要用它。
 */
export async function prepareRecommend(
  req: RecommendRequest,
): Promise<
  | { ok: true; place: Place; userMessage: string }
  | { ok: false; failure: RecommendFailure }
> {
  const verify = getVerifyProvider()
  let place: Place = { label: '', city: '' }

  if (req.origin.point) {
    try {
      place = await verify.reverseGeocode(req.origin.point)
    } catch (error) {
      console.error('[recommend] 逆地理编码失败，退化为纯坐标', error)
    }
  }
  // mock 不需要城市（地址里已经带了），所以只在真实 skill 路径上拦住
  if (!isMock() && !place.label && !place.city) {
    return { ok: false, failure: { reason: '无法确定出发点所在城市，请换一个位置试试' } }
  }

  return { ok: true, place, userMessage: buildUserMessage(req, place, await getWeather(place.adcode)) }
}

export async function recommend(req: RecommendRequest): Promise<RecommendOutcome> {
  const verify = getVerifyProvider()

  // skill 要「位置名称 + 城市」，而客户端只知道坐标 —— 由服务端逆地理编码补上
  let place: Place = { label: '', city: '' }
  if (req.origin.point) {
    try {
      place = await verify.reverseGeocode(req.origin.point)
    } catch (error) {
      console.error('[recommend] 逆地理编码失败，退化为纯坐标', error)
    }
  }
  // mock 不需要城市（地址里已经带了），所以只在真实 skill 路径上拦住
  if (!isMock() && !place.label && !place.city) {
    return { ok: false, failure: { reason: '无法确定出发点所在城市，请换一个位置试试' } }
  }

  const skill = await getSkillOutput(req, place, await getWeather(place.adcode))
  if (!skill.ok) return { ok: false, failure: skill.failure }
  const raw = skill.raw

  // refine 的产物是 diff，形状与初次推荐不同，单独走一条解析
  if (req.task === 'refine') {
    const refine = parseRefineOutput(raw)
    if (!refine.ok) {
      console.error('[recommend] 追问回包结构未通过', refine.problems)
      return { ok: false, failure: { reason: `回包结构不符合约定：${refine.problems[0]}` } }
    }
    const added = await verifyAll(refine.value.added, req, place)
    return { ok: true, refine: { ...refine.value, added } }
  }

  const parsed = parseSkillOutput(raw)
  if (!parsed.ok) {
    console.error('[recommend] 结构校验未通过', parsed.problems)
    return { ok: false, failure: { reason: `回包结构不符合约定：${parsed.problems[0]}` } }
  }

  const places = await verifyAll(parsed.value.recommendations, req, place)

  return {
    ok: true,
    value: { places, excluded: parsed.value.excluded, meta: parsed.value.meta },
  }
}

/**
 * 逐条核实，串行 + 小延迟：高德 QPS 是按秒掐的，
 * 见 2026-09-18 spec 第 9.1 节那次「假零公里」事故。
 * 单条失败只让那条变未核实，不影响整次。
 */
async function verifyAll(
  list: Omit<RecommendPlace, 'point' | 'verified'>[],
  req: RecommendRequest,
  place: { label: string; city: string },
): Promise<RecommendPlace[]> {
  const verify = getVerifyProvider()
  const origin = req.origin.point ?? { lng: 0, lat: 0 }
  const out: RecommendPlace[] = []

  for (const [i, rec] of list.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 120))

    try {
      const v = await verify.verify({
        name: rec.name,
        address: rec.address,
        city: place.city,
        origin,
      })
      out.push({ ...rec, ...v })
    } catch (error) {
      console.error(`[recommend] 核实失败：${rec.name}`, error)
      out.push({ ...rec, point: null, verified: false })
    }
  }

  return out
}

/** skill 给的地点还没有坐标，核实之后才成为 RecommendPlace */
type UnverifiedPlace = Omit<RecommendPlace, 'point' | 'verified'>

/** refine 的输出是 diff，需要单独校验 */
function parseRefineOutput(
  raw: unknown,
): { ok: true; value: Omit<RefineResult, 'added'> & { added: UnverifiedPlace[] } } | { ok: false; problems: string[] } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, problems: ['顶层不是对象'] }
  }

  const obj = raw as Record<string, unknown>
  const problems: string[] = []

  if (!Array.isArray(obj.added)) problems.push('缺少 added 数组')
  if (!Array.isArray(obj.removed)) problems.push('缺少 removed 数组')
  if (typeof obj.answer !== 'string' || !obj.answer.trim()) problems.push('缺少 answer')

  if (problems.length > 0) return { ok: false, problems }

  // added 里的每条仍要过常规的推荐校验（amap_url 白名单等）
  const asRecommendations = parseSkillOutput({
    recommendations: obj.added,
    excluded: [],
    meta: {},
  })

  const emptyAdded = (obj.added as unknown[]).length === 0
  if (!asRecommendations.ok && !emptyAdded) {
    return { ok: false, problems: asRecommendations.ok ? [] : asRecommendations.problems }
  }

  const removed = (obj.removed as unknown[])
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({
      name: typeof r.name === 'string' ? r.name.trim() : '',
      reason: typeof r.reason === 'string' ? r.reason.trim() : '',
    }))
    .filter((r) => r.name)

  return {
    ok: true,
    value: {
      answer: String(obj.answer).trim(),
      added: asRecommendations.ok ? asRecommendations.value.recommendations : [],
      removed,
    },
  }
}
