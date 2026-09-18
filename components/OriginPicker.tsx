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
const EXIT_BASE =
  'rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed'

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
  const exitIdle = 'bg-slate-100 text-slate-700 hover:bg-slate-200'

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate text-sm text-slate-700">
          {origin ? origin.label : '还没有出发点'}
        </div>

        <button
          onClick={onUseGeolocation}
          disabled={locating}
          className={`${EXIT_BASE} ${locating ? 'bg-slate-100 text-slate-400' : exitIdle}`}
        >
          {locating ? '定位中…' : '用我的位置'}
        </button>

        <button
          onClick={onStartPick}
          className={`${EXIT_BASE} ${
            picking ? 'bg-blue-600 text-white ring-2 ring-blue-200' : exitIdle
          }`}
        >
          {picking ? '选点中…' : '地图选点'}
        </button>
      </div>

      <button
        onClick={() => setShowOptions((v) => !v)}
        className="mt-2 text-xs text-slate-500 underline"
      >
        {showOptions ? '收起选项' : '出行方式与时间范围（可选）'}
      </button>

      {showOptions && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onModeChange(m.value)}
                className={`rounded-full px-3 py-1 text-xs ${
                  mode === m.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
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
                className={`rounded-full px-3 py-1 text-xs ${
                  radiusMinutes === r ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
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
