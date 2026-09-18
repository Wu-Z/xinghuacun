'use client'

import type { Poi } from '@/lib/core/model'

type Props = {
  poi: Poi
  order: number | null
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
}

const STATUS_TEXT: Record<Poi['openStatus'], string> = {
  open: '营业中',
  closed: '已打烊',
  unknown: '',
}

export default function PoiCard({ poi, order, onToggle, onOpenDetail }: Props) {
  const selected = order !== null

  return (
    <div
      className={`flex gap-3 rounded-xl border p-3 transition ${
        selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'
      }`}
    >
      <button
        onClick={() => onToggle(poi.id)}
        aria-label={selected ? `取消选择 ${poi.name}` : `选择 ${poi.name}`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          selected ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-300'
        }`}
      >
        {selected ? order : '·'}
      </button>

      <button onClick={() => onOpenDetail(poi.id)} className="flex-1 text-left">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-slate-900">{poi.name}</span>
          {poi.rating != null && <span className="text-xs text-amber-600">{poi.rating} 分</span>}
        </div>

        <div className="mt-0.5 text-xs text-slate-500">
          {poi.category} · {(poi.distanceMeters / 1000).toFixed(1)} 公里
          {STATUS_TEXT[poi.openStatus] && ` · ${STATUS_TEXT[poi.openStatus]}`}
        </div>

        {poi.address && (
          <div className="mt-0.5 truncate text-xs text-slate-400">{poi.address}</div>
        )}
      </button>
    </div>
  )
}
