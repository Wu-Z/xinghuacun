'use client'

export type Step = 'ask' | 'pick' | 'trip'

const STEPS: { key: Step; label: string }[] = [
  { key: 'ask', label: '说需求' },
  { key: 'pick', label: '挑地点' },
  { key: 'trip', label: '看行程' },
]

/**
 * 三步的进度指示。
 *
 * 这里用编号是**挣来的**：内容本身确实是序列（说需求 → 挑地点 → 看行程），
 * 而不是给一堆并列的卡片硬套 01/02/03。
 *
 * 存在的理由很直接：这条链路有三步，但之前界面上没有任何地方告诉用户
 * 「你现在在哪、下一步干嘛」，勾完地点也不知道该去看行程。
 */
export default function StepBar({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current)

  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <li key={s.key} className="flex items-center gap-2">
            {i > 0 && <span className="text-line">——</span>}
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-1 ${
                active ? 'font-medium text-ink' : done ? 'text-jade' : 'text-ink-soft/60'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  active
                    ? 'bg-ink text-paper'
                    : done
                      ? 'bg-jade text-white'
                      : 'border border-line text-ink-soft/60'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              {s.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
