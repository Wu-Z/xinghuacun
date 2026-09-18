const UPSTREAM = 'https://restapi.amap.com'

/**
 * 高德 JS API 的 serviceHost 代理。
 * 安全密钥只在这里被追加，浏览器永远拿不到它。
 *
 * 路径不能叫 _AMapService —— App Router 会把下划线开头的目录当 private folder，
 * 直接排除在路由之外，那样这个代理根本不会生成。
 *
 * 注意：这是一个路径不受限的转发口 —— 任何能访问本站的人都可以借它、用我们的
 * jscode 去调高德。上游被钉死在 restapi.amap.com，所以不是任意 SSRF，
 * 但它确实是个凭证放大器。上生产前应当按 JS API 实际用到的路径加白名单。
 */
async function forward(req: Request, path: string[]): Promise<Response> {
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
