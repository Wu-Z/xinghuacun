const BASE = 'https://restapi.amap.com'

export class AmapError extends Error {
  readonly info?: string

  constructor(message: string, info?: string) {
    super(message)
    this.name = 'AmapError'
    this.info = info
  }
}

/**
 * 只在服务端调用。
 * AMAP_WEB_SERVICE_KEY 绝不允许出现在 'use client' 文件里。
 */
export async function amapGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const key = process.env.AMAP_WEB_SERVICE_KEY
  if (!key) throw new AmapError('未配置 AMAP_WEB_SERVICE_KEY')

  const url = new URL(path, BASE)
  url.searchParams.set('key', key)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new AmapError(`高德接口 HTTP ${res.status}`)

  const data = (await res.json()) as T & { status?: string; info?: string }
  if (data.status !== undefined && data.status !== '1') {
    throw new AmapError(`高德接口返回失败：${data.info ?? '未知原因'}`, data.info)
  }

  return data
}
