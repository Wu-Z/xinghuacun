'use client'

import { MODE_LABEL, formatDistance, formatDuration } from '@/lib/core/format'
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

export default function TripTimeline({
  itinerary,
  places,
  hasEnd,
  onSetEnd,
  onClearEnd,
  onOpenDetail,
}: Props) {
  const modeLabel = MODE_LABEL[itinerary.mode]

  return (
    <div className="px-4 py-3">
      {itinerary.hasDegradedLeg && (
        <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
          有路段没规划出来，下面的时长与距离按直线估算，实际会更长。
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
                  <div className="min-w-0 flex-1 py-1.5 text-[11.5px] leading-relaxed text-ink-soft">
                    {modeLabel} {formatDuration(leg.durationSeconds)} ·{' '}
                    {formatDistance(leg.distanceMeters)}
                    {leg.degraded && <span className="ml-1.5 text-amber-700">（直线估算）</span>}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex w-2.5 shrink-0 justify-center">
                  <span
                    className={`${DOT} ${
                      stop.kind === 'stop' ? 'bg-jade' : 'border border-ink-soft bg-paper'
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
                    <span className="shrink-0 text-[11px] text-ink-soft">
                      {stop.kind === 'start' ? '起点' : stop.kind === 'end' ? '终点' : ''}
                    </span>
                  </div>
                  {place && (
                    <div className="mt-0.5 truncate text-[11.5px] text-ink-soft">
                      {place.tier}
                      {place.category ? ` · ${place.category}` : ''}
                    </div>
                  )}
                  {isLast && !hasEnd && (
                    <div className="mt-1 text-[11.5px] text-ink-soft">到这里就结束了</div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-3 border-t border-line pt-3">
        {hasEnd ? (
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <span>终点：{itinerary.stops[itinerary.stops.length - 1].name}</span>
            <button onClick={onSetEnd} className="text-jade hover:underline">
              改
            </button>
            <button onClick={onClearEnd} className="hover:text-ink">
              取消终点
            </button>
          </div>
        ) : (
          <button onClick={onSetEnd} className="text-xs text-jade hover:underline">
            设置终点（比如回家）
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-xs font-medium">
        <span className="text-ink-soft">路上共</span>
        <span className="tnum text-jade">{formatDuration(itinerary.totalTravelMinutes * 60)}</span>
        <span className="tnum text-jade">{formatDistance(itinerary.totalDistanceMeters)}</span>
      </div>
    </div>
  )
}
