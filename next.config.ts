import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
