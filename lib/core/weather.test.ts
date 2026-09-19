import { describe, expect, it } from 'vitest'
import type { Weather } from './weather'
import {
  describeTonight,
  describeWeather,
  normalizeCondition,
  overlayKind,
  rainLevel,
  splitWeather,
} from './weather'

describe('normalizeCondition', () => {
  it('晴包住晴间多云以外的写法', () => {
    expect(normalizeCondition('晴')).toBe('sunny')
    expect(normalizeCondition('多云')).toBe('cloudy')
    expect(normalizeCondition('晴间多云')).toBe('cloudy')
    expect(normalizeCondition('阴')).toBe('overcast')
  })

  it('雷与暴雨不因为有「雨」字就被降级', () => {
    expect(normalizeCondition('雷阵雨')).toBe('storm')
    expect(normalizeCondition('雷阵雨并伴有冰雹')).toBe('storm')
    expect(normalizeCondition('暴雨')).toBe('storm')
    expect(normalizeCondition('大暴雨')).toBe('storm')
  })

  it('中雨大雨强于小雨', () => {
    expect(normalizeCondition('小雨')).toBe('shower')
    expect(normalizeCondition('阵雨')).toBe('shower')
    expect(normalizeCondition('中雨')).toBe('rain')
    expect(normalizeCondition('大雨')).toBe('rain')
  })

  it('霾与雾归到雾，不许画成晴天', () => {
    expect(normalizeCondition('雾')).toBe('fog')
    expect(normalizeCondition('中度霾')).toBe('fog')
    expect(normalizeCondition('扬沙')).toBe('fog')
  })

  it('认不出来返回 unknown，不兜底成晴', () => {
    expect(normalizeCondition('冰冻')).toBe('unknown')
    expect(normalizeCondition('')).toBe('unknown')
  })
})

describe('rainLevel', () => {
  it('按强度分级', () => {
    expect(rainLevel('shower')).toBe(1)
    expect(rainLevel('rain')).toBe(2)
    expect(rainLevel('storm')).toBe(3)
    expect(rainLevel('sunny')).toBe(0)
  })
})

describe('overlayKind', () => {
  it('认不出的天气不出蒙版', () => {
    expect(overlayKind('unknown')).toBeNull()
    expect(overlayKind('fog')).toBe('cloud')
    expect(overlayKind('sunny')).toBe('sun')
    expect(overlayKind('storm')).toBe('rain')
    expect(overlayKind('snow')).toBe('snow')
  })
})

function weather(over: Partial<Weather> = {}): Weather {
  return {
    city: '厦门市',
    adcode: '350211',
    condition: 'sunny',
    conditionText: '晴',
    temperatureC: 28,
    tonight: null,
    reportTime: '2026-09-19 09:00:00',
    ...over,
  }
}

describe('describeWeather', () => {
  it('拼温度、天气与风', () => {
    expect(describeWeather(weather({ windDirection: '东南风', windPower: '3' }))).toBe(
      '28° 晴 · 东南风 3 级',
    )
  })

  it('缺风向时只留风力', () => {
    expect(describeWeather(weather({ windPower: '2' }))).toBe('28° 晴 · 2 级')
  })

  it('都没给就不留多余的分隔点', () => {
    expect(describeWeather(weather())).toBe('28° 晴')
  })

  it('温度取整，不让 27.6 混进来', () => {
    expect(describeWeather(weather({ temperatureC: 27.6 }))).toBe('28° 晴')
  })
})

describe('describeTonight', () => {
  it('没预报就不说话', () => {
    expect(describeTonight(weather())).toBeNull()
  })

  it('夜里还是同一个天气也不占版面', () => {
    expect(describeTonight(weather({ tonight: { condition: 'sunny', conditionText: '晴', temperatureC: 22 } }))).toBeNull()
  })

  it('变天才说', () => {
    expect(
      describeTonight(
        weather({ tonight: { condition: 'shower', conditionText: '阵雨', temperatureC: 22 } }),
      ),
    ).toBe('夜间转阵雨 22°')
  })
})

describe('splitWeather', () => {
  it('拆成「温度 + 天气」与「风」两段', () => {
    expect(splitWeather(weather({ windDirection: '东南风', windPower: '3' }))).toEqual({
      head: '28° 晴',
      tail: '东南风 3 级',
    })
  })

  it('没风就只有前半段，tail 给 null 而不是空串', () => {
    expect(splitWeather(weather())).toEqual({ head: '28° 晴', tail: null })
  })

  it('只有风级、没有风向时，后半段照样给得出', () => {
    expect(splitWeather(weather({ windPower: '3' })).tail).toBe('3 级')
  })

  it('两段拼回去就是 describeWeather 那一句', () => {
    const w = weather({ windDirection: '东南风', windPower: '3' })
    const { head, tail } = splitWeather(w)

    expect(describeWeather(w)).toBe(`${head} · ${tail}`)
  })
})
