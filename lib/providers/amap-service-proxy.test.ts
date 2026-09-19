import { describe, expect, it } from 'vitest'
import { isAllowedAmapProxyPath } from './amap-service-proxy'

/**
 * 这份白名单是**实测**出来的，不是照着高德文档猜的：
 * 开着 dev server 用浏览器打开首页 → 点「地图选点」→ 让地图完全渲染，
 * 然后把 performance 里所有 `/ _AMapService` 请求的 pathname 去重，
 * 结果只有 `/v3/log/init`（SDK 的埋点上报，eventId=resource.load / monitor.cdn）。
 *
 * 瓦片、样式、POI 数据走的是 jsapi.amap.com、jsapi-data*.amap.com、
 * webapi.amap.com，用的是浏览器可见的 JS key，根本不经过这个代理。
 * 所以这里可以收得很紧。
 */

describe('isAllowedAmapProxyPath', () => {
  it('放行实测到的那一条', () => {
    expect(isAllowedAmapProxyPath(['v3', 'log', 'init'])).toBe(true)
  })

  it('拒绝真正花钱的 web 服务接口 —— 这些才是「凭证放大器」的价值所在', () => {
    // 这些接口我们自己的服务端在调（AMAP_WEB_SERVICE_KEY），
    // 不该让任何人借浏览器这条路用 jscode 去白嫖
    expect(isAllowedAmapProxyPath(['v3', 'place', 'text'])).toBe(false)
    expect(isAllowedAmapProxyPath(['v3', 'place', 'around'])).toBe(false)
    expect(isAllowedAmapProxyPath(['v3', 'geocode', 'regeo'])).toBe(false)
    expect(isAllowedAmapProxyPath(['v3', 'direction', 'driving'])).toBe(false)
    expect(isAllowedAmapProxyPath(['v3', 'weather', 'weatherInfo'])).toBe(false)
  })

  it('拒绝模糊搜索式的放行 —— 不能整个 v3 都放', () => {
    expect(isAllowedAmapProxyPath(['v3'])).toBe(false)
    expect(isAllowedAmapProxyPath(['v3', 'log'])).toBe(false)
  })

  it('不靠前缀匹配 —— /v3/log/initX 不是那一条', () => {
    expect(isAllowedAmapProxyPath(['v3', 'log', 'initX'])).toBe(false)
    expect(isAllowedAmapProxyPath(['v3', 'log', 'init', 'extra'])).toBe(false)
  })

  it('大小写不算数 —— 只有小写这一种写法', () => {
    expect(isAllowedAmapProxyPath(['V3', 'log', 'init'])).toBe(false)
    expect(isAllowedAmapProxyPath(['v3', 'LOG', 'init'])).toBe(false)
    expect(isAllowedAmapProxyPath(['v3', 'log', 'INIT'])).toBe(false)
  })

  it('拒绝路径穿越段', () => {
    expect(isAllowedAmapProxyPath(['..', 'v3', 'log', 'init'])).toBe(false)
    expect(isAllowedAmapProxyPath(['v3', 'log', 'init', '..'])).toBe(false)
    expect(isAllowedAmapProxyPath(['.'])).toBe(false)
  })

  it('拒绝空路径', () => {
    expect(isAllowedAmapProxyPath([])).toBe(false)
  })
})
