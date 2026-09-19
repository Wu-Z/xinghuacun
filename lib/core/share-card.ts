import { formatDistance, legSummary, summarizeModes } from './format'
import type { Itinerary } from './itinerary'
import type { RecommendPlace } from './model'

/**
 * 分享卡的卡面内容。**这里只做装配，不做绘制** ——
 * 绘制在 components/share-card-canvas.ts（依赖 Canvas，测不了），
 * 卡片上写什么字在这里定，于是那些字可以被测试守住。
 *
 * 三件事不能上卡：
 * - 出发点坐标（隐私。卡面首站从「1」开始，不含「出发点」标记）
 * - 任何时刻（产品边界：不知道你会待多久就不编一个时间出来）
 * - 降级段的时长（那是拿直线距离估的，不是高德算出来的）
 */
export type ShareCardStop = {
  /** 卡面上的编号，与列表、地图、时间轴上的编号同源 */
  order: number
  name: string
  /** 一句「为什么是它」，来自 skill 的 fit[0]；没有就空着，不编 */
  why: string
  /** 从上一站怎么过来。首站没有这一段 */
  leg: string | null
}

export type ShareCardData = {
  title: string
  /** 出行时间。用户自己写的一句话，不写就没有这一行 */
  when: string | null
  /** 「3 站 · 步行 + 骑行 · 约 6.2 公里」 */
  summary: string
  stops: ShareCardStop[]
  /** 底部固定那行。诚实原则跟卡走 */
  disclaimer: string
}

export const SHARE_DISCLAIMER = '地点经高德核实 · 距离为直线口径'

/** 出行时间的四档之一。值是**用户看到什么就印什么**的字面串，不做任何推算 */
export const SHARE_WHEN_PRESETS = ['今天下午', '明天上午', '这个周末'] as const

export type ShareWhenPreset = (typeof SHARE_WHEN_PRESETS)[number]

/**
 * 没填名字时系统给的默认名。
 *
 * 刻意不生成「学村半日闲走」这种文艺标题：那是人取的名字，
 * 机器拼一个出来只会成批地重复且不知所指。就用能确认的两件事：
 * 从哪一站开始、一共几站。
 */
export function defaultShareTitle(firstStopName: string, stopCount: number): string {
  return `${firstStopName}起 · ${stopCount} 站`
}

/**
 * 从出发点的说法里挑出「市 · 区」，给卡面当语境行。
 *
 * 草稿里的 label 形如「厦门市集美区软件园B区」，卡面要的是「厦门 · 集美」——
 * 「软件园B区」对收到卡的人没有意义，而省市是帮他判断这张卡跟自己有没有关系的东西。
 * 认不出来就返回空（比如 label 是「当前位置」），调用方直接不写这一截 ——
 * 宁可少一行，也不要写一句猜的。
 */
export function cityDistrict(label: string): { city: string; district: string } {
  const city = /^([\u4e00-\u9fa5]{2,10}?市|[\u4e00-\u9fa5]{2,10}?自治州|[\u4e00-\u9fa5]{2,10}?地区)/.exec(
    label,
  )?.[1]

  const rest = city ? label.slice(city.length) : label
  const district = /^([\u4e00-\u9fa5]{2,10}?[区县市旗])/.exec(rest)?.[1]

  return {
    city: city?.replace(/市$/, '') ?? '',
    district: district?.replace(/[区县市旗]$/, '') ?? '',
  }
}

export type ShareCardInput = {
  itinerary: Itinerary
  places: RecommendPlace[]
  /** 用户填的或系统给的默认名 */
  title: string
  when: string | null
}

export function buildShareCard({
  itinerary,
  places,
  title,
  when,
}: ShareCardInput): ShareCardData {
  const stops: ShareCardStop[] = []

  itinerary.stops.forEach((stop, i) => {
    // 起点不进卡：它是「我」出发的地方，不是这张路书上的一站
    if (stop.kind !== 'stop') return

    const place = places.find((p) => p.name === stop.name)
    /*
     * legs[i-1] 是上一站到本站那一段。
     *
     * 首站那一段是「出发点 → 首站」，**不上卡**：卡是给别人看的，
     * 别人不关心你从哪出发，而出发点正是这张卡上唯一需要藏起来的东西。
     * 所以卡面首站只有名字和理由，从第 2 站起才写怎么过来。
     */
    const legsFromPrevStop = i > 0 && itinerary.stops[i - 1]?.kind === 'stop'
    const leg = legsFromPrevStop ? itinerary.legs[i - 1] : null

    stops.push({
      order: stops.length + 1,
      name: stop.name,
      why: place?.fit?.[0]?.why ?? '',
      leg: leg ? legSummary(leg) : null,
    })
  })

  return {
    title,
    when: when?.trim() ? when.trim() : null,
    summary: `${stops.length} 站 · ${summarizeModes(itinerary.legs)} · 约 ${formatDistance(
      itinerary.totalDistanceMeters,
    )}`,
    stops,
    disclaimer: SHARE_DISCLAIMER,
  }
}

/**
 * 卡面最上面那行语境：「厦门 · 集美 · 今天 · 26° 晴」。
 *
 * 为什么写「今天」而不是「周六」：卡上还可能有一行用户自己写的出行时间
 * （「本周六 14:00」）。两行都写星期，收到卡的人没法判断哪一个是行程的日子。
 * 天气是**此刻实测**的，所以它归「今天」，出行时间归用户那句话。
 *
 * 拼不出城市（出发点的说法是「当前位置」）就不写那一截；连天气都没有就整行不给 ——
 * 留一行光秃秃的「今天」比没有更让人困惑。
 */
export function shareContextLabel(input: {
  label: string
  /** 天气的头部说法，如「26° 晴」。取不到传 null */
  weather?: string | null
}): string | null {
  const { city, district } = cityDistrict(input.label)
  const place = [city, district].filter(Boolean).join(' · ')

  const weather = input.weather?.trim() || null
  if (!place && !weather) return null

  return [place, '今天', weather].filter(Boolean).join(' · ')
}

/**
 * 导出图片的文件名。
 *
 * 用户取的名字会带上各种字符（空格、斜杠、emoji），直接当文件名在部分系统上
 * 会存不下来或被改名 —— 统一换成连字符，再去掉首尾的连字符。
 */
export function shareFileName(title: string): string {
  const safe = title
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${safe || '周边去哪-行程'}.png`
}
