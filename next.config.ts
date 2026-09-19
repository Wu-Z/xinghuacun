import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * 把高德 JS key 送到浏览器。
   *
   * 高德 JS API 必须拿着这个 key 在浏览器里加载 SDK，所以它躲不开「会进浏览器产物」
   * 这件事 —— 保护它的是高德控制台的**域名白名单**，不是保密。
   *
   * 那为什么不直接用 `NEXT_PUBLIC_` 前缀？因为 Vercel 的环境变量面板不接受那个名字
   * （报「变量名是保留字」）。next.config 的 env 段是官方文档里另一条下发路径，
   * 它不要求前缀 —— 文档原话是「environment variables specified in this way will
   * always be included in the JavaScript bundle」。
   *
   * 注：这里和 `NEXT_PUBLIC_` 一样是**构建期内联**，改了要重新部署才生效。
   * 注：`?? ''` 不能省。留 undefined 的话 Next 会把字符串 "undefined" 写进产物，
   *     loader 里那句 `if (!key)` 就永远不成立，报错也跟着变成误导的。
   */
  env: {
    AMAP_JS_KEY: process.env.AMAP_JS_KEY ?? '',
  },

  // 左下角那个圆形开发角标。它正好压在首页内容的左下方，看着像页面自己的按钮，关掉。
  // 编译错误与运行时错误照样会浮出来，只是不显示平时那个常驻角标。
  devIndicators: false,

  async rewrites() {
    return [
      {
        // 高德 JS API 强制要求安全密钥代理的一级路由是 _AMapService。
        // 而 App Router 会把 `_` 开头的目录当 private folder 排除，直接建目录拿不到路由，
        // 所以真实路由在 /api/amap-service，这里做一层映射。
        // rewrite 发生在文件系统路由之前，不受 private folder 规则影响。
        source: '/_AMapService/:path*',
        destination: '/api/amap-service/:path*',
      },
    ]
  },
}

export default nextConfig
