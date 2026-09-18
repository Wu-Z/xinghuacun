'use client'

import type { Origin } from '@/lib/core/model'

type Props = {
  origin: Origin | null
  locating: boolean
  onUseGeolocation: () => void
  onStartPick: () => void
  picking: boolean
}

// 两个入口共用同一套样式：拒绝定位不该被暗示成次等选择
const EXIT = 'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors'
const EXIT_IDLE = 'bg-mist text-ink hover:bg-line'

export default function OriginPicker({
  origin,
  locating,
  onUseGeolocation,
  onStartPick,
  picking,
}: Props) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-ink-soft">出发点</div>
        <div
          className={`mt-1 truncate text-sm font-medium ${origin ? 'text-ink' : 'text-ink-soft'}`}
          title={origin?.label}
        >
          {origin ? origin.label : '还没有选'}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onUseGeolocation}
          disabled={locating}
          className={`${EXIT} ${locating ? 'bg-mist text-ink-soft' : EXIT_IDLE} disabled:cursor-not-allowed`}
        >
          {locating ? '定位中…' : '用我的位置'}
        </button>

        <button
          onClick={onStartPick}
          aria-pressed={picking}
          className={`${EXIT} ${picking ? 'bg-jade text-white' : EXIT_IDLE}`}
        >
          {picking ? '在地图上点一下' : '地图选点'}
        </button>
      </div>
    </div>
  )
}
