import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
