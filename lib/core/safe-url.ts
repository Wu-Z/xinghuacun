/**
 * 高德链接的白名单校验。
 *
 * 为什么必须做：`amapUrl` 来自 LLM 输出，而 skill 被要求联网检索，
 * 于是恶意网页可以通过提示词注入把 `javascript:...` 塞进这个字段。
 * 它最终会渲染成 `<a href>`，用户一点就执行 —— 这是一条完整的
 * 「提示词注入 → XSS」链路，不是理论风险。
 *
 * 两道防线都用这个函数：服务端在 schema 校验时挡一次，
 * 客户端在渲染 href 之前再挡一次（纵深防御，也防后端被绕过）。
 */
export function isSafeAmapUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  // 只收 https：高德支持 https，收 http 只会白白放宽攻击面
  if (url.protocol !== 'https:') return false

  // 不能只写 endsWith('amap.com') —— 那样 `amap.com.evil.com` 会被放过
  const host = url.hostname.toLowerCase()
  return host === 'amap.com' || host.endsWith('.amap.com')
}
