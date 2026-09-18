import { describe, expect, it } from 'vitest'
import { pickRouteMode } from './route-mode'

describe('pickRouteMode', () => {
  it('单一方式直接映射', () => {
    expect(pickRouteMode(['步行'])).toBe('walking')
    expect(pickRouteMode(['骑行'])).toBe('bicycling')
    expect(pickRouteMode(['驾车'])).toBe('driving')
    expect(pickRouteMode(['公共交通'])).toBe('transit')
  })

  it('打车走的是驾车路线', () => {
    expect(pickRouteMode(['打车'])).toBe('driving')
  })

  it('空选择回落到驾车', () => {
    expect(pickRouteMode([])).toBe('driving')
  })

  it('认不出的值被跳过', () => {
    expect(pickRouteMode(['飞过去'])).toBe('driving')
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
