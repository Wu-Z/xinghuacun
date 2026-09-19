import type { Weather } from '@/lib/core/weather'

/**
 * 天气查询的输入。
 *
 * 高德的 `city` 参数要的是 **adcode**（城市编码），不是城市名 ——
 * 传「厦门市」会直接失败。adcode 从逆地理编码那一步免费拿到。
 */
export type WeatherInput = {
  adcode?: string
  city?: string
}

export type WeatherProvider = {
  /**
   * 拿不到就返回 null，不要抛。
   *
   * 天气是锦上添花的信息，它失败时推荐流程必须照常跑完 ——
   * 为了「显示不了天气」而让用户出不了门，是把优先级搞反了。
   */
  getWeather(input: WeatherInput): Promise<Weather | null>
}
