import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { register } from './instrumentation'

let log: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  log.mockRestore()
  // NODE_ENV 在 @types/node 里是只读的，直接赋值过不了 tsc；
  // stubEnv 既绕开这一点，也会在 unstubAllEnvs 时把原值还回去
  vi.unstubAllEnvs()
})

function output(): string {
  return log.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')
}

describe('启动时打印带 token 的链接', () => {
  it('开发环境打印出可直接打开的链接', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SITE_TOKEN', 'abc123')
    vi.stubEnv('PORT', '3111')

    register()

    expect(output()).toContain('http://localhost:3111/?token=abc123')
  })

  it('没传端口时按 3000 算', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SITE_TOKEN', 'abc123')
    vi.stubEnv('PORT', undefined)

    register()

    expect(output()).toContain('http://localhost:3000/?token=abc123')
  })

  it('生产环境一个字都不打印 —— 否则 token 会进 Vercel 的运行日志', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SITE_TOKEN', 'abc123')
    vi.stubEnv('PORT', '3000')

    register()

    expect(log).not.toHaveBeenCalled()
  })

  it('没配 SITE_TOKEN 时不打印 —— 此时门是关的（503），给出链接等于骗人', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SITE_TOKEN', undefined)

    register()

    expect(log).not.toHaveBeenCalled()
  })

  it('打印出来的链接里不能出现没编码的 token —— 否则拼出来的地址是坏的', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SITE_TOKEN', 'a&b=c')
    vi.stubEnv('PORT', '3000')

    register()

    expect(output()).toContain('http://localhost:3000/?token=a%26b%3Dc')
  })
})
