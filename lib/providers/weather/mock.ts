import type { Weather } from '@/lib/core/weather'
import type { WeatherProvider } from './types'

/**
 * 假天气。雷阵雨是特意挑的 —— 它是动效最重、也最容易做砸的一种，
 * 拿它调 UI 才能同时看到「强度分档」和「可读性」两件事。
 *
 * 想看晴天 / 多云的情况，改 WEATHER_OVERRIDE 环境变量：
 * `RECOMMEND_WEATHER=mock WEATHER_OVERRIDE=sunny npm run dev`
 */
const PRESETS: Record<string, Weather> = {
  storm: {
    city: '示例市',
    adcode: '000000',
    condition: 'storm',
    conditionText: '雷阵雨',
    temperatureC: 26,
    humidity: 88,
    windDirection: '东南风',
    windPower: '4',
    tonight: { condition: 'shower', conditionText: '阵雨', temperatureC: 23 },
    reportTime: '2026-01-01 09:00:00',
  },
  cloudy: {
    city: '示例市',
    adcode: '000000',
    condition: 'cloudy',
    conditionText: '多云',
    temperatureC: 27,
    humidity: 70,
    windDirection: '东风',
    windPower: '2',
    tonight: { condition: 'cloudy', conditionText: '多云', temperatureC: 24 },
    reportTime: '2026-01-01 09:00:00',
  },
  sunny: {
    city: '示例市',
    adcode: '000000',
    condition: 'sunny',
    conditionText: '晴',
    temperatureC: 33,
    humidity: 55,
    windDirection: '南风',
    windPower: '1',
    tonight: { condition: 'sunny', conditionText: '晴', temperatureC: 28 },
    reportTime: '2026-01-01 09:00:00',
  },
}

export const mockWeatherProvider: WeatherProvider = {
  async getWeather() {
    return PRESETS[process.env.WEATHER_OVERRIDE ?? 'storm'] ?? PRESETS.storm
  },
}
