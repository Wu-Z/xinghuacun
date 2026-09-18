'use client'

import type { Poi, Route } from '@/lib/core/model'

type Props = { selectedOrder: string[]; pois: Poi[]; route: Route | null }

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

/** 地图最上层的路径图：「1 → 2 → 4」 */
export default function RouteSummaryBar({ selectedOrder, pois, route }: Props) {
  if (selectedOrder.length < 2) return null

  const orderText = selectedOrder
    .map((id, index) => `${index + 1}. ${pois.find((p) => p.id === id)?.name ?? id}`)
    .join(' → ')

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
      <div className="mx-auto max-w-2xl rounded-xl bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <div className="text-sm font-medium text-slate-900">
          {selectedOrder.map((_, i) => i + 1).join(' → ')}
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{orderText}</div>
        {route && (
          <div className="mt-1 text-xs text-slate-600">
            全程 {formatDuration(route.totalDurationSeconds)} ·{' '}
            {(route.totalDistanceMeters / 1000).toFixed(1)} 公里
          </div>
        )}
      </div>
    </div>
  )
}
