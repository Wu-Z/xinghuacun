import { describe, expect, it } from 'vitest'
import { isSafeAmapUrl } from './safe-url'

describe('isSafeAmapUrl', () => {
  it('接受高德域名下的 https 链接', () => {
    expect(isSafeAmapUrl('https://uri.amap.com/search?keyword=x')).toBe(true)
    expect(isSafeAmapUrl('https://www.amap.com/place/B123')).toBe(true)
    expect(isSafeAmapUrl('https://amap.com/x')).toBe(true)
  })

  it('拒绝 http —— 高德支持 https，没有理由放宽', () => {
    expect(isSafeAmapUrl('http://uri.amap.com/search')).toBe(false)
  })

  it('拒绝 javascript: —— 提示词注入到 XSS 的主路径', () => {
    expect(isSafeAmapUrl('javascript:alert(document.cookie)')).toBe(false)
  })

  it('拒绝 data: 与 vbscript:', () => {
    expect(isSafeAmapUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeAmapUrl('vbscript:msgbox(1)')).toBe(false)
  })

  it('拒绝伪装成高德域名的主机', () => {
    // 朴素的 endsWith('amap.com') 会放过第一个
    expect(isSafeAmapUrl('https://amap.com.evil.com/x')).toBe(false)
    expect(isSafeAmapUrl('https://evil-amap.com/x')).toBe(false)
    expect(isSafeAmapUrl('https://notamap.com/x')).toBe(false)
  })

  it('拒绝其它域名', () => {
    expect(isSafeAmapUrl('https://evil.com/x')).toBe(false)
  })

  it('拒绝不是合法 URL 的输入', () => {
    expect(isSafeAmapUrl('这不是链接')).toBe(false)
    expect(isSafeAmapUrl('//uri.amap.com/x')).toBe(false)
    expect(isSafeAmapUrl('')).toBe(false)
  })

  it('拒绝非字符串输入', () => {
    expect(isSafeAmapUrl(undefined)).toBe(false)
    expect(isSafeAmapUrl(null)).toBe(false)
    expect(isSafeAmapUrl([])).toBe(false)
    expect(isSafeAmapUrl(123)).toBe(false)
  })

  it('大小写不影响判断', () => {
    expect(isSafeAmapUrl('HTTPS://URI.AMAP.COM/x')).toBe(true)
  })
})
