import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'
import { config, proxy } from './proxy'

const ORIGINAL = process.env.SITE_TOKEN

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SITE_TOKEN
  else process.env.SITE_TOKEN = ORIGINAL
})

function call(path: string, token?: string) {
  // 注意别写成 `process.env.SITE_TOKEN = token` —— Node 会把 undefined
  // 强制转成字符串 "undefined"，于是「没配」变成「配了个叫 undefined 的令牌」，
  // 503 那条断言就永远测不到真实情况。
  if (token === undefined) delete process.env.SITE_TOKEN
  else process.env.SITE_TOKEN = token
  return proxy(new NextRequest(new URL(path, 'https://xinghuacun.test')))
}

describe('proxy 的 token 门', () => {
  it('没配 SITE_TOKEN 时拒绝所有访问 —— 宁可全站不可用，也不要静默放行', () => {
    const res = call('/', undefined)
    expect(res.status).toBe(503)
  })

  it('没配 SITE_TOKEN 时连带对了 token 的请求也不放行', () => {
    // 没有基准值就无所谓「对」，此时任何放行都是误放
    const res = call('/?token=随便什么', undefined)
    expect(res.status).toBe(503)
  })

  it('token 正确时放行', () => {
    const res = call('/?token=s3cret', 's3cret')
    expect(res.status).toBe(200)
  })

  it('token 不对时 401', () => {
    expect(call('/?token=wrong', 's3cret').status).toBe(401)
    expect(call('/?token=s3cretX', 's3cret').status).toBe(401)
    expect(call('/?token=S3CRET', 's3cret').status).toBe(401)
  })

  it('完全没有 token 参数时 401', () => {
    expect(call('/', 's3cret').status).toBe(401)
  })

  it('空 token 时 401 —— 不能把「参数存在」当成「验证通过」', () => {
    expect(call('/?token=', 's3cret').status).toBe(401)
  })

  it('长度不同的 token 返回 401 而不是抛异常', () => {
    // 直接拿两个不等长的 buffer 喂 timingSafeEqual 会 throw；
    // 先各自摘要成 32 字节再比，就没有这个问题，也不泄露长度
    expect(call('/?token=a', '一个长得多的令牌').status).toBe(401)
  })

  it('API 路由同样要过门 —— 门不能只挡页面', () => {
    expect(call('/api/recommend', 's3cret').status).toBe(401)
    expect(call('/api/recommend?token=s3cret', 's3cret').status).toBe(200)
    expect(call('/api/amap-service/v3/geocode/regeo', 's3cret').status).toBe(401)
  })
})

describe('matcher', () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`)
  const runs = (path: string) => pattern.test(path)

  it('_AMapService 不经 proxy —— 高德 SDK 自己发请求，挂不上 token', () => {
    expect(runs('/_AMapService/v3/geocode/regeo')).toBe(false)
    expect(runs('/_AMapService/v4/map/styles')).toBe(false)
  })

  it('页面与 API 都要过门', () => {
    expect(runs('/')).toBe(true)
    expect(runs('/plan')).toBe(true)
    expect(runs('/api/recommend')).toBe(true)
    expect(runs('/api/weather')).toBe(true)
  })

  it('Next 自己的静态资源不过门 —— 否则 CSS/JS 一起被 401，页面白屏', () => {
    expect(runs('/_next/static/chunks/main.js')).toBe(false)
    expect(runs('/_next/image')).toBe(false)
    expect(runs('/favicon.ico')).toBe(false)
  })

  it('public 里的静态文件不过门', () => {
    expect(runs('/vercel.svg')).toBe(false)
    expect(runs('/globe.svg')).toBe(false)
  })
})
