import { describe, expect, it } from 'vitest'
import { asText } from './coerce'

describe('asText', () => {
  it('字符串原样返回', () => {
    expect(asText('示例公园')).toBe('示例公园')
  })

  it('数字转成字符串', () => {
    expect(asText(4.5)).toBe('4.5')
  })

  it('数组取第一个', () => {
    expect(asText(['09:00-17:00'])).toBe('09:00-17:00')
  })

  it('空数组给空串 —— 高德就是用 [] 表示「没有值」', () => {
    expect(asText([])).toBe('')
  })

  it('undefined / null 给空串', () => {
    expect(asText(undefined)).toBe('')
    expect(asText(null)).toBe('')
  })

  it('对象给空串而不是 "[object Object]"', () => {
    expect(asText({})).toBe('')
  })

  it('嵌套数组也能收敛', () => {
    expect(asText([['a']])).toBe('a')
  })

  it('数组首元素为空数组时给空串', () => {
    expect(asText([[]])).toBe('')
  })
})
