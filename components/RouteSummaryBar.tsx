'use client'

import { Fragment } from 'react'
import type { Poi, Route } from '@/lib/core/model'

type Props = { selectedOrder: string[]; pois: Poi[]; route: Route | null }

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

/**
 * 地图最上层的路径图。
 * 这是整个界面唯一的视觉重音 —— 路线顺序是本产品的核心信息。
 * `→` 在这里表示真实顺序，不是装饰。
 */
export default function RouteSummaryBar({ selectedOrder, pois, route }: Props) {
  if (selectedOrder.length < 2) return null

  const names = selectedOrder
    .map((id) => pois.find((p) => p.id === id)?.name ?? id)
    .join(' → ')

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
      <div className="max-w-[min(100%,560px)] rounded-lg bg-paper/95 px-5 py-3 shadow-lg ring-1 ring-line backdrop-blur">
        <div className="tnum flex items-center gap-2.5 text-xl font-semibold leading-none text-ink">
          {selectedOrder.map((_, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-jade/40">→</span>}
              <span>{i + 1}</span>
            </Fragment>
          ))}
        </div>

        <div className="mt-2 truncate text-xs text-ink-soft" title={names}>
          {names}
        </div>

        {route && (
          <div className="mt-1 flex items-center gap-3 text-xs font-medium">
            <span className="tnum text-jade">{formatDuration(route.totalDurationSeconds)}</span>
            <span className="tnum text-jade">
              {(route.totalDistanceMeters / 1000).toFixed(1)} 公里
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
