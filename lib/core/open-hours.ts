import type { OpenStatus } from './model'

const RANGE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/

function toMinutes(h: number, m: number): number {
  return h * 60 + m
}

/**
 * 从高德的 open_time / opentime2 推断当前营业状态。
 * 判不出来一律 'unknown' —— 绝不把「不知道」当成「已打烊」，那样会误杀 POI。
 */
export function parseOpenStatus(openTime: string | undefined, now: Date): OpenStatus {
  if (!openTime) return 'unknown'

  const text = openTime.trim()
  if (!text) return 'unknown'
  if (/24\s*小时/.test(text)) return 'open'

  const segments = text
    .split(/[;；]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const nowMin = toMinutes(now.getHours(), now.getMinutes())
  let matchedAny = false
  let openNow = false

  for (const segment of segments) {
    const m = RANGE.exec(segment)
    if (!m) continue
    matchedAny = true

    const start = toMinutes(Number(m[1]), Number(m[2]))
    const end = toMinutes(Number(m[3]), Number(m[4]))

    if (start === end) {
      openNow = true
    } else if (start < end) {
      if (nowMin >= start && nowMin < end) openNow = true
    } else {
      // 跨夜，例如 20:00-02:00
      if (nowMin >= start || nowMin < end) openNow = true
    }
  }

  if (!matchedAny) return 'unknown'
  return openNow ? 'open' : 'closed'
}
