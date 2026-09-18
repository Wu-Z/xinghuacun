'use client'

import type { RecommendPlace } from '@/lib/core/model'
import AmapLink from './AmapLink'

type Props = { place: RecommendPlace | null; onClose: () => void }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 border-b border-line py-1.5 text-xs leading-relaxed last:border-0">
      <span className="w-[58px] shrink-0 text-ink-soft">{label}</span>
      <span className="flex-1 text-ink">{children}</span>
    </div>
  )
}

/** 停靠点详情：贴在侧栏底部，描述的是列表里被点开的那一项 */
export default function StopDetail({ place, onClose }: Props) {
  if (!place) return null

  return (
    <div className="anim-rise absolute inset-x-0 bottom-0 max-h-[78%] overflow-y-auto border-t border-line bg-paper shadow-[0_-8px_24px_-12px_rgba(18,23,28,0.25)]">
      <div className="flex items-start gap-3 px-4 pb-1.5 pt-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-ink">{place.name}</h2>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="-mr-1 shrink-0 rounded px-2 py-0.5 text-xs text-ink-soft hover:bg-mist hover:text-ink"
        >
          关闭
        </button>
      </div>

      <div className="px-4 pb-4">
        <div className="text-xs text-ink-soft">{place.category}</div>

        <div className="mt-3">
          {place.bestTime && <Row label="最佳时段">{place.bestTime}</Row>}
          {place.cost && <Row label="费用">{place.cost}</Row>}
          {place.crowdLevel && (
            <Row label="拥挤度">
              {place.crowdLevel}
              {place.crowdNote && ` · ${place.crowdNote}`}
            </Row>
          )}
          {place.transitHint && <Row label="交通">{place.transitHint}</Row>}
          {place.tradeOff && <Row label="取舍">{place.tradeOff}</Row>}
          {place.pickIf && <Row label="选它的理由">{place.pickIf}</Row>}
          {!place.verified && <Row label="核实">高德未能核实到该地点</Row>}
        </div>

        {place.itinerary && place.itinerary.length > 0 && (
          <>
            <div className="mt-3.5 text-[11.5px] font-semibold text-ink-soft">如果只去这一个</div>
            <div className="mt-1.5 space-y-1">
              {place.itinerary.map((s, i) => (
                <div key={i} className="flex gap-2.5 text-xs leading-relaxed">
                  <span className="w-[76px] shrink-0 text-ink-soft">{s.time}</span>
                  <span className="flex-1 text-ink">{s.action}</span>
                </div>
              ))}
            </div>
            {/* 两个时间数字回答的是不同问题，不合并 */}
            <p className="mt-2 rounded-md bg-mist px-2.5 py-2 text-[11px] leading-relaxed text-ink-soft">
              这段动线是 skill 按它假设的时长排的。你实际勾选多个点时，总时长以地图顶部为准
              —— 两个数字回答的是不同问题，所以不合并。
            </p>
          </>
        )}

        {(place.confidence || place.source) && (
          <>
            <div className="mt-3.5 text-[11.5px] font-semibold text-ink-soft">可信度</div>
            <Row label="来源">
              {[place.source, place.confidence].filter(Boolean).join(' · ') || '未说明'}
            </Row>
          </>
        )}

        <AmapLink url={place.amapUrl} className="mt-3 inline-block text-xs text-jade underline underline-offset-2">
          在高德地图中打开
        </AmapLink>
      </div>
    </div>
  )
}
