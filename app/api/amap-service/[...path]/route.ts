import { isAllowedAmapProxyPath } from '@/lib/providers/amap-service-proxy'

const UPSTREAM = 'https://restapi.amap.com'

/**
 * 高德 JS API 的 serviceHost 代理。
 * 安全密钥只在这里被追加，浏览器永远拿不到它。
 *
 * 路径不能叫 _AMapService —— App Router 会把下划线开头的目录当 private folder，
 * 直接排除在路由之外，那样这个代理根本不会生成。
 *
 * 它是一个凭证放大器：任何能访问到它的人都能借我们的 jscode 去调高德，
 * 额度记在我们账上。而且 proxy.ts 的 token 门**挡不住它** ——
 * 请求是高德 SDK 自己发的（serviceHost 只能是主机前缀，拼不了查询串），
 * 所以那道门只能把这个路径排除在外。于是白名单成了它唯一的限制，
 * 名单和实测方法见 lib/providers/amap-service-proxy.ts。
 */
async function forward(req: Request, path: string[]): Promise<Response> {
  if (!isAllowedAmapProxyPath(path)) {
    // 先判后转。绝不能先转发再检查 —— 那样额度已经花出去了
    return new Response('该路径不在高德代理白名单内', { status: 403 })
  }

  const code = process.env.AMAP_JS_SECURITY_CODE
  if (!code) return new Response('未配置 AMAP_JS_SECURITY_CODE', { status: 500 })

  const incoming = new URL(req.url)
  const target = new URL(`/${path.join('/')}`, UPSTREAM)
  incoming.searchParams.forEach((value, key) => target.searchParams.set(key, value))
  target.searchParams.set('jscode', code)

  const isPost = req.method === 'POST'
  const upstream = await fetch(target, {
    method: req.method,
    headers: isPost ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
    body: isPost ? await req.text() : undefined,
    cache: 'no-store',
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return forward(req, path)
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return forward(req, path)
}
