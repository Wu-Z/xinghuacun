import { amapWeatherProvider } from './amap'
import { mockWeatherProvider } from './mock'
import type { WeatherProvider } from './types'

export function getWeatherProvider(): WeatherProvider {
  return process.env.RECOMMEND_WEATHER === 'mock' ? mockWeatherProvider : amapWeatherProvider
}

export type { WeatherInput, WeatherProvider } from './types'
