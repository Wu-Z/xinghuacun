import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from './next.config'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('next.config 的 env 段', () => {
  it('把高德 JS key 下发到浏览器，且名字里不带 PUBLIC', () => {
    // 这个 key 必须进浏览器（高德 JS API 用它加载 SDK），
    // 但变量名不能再走 NEXT_PUBLIC_ 前缀那条路
    const env = (nextConfig.env ?? {}) as Record<string, string>
    expect(Object.keys(env)).toContain('AMAP_JS_KEY')
    expect(Object.keys(env).filter((k) => k.includes('PUBLIC'))).toEqual([])
  })

  it('值取自环境变量，不在配置里写死 —— 写死就等于把 key 提交进仓库', async () => {
    vi.stubEnv('AMAP_JS_KEY', 'probe-value-not-a-real-key')
    vi.resetModules()

    const mod = await import('./next.config')
    const env = (mod.default.env ?? {}) as Record<string, string>

    expect(env.AMAP_JS_KEY).toBe('probe-value-not-a-real-key')
  })

  it('环境里没有这个变量时给空串，而不是 undefined', () => {
    // undefined 会被 Next 写成字符串 "undefined" 下发到浏览器，
    // 那样 loader 里的 !key 判断就永远不成立，报错也变成误导的
    const env = (nextConfig.env ?? {}) as Record<string, string>
    expect(typeof env.AMAP_JS_KEY).toBe('string')
  })
})
