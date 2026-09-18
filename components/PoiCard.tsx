'use client'

import type { Poi } from '@/lib/core/model'

type Props = {
  poi: Poi
  order: number | null
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
}

const STATUS: Record<Poi['openStatus'], string> = {
  open: '营业中',
  closed: '已打烊',
  unknown: '',
}

/**
 * 用分隔线切分而不是「同款圆角浮空盒 + 同款阴影」的卡片套件。
 * 元信息不用 `·` 连接 —— 那是 AI 生成页最典型的外观特征。
 */
export default function PoiCard({ poi, order, onToggle, onOpenDetail }: Props) {
  const selected = order !== null

  return (
    <div
      className={`relative flex gap-3 py-3 pl-4 pr-3 transition-colors ${
        selected ? 'bg-jade-wash' : 'bg-transparent hover:bg-mist/60'
      }`}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-jade" aria-hidden />}

      <button
        onClick={() => onToggle(poi.id)}
        aria-label={selected ? `取消选择 ${poi.name}` : `选择 ${poi.name}`}
        aria-pressed={selected}
        className={`tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
          selected
            ? 'bg-jade text-white'
            : 'border border-line text-ink-soft hover:border-jade hover:text-jade'
        }`}
      >
        {selected ? order : '+'}
      </button>

      <button onClick={() => onOpenDetail(poi.id)} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-3">
          <span className="truncate text-sm font-medium text-ink">{poi.name}</span>
          {poi.rating != null && (
            <span className="tnum ml-auto shrink-0 text-xs text-ink-soft">{poi.rating}</span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-3 text-xs text-ink-soft">
          <span className="truncate">{poi.category}</span>
          <span className="tnum shrink-0">{(poi.distanceMeters / 1000).toFixed(1)} 公里</span>
          {STATUS[poi.openStatus] && (
            <span
              className={`ml-auto shrink-0 ${poi.openStatus === 'open' ? 'text-jade' : 'text-ink-soft'}`}
            >
              {STATUS[poi.openStatus]}
            </span>
          )}
        </div>

        {poi.address && <div className="mt-0.5 truncate text-xs text-ink-soft">{poi.address}</div>}
      </button>
    </div>
  )
}
