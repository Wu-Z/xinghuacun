'use client'

import { isSafeAmapUrl } from '@/lib/core/safe-url'

type Props = { url: string; children: React.ReactNode; className?: string }

/**
 * 渲染高德链接。
 *
 * 服务端已经在 schema 校验时挡过一次，这里再挡一次 —— 客户端组件不该
 * 无条件信任 API 返回的数据。不安全就整个不渲染，而不是渲染一个 href="#"
 * 的假链接（那会让人以为能点）。
 */
export default function AmapLink({ url, children, className }: Props) {
  if (!isSafeAmapUrl(url)) return null

  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className={className}>
      {children}
    </a>
  )
}
