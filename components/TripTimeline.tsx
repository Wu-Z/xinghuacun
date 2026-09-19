'use client'

import { MODE_LABEL, formatDistance, formatDuration, summarizeModes } from '@/lib/core/format'
import type { Itinerary } from '@/lib/core/itinerary'
import type { RecommendPlace } from '@/lib/core/model'

type Props = {
  itinerary: Itinerary
  places: RecommendPlace[]
  /** 是否已设终点；未设时末站就是结束 */
  hasEnd: boolean
  onSetEnd: () => void
  onClearEnd: () => void
  onOpenDetail: (name: string) => void
}

const DOT = 'mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full'

/** 站点在这条动线里的身份。只给听得懂的说法，不排时刻表 */
const KIND_LABEL: Record<string, (i: number) => string> = {
  start: () => '起点',
  stop: (i) => `第 ${i} 站`,
  end: () => '终点',
}

export default function TripTimeline({
  itinerary,
  places,
  hasEnd,
  onSetEnd,
  onClearEnd,
  onOpenDetail,
}: Props) {
  const modeLabel = summarizeModes(itinerary.legs)

  return (
    <div className="px-4 py-3">
      {itinerary.hasDegradedLeg && (
        <div className="mb-3 border-b border-amber-line bg-amber-bg px-3 py-2 text-[12.5px] leading-[1.65] text-amber">
          有路段没规划出来，下面标了「直线估算」的那几段按直线算，实际会更长。
          取消再勾一次通常能算出来。
        </div>
      )}

      <ol className="relative">
        {itinerary.stops.map((stop, i) => {
          // legs[i-1] 是上一站到本站那一段
          const leg = i > 0 ? itinerary.legs[i - 1] : null
          const place = stop.stopId ? places.find((p) => p.name === stop.name) : null
          const isLast = i === itinerary.stops.length - 1

          return (
            <li key={`${stop.kind}-${stop.name}-${i}`}>
              {leg && (
                <div className="flex gap-3">
                  <div className="flex w-2.5 shrink-0 justify-center">
                    <span className="w-px bg-line" />
                  </div>
                  {/* 每段单独一行给「方式 + 时长 + 里程」，
                      而不是把所有段的数字堆在底部 —— 那样看不出哪段是哪种走法。
                      方式取的是**这一段自己的**：一条路线可以近的走路、远的坐地铁 */}
                  <div className="min-w-0 flex-1 py-1.5 text-xs leading-[1.6] text-ink-3">
                    {MODE_LABEL[leg.mode]} {formatDuration(leg.durationSeconds)} ·{' '}
                    {formatDistance(leg.distanceMeters)}
                    {leg.degraded && <span className="ml-1.5 font-medium text-amber">（直线估算）</span>}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex w-2.5 shrink-0 justify-center">
                  <span
                    className={`${DOT} ${
                      stop.kind === 'stop' ? 'bg-jade' : 'border border-ink-3 bg-surface'
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-baseline gap-2">
                    {stop.kind === 'stop' ? (
                      <button
                        onClick={() => onOpenDetail(stop.name)}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:text-jade"
                      >
                        {stop.name}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                        {stop.name}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-ink-3">{KIND_LABEL[stop.kind](i)}</span>
                  </div>
                  {place && (
                    <div className="mt-0.5 truncate text-xs text-ink-3">
                      {place.tier}
                      {place.category ? ` · ${place.category}` : ''}
                    </div>
                  )}
                  {isLast && !hasEnd && (
                    <div className="mt-1 text-xs text-ink-3">到这里就结束了</div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-3 border-t border-line pt-3">
        {hasEnd ? (
          <div className="flex items-center gap-3 text-[13px] text-ink-2">
            <span className="min-w-0 truncate">
              终点：{itinerary.stops[itinerary.stops.length - 1].name}
            </span>
            <button
              onClick={onSetEnd}
              className="ml-auto shrink-0 text-jade hover:underline"
            >
              改终点
            </button>
            <button onClick={onClearEnd} className="shrink-0 text-ink-3 hover:text-ink">
              取消终点
            </button>
          </div>
        ) : (
          <button onClick={onSetEnd} className="text-[13px] text-jade hover:underline">
            设置终点（比如回家）
          </button>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-3 border-t border-line pt-3">
        <span className="text-xs text-ink-3">路上共</span>
        <span className="tnum text-[15px] font-semibold text-jade-deep">
          {formatDuration(itinerary.totalTravelMinutes * 60)}
        </span>
        <span className="text-xs text-ink-3">{modeLabel}</span>
        <span className="tnum text-[15px] font-semibold text-jade-deep">
          {formatDistance(itinerary.totalDistanceMeters)}
        </span>
      </div>
    </div>
  )
}
