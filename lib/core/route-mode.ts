import { haversineMeters } from './geo'
import type { LatLng, TravelMode } from './model'

const MAP: Record<string, TravelMode> = {
  步行: 'walking',
  骑行: 'bicycling',
  驾车: 'driving',
  // 打车走的仍是道路，用驾车路线
  打车: 'driving',
  公共交通: 'transit',
  地铁: 'transit',
  公交: 'transit',
}

/**
 * 步行的距离上限（直线米）。
 *
 * 超过就不该再走路 —— 这不是「谁更快」的问题。实测集美学村 → 集美万达
 * 直线 634 米，步行 15.2 分钟、骑行 7.0 分钟，但骑行那 7 分钟不含找车、
 * 扫码、停车，也不含骑到目的地之后的体力消耗。所以距离档位由本地定，
 * 不交给高德的时长去比。
 */
export const WALK_MAX_METERS = 1000

/**
 * 骑行的距离上限（直线米）。约 25 分钟，再远骑到了也没力气玩。
 *
 * 实测 2.8 km 骑行 45.5 分 vs 公共交通 48.6 分、7.6 km 骑行 51.8 分 vs
 * 地铁 53.5 分 —— 时长上骑行在 8 km 内都不输，正是因为这个「不输」，
 * 才不能拿时长当判据：那样每一段都会选骑行，人会骑 50 分钟去玩。
 */
export const BIKE_MAX_METERS = 5000

/**
 * 把用户的出行方式偏好映射成高德路线规划的方式。
 *
 * 之前这里被写死成 'driving'，导致**用户选「步行」，地图画的却是驾车路线** ——
 * 偏好只传给了 skill，没传给路线规划。
 *
 * 多选时取**第一个能识别的**：chip 数组的顺序就是用户勾选的先后，
 * 视作他的偏好顺序。认不出来就返回 null —— 交给 legModeCandidates 按距离兜底，
 * 而不是在这里偷偷替用户选一个。
 */
export function pickRouteMode(travelMode: string[]): TravelMode | null {
  for (const raw of travelMode) {
    const key = raw.trim()
    const mode = MAP[key]
    if (mode) return mode
  }
  return null
}

/**
 * 这一段该依次试哪些方式。
 *
 * **逐段定，不是整条定。**高德没有跨方式的路径规划接口（每种方式一个地址，
 * 没有「逐段指定方式」的参数），所以「近的走、远的坐地铁」只能本地做 ——
 * 我们本来就是逐段发请求的，接口层天生支持，只是原先所有段传了同一个方式。
 *
 * 第一候选就是「这个距离上说得通的方式」，后面的候选只在第一候选**算不出来**时
 * （高德没给路径 / 那片没有步行道）才顶上来。刻意**不按返回的时长排序**：
 * 高德的时长是机械时间，不含等车之外的代价，也不含骑行要停车、走路会累。
 *
 * 用户明确选过就只听他的，哪怕 12 公里他也说要走路 —— 静默替他换一种交通方式，
 * 他看到路线会以为算错了。
 */
export function legModeCandidates(
  from: LatLng,
  to: LatLng,
  explicit: TravelMode | null,
): TravelMode[] {
  if (explicit) return [explicit]

  const straight = haversineMeters(from, to)
  if (straight <= WALK_MAX_METERS) return ['walking', 'bicycling']
  if (straight <= BIKE_MAX_METERS) return ['bicycling', 'transit', 'driving']
  // 超过骑行上限：公共交通优先，自驾兜底。骑行不再列入 ——
  // 那是被距离否掉的方式，不该作为「没别的办法了」的备胎重新冒出来
  return ['transit', 'driving']
}

/**
 * 一条路线上每一段的候选方式。段数与 `points` 一一对应：第 i 段是 points[i] → points[i+1]。
 *
 * 距离用的是**直线距离**（段的两端坐标我们有），所以阈值也是直线口径。
 * 实测厦门几组真实地点对，实际里程约是直线的 1.3~1.8 倍。
 */
export function buildLegModes(points: LatLng[], explicit: TravelMode | null): TravelMode[][] {
  const out: TravelMode[][] = []
  for (let i = 0; i < points.length - 1; i++) {
    out.push(legModeCandidates(points[i], points[i + 1], explicit))
  }
  return out
}
