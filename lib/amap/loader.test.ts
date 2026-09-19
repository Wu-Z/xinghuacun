// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAmap } from './loader'

const ORIGINAL = process.env.AMAP_JS_KEY

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AMAP_JS_KEY
  else process.env.AMAP_JS_KEY = ORIGINAL

  // 加载器把它们挂在 window 上，用例之间要擦干净，否则会互相影响
  delete (window as unknown as Record<string, unknown>).AMap
  delete (window as unknown as Record<string, unknown>)._AMapSecurityConfig
})

describe('loadAmap 缺 key 时', () => {
  it('报的是新变量名 AMAP_JS_KEY', async () => {
    // 报错文案是运维唯一的线索 —— 它要是还写着旧名字，
    // 人在 Vercel 上就会去配一个已经没人读的变量，然后地图继续空白
    delete process.env.AMAP_JS_KEY

    // 必须锚在「未配置」后面：写成 /AMAP_JS_KEY/ 的话，
    // 旧文案 `未配置 NEXT_PUBLIC_AMAP_JS_KEY` 也能匹配上，这条就白写了
    await expect(loadAmap()).rejects.toThrow(/未配置 AMAP_JS_KEY/)
  })

  it('报错里不再出现 NEXT_PUBLIC_', async () => {
    delete process.env.AMAP_JS_KEY

    await expect(loadAmap()).rejects.not.toThrow(/NEXT_PUBLIC_/)
  })

  it('缺 key 时不留半截状态：再调一次仍然是「缺 key」这个错', async () => {
    // 加载器有个模块级的 loading 缓存。缺 key 时若把它设成了 rejected promise，
    // 后面即使把 key 配上，这一次会话也再也加载不出地图了
    delete process.env.AMAP_JS_KEY
    await expect(loadAmap()).rejects.toThrow(/未配置 AMAP_JS_KEY/)
    await expect(loadAmap()).rejects.toThrow(/未配置 AMAP_JS_KEY/)
  })

  it('安全密钥的代理地址在缺 key 之前就已经设好', async () => {
    // _AMapSecurityConfig 必须在 SDK 脚本加载之前赋值，晚一步就不生效。
    // 这里钉住它确实是在读 key 之前写的
    delete process.env.AMAP_JS_KEY

    await expect(loadAmap()).rejects.toThrow()

    const config = (window as unknown as { _AMapSecurityConfig?: { serviceHost?: string } })
      ._AMapSecurityConfig
    expect(config?.serviceHost).toContain('/_AMapService')
  })
})

describe('loadAmap 读到新变量名时', () => {
  it('能往下走到底，不再报缺 key', async () => {
    /*
     * 这条是补一个洞：上面几条只断言**报错文案**，而两个变量名在测试环境里
     * 都是空的，报出来的错一模一样 —— 把 loader 改回读 NEXT_PUBLIC_AMAP_JS_KEY、
     * 只留新文案，上面那几条照样全绿，而线上地图会静默地不加载。
     * 只有「配上了就真的能往下走」能测出它读的是哪个变量。
     *
     * 要 resetModules + 动态 import：loader 有个模块级的 loading 缓存，
     * 而 vi.doMock 只对之后的 import 生效。
     */
    vi.resetModules()
    vi.doMock('@amap/amap-jsapi-loader', () => ({
      default: { load: () => Promise.resolve({ __fakeAmap: true }) },
    }))
    process.env.AMAP_JS_KEY = 'a-key'

    const { loadAmap: freshLoad } = await import('./loader')

    await expect(freshLoad()).resolves.toEqual({ __fakeAmap: true })
  })
})
