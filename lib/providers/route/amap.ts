import { simplifyPolyline } from '@/lib/core/geo'
import type { LatLng, Route, RouteLeg, TravelMode } from '@/lib/core/model'
import { amapGet } from '../amap-fetch'
import { parseAmapPolyline } from '../amap-polyline'
import type { RouteProvider } from './types'

type PathsResponse = {
  route?: {
    paths?: {
      distance?: string
      duration?: string
      steps?: { polyline?: string; duration?: string; distance?: string }[]
    }[]
  }
}

/** 公共交通是另一套结构：一条方案由若干段拼成，每段又分步行与公交（地铁也在 bus 里） */
type TransitResponse = {
  route?: {
    transits?: {
      distance?: string
      duration?: string
      segments?: {
        walking?: { steps?: { polyline?: string }[] }
        bus?: { buslines?: { polyline?: string }[] }
      }[]
    }[]
  }
}

type ParsedPath = { distanceMeters: number; durationSeconds: number; polyline: LatLng[] }

/**
 * 高德的路线接口按出行方式分了好几套返回结构，这个表把「请求什么」和
 * 「怎么读回来」绑在一起 —— 曾经这里只有一条读法（route.paths[0]），
 * 于是公共交通方案永远被判成「未返回可用路径」。
 */
const MODE_ENDPOINT: Record<TravelMode, { path: string; params?: Record<string, string> }> = {
  driving: { path: '/v3/direction/driving' },
  walking: { path: '/v3/direction/walking' },
  // 骑行在 v3 已经下线（SERVICE_NOT_AVAILABLE），v5 还在，返回结构与 v3 的 paths 一致
  bicycling: { path: '/v5/direction/bicycling', params: { show_fields: 'cost,polyline' } },
  transit: { path: '/v3/direction/transit/integrated' },
}

/** 驾车 / 步行 / 骑行：route.paths[0] → steps[].polyline */
function parsePaths(data: PathsResponse): ParsedPath | null {
  const path = data.route?.paths?.[0]
  if (!path) return null

  return {
    distanceMeters: Math.round(Number(path.distance) || 0),
    durationSeconds: Math.round(Number(path.duration) || 0),
    polyline: (path.steps ?? []).flatMap((s) => parseAmapPolyline(s.polyline ?? '')),
  }
}

/**
 * 公共交通：route.transits[0]，折线要自己按段拼。
 *
 * 一段里可能既有步行也有公交（地铁同样出现在 bus.buslines 里，
 * 名字形如「地铁1号线(岩内--镇海路)」），按 walking → buslines 的顺序接上。
 * 只走 railway 的城际段不带折线（高德不给），本应用的场景里也不会出现。
 */
function parseTransit(data: TransitResponse): ParsedPath | null {
  const transit = data.route?.transits?.[0]
  if (!transit) return null

  const polyline: LatLng[] = []
  for (const segment of transit.segments ?? []) {
    for (const step of segment.walking?.steps ?? []) {
      polyline.push(...parseAmapPolyline(step.polyline ?? ''))
    }
    for (const line of segment.bus?.buslines ?? []) {
      polyline.push(...parseAmapPolyline(line.polyline ?? ''))
    }
  }

  return {
    distanceMeters: Math.round(Number(transit.distance) || 0),
    durationSeconds: Math.round(Number(transit.duration) || 0),
    polyline,
  }
}

/**
 * 逐段规划：每段一次请求，**每段可以有自己的出行方式**。
 *
 * 近的一段走路、远的一段坐地铁，是同一条路线上正常的样子 ——
 * 高德没有跨方式的接口，这件事只能在调用侧做。段内候选按顺序试，
 * 第一候选没规划出来才轮到下一个，且只影响这一段。
 */
export const amapRouteProvider: RouteProvider = {
  async planRoute({ origin, stops, legModes, end }): Promise<Route> {
    // 终点作为最后一个点参与逐段规划，但不进 order —— 它是一站的收尾，不是途中一站
    const points = [origin, ...stops.map((s) => s.point), ...(end ? [end] : [])]
    const legs: RouteLeg[] = []

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      const fromIndex = i - 1
      const toIndex = i
      const candidates = legModes[i] ?? []

      // 候选为空说明调用方没给这一段定方式，那是编程错误。
      // 不在这里编一个默认方式顶上 —— 那样用户看到的是一条没人决策过的路线
      if (candidates.length === 0) {
        throw new Error(`第 ${i + 1} 段没有候选出行方式`)
      }

      let planned: RouteLeg | null = null

      for (const mode of candidates) {
        const endpoint = MODE_ENDPOINT[mode]

        try {
          // 刻意不传 depart_at：它不是 /v3/direction 的文档化参数，
          // 实测传合法未来时间结果毫无变化、传非法值直接返回空。
          // 出发时间只用于时间轴的时刻推算，不送给高德。
          const data = await amapGet<PathsResponse & TransitResponse>(endpoint.path, {
            origin: `${from.lng},${from.lat}`,
            destination: `${to.lng},${to.lat}`,
            extensions: 'all',
            ...endpoint.params,
          })

          const parsed = mode === 'transit' ? parseTransit(data) : parsePaths(data)
          if (!parsed || parsed.polyline.length === 0) throw new Error('高德未返回可用路径')

          planned = {
            fromIndex,
            toIndex,
            mode,
            distanceMeters: parsed.distanceMeters,
            durationSeconds: parsed.durationSeconds,
            polyline: simplifyPolyline(parsed.polyline, 5),
          }
          break
        } catch (error) {
          // 这一段这个方式不行，换下一个候选。必须留痕：之前这里静默吞错，
          // 导致线上出现「0 分钟 0.0 公里」时无从查起
          console.error(
            `[route/amap] 第 ${i} 段用 ${mode} 没规划出来，` +
              `换下一个候选（${candidates.join(' → ')}）| ${from.lng},${from.lat} -> ${to.lng},${to.lat} |`,
            error,
          )
        }
      }

      if (planned) {
        legs.push(planned)
        continue
      }

      // 候选全试过还是不行：降级成直线，不让整条路线失败。
      // mode 记的是「本来想用的那种」，配合 degraded 标记，界面会说「这段是直线估算」
      legs.push({
        fromIndex,
        toIndex,
        mode: candidates[0],
        distanceMeters: 0,
        durationSeconds: 0,
        polyline: [from, to],
        // 明确标记，让界面能说「这段没规划出来」，而不是拿 0 冒充结果
        degraded: true,
      })
    }

    return {
      order: stops.map((s) => s.id),
      legs,
      totalDurationSeconds: legs.reduce((a, l) => a + l.durationSeconds, 0),
      totalDistanceMeters: legs.reduce((a, l) => a + l.distanceMeters, 0),
      polyline: points,
    }
  },
}
