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

  it('绝对地址一律不挂令牌', () => {
    // 这条以前是反过来的（旧版本会往绝对地址上也挂令牌，还配了个测试「也吃绝对地址」）。
    // 那等于埋了个雷：这个函数的入参只要有一次来自外部数据 ——
    // 比如哪天有人写 withToken(place.amapUrl) —— 全站令牌就被送到别人服务器上，
    // 而且是静默的，因为链接照样能打开。
    expect(withToken('https://x.dev/plan', 'abc123')).toBe('https://x.dev/plan')
    expect(withToken('https://uri.amap.com/search?keyword=x', 'abc123')).toBe(
      'https://uri.amap.com/search?keyword=x',
    )
  })

  it('协议相对地址也不挂 —— //evil.com/x 会被浏览器当成别的域', () => {
    expect(withToken('//evil.com/x', 'abc123')).toBe('//evil.com/x')
  })

  it('不是路径的东西原样返回', () => {
    expect(withToken('javascript:alert(1)', 'abc123')).toBe('javascript:alert(1)')
    expect(withToken('', 'abc123')).toBe('')
  })
})
