// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach } from 'vitest'
import type { Weather } from '@/lib/core/weather'
import WeatherOverlay from './WeatherOverlay'

afterEach(cleanup)

const BASE: Weather = {
  city: '厦门市',
  adcode: '350211',
  condition: 'sunny',
  conditionText: '晴',
  temperatureC: 28,
  tonight: null,
  reportTime: '2026-09-19 09:12:00',
}

function sky(container: HTMLElement) {
  return container.querySelector<HTMLElement>('.weather-sky')
}

describe('WeatherOverlay', () => {
  it('晴天出太阳层', () => {
    const { container } = render(<WeatherOverlay weather={BASE} />)
    expect(sky(container)?.dataset.kind).toBe('sun')
  })

  it('雨按强度分级，级别喂给 CSS 决定下多大', () => {
    const { container: light } = render(
      <WeatherOverlay weather={{ ...BASE, condition: 'shower', conditionText: '阵雨' }} />,
    )
    expect(sky(light)?.dataset.kind).toBe('rain')
    expect(sky(light)?.dataset.level).toBe('1')

    const { container: heavy } = render(
      <WeatherOverlay weather={{ ...BASE, condition: 'storm', conditionText: '暴雨' }} />,
    )
    expect(sky(heavy)?.dataset.level).toBe('3')
  })

  it('霾算云雾那一层，不许画成晴', () => {
    const { container } = render(
      <WeatherOverlay weather={{ ...BASE, condition: 'fog', conditionText: '中度霾' }} />,
    )
    expect(sky(container)?.dataset.kind).toBe('cloud')
  })

  it('认不出的天气不出蒙版', () => {
    const { container } = render(
      <WeatherOverlay weather={{ ...BASE, condition: 'unknown', conditionText: '冻雨' }} />,
    )
    expect(sky(container)).toBeNull()
  })

  it('没取到天气时也不出', () => {
    const { container } = render(<WeatherOverlay weather={null} />)
    expect(sky(container)).toBeNull()
  })

  it('蒙版对辅助技术是隐的，也只是装饰', () => {
    const { container } = render(<WeatherOverlay weather={BASE} />)
    expect(sky(container)?.getAttribute('aria-hidden')).toBe('true')
  })

  it('雨是前后两层，纵深由 CSS 的速度差给', () => {
    const { container } = render(
      <WeatherOverlay weather={{ ...BASE, condition: 'rain', conditionText: '中雨' }} />,
    )
    expect(container.querySelectorAll('.weather-sky__rain--far')).toHaveLength(1)
    expect(container.querySelectorAll('.weather-sky__rain--near')).toHaveLength(1)
  })

  it('只有原文带「雷」的天气才闪', () => {
    const { container: thunder } = render(
      <WeatherOverlay weather={{ ...BASE, condition: 'storm', conditionText: '雷阵雨' }} />,
    )
    expect(sky(thunder)?.dataset.thunder).toBe('on')
  })

  it('「暴雨」也归 storm，但它不闪 —— 没有雷就不许替它打雷', () => {
    const { container } = render(
      <WeatherOverlay weather={{ ...BASE, condition: 'storm', conditionText: '暴雨' }} />,
    )
    expect(sky(container)?.dataset.thunder).toBeUndefined()
  })

  it('晴和雪都不通电', () => {
    const { container: sun } = render(<WeatherOverlay weather={BASE} />)
    expect(sky(sun)?.dataset.thunder).toBeUndefined()

    const { container: snow } = render(
      <WeatherOverlay weather={{ ...BASE, condition: 'snow', conditionText: '小雪' }} />,
    )
    expect(sky(snow)?.dataset.thunder).toBeUndefined()
  })

  it('天空本体是单独一层，任何天气都得有 —— 少了它，雨丝就只是白纸上的纹理', () => {
    for (const w of [
      BASE,
      { ...BASE, condition: 'rain', conditionText: '中雨' },
      { ...BASE, condition: 'snow', conditionText: '小雪' },
      { ...BASE, condition: 'fog', conditionText: '雾' },
      { ...BASE, condition: 'storm', conditionText: '雷阵雨' },
    ] as Weather[]) {
      const { container } = render(<WeatherOverlay weather={w} />)
      expect(container.querySelectorAll('.weather-sky__sky')).toHaveLength(1)
      cleanup()
    }
  })

  it('昼夜喂给 CSS 决定天空配色，且只取这三个值', () => {
    const { container } = render(<WeatherOverlay weather={BASE} />)
    expect(['day', 'dusk', 'night']).toContain(sky(container)?.dataset.day)
  })
})
