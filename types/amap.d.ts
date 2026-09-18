/* eslint-disable @typescript-eslint/no-explicit-any */
// @amap/amap-jsapi-loader 不自带类型，其类型包版本未经验证，
// 所以本版把 AMap 统一声明为 any，把类型风险关在这一个文件里。
declare global {
  interface Window {
    AMap?: any
    _AMapSecurityConfig?: {
      serviceHost?: string
      securityJsCode?: string
    }
  }
}

export {}
