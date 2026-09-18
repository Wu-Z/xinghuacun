'use client'

import type { PoiDetail } from '@/lib/core/model'

type Props = {
  detail: PoiDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
}

/** 停靠点详情：贴在侧栏底部，因为它描述的是列表里被点开的那一项 */
export default function StopDetail({ detail, loading, error, onClose }: Props) {
  if (!detail && !loading && !error) return null

  return (
    <div className="absolute inset-x-0 bottom-0 border-t border-line bg-paper shadow-[0_-8px_24px_-12px_rgba(18,23,28,0.25)]">
      <div className="flex items-start gap-3 px-4 pb-2 pt-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {detail?.name ?? '加载中…'}
        </h2>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="-mr-1 shrink-0 rounded px-2 py-0.5 text-xs text-ink-soft hover:bg-mist hover:text-ink"
        >
          关闭
        </button>
      </div>

      {loading && <p className="px-4 pb-4 text-sm text-ink-soft">正在加载…</p>}
      {error && <p className="px-4 pb-4 text-sm text-red-700">{error}</p>}

      {detail && (
        <div className="px-4 pb-4">
          <div className="text-xs text-ink-soft">
            建议停留{' '}
            <span className="tnum font-medium text-ink">{detail.suggestedDurationMinutes}</span> 分钟
          </div>

          <ul className="mt-3 divide-y divide-line border-y border-line">
            {detail.activities.map((a) => (
              <li key={a.title} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-ink">{a.title}</span>
                <span className="tnum shrink-0 text-xs text-ink-soft">{a.durationMinutes} 分钟</span>
              </li>
            ))}
          </ul>

          {/* 必须说清楚这是推导值，不能让用户当成权威信息 */}
          <p className="mt-3 text-xs text-ink-soft/70">游玩项目按地点类别推导，仅供参考</p>
        </div>
      )}
    </div>
  )
}
