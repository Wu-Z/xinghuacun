import { withToken } from '@/lib/client/auth'

/**
 * 开发时在终端直接把带令牌的地址打出来 —— 免得每次启动都要去 .env.local 里翻那一串。
 *
 * register() 在服务能接请求之前就跑完了，但 Next 会把 stdout 重排一下 ——
 * 实测打印落在 `✓ Ready in …` **之后**，正好是你要找端口的那一眼。
 *
 * 只在 development 下做。生产环境（Vercel）也会跑 register()，
 * 那时候把令牌打进运行日志，等于把门钥匙抄一份贴在门上。
 */
export function register(): void {
  if (process.env.NODE_ENV !== 'development') return

  const token = process.env.SITE_TOKEN
  // 没配令牌时门是关着的（proxy 返回 503），这时候给链接等于骗人
  if (!token) return

  // next dev 把实际端口写进了 PORT —— 显式 -p 和默认 3000 都是
  const port = process.env.PORT || '3000'
  const url = withToken(`http://localhost:${port}/`, token)

  console.log(`\n  带令牌的地址（本地开发直接开这个）：\n  ${url}\n`)
}
