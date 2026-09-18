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
  transit: '公交',
  walking: '步行',
  bicycling: '骑行',
}
