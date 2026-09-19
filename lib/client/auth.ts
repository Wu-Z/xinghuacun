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
 * 只往「本站的相对路径」上挂令牌：必须以单个 `/` 开头。
 *
 * 绝对地址一律原样返回。这条限制看着碍事，但它是这个函数唯一的安全边界 ——
 * 它接的是一段 URL，而应用里到处是外部链接（place.amapUrl、uri.amap.com 那些）。
 * 只要哪天有人写 `withToken(place.amapUrl)`，全站令牌就被送到高德服务器上，
 * 而且**不会有任何报错**：链接照样能打开，只是钥匙已经交出去了。
 *
 * `//evil.com/x` 也要挡：协议相对地址在浏览器里是另一个域，不是本站路径。
 */
export function withToken(path: string, token: string = currentToken()): string {
  if (!token) return path
  if (!path.startsWith('/') || path.startsWith('//')) return path

  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}${PARAM}=${encodeURIComponent(token)}`
}
