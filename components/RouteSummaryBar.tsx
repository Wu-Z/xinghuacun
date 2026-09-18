'use client'

import { Fragment } from 'react'
import type { Route } from '@/lib/core/model'

type Props = { visitOrder: string[]; route: Route | null }

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

/**
 * 地图最上层的路径图。
 * 编号是**拜访顺序**，不是勾选顺序 —— 顺序由服务端算最优后返回。
 */
export default function RouteSummaryBar({ visitOrder, route }: Props) {
  if (visitOrder.length < 2) return null

  const degradedCount = route?.legs.filter((l) => l.degraded).length ?? 0

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
      <div className="max-w-[min(100%,560px)] rounded-lg bg-paper/95 px-5 py-3 shadow-lg ring-1 ring-line backdrop-blur">
        <div className="tnum flex items-center gap-2.5 text-xl font-semibold leading-none text-ink">
          {visitOrder.map((_, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-jade/40">→</span>}
              <span>{i + 1}</span>
            </Fragment>
          ))}
        </div>

        <div className="mt-2 truncate text-xs text-ink-soft" title={visitOrder.join(' → ')}>
          {visitOrder.join(' → ')}
        </div>

        {route && degradedCount === 0 && (
          <div className="mt-1 flex items-center gap-3 text-xs font-medium">
            <span className="tnum text-jade">{formatDuration(route.totalDurationSeconds)}</span>
            <span className="tnum text-jade">
              {(route.totalDistanceMeters / 1000).toFixed(1)} 公里
            </span>
          </div>
        )}

        {/* 有路段没规划出来时绝不拿 0 冒充结果 —— 上一轮就是这样把限流失败
            伪装成了「0 分钟 0.0 公里」的一条路线 */}
        {route && degradedCount > 0 && (
          <div className="mt-1 text-xs text-amber-700">
            有 {degradedCount} 段没规划出来，图中以直线示意。稍等片刻再选一次可重试。
          </div>
        )}
      </div>
    </div>
  )
}
