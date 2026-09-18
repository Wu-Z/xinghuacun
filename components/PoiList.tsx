'use client'

import type { Poi } from '@/lib/core/model'
import PoiCard from './PoiCard'

type Props = {
  pois: Poi[]
  selectedOrder: string[]
  loading: boolean
  error: string | null
  hasOrigin: boolean
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
}

function Note({ children, tone = 'quiet' }: { children: React.ReactNode; tone?: 'quiet' | 'bad' }) {
  return (
    <p className={`px-4 py-6 text-sm ${tone === 'bad' ? 'text-red-700' : 'text-ink-soft'}`}>
      {children}
    </p>
  )
}

export default function PoiList({
  pois,
  selectedOrder,
  loading,
  error,
  hasOrigin,
  onToggle,
  onOpenDetail,
}: Props) {
  if (loading) return <Note>正在找附近的地方…</Note>
  if (error) return <Note tone="bad">{error}</Note>
  if (pois.length === 0) {
    return (
      <Note>
        {hasOrigin ? '附近没有找到合适的地方，换个范围试试' : '先用我的位置，或者在地图上点一个出发点'}
      </Note>
    )
  }

  return (
    <div className="divide-y divide-line">
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
