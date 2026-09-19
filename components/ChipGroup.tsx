'use client'

type Props = {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
}

/**
 * 圆角全圆的 chip —— 跟方形按钮区分开：
 * 方形的是「做一件事」，全圆的是「选一个值」。
 */
export default function ChipGroup({ label, options, selected, onToggle }: Props) {
  return (
    <div>
      <div className="mb-2 text-xs text-ink-3">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o)
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o)}
              className={`h-8 rounded-full border px-3 text-[13px] transition-colors ${
                on
                  ? 'border-jade bg-jade font-medium text-white'
                  : 'border-line-2 bg-surface text-ink-2 hover:border-ink-3 hover:text-ink'
              }`}
            >
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}
