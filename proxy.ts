import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * 全站的访问令牌门。
 *
 * Next 16 把 middleware 改名成了 proxy（功能没变），文件必须在仓库根。
 * 它默认跑在 Node.js runtime 上，所以 node:crypto 可以直接用 ——
 * 也正因为如此，「proxy 里不能写 runtime 配置」这条约束对我们没有影响。
 *
 * 令牌走 URL 而不是 cookie：这样分享出去的链接直接可用，收链接的人不用做任何事。
 * 代价是每个请求都得自己带 —— 客户端那边由 lib/client/auth.ts 的 withToken() 统一拼。
 *
 * 高德 JS API 那条 /_AMapService 不走这里，见下面 matcher 的说明。
 */

const TOKEN_PARAM = 'token'

/**
 * 先把两边各自摘要成 32 字节再比。
 *
 * 直接 timingSafeEqual(given, expected) 在两个长度不同时会抛异常，
 * 而且比较耗时随长度变化 —— 等于把「令牌有多长」这个信息漏出去。
 * 摘要之后长度恒定，两个问题一起没有。
 */
function tokenMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function deny(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export function proxy(request: NextRequest): NextResponse {
  const expected = process.env.SITE_TOKEN

  // 没配就全站拒绝，而不是放行。
  // 配错、忘了配、部署时漏填 —— 这几种情况下「打不开」都比「谁都能进」好收场。
  if (!expected) {
    return deny('未配置 SITE_TOKEN，已拒绝所有访问。', 503)
  }

  const given = request.nextUrl.searchParams.get(TOKEN_PARAM)
  // given 为 null（没这个参数）或空串都走不到放行 —— 「参数存在」不等于「验证通过」
  if (given && tokenMatches(given, expected)) {
    return NextResponse.next()
  }

  return deny('需要访问令牌。请在网址后面加上 ?token=<你的令牌>，再打开一次。', 401)
}

export const config = {
  /**
   * 排除两类路径：
   *
   * 1. Next 自己的静态产物与 public 里的文件 —— 它们一起过门的话，
   *    401 会连 CSS/JS 一起挡掉，页面直接白屏，而且看不出是门的问题。
   *
   * 2. `_AMapService` —— 这是高德 JS API 自己的代理入口，请求由 SDK 内部发出，
   *    **不是我们的代码发的**，所以挂不上 token（serviceHost 只能是主机前缀，
   *    后面拼不了查询串）。这一条不是「忘了管」，是有意留的口子，
   *    由 app/api/amap-service/[...path]/route.ts 里的路径白名单单独收紧。
   *
   * matcher 必须是常量字面量，Next 在构建时静态分析它，写成变量会被忽略。
   */
  matcher: [
    '/((?!_next/static|_next/image|_AMapService|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)',
  ],
}
