import { DERIVE_RULES, FALLBACK_RULE } from './derive-rules'
import type { Activity, Poi } from './model'

function matches(rule: { match: string[] }, haystack: string): boolean {
  return rule.match.some((keyword) => haystack.includes(keyword))
}

export function deriveActivities(
  poi: Pick<Poi, 'category' | 'categoryRaw'>,
): { activities: Activity[]; suggestedDurationMinutes: number; deriveSource: 'rules' } {
  const haystack = `${poi.category ?? ''};${poi.categoryRaw ?? ''}`
  const rule = DERIVE_RULES.find((r) => matches(r, haystack)) ?? FALLBACK_RULE

  return {
    activities: rule.activities.map((a) => ({ ...a })),
    suggestedDurationMinutes: rule.suggestedDurationMinutes,
    deriveSource: 'rules',
  }
}
