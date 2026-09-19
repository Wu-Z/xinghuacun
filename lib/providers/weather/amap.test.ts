// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const amapGet = vi.fn()
vi.mock('../amap-fetch', () => ({ amapGet: (...args: unknown[]) => amapGet(...args) }))

import { amapWeatherProvider } from './amap'

/** base 的回包：只有 lives，字段名与嵌套照着高德的真实结构写 */
const LIVE = {
  lives: [
    {
      province: '福建',
      city: '集美区',
      adcode: '350211',
      weather: '阵雨',
      temperature: '27',
      winddirection: '东南',
      windpower: '3',
      humidity: '82',
      reporttime: '2026-09-19 09:12:00',
    },
  ],
}

/** all 的回包：只有 forecasts。第一天是今天，后面几天是预告 */
const FORECAST = {
  forecasts: [
    {
      city: '集美区',
      adcode: '350211',
      casts: [
        { date: '2026-09-19', dayweather: '阵雨', nightweather: '多云', nighttemp: '24' },
        { date: '2026-09-20', dayweather: '晴', nightweather: '晴', nighttemp: '26' },
      ],
    },
  ],
}

/** 按 extensions 分流 —— 真实接口就是这两份互不相干的回包 */
function stub() {
  amapGet.mockImplementation(async (_path: string, params: Record<string, string>) =>
    (params.extensions === 'all' ? FORECAST : LIVE) as never,
  )
}

beforeEach(() => {
  amapGet.mockReset()
  stub()
})

describe('amapWeatherProvider', () => {
  it('没有 adcode 就别去打高德', async () => {
    expect(await amapWeatherProvider.getWeather({ adcode: '' })).toBeNull()
    expect(await amapWeatherProvider.getWeather({})).toBeNull()
    expect(amapGet).not.toHaveBeenCalled()
  })

  it('城市名不能当 adcode 用，宁可拿不到', async () => {
    expect(await amapWeatherProvider.getWeather({ city: '厦门市' })).toBeNull()
    expect(amapGet).not.toHaveBeenCalled()
  })

  it('实况与预报各发一次，base 只给 lives、all 只给 forecasts', async () => {
    await amapWeatherProvider.getWeather({ adcode: '350211' })

    const extensions = amapGet.mock.calls.map((c) => (c[1] as { extensions: string }).extensions)
    expect(extensions.sort()).toEqual(['all', 'base'])
  })

  it('映射实况与今日夜间', async () => {
    const weather = await amapWeatherProvider.getWeather({ adcode: '350211' })

    expect(weather?.condition).toBe('shower')
    expect(weather?.temperatureC).toBe(27)
    expect(weather?.humidity).toBe(82)
    expect(weather?.reportTime).toBe('2026-09-19 09:12:00')
    // casts 里第二个是明天 —— 不能拿明天的夜间当今天的
    expect(weather?.tonight).toEqual({
      condition: 'cloudy',
      conditionText: '多云',
      temperatureC: 24,
    })
  })

  it('实况挂了就没有这一整块，不拿预报的白天温度顶替「现在几度」', async () => {
    amapGet.mockImplementation(async (_path: string, params: Record<string, string>) =>
      (params.extensions === 'all' ? FORECAST : { lives: [] }) as never,
    )

    expect(await amapWeatherProvider.getWeather({ adcode: '350211' })).toBeNull()
  })

  it('预报挂了照样出实况，只是少说一句夜间', async () => {
    amapGet.mockImplementation(async (_path: string, params: Record<string, string>) => {
      if (params.extensions === 'all') throw new Error('当天预报额度用完了')
      return LIVE as never
    })

    const weather = await amapWeatherProvider.getWeather({ adcode: '350211' })
    expect(weather?.temperatureC).toBe(27)
    expect(weather?.tonight).toBeNull()
  })

  it('两次都失败返回 null，不把错误抛进推荐流程', async () => {
    amapGet.mockRejectedValue(new Error('限流了'))
    expect(await amapWeatherProvider.getWeather({ adcode: '350211' })).toBeNull()
  })

  it('字段名是 forecast 而不是 forecasts 时也能取到夜间', async () => {
    amapGet.mockImplementation(async (_path: string, params: Record<string, string>) =>
      (params.extensions === 'all'
        ? { forecast: FORECAST.forecasts }
        : LIVE) as never,
    )

    const weather = await amapWeatherProvider.getWeather({ adcode: '350211' })
    expect(weather?.tonight?.temperatureC).toBe(24)
  })
})
