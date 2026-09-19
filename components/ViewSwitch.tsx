'use client'

type Props = {
  view: 'list' | 'timeline'
  onChange: (view: 'list' | 'timeline') => void
}

const ITEMS = [
  ['list', '列表'],
  ['timeline', '行程'],
] as const

/**
 * 列表 ⇄ 行程 的切换。
 *
 * 做成轨道式分段控件（深底 + 白色滑块）而不是两个并排按钮：
 * 它切换的是「同一份结果的两种看法」，不是两个并列的动作 ——
 * 两个长得一样的按钮会让人以为按钮之间没有关系。
 */
export default function ViewSwitch({ view, onChange }: Props) {
  return (
    <div className="flex gap-0.5 rounded-sm bg-mist p-[3px]" role="group" aria-label="查看方式">
      {ITEMS.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={view === key}
          className={`rounded-xs px-2.5 py-1 text-xs transition-colors ${
            view === key ? 'bg-surface font-semibold text-ink shadow-1' : 'text-ink-2'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
