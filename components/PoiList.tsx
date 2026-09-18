'use client'

import type { Poi } from '@/lib/core/model'
import PoiCard from './PoiCard'

type Props = {
  pois: Poi[]
  selectedOrder: string[]
  loading: boolean
  error: string | null
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
}

export default function PoiList({
  pois,
  selectedOrder,
  loading,
  error,
  onToggle,
  onOpenDetail,
}: Props) {
  if (loading) return <p className="p-3 text-sm text-slate-500">正在找附近的地方…</p>
  if (error) return <p className="p-3 text-sm text-red-600">{error}</p>
  if (pois.length === 0) return <p className="p-3 text-sm text-slate-500">附近没有找到合适的地方</p>

  return (
    <div className="space-y-2">
      {pois.map((poi) => {
        const index = selectedOrder.indexOf(poi.id)
        return (
          <PoiCard
            key={poi.id}
            poi={poi}
            order={index === -1 ? null : index + 1}
            onToggle={onToggle}
            onOpenDetail={onOpenDetail}
          />
        )
      })}
    </div>
  )
}
