'use client'

import { formatDistance, formatDuration, legSummary, summarizeModes } from '@/lib/core/format'
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
  const stopCount = itinerary.stops.filter((s) => s.kind === 'stop').length
  const plannedLegs = itinerary.legs.filter((l) => !l.degraded).length

  return (
    <div className="px-4 py-3">
      {itinerary.hasDegradedLeg && (
        <div className="mb-3 border-b border-amber-line bg-amber-bg px-3 py-2 text-[12.5px] leading-[1.65] text-amber">
          有路段没规划出来，下面标了「直线估算」的那几段按直线算，实际会更长。
          取消再勾一次通常能算出来。
        </div>
      )}

      {/*
        汇总条：站数 / 里程 / 方式，三格，**放在最上面**。
        原先它是一行小字压在时间轴底下 —— 用户要看「这条线一共多远」得先滚到底，
        而这一行正是他决定要不要走这条线时最先想看的东西。

        第 2 格的副标只在**每一段都规划出来**时才写「路上共 X 分钟」：
        有降级段时那个总数是漏算了那几段的，写出来会让人以为它算全了。
      */}
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-sm bg-paper px-3 py-2.5">
        <div>
          <div className="tnum text-[15px] font-semibold text-ink">{stopCount} 站</div>
          <div className="mt-0.5 text-[11.5px] text-ink-3">
            {hasEnd ? '含 1 个终点' : '末站即结束'}
          </div>
        </div>

        <div className="min-w-0">
          <div className="tnum text-[15px] font-semibold text-ink">
            {formatDistance(itinerary.totalDistanceMeters)}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
            {itinerary.hasDegradedLeg
              ? `${plannedLegs} 段已规划`
              : itinerary.totalTravelMinutes > 0
                ? `路上共 ${formatDuration(itinerary.totalTravelMinutes * 60)}`
                : '时长没算出来'}
          </div>
        </div>

        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-ink">{modeLabel || '—'}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-3">逐段各定</div>
        </div>
      </div>

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
                  {/*
                    每段单独一行给「方式 + 时长 + 里程」，
                    而不是把所有段的数字堆在底部 —— 那样看不出哪段是哪种走法。
                    方式取的是**这一段自己的**：一条路线可以近的走路、远的坐地铁。

                    这段文字由 legSummary 统一生成，分享卡上是同一份 ——
                    降级段在两边都不印时长（那是拿直线距离估的，不是高德算的）。
                  */}
                  <div
                    className={`min-w-0 flex-1 py-1.5 text-xs leading-[1.6] ${
                      leg.degraded ? 'text-amber' : 'text-ink-3'
                    }`}
                  >
                    {legSummary(leg)}
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
            <button onClick={onSetEnd} className="ml-auto shrink-0 text-jade hover:underline">
              改终点
            </button>
            {/*
              「取消终点」是不可逆的（取消之后得重新选一次点），
              所以它不与「改终点」同权重：灰字、字号更小、还留一段间距，
              免得手滑点掉整条线的收尾。
            */}
            <button
              onClick={onClearEnd}
              className="shrink-0 px-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
            >
              取消终点
            </button>
          </div>
        ) : (
          <button onClick={onSetEnd} className="text-[13px] text-jade hover:underline">
            设置终点（比如回家）
          </button>
        )}
      </div>
    </div>
  )
}
