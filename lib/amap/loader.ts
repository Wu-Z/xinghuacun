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

  window._AMapSecurityConfig = {
    serviceHost: `${window.location.origin}/api/amap-service`,
  }

  const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY
  if (!key) return Promise.reject(new Error('未配置 NEXT_PUBLIC_AMAP_JS_KEY'))

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
