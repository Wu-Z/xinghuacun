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

export function withToken(path: string, token: string = currentToken()): string {
  if (!token) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}${PARAM}=${encodeURIComponent(token)}`
}
