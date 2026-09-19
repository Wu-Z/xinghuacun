'use client'

type Props = {
  /**
   * 不传就不渲染小标题。
   * 浮层（PreferencePills）里的标题由浮层自己给 —— 那边还带着输入框和说明，
   * 标题必须跟它们同宽同排，交给 ChipGroup 会各排各的。
   */
  label?: string
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
      {label && <div className="sky-ink-3 mb-2 text-xs">{label}</div>}
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
