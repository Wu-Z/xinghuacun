const BASE = 'https://restapi.amap.com'

/**
 * 高德按「每秒查询数」限流，超限返回 CUQPS_HAS_EXCEEDED_THE_LIMIT。
 * 这是瞬时错误 —— 它是按秒计的，等一会儿就好了，所以值得退避重试。
 * 其他错误（Key 无效、参数错）重试多少次都没用，直接抛。
 */
const RETRYABLE_INFO = new Set(['CUQPS_HAS_EXCEEDED_THE_LIMIT'])
const RETRY_DELAY_MS = 250
const MAX_ATTEMPTS = 2

const DEFAULT_MAX_CONCURRENCY = 3

/**
 * 同时在飞的高德请求上限，见 .env.example 的 AMAP_MAX_CONCURRENCY。
 *
 * 退避重试只是兜底，这道闸门才是主要手段：限流是按秒计的，
 * 一波请求同时撞上去、一起退避、再一起撞，退避救不了这个节奏。
 */
function maxConcurrency(): number {
  const raw = Number(process.env.AMAP_MAX_CONCURRENCY)
  // 没配、配了非数字、配成 0 或负数，一律回到默认值。
  // 这个值一旦是 0，闸门永远不放行 —— 整个核实层会静默卡死，比限流更难查
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_MAX_CONCURRENCY
}

let inFlight = 0
const waiting: Array<() => void> = []

async function acquireSlot(): Promise<void> {
  if (inFlight < maxConcurrency()) {
    inFlight += 1
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
}

function releaseSlot(): void {
  const next = waiting.shift()
  // 名额直接交给队首，不先归还再去竞争 ——
  // 否则中间插进来的请求会把名额抢走，实际并发冲到上限 +1
  if (next) next()
  else inFlight -= 1
}

export class AmapError extends Error {
  readonly info?: string

  constructor(message: string, info?: string) {
    super(message)
    this.name = 'AmapError'
    this.info = info
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  let lastError: AmapError | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await acquireSlot()
      try {
        return await request<T>(url, path)
      } finally {
        // 名额必须在重试的 sleep 之前还回去，否则排队的人要等两倍长
        releaseSlot()
      }
    } catch (error) {
      if (!(error instanceof AmapError) || !error.info || !RETRYABLE_INFO.has(error.info)) {
        throw error
      }
      lastError = error
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS)
    }
  }

  throw lastError ?? new AmapError(`高德接口调用失败（${path}）`)
}

async function request<T>(url: URL, path: string): Promise<T> {
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
