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
 *
 * 关于 key 放在查询串：高德 Web 服务 API 只支持 `key` 作为 URL 参数，
 * 没有 header 认证方式，所以这不是可以绕开的选择。
 * 代价是「任何把 url 带进日志或异常的地方都会泄漏 key」，
 * 因此下面所有错误路径都只带 path，绝不带拼好 key 的完整 url。
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

  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store' })
  } catch {
    // 故意丢弃原始 error：它的 message/cause 可能带着含 key 的 url
    throw new AmapError(`无法连接高德接口（${path}）`)
  }

  if (!res.ok) throw new AmapError(`高德接口 HTTP ${res.status}（${path}）`)

  let data: T & { status?: string; info?: string }
  try {
    data = (await res.json()) as T & { status?: string; info?: string }
  } catch {
    throw new AmapError(`高德接口返回了非 JSON 内容（HTTP ${res.status}）`)
  }

  if (data.status !== undefined && data.status !== '1') {
    throw new AmapError(`高德接口返回失败：${data.info ?? '未知原因'}`, data.info)
  }

  return data
}
