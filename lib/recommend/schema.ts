export type SkillFit = { tag: string; why: string }
export type SkillItineraryItem = { time: string; action: string }

export type SkillRecommendation = {
  rank: number
  tier: string
  name: string
  category: string
  address: string
  fit: SkillFit[]
  crowdLevel?: string
  crowdNote?: string
  indoorOutdoor?: string
  bestTime?: string
  cost?: string
  transitHint?: string
  itinerary?: SkillItineraryItem[]
  pickIf?: string
  tradeOff?: string
  amapUrl: string
  confidence?: string
  source?: string
}

export type SkillOutput = {
  query: Record<string, unknown>
  recommendations: SkillRecommendation[]
  excluded: { name: string; reason: string }[]
  meta: { assumptions: string[]; unverified: string[]; disclaimer?: string }
}

type Parsed = { ok: true; value: SkillOutput } | { ok: false; problems: string[] }

/**
 * DeepSeek 的 json_object 只保证 JSON 语法合法，**不保证字段符合我们的约定**。
 * 字段缺失、类型不对、fit 里同一个 tag 出现两次，都会照样通过语法检查。
 * skill 的 README 明确要求「同一个 tag 只占一条」，那条规则只能在这里守。
 */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function parseFit(raw: unknown, where: string, problems: string[]): SkillFit[] {
  if (!Array.isArray(raw)) {
    problems.push(`${where} 缺少 fit 数组`)
    return []
  }

  const out: SkillFit[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (!isObj(item)) continue
    const tag = text(item.tag)
    const why = text(item.why)
    if (!tag || !why) continue

    // 拆成多条会让同一个标签被重复计数，也把一件事拆散在几条里
    if (seen.has(tag)) {
      problems.push(`${where} 的 fit 里 tag「${tag}」出现了多次，应合并成一条`)
      continue
    }
    seen.add(tag)
    out.push({ tag, why })
  }

  if (out.length === 0) problems.push(`${where} 的 fit 为空`)
  return out
}

export function parseSkillOutput(raw: unknown): Parsed {
  if (!isObj(raw)) return { ok: false, problems: ['顶层不是对象'] }

  if (!Array.isArray(raw.recommendations)) {
    return { ok: false, problems: ['缺少 recommendations 数组'] }
  }
  if (raw.recommendations.length === 0) {
    return { ok: false, problems: ['recommendations 为空，没有可用推荐'] }
  }

  const problems: string[] = []
  const recommendations: SkillRecommendation[] = []

  raw.recommendations.forEach((item, i) => {
    const where = `第 #${i + 1} 条`
    if (!isObj(item)) {
      problems.push(`${where} 不是对象`)
      return
    }

    const name = text(item.name)
    const amapUrl = text(item.amap_url)
    if (!name) problems.push(`${where} 缺少 name`)
    if (!amapUrl) problems.push(`${where} 缺少 amap_url`)

    const fit = parseFit(item.fit, where, problems)
    if (!name || !amapUrl) return

    const itinerary = Array.isArray(item.itinerary)
      ? item.itinerary
          .filter(isObj)
          .map((s) => ({ time: text(s.time), action: text(s.action) }))
          .filter((s) => s.time && s.action)
      : []

    recommendations.push({
      rank: typeof item.rank === 'number' ? item.rank : i + 1,
      tier: text(item.tier) || '备选',
      name,
      category: text(item.category) || '未分类',
      address: text(item.address),
      fit,
      crowdLevel: text(item.crowd_level) || undefined,
      crowdNote: text(item.crowd_note) || undefined,
      indoorOutdoor: text(item.indoor_outdoor) || undefined,
      bestTime: text(item.best_time) || undefined,
      cost: text(item.cost) || undefined,
      transitHint: text(item.transit_hint) || undefined,
      itinerary: itinerary.length > 0 ? itinerary : undefined,
      pickIf: text(item.pick_if) || undefined,
      tradeOff: text(item.trade_off) || undefined,
      amapUrl,
      confidence: text(item.confidence) || undefined,
      source: text(item.source) || undefined,
    })
  })

  if (problems.length > 0) return { ok: false, problems }

  const excluded = Array.isArray(raw.excluded)
    ? raw.excluded
        .filter(isObj)
        .map((e) => ({ name: text(e.name), reason: text(e.reason) }))
        .filter((e) => e.name)
    : []

  const metaRaw = isObj(raw.meta) ? raw.meta : {}

  return {
    ok: true,
    value: {
      query: isObj(raw.query) ? raw.query : {},
      recommendations,
      excluded,
      meta: {
        assumptions: Array.isArray(metaRaw.assumptions)
          ? metaRaw.assumptions.map(text).filter(Boolean)
          : [],
        unverified: Array.isArray(metaRaw.unverified)
          ? metaRaw.unverified.map(text).filter(Boolean)
          : [],
        disclaimer: text(metaRaw.disclaimer) || undefined,
      },
    },
  }
}
