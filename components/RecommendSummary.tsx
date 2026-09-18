'use client'

import Link from 'next/link'
import type { Preferences } from '@/lib/core/model'

type Props = {
  location: string
  value: Preferences
  onEdit?: () => void
  /** 给了就渲染成链接（跨页返回首页），否则渲染成按钮（同页展开表单） */
  editHref?: string
}

/**
 * 表单收起后的一行摘要。
 *
 * 存在的理由很实际：偏好表单占 560px，会把结果列表挤到只剩 340px。
 * 点完「帮我推荐」后表单的使命就结束了，把空间让给结果。
 */
export default function RecommendSummary({ location, value, onEdit, editHref }: Props) {
  const parts = [
    value.intents.join(' · ') || null,
    value.timeBudget,
    value.travelMode.join(' · ') || null,
  ].filter(Boolean)

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink" title={location}>
          {location}
        </div>
        <div className="mt-1 text-xs text-ink-soft">
          {parts.length > 0 ? parts.join('　|　') : '未设置偏好'}
        </div>
      </div>
      {editHref ? (
        <Link href={editHref} className="shrink-0 text-xs text-jade hover:underline">
          修改
        </Link>
      ) : (
        <button onClick={onEdit} className="shrink-0 text-xs text-jade hover:underline">
          修改
        </button>
      )}
    </div>
  )
}
