'use client'

import type { RecommendPlace } from '@/lib/core/model'
import AmapLink from './AmapLink'

type Props = {
  place: RecommendPlace
  order: number | null
  onToggle: (name: string) => void
  onOpenDetail: (name: string) => void
  onAsk: (name: string) => void
}

const STATUS: Record<string, string> = { open: '营业中', closed: '已打烊', unknown: '' }

export default function RecommendCard({ place, order, onToggle, onOpenDetail, onAsk }: Props) {
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
          {/*
            高亮判据用 tier 而不是 rank === 1。
            rank 是顺序、tier 才是档位；而 parseSkillOutput 在 rank 缺失时
            会按 i+1 补位 —— 于是「追问中途补进来的沙茶面」会被高亮成「首选」。
            跟 tier 走则无论 rank 怎么写都不会错判。
          */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
              place.tier.startsWith('首选') ? 'bg-jade-wash text-jade' : 'bg-mist text-ink-soft'
            }`}
          >
            {place.tier}
          </span>
        </div>

        <div className="mt-1 text-xs text-ink-soft">{place.category}</div>

        {/* 复合地点：提前告诉用户细化后会被拆开，否则列表突然变样会懵 */}
        {place.contains && place.contains.length > 0 && (
          <div className="mt-2 rounded-md bg-mist px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink-soft">
            含 {place.contains.length} 个可玩点：{place.contains.join(' / ')}
            <br />
            选定后会拆成独立站点，才能逐个规划路线
          </div>
        )}

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

      {/* 追问入口：只针对这一个地点 */}
      <button
        onClick={() => onAsk(place.name)}
        className="shrink-0 self-start rounded-md px-2 py-1 text-[11.5px] text-ink-soft transition-colors hover:bg-mist hover:text-jade"
      >
        追问
      </button>
    </div>
  )
}
