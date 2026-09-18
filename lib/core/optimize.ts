import { haversineMeters } from './geo'
import type { LatLng } from './model'

export type StopPoint = { id: string; point: LatLng }

/**
 * 求从 origin 出发、走遍所有停靠点的最短顺序。
 *
 * 停靠点上限是 6（一屏卡片数），6! = 720 种排列，穷举即是精确最优，
 * 用不上启发式。n 再大就不能这么做了 —— 那时要么换 Held-Karp，
 * 要么接受近似解。
 *
 * 距离函数默认是直线距离，**零额外 API 调用**。这一点是刻意的：真实行车
 * 时间需要一张距离矩阵，而高德的批量算路是「1 终点 × N 起点」，n 个点要发
 * n+1 次请求，会直接撞上 QPS（见 09-18 spec 第 9.1 节的事故）。
 * 将来若要更准，传一个可替换的 distance 即可，排序逻辑与测试都不用动。
 */
export function optimizeOrder(
  origin: LatLng,
  stops: StopPoint[],
  distance: (a: LatLng, b: LatLng) => number = haversineMeters,
): StopPoint[] {
  if (stops.length < 2) return stops.slice()

  let best: StopPoint[] = []
  let bestCost = Infinity

  const walk = (remaining: StopPoint[], path: StopPoint[], cost: number, from: LatLng): void => {
    // 剪枝：已经比当前最优贵，往下走只会更贵
    if (cost >= bestCost) return

    if (remaining.length === 0) {
      best = path
      bestCost = cost
      return
    }

    for (let i = 0; i < remaining.length; i++) {
      const next = remaining[i]
      walk(
        [...remaining.slice(0, i), ...remaining.slice(i + 1)],
        [...path, next],
        cost + distance(from, next.point),
        next.point,
      )
    }
  }

  walk(stops, [], 0, origin)
  return best
}
