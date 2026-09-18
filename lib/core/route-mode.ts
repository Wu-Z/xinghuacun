import type { TravelMode } from './model'

const MAP: Record<string, TravelMode> = {
  步行: 'walking',
  骑行: 'bicycling',
  驾车: 'driving',
  // 打车走的仍是道路，用驾车路线
  打车: 'driving',
  公共交通: 'transit',
}

/**
 * 把用户的出行方式偏好映射成高德路线规划的方式。
 *
 * 之前这里被写死成 'driving'，导致**用户选「步行」，地图画的却是驾车路线** ——
 * 偏好只传给了 skill，没传给路线规划。
 *
 * 多选时取**第一个能识别的**：chip 数组的顺序就是用户勾选的先后，
 * 视作他的偏好顺序。单一路线方式表达不了「近的走、远的坐车」，
 * 这里只挑一个，不假装能混合。
 */
export function pickRouteMode(travelMode: string[]): TravelMode {
  for (const raw of travelMode) {
    const key = raw.trim()
    const mode = MAP[key]
    if (mode) return mode
  }
  return 'driving'
}
