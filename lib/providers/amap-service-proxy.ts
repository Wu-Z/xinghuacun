/**
 * 高德 JS API 的 serviceHost 代理该放行哪些路径。
 *
 * 这个代理转发时会**追加服务端的 jscode**，所以它是个凭证放大器：
 * 谁能访问到它，谁就能拿我们的安全密钥去调高德，额度记在我们账上。
 * 而 `/_AMapService` 又被 proxy.ts 的 token 门排除在外（高德 SDK 自己发的
 * 请求挂不上 token），所以这道白名单是它唯一的限制。
 *
 * 名单是**实测**出来的，见同名测试里的说明 —— 这个应用真正会走的只有埋点上报那一条。
 *
 * ⚠️ 地图哪天不显示了，先来这儿看。高德加了新的服务调用而没在这里放行，
 * 症状就是地图半死不活，而且请求是 SDK 发的，控制台里看着像是高德自己的问题。
 * 重新实测的办法：开着 dev server 打开地图，然后
 *   performance.getEntriesByType('resource').map(e => e.name)
 *     .filter(u => u.includes('_AMapService')).map(u => new URL(u).pathname)
 */
const ALLOWED = new Set(['v3/log/init'])

export function isAllowedAmapProxyPath(path: string[]): boolean {
  // 逐段比，不做前缀匹配 —— 前缀匹配会把 /v3/log/initX 一起放进来
  const joined = path.join('/')
  if (!ALLOWED.has(joined)) return false

  // ALLOWED 里没有这两个符号，但显式挡掉能防止以后有人往里加路径时
  // 顺手把穿越段放进来
  return !path.some((seg) => seg === '..' || seg === '.')
}
