'use client'

type Props = {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
}

const CHIP = 'rounded-md px-3 py-1.5 text-sm transition-colors'
const IDLE = 'bg-mist text-ink-soft hover:bg-line hover:text-ink'

export default function ChipGroup({ label, options, selected, onToggle }: Props) {
  return (
    <div>
      <div className="mb-2 text-xs text-ink-soft">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o)
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o)}
              className={`${CHIP} ${on ? 'bg-jade text-white' : IDLE}`}
            >
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}
