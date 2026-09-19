'use client'

type Props = {
  selectedCount: number
  /** 细化前是「个地方」，细化后是「个站点」—— 同一批东西的性质变了 */
  unit: '个地方' | '个站点'
  canFinalize: boolean
  busy: boolean
  /** 已经在行程页时别再给「看行程」—— 那个按钮点下去什么也不会发生 */
  showViewButton?: boolean
  onClear: () => void
  onView: () => void
  onFinalize: () => void
}

/**
 * 底部托盘：把「下一步做什么」收在一处。
 *
 * 之前这两个入口一个在列表最底部（要滚到底才看见）、一个在列表上方（容易错过），
 * 用户勾完地点不知道接下来该干嘛 —— 这是「难用」的主要来源。
 *
 * 托盘只在勾了至少一个之后出现：没勾的时候它既没有信息也没有动作，
 * 白占一条底边。
 */
export default function SelectionTray({
  selectedCount,
  unit,
  canFinalize,
  busy,
  showViewButton = true,
  onClear,
  onView,
  onFinalize,
}: Props) {
  if (selectedCount === 0) return null

  const remaining = 2 - selectedCount

  return (
    <div className="anim-rise shrink-0 border-t border-line bg-surface px-4 py-3 shadow-4">
      {canFinalize && (
        <button
          onClick={onFinalize}
          disabled={busy}
          className="mb-2 w-full rounded-sm bg-mist py-2.5 text-[13px] text-ink transition-colors hover:bg-mist-2 disabled:cursor-not-allowed disabled:text-ink-3"
        >
          把选中的 {selectedCount} 个细化成站点
        </button>
      )}

      <div className="flex items-center gap-3">
        <div className="min-w-0 text-[13px] text-ink-2">
          已选 <b className="tnum text-[15px] font-semibold text-ink">{selectedCount}</b> {unit}
        </div>

        <div className="ml-auto flex shrink-0 gap-2">
          <button
            onClick={onClear}
            className="h-10 rounded-sm border border-line-2 bg-surface px-3.5 text-[13px] text-ink transition-colors hover:border-ink-3"
          >
            清空
          </button>
          {showViewButton && selectedCount >= 2 && (
            <button
              onClick={onView}
              className="h-10 rounded-sm bg-jade px-4 text-[13px] font-medium text-white transition-colors hover:bg-jade-deep"
            >
              看行程 →
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs leading-[1.5] text-ink-3">
        {remaining > 0
          ? `再选 ${remaining} 个就能规划路线；带「复合地点」的选中后会被拆成独立站点。`
          : '带「复合地点」的选中后会被拆成独立站点，只有拆开才能逐段规划路线。'}
      </p>
    </div>
  )
}
