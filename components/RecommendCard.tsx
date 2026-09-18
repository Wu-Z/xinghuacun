'use client'

import type { RecommendPlace } from '@/lib/core/model'
import AmapLink from './AmapLink'

type Props = {
  place: RecommendPlace
  order: number | null
  onToggle: (name: string) => void
  onOpenDetail: (name: string) => void
}

const STATUS: Record<string, string> = { open: '营业中', closed: '已打烊', unknown: '' }

export default function RecommendCard({ place, order, onToggle, onOpenDetail }: Props) {
  const selectable = place.verified
  const selected = order !== null

  return (
    <div
      className={`relative flex gap-3 py-3 pl-4 pr-3 transition-colors ${
        selected ? 'bg-jade-wash' : selectable ? 'hover:bg-mist/60' : 'bg-[#fbfbfa]'
      }`}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-jade" aria-hidden />}

      {/*
        未能核实的地点不占路线编号：它在语义上就不是一个可拜访的站点。
        徽章显示 · 而不是数字，避免出现「有编号但画不出路线」的矛盾。
      */}
      <button
        onClick={() => selectable && onToggle(place.name)}
        disabled={!selectable}
        aria-label={
          selectable
            ? selected
              ? `取消选择 ${place.name}`
              : `选择 ${place.name}`
            : `${place.name} 高德未能核实，无法加入路线`
        }
        aria-pressed={selected}
        className={`tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
          selected
            ? 'bg-jade text-white'
            : selectable
              ? 'border border-line text-ink-soft hover:border-jade hover:text-jade'
              : 'cursor-not-allowed border border-dashed border-line text-ink-soft'
        }`}
      >
        {selected ? order : selectable ? '+' : '·'}
      </button>

      <button onClick={() => onOpenDetail(place.name)} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{place.name}</span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
              place.rank === 1 ? 'bg-jade-wash text-jade' : 'bg-mist text-ink-soft'
            }`}
          >
            {place.tier}
          </span>
        </div>

        <div className="mt-1 text-xs text-ink-soft">{place.category}</div>

        {place.fit.length > 0 && (
          <div className="mt-2 space-y-1">
            {place.fit.map((f) => (
              <div key={f.tag} className="flex gap-2 text-xs leading-relaxed">
                <span className="shrink-0 font-semibold text-jade">{f.tag}</span>
                <span className="text-ink-soft">{f.why}</span>
              </div>
            ))}
          </div>
        )}

        {place.verified ? (
          <div className="mt-2 flex items-center gap-2.5 text-[11.5px] text-ink-soft">
            {place.distanceMeters != null && (
              // 「直线」两个字不能省：这不是驾车里程，不标就是误导
              <span className="tnum">{(place.distanceMeters / 1000).toFixed(1)} 公里 · 直线</span>
            )}
            {place.cost && <span>{place.cost}</span>}
            {place.openStatus && STATUS[place.openStatus] && (
              <span className={place.openStatus === 'open' ? 'text-jade' : ''}>
                {STATUS[place.openStatus]}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-2 text-[11.5px] leading-relaxed text-amber-700">
            高德未能核实到该地点，无法上图、不参与路线规划。
            <AmapLink url={place.amapUrl} className="underline underline-offset-2">
              在高德地图中查看
            </AmapLink>
          </div>
        )}
      </button>
    </div>
  )
}
