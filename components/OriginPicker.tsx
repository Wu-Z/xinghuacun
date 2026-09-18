'use client'

import { useState } from 'react'
import type { Origin, TravelMode } from '@/lib/core/model'

type Props = {
  origin: Origin | null
  locating: boolean
  mode: TravelMode
  radiusMinutes: 30 | 60 | 120
  onUseGeolocation: () => void
  onStartPick: () => void
  picking: boolean
  onModeChange: (mode: TravelMode) => void
  onRadiusChange: (minutes: 30 | 60 | 120) => void
}

const MODES: { value: TravelMode; label: string }[] = [
  { value: 'driving', label: '驾车' },
  { value: 'transit', label: '公交' },
  { value: 'walking', label: '步行' },
  { value: 'bicycling', label: '骑行' },
]

const RADII: (30 | 60 | 120)[] = [30, 60, 120]

// 两个入口共用同一套样式：拒绝定位不该被暗示成次等选择
const EXIT = 'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors'
const EXIT_IDLE = 'bg-mist text-ink hover:bg-line'
const CHIP = 'rounded-md px-2.5 py-1 text-xs transition-colors'

export default function OriginPicker({
  origin,
  locating,
  mode,
  radiusMinutes,
  onUseGeolocation,
  onStartPick,
  picking,
  onModeChange,
  onRadiusChange,
}: Props) {
  const [showOptions, setShowOptions] = useState(false)

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
          className={`${EXIT} ${
            picking ? 'bg-jade text-white' : EXIT_IDLE
          }`}
        >
          {picking ? '在地图上点一下' : '地图选点'}
        </button>
      </div>

      <button
        onClick={() => setShowOptions((v) => !v)}
        aria-expanded={showOptions}
        className="text-xs text-ink-soft underline decoration-line underline-offset-4 hover:text-ink"
      >
        {showOptions ? '收起出行方式与范围' : '出行方式与范围'}
      </button>

      {showOptions && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onModeChange(m.value)}
                aria-pressed={mode === m.value}
                className={`${CHIP} ${
                  mode === m.value
                    ? 'bg-jade text-white'
                    : 'bg-mist text-ink-soft hover:bg-line hover:text-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {RADII.map((r) => (
              <button
                key={r}
                onClick={() => onRadiusChange(r)}
                aria-pressed={radiusMinutes === r}
                className={`${CHIP} tnum ${
                  radiusMinutes === r
                    ? 'bg-jade text-white'
                    : 'bg-mist text-ink-soft hover:bg-line hover:text-ink'
                }`}
              >
                {r} 分钟
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
