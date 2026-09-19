/**
 * 访问令牌在客户端的两个动作：从地址栏读出来，拼到下一条地址上。
 *
 * token 走 URL 而不是 cookie 是定下来的 —— 这样分享出去的链接直接可用。
 * 代价是每个请求都得自己带上，所以这里必须是拼 token 的唯一出口：
 * 任何一处手写 `?token=`，都会在别人漏带时变成一个静默的 401。
 */

const PARAM = 'token'

export function currentToken(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(PARAM) ?? ''
}

/**
 * 判定来源用的基准，不需要是真的 —— 我们只拿它比对「解析出来的来源是不是同一个」，
 * 相对路径一定会落在它上面，绝对地址一定会离开它。
 */
const BASE_ORIGIN = 'http://localhost'

/**
 * 只往「本站的相对路径」上挂令牌。
 *
 * 这条限制看着碍事，但它是这个函数唯一的安全边界 —— 它接的是一段 URL，
 * 而应用里到处是外部链接（place.amapUrl、uri.amap.com 那些）。只要哪天有人写
 * `withToken(place.amapUrl)`，全站令牌就被送到别人服务器上，而且**不会有任何报错**：
 * 链接照样能打开，只是钥匙已经交出去了。
 *
 * 两道判断，缺一不可：
 *   1. 形状上必须是本站路径（以 `/` 开头）—— 挡掉绝对地址与 `javascript:` 之类。
 *   2. 再交给 URL 解析确认来源。
 *
 * 第 2 道不是多余的。URL 标准规定 http/https 这类特殊 scheme 里 `\` 与 `/` 等价，
 * 所以 `/` 后面跟一个 `\`（或一个换行，解析时会先被去掉）就等于 `//`，
 * 会切到 authority 解析 —— `/` + `\` + `evil.com/x` 指向的是 evil.com。
 * 字符串前缀检查对这种情况完全看不出异常，实测：
 *   new URL('/\\evil.com/x', 'http://localhost').origin === 'http://evil.com'
 */
export function withToken(path: string, token: string = currentToken()): string {
  if (!token) return path
  if (!path.startsWith('/')) return path

  let origin: string
  try {
    origin = new URL(path, BASE_ORIGIN).origin
  } catch {
    // 解析不了（比如单独一个 `/\`）就当它不是本站路径。
    // 这不是吞错：挂不上令牌是安全的默认，而这个函数在渲染路径上，
    // 抛出去换来的是整个页面白屏，代价比「这个链接要重开一次」大得多。
    return path
  }
  if (origin !== BASE_ORIGIN) return path

  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}${PARAM}=${encodeURIComponent(token)}`
}
