'use client'

import { Fragment } from 'react'
import { formatDistance, formatDuration, summarizeModes } from '@/lib/core/format'
import type { Route } from '@/lib/core/model'

type Props = { visitOrder: string[]; route: Route | null }

/** 一格「小标签 + 大数字」。数字走 tnum，几格之间才对得齐 */
function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-ink-3">{label}</div>
      <b className="tnum block text-[15px] font-semibold leading-tight text-jade-deep">{value}</b>
    </div>
  )
}

/**
 * 地图最上层的路径图。
 * 编号是**拜访顺序**，不是勾选顺序 —— 顺序由服务端算最优后返回。
 *
 * 只在列表页挂。行程页不挂：那边的时间轴已经把顺序与汇总说完了，
 * 再压一张卡只是把地图盖住。挂载与否由结果页决定，见 app/plan/page.tsx。
 */
export default function RouteSummaryBar({ visitOrder, route }: Props) {
  if (visitOrder.length < 2) return null

  const degradedCount = route?.legs.filter((l) => l.degraded).length ?? 0

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
      <div className="max-w-[min(100%,560px)] rounded-md border border-line bg-surface/95 px-4 py-3 shadow-3 backdrop-blur">
        <div className="tnum flex items-center gap-2 text-[19px] font-semibold leading-none tracking-[-0.2px] text-ink">
          {visitOrder.map((_, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-sm font-normal text-jade/50">→</span>}
              <span>{i + 1}</span>
            </Fragment>
          ))}
          {/* 有路线才算「重排」；没有时这几个数字只是勾选顺序，别替它担保 */}
          {route && (
            <span className="ml-1.5 text-xs font-normal text-ink-3">
              拜访顺序（已按最短路径重排）
            </span>
          )}
        </div>

        <div className="mt-1.5 truncate text-xs text-ink-3" title={visitOrder.join(' → ')}>
          {visitOrder.join(' → ')}
        </div>

        {route && degradedCount === 0 && (
          <div className="mt-2 flex gap-5 border-t border-line pt-2">
            {/* 标签位放方式：混用时是「步行 + 公交/地铁」，一格放得下 */}
            <Cell label={summarizeModes(route.legs)} value={formatDuration(route.totalDurationSeconds)} />
            <Cell label="全程" value={formatDistance(route.totalDistanceMeters)} />
            <Cell label="站点" value={`${visitOrder.length} 站`} />
          </div>
        )}

        {/* 有路段没规划出来时绝不拿 0 冒充结果 —— 上一轮就是这样把限流失败
            伪装成了「0 分钟 0.0 公里」的一条路线 */}
        {route && degradedCount > 0 && (
          <div className="mt-2 border-t border-amber-line pt-2 text-xs leading-[1.6] text-amber">
            有 {degradedCount} 段没规划出来，图中以直线示意。稍等片刻再选一次可重试。
          </div>
        )}
      </div>
    </div>
  )
}
