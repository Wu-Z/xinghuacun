// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Weather } from '@/lib/core/weather'
import WeatherBar from './WeatherBar'

const BASE: Weather = {
  city: '厦门市',
  adcode: '350211',
  condition: 'sunny',
  conditionText: '晴',
  temperatureC: 28,
  humidity: 60,
  windDirection: '东南风',
  windPower: '3',
  tonight: null,
  reportTime: '2026-09-19 09:12:00',
}

describe('WeatherBar', () => {
  it('温度、天气、风、更新时间都要出现', () => {
    render(<WeatherBar weather={BASE} />)

    expect(screen.getByText(/28°/)).toBeTruthy()
    expect(screen.getByText(/东南风 3 级/)).toBeTruthy()
    expect(screen.getByText('09:12')).toBeTruthy()
  })

  it('夜里还是同一个天气时不占版面', () => {
    render(
      <WeatherBar
        weather={{ ...BASE, tonight: { condition: 'sunny', conditionText: '晴', temperatureC: 22 } }}
      />,
    )

    expect(screen.queryByText(/夜间转/)).toBeNull()
  })

  it('夜里变天才说一句', () => {
    render(
      <WeatherBar
        weather={{
          ...BASE,
          tonight: { condition: 'shower', conditionText: '阵雨', temperatureC: 23 },
        }}
      />,
    )

    expect(screen.getByText(/夜间转阵雨 23°/)).toBeTruthy()
  })

  it('拿不到天气就什么都不渲染', () => {
    const { container } = render(<WeatherBar weather={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('认不出的天气照样显示数据源的原话，不替它改名', () => {
    render(<WeatherBar weather={{ ...BASE, condition: 'unknown', conditionText: '扬沙' }} />)
    expect(screen.getByText(/扬沙/)).toBeTruthy()
  })
})
