// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { currentToken, withToken } from './auth'

describe('currentToken', () => {
  it('地址栏里的 token 取得到', () => {
    window.history.replaceState({}, '', '/plan?token=abc123')
    expect(currentToken()).toBe('abc123')
  })

  it('没有 token 时返回空串 —— 本地把门关掉时不该凭空造一个', () => {
    window.history.replaceState({}, '', '/plan')
    expect(currentToken()).toBe('')
  })

  it('?token= 后面是空的时候也算没有', () => {
    window.history.replaceState({}, '', '/plan?token=')
    expect(currentToken()).toBe('')
  })
})

describe('withToken', () => {
  it('路径原本没有查询串时用 ? 接', () => {
    expect(withToken('/plan', 'abc123')).toBe('/plan?token=abc123')
  })

  it('路径已经有查询串时用 & 接 —— 否则会拼出 /x?a=1?token=…，a 的值变成 "1?token=…"', () => {
    expect(withToken('/search?keyword=咖啡', 'abc123')).toBe('/search?keyword=咖啡&token=abc123')
  })

  it('保留原有的查询参数，不覆盖', () => {
    const out = withToken('/search?a=1&b=2', 'abc123')
    const params = new URLSearchParams(out.slice(out.indexOf('?') + 1))
    expect(params.get('a')).toBe('1')
    expect(params.get('b')).toBe('2')
    expect(params.get('token')).toBe('abc123')
  })

  it('没有 token 时原样返回 —— 不能留下一个空的 ?token= 污染地址栏', () => {
    expect(withToken('/plan', '')).toBe('/plan')
    expect(withToken('/search?a=1', '')).toBe('/search?a=1')
  })

  it('token 里的特殊字符要编码 —— 否则 & 会把它截成另一个参数', () => {
    expect(withToken('/plan', 'a&b=c')).toBe('/plan?token=a%26b%3Dc')
  })

  it('也吃绝对地址', () => {
    expect(withToken('https://x.dev/plan', 'abc123')).toBe('https://x.dev/plan?token=abc123')
  })
})
