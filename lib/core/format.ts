import type { TravelMode } from './model'

/** 把秒数说成人话。不足一分钟的按分钟进位，别显示「0 分钟」。 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—'
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

/** 距离按公里显示，一位小数 */
export function formatDistance(meters: number): string {
  if (meters <= 0) return '—'
  if (meters < 1000) return `${Math.round(meters)} 米`
  return `${(meters / 1000).toFixed(1)} 公里`
}

export const MODE_LABEL: Record<TravelMode, string> = {
  driving: '驾车',
  // 高德这个是「公共交通」综合方案，地铁与公交都可能出现，不写成「公交」免得漏掉地铁
  transit: '公交/地铁',
  walking: '步行',
  bicycling: '骑行',
}

/**
 * 一条路线用了哪几种方式，说成一句话：单一方式就是「骑行」，混用就是「步行 + 公交/地铁」。
 *
 * 混用时**不挑一个代表**：出行方式现在是逐段定的（近的走路、远的坐地铁），
 * 汇总处只写一种，会和用户在时间轴上逐段看到的方式对不上。
 *
 * 传的是段数组而不是 Route/Itinerary —— RouteLeg 与 ItineraryLeg 都有 mode，
 * 两边都能用，不必为它多转一道。
 */
export function summarizeModes(legs: { mode: TravelMode }[]): string {
  const unique: TravelMode[] = []
  for (const leg of legs) {
    if (!unique.includes(leg.mode)) unique.push(leg.mode)
  }
  return unique.map((m) => MODE_LABEL[m]).join(' + ')
}
