import type { Poi } from './model'

export const WEIGHTS = {
  distance: 0.5,
  openStatus: 0.3,
  popularity: 0.2,
} as const

export const MAX_PER_CATEGORY = 2
export const DIVERSITY_PENALTY = 0.6

const OPEN_STATUS_SCORE = { open: 1, unknown: 0.5, closed: 0 } as const

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function medianRating(pois: Poi[]): number | null {
  const ratings = pois.map((p) => p.rating).filter((r): r is number => typeof r === 'number')
  if (ratings.length === 0) return null

  const sorted = [...ratings].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function rankPois(pois: Poi[], opts: { radiusMeters: number }): Poi[] {
  const median = medianRating(pois)

  const scored = pois
    .filter((p) => p.openStatus !== 'closed')
    .map((p) => {
      const scoreParts = {
        distance: clamp01(1 - p.distanceMeters / opts.radiusMeters),
        openStatus: OPEN_STATUS_SCORE[p.openStatus],
        // 没有评分时取全体中位数；全体都没有评分时取中性 0.5
        popularity:
          p.rating != null ? clamp01(p.rating / 5) : median != null ? clamp01(median / 5) : 0.5,
      }
      const score =
        scoreParts.distance * WEIGHTS.distance +
        scoreParts.openStatus * WEIGHTS.openStatus +
        scoreParts.popularity * WEIGHTS.popularity
      return { ...p, score, scoreParts }
    })

  // 贪心：每次从剩下的里取「施加多样性惩罚后」分数最高的一个。
  // 这样同类别第 3 张会被压到其他类别后面，且不会来回震荡。
  const remaining = scored.slice()
  const out: Poi[] = []
  const categoryCount = new Map<string, number>()

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestScore = -Infinity

    for (let i = 0; i < remaining.length; i++) {
      const used = categoryCount.get(remaining[i].category) ?? 0
      const penalized =
        (remaining[i].score ?? 0) * (used >= MAX_PER_CATEGORY ? DIVERSITY_PENALTY : 1)
      if (penalized > bestScore) {
        bestScore = penalized
        bestIndex = i
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1)
    categoryCount.set(chosen.category, (categoryCount.get(chosen.category) ?? 0) + 1)
    out.push({ ...chosen, score: bestScore })
  }

  return out
}
