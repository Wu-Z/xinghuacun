import { asText } from '@/lib/core/coerce'
import { normalizeCondition, type Weather, type WeatherCondition } from '@/lib/core/weather'
import { amapGet } from '../amap-fetch'
import type { WeatherInput, WeatherProvider } from './types'

type Live = {
  city?: unknown
  adcode?: unknown
  weather?: unknown
  temperature?: unknown
  winddirection?: unknown
  windpower?: unknown
  humidity?: unknown
  reporttime?: unknown
}

type Cast = {
  date?: unknown
  nightweather?: unknown
  nighttemp?: unknown
}

type AmapLiveResponse = { lives?: Live[] }

type AmapForecastResponse = {
  /*
   * 文档写 `forecast`，实测这个 key 返回的是 `forecasts`。
   * 两个都收着，取第一个非空 —— 为一个字段名把整块功能做死不值得。
   */
  forecast?: { casts?: Cast[] }[]
  forecasts?: { casts?: Cast[] }[]
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const n = Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

/**
 * 实况与预报是**两次请求**：
 * `extensions=base` 只给 lives（现在几点报的实时数据），
 * `extensions=all` 只给 forecasts（今天起四天的白天/夜间预报）——
 * 实测过，all 的回包里没有 lives。用 all 里的 daytemp 冒充「现在几度」是编造，
 * 所以宁可多打一次：14 分钟缓存摊完之后，一个城市一天不到两百次。
 */
async function fetchLive(code: string): Promise<Live | null> {
  try {
    const data = await amapGet<AmapLiveResponse>('/v3/weather/weatherInfo', {
      city: code,
      extensions: 'base',
    })
    return data.lives?.[0] ?? null
  } catch (error) {
    console.error('[weather] 实况天气查询失败', error)
    return null
  }
}

/** 今日夜间那半 —— 有就有，没有只是少说一句，不影响整块天气 */
async function fetchTonight(code: string): Promise<Weather['tonight']> {
  try {
    const data = await amapGet<AmapForecastResponse>('/v3/weather/weatherInfo', {
      city: code,
      extensions: 'all',
    })
    // casts 按「今天 / 明天 / …」排，只取第 0 个，那是今天
    const today = (data.forecast ?? data.forecasts)?.[0]?.casts?.[0]
    const text = asText(today?.nightweather)
    const temp = toNumber(today?.nighttemp)
    if (!text || temp === null) return null

    return { condition: normalizeCondition(text) as WeatherCondition, conditionText: text, temperatureC: temp }
  } catch (error) {
    console.error('[weather] 今日预报查询失败', error)
    return null
  }
}

export const amapWeatherProvider: WeatherProvider = {
  async getWeather({ adcode }: WeatherInput): Promise<Weather | null> {
    const code = adcode?.trim()
    if (!code) return null

    // 两个都在同一个并发闸门里排队，并行发出 —— 慢的那个决定总时长，不是两者相加
    const [live, tonight] = await Promise.all([fetchLive(code), fetchTonight(code)])
    if (!live) return null

    const text = asText(live.weather)
    const temperatureC = toNumber(live.temperature)
    // 没有天气或温度就没有这整块 —— 它不是必备信息
    if (!text || temperatureC === null) return null

    return {
      city: asText(live.city),
      adcode: asText(live.adcode) || code,
      condition: normalizeCondition(text),
      conditionText: text,
      temperatureC,
      humidity: toNumber(live.humidity) ?? undefined,
      windDirection: asText(live.winddirection) || undefined,
      windPower: asText(live.windpower) || undefined,
      tonight,
      reportTime: asText(live.reporttime),
    }
  },
}
