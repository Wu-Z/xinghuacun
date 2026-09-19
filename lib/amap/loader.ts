/* eslint-disable @typescript-eslint/no-explicit-any */
let loading: Promise<any> | null = null

/**
 * 幂等加载高德 JS API 2.0。
 *
 * 安全密钥不进浏览器：只把 serviceHost 指向本站代理，由服务端追加 jscode。
 * _AMapSecurityConfig 必须在脚本加载前设置好，所以这里在 load 之前赋值。
 */
export function loadAmap(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadAmap 只能在浏览器中调用'))
  }
  if (window.AMap) return Promise.resolve(window.AMap)
  if (loading) return loading

  // serviceHost 的一级路由必须是 _AMapService —— 这不是约定，是 JS API 运行时强校验的。
  // 但 App Router 会把 `_` 开头的目录当 private folder 排除掉，直接建目录拿不到路由，
  // 所以真正的路由挂在 /api/amap-service，由 next.config.ts 的 rewrite 映射过来。
  window._AMapSecurityConfig = {
    serviceHost: `${window.location.origin}/_AMapService`,
  }

  // 名字里没有 NEXT_PUBLIC_ 是故意的：这个值由 next.config.ts 的 env 段下发
  // （Vercel 的环境变量面板不接受 NEXT_PUBLIC_ 开头的名字）。详见那里的注释。
  const key = process.env.AMAP_JS_KEY
  if (!key) return Promise.reject(new Error('未配置 AMAP_JS_KEY'))

  loading = import('@amap/amap-jsapi-loader')
    .then(({ default: AMapLoader }) =>
      AMapLoader.load({ key, version: '2.0', plugins: ['AMap.ToolBar', 'AMap.Scale'] }),
    )
    .then((AMap) => {
      window.AMap = AMap
      return AMap
    })
    .catch((error) => {
      loading = null
      throw error
    })

  return loading
}
