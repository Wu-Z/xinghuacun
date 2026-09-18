import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

// 数字与拉丁用 Plex：带导视标牌气质，且有真正的等宽数字，不是 Geist/Inter 这类默认脸
const plex = IBM_Plex_Sans({
  variable: '--font-plex',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: '周边去哪',
  description: '按当前位置或地图选点推荐附近去处，并规划路线',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-CN" className={`${plex.variable} h-full`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
