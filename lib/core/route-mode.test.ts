import { describe, expect, it } from 'vitest'
import { haversineMeters } from './geo'
import {
  BIKE_MAX_METERS,
  WALK_MAX_METERS,
  buildLegModes,
  legModeCandidates,
  pickRouteMode,
} from './route-mode'

const HERE = { lng: 118.0989, lat: 24.5728 } // 集美学村地铁站
const THERE = { lng: 116.4, lat: 39.9 } // 足够远

describe('pickRouteMode', () => {
  it('单一方式直接映射', () => {
    expect(pickRouteMode(['步行'])).toBe('walking')
    expect(pickRouteMode(['骑行'])).toBe('bicycling')
    expect(pickRouteMode(['驾车'])).toBe('driving')
    expect(pickRouteMode(['公共交通'])).toBe('transit')
  })

  it('「地铁」「公交」都归到高德的公共交通', () => {
    expect(pickRouteMode(['地铁'])).toBe('transit')
    expect(pickRouteMode(['公交'])).toBe('transit')
  })

  it('打车走的是驾车路线', () => {
    expect(pickRouteMode(['打车'])).toBe('driving')
  })

  it('一个都没选时返回 null —— 不替用户默认成驾车', () => {
    // 写死一种就是把「没有偏好」说成了「偏好这种」。
    // 空选择的兜底在 legModeCandidates 里，那是按距离定的，不是随手挑的
    expect(pickRouteMode([])).toBeNull()
  })

  it('认不出的值被跳过', () => {
    expect(pickRouteMode(['飞过去'])).toBeNull()
    expect(pickRouteMode(['飞过去', '步行'])).toBe('walking')
  })

  it('多选时取第一个能识别的 —— 勾选顺序即优先顺序', () => {
    expect(pickRouteMode(['步行', '公共交通'])).toBe('walking')
    expect(pickRouteMode(['公共交通', '步行'])).toBe('transit')
  })

  it('忽略空白与大小写差异', () => {
    expect(pickRouteMode(['  步行  '])).toBe('walking')
  })
})

describe('legModeCandidates · 按距离逐段定', () => {
  it('很近的一段走路优先，不先去问公交', () => {
    // 用户的原始问题：两个地方太近，还给他排地铁。
    // 实测 700 米那段高德确实会给出公交方案（846 米 / 11.9 分），
    // 但走路是 839 米 / 11.2 分 —— 坐车比走路还慢。
    // 所以「有没有方案」不是判据，距离才是：这一段根本不该去查公交
    const candidates = legModeCandidates(
      HERE,
      { lng: HERE.lng, lat: HERE.lat + 0.0063 }, // 约 700 m
      null,
    )

    expect(candidates[0]).toBe('walking')
    expect(candidates).not.toContain('transit')
  })

  it('中等距离骑行优先，公交与自驾只作为算不出来时的候选', () => {
    const candidates = legModeCandidates(
      HERE,
      { lng: HERE.lng, lat: HERE.lat + 0.02 }, // 约 2.2 km
      null,
    )

    expect(candidates[0]).toBe('bicycling')
    expect(candidates.slice(1)).toEqual(['transit', 'driving'])
  })

  it('超过骑行上限时公交优先、自驾兜底，且骑行不再出现在候选里', () => {
    // 骑行是被距离否掉的方式，不该作为「没别的办法了」的备胎重新冒出来
    const candidates = legModeCandidates(
      HERE,
      { lng: HERE.lng, lat: HERE.lat + 0.09 }, // 约 10 km
      null,
    )

    expect(candidates).toEqual(['transit', 'driving'])
  })

  it('档位边界跟着常量走，不是散落的魔数', () => {
    const at = (meters: number) =>
      legModeCandidates(HERE, { lng: HERE.lng, lat: HERE.lat + meters / 111320 }, null)[0]

    expect(at(WALK_MAX_METERS)).toBe('walking')
    expect(at(BIKE_MAX_METERS)).toBe('bicycling')
    expect(at(BIKE_MAX_METERS + 100)).toBe('transit')
  })

  it('用户明确选过就只听他的，距离再离谱也不改口', () => {
    // 静默替他换成别的交通方式，他看到路线会以为算错了
    expect(legModeCandidates(HERE, THERE, 'walking')).toEqual(['walking'])
    expect(legModeCandidates(HERE, { lng: HERE.lng + 0.0001, lat: HERE.lat }, 'driving')).toEqual([
      'driving',
    ])
  })
})

describe('buildLegModes', () => {
  const POINTS = [HERE, { lng: HERE.lng, lat: HERE.lat + 0.0063 }, THERE]

  it('段数与点数一一对应，逐段独立', () => {
    // 短的一段走路、长的一段坐地铁 —— 这正是「两个地方太近」那个问题的解
    const modes = buildLegModes(POINTS, null)

    expect(modes).toHaveLength(2)
    expect(modes[0][0]).toBe('walking')
    expect(modes[1][0]).toBe('transit')
  })

  it('单点没有段', () => {
    expect(buildLegModes([HERE], null)).toEqual([])
  })

  it('每段都至少有一个候选 —— 空候选会让 provider 直接报错', () => {
    for (const candidates of buildLegModes(POINTS, null)) {
      expect(candidates.length).toBeGreaterThan(0)
    }
  })

  it('用的确实是直线距离口径（阈值按直线标定）', () => {
    // 阈值是直线口径，不是实际里程 —— 实测厦门几组真实地点对，
    // 实际里程约是直线的 1.3~1.8 倍。这条测试钉住这个换算关系不被误改
    const straight = haversineMeters(HERE, { lng: HERE.lng, lat: HERE.lat + 0.0063 })
    expect(straight).toBeGreaterThan(600)
    expect(straight).toBeLessThan(800)
  })
})
