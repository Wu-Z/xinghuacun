/**
 * 天气的边角因人而异，但有一条公用的：数据在多大程度上可信。
 *
 * 这一层只放纯函数 —— 归一化、判级、拼文案。取数在 providers/weather，
 * 展示在 components。分层的意义是这些规则能单独被测到：
 * 「暴雨」不能被当成「雨」画成小雨，「雷阵雨」也不能因为没有「暴雨」两个
 * 字就降级。
 */
export type WeatherCondition =
  | 'sunny'
  | 'cloudy'
  | 'overcast'
  | 'shower'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fog'
  | 'unknown'

export type Weather = {
  city: string
  adcode: string
  condition: WeatherCondition
  /** 高德给的原话。界面优先用它 —— 它是数据源的说法，不是我们的推断 */
  conditionText: string
  temperatureC: number
  humidity?: number
  windDirection?: string
  windPower?: string
  /** 今日夜间预报。高德没给就是 null，界面不许替它编 */
  tonight: { condition: WeatherCondition; conditionText: string; temperatureC: number } | null
  /** 数据发布时间。预报每天只更新三次，不标就是假精确 */
  reportTime: string
}

/*
 * 顺序敏感：先匹配更具体的。
 * 「雷阵雨」里没有「暴雨」两个字，但它是比「中雨」更强的天气；
 * 反过来「暴雨」也不该被前一条「阵雨」吃掉。
 */
const RULES: [RegExp, WeatherCondition][] = [
  [/冰雹|雷/, 'storm'],
  [/暴雨/, 'storm'],
  [/大雨|中雨/, 'rain'],
  [/小雨|阵雨|雨/, 'shower'],
  [/雪/, 'snow'],
  [/雾|霾|尘|沙/, 'fog'],
  [/阴/, 'overcast'],
  [/多云|少云|晴间/, 'cloudy'],
  [/晴/, 'sunny'],
]

/**
 * 把高德的天气文字归成一类。
 *
 * 认不出来返回 unknown 而不是兜底成 sunny —— 后者会把「霾」画成一个大太阳，
 * 那是编造；unknown 的代价只是不出动效，文案里照写高德的原话。
 */
export function normalizeCondition(text: string): WeatherCondition {
  const t = text.trim()
  if (!t) return 'unknown'

  for (const [re, condition] of RULES) {
    if (re.test(t)) return condition
  }
  return 'unknown'
}

/** 降水强度 0–3，蒙版用它决定下多大的雨 */
export function rainLevel(condition: WeatherCondition): 0 | 1 | 2 | 3 {
  if (condition === 'storm') return 3
  if (condition === 'rain') return 2
  if (condition === 'shower') return 1
  return 0
}

export type OverlayKind = 'sun' | 'cloud' | 'rain' | 'snow' | null

/**
 * 该出哪一种蒙版。认不出的天气不出 —— 宁可不动，也不画错。
 */
export function overlayKind(condition: WeatherCondition): OverlayKind {
  if (condition === 'sunny') return 'sun'
  if (condition === 'cloudy' || condition === 'overcast') return 'cloud'
  if (condition === 'fog') return 'cloud'
  if (condition === 'snow') return 'snow'
  if (rainLevel(condition) > 0) return 'rain'
  return null
}

/**
 * 把天气拆成两段：`head` 是「多少度、什么天」，`tail` 是风。
 *
 * 分开的理由是这两段在版面上的地位不同 —— 温度与天气是一个整体，要连读；
 * 风是补充。排得下就拼成一行（describeWeather），排不下就各占一行。
 * 拆法只有这一处，两种排法不会各自漂移。
 */
export function splitWeather(weather: Weather): { head: string; tail: string | null } {
  const head = `${Math.round(weather.temperatureC)}° ${weather.conditionText}`

  const tail: string[] = []
  if (weather.windDirection && weather.windPower) tail.push(`${weather.windDirection} ${weather.windPower} 级`)
  else if (weather.windPower) tail.push(`${weather.windPower} 级`)

  return { head, tail: tail.length > 0 ? tail.join(' · ') : null }
}

/** 一句能扫读的天气：`28° 晴 · 东南风 3 级` */
export function describeWeather(weather: Weather): string {
  // 温度与天气之间不加分隔点 —— 「28° 晴」是一个整体，
  // 中间的「·」会让这两个本该连读的东西变成分开的两条信息
  const { head, tail } = splitWeather(weather)
  return tail ? `${head} · ${tail}` : head
}

/** 夜里会不会变天。变了才有必要占版面说一句 */
export function describeTonight(weather: Weather): string | null {
  if (!weather.tonight) return null
  if (weather.tonight.condition === weather.condition) return null

  return `夜间转${weather.tonight.conditionText} ${Math.round(weather.tonight.temperatureC)}°`
}
