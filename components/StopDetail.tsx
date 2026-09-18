'use client'

import type { PoiDetail } from '@/lib/core/model'

type Props = {
  detail: PoiDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
}

export default function StopDetail({ detail, loading, error, onClose }: Props) {
  if (!detail && !loading && !error) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl rounded-t-2xl bg-white p-4 shadow-2xl">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{detail?.name ?? '加载中…'}</h2>
        <button onClick={onClose} className="text-sm text-slate-400" aria-label="关闭">
          关闭
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">正在加载…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {detail && (
        <>
          <p className="text-xs text-slate-500">建议停留 {detail.suggestedDurationMinutes} 分钟</p>

          <ul className="mt-3 space-y-1.5">
            {detail.activities.map((a) => (
              <li key={a.title} className="flex justify-between text-sm">
                <span className="text-slate-800">{a.title}</span>
                <span className="text-slate-400">{a.durationMinutes} 分钟</span>
              </li>
            ))}
          </ul>

          {/* 必须说清楚这是推导值，不能让用户当成权威信息 */}
          <p className="mt-3 text-xs text-slate-400">游玩项目按地点类别推导，仅供参考</p>
        </>
      )}
    </div>
  )
}
