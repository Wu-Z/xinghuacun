'use client'

import { useEffect, useRef, useState } from 'react'
import ChipGroup from '@/components/ChipGroup'
import type { Preferences } from '@/lib/core/model'

type Kind = 'people' | 'crowd' | 'dest'

/*
 * 人数存的是区间的**下界**（「3–4 人」→ 3）。规则统一取小：
 * 座位、包间这类判断上，少算一个人比多算一个人安全。
 * 读回来时按区间归属反查，所以 3 和 4 都显示成「3–4 人」。
 */
const PEOPLE = ['1 人', '2 人', '3–4 人', '5 人以上']

function peopleToNumber(v: string): number {
  if (v === '3–4 人') return 3
  if (v === '5 人以上') return 5
  return Number.parseInt(v, 10)
}

function numberToPeople(n: number): string {
  if (n <= 1) return '1 人'
  if (n === 2) return '2 人'
  if (n <= 4) return '3–4 人'
  return '5 人以上'
}

const CROWD = ['人少', '一般', '无所谓']
const CROWD_VALUE: Record<string, Preferences['crowdTolerance']> = {
  人少: 'low',
  一般: 'medium',
  无所谓: 'high',
}
const CROWD_LABEL: Record<string, string> = { low: '人少', medium: '一般', high: '无所谓' }

/**
 * 浮层宽度。算左缘位置要用到，写死比量出来稳。
 *
 * 236 是量出来的：拥挤容忍度那三个 chip 一共 185px 宽，浮层左右各 13px 内边距，
 * 210 才放得下一行 —— 212 时它们会折成「2 + 1」，四个选项拆成两行的观感很差。
 * 人数那组四个 chip 约 295px，一定折行，但四个排成 2×2 是整齐的。
 */
const POP_W = 236

type Props = {
  prefs: Preferences
  onChange: (next: Preferences) => void
}

function Pill({
  text,
  filled,
  expanded,
  onOpen,
}: {
  text: string
  filled: boolean
  expanded: boolean
  onOpen: (el: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-haspopup="true"
      // 有值才写属性：CSS 只判存在性，写 ="false" 会让「实值」的规则也命中
      data-filled={filled ? 'true' : undefined}
      data-open={expanded ? 'true' : undefined}
      onClick={(e) => onOpen(e.currentTarget)}
      className="pref-pill inline-flex h-[34px] max-w-full items-center gap-[7px] rounded-full border px-[13px] text-[13px] transition-colors"
    >
      <span className="min-w-0 truncate">{text}</span>
      <span className="shrink-0 text-[9px] opacity-55" aria-hidden>
        ▾
      </span>
    </button>
  )
}

/**
 * 偏好 = 一行可点开的 pill。
 *
 * 之前是「▸ 偏好（不填也行）」折叠出三段表单，问题有三个：
 * 1. 入口是一行很弱的文字，可这几个参数对结果影响很大 —— 价值与表现不匹配；
 * 2. 展开后三种控件用了三套排版（label 在左 / label 在上 / 整行输入），
 *    同一组里的东西长得不像一家人；
 * 3. 展开一次要把页面撑长 200 多像素。
 *
 * 改成 pill 之后三种控件终于是同一形态，展开走浮层、不再改变页面高度。
 * 「不填也行」那句话也去掉了：pill 本身只显示「同行人数」这样一个占位词，
 * 没有值就是没有值，不需要再用一句话解释。
 */
export default function PreferencePills({ prefs, onChange }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<{ kind: Kind; left: number; top: number } | null>(null)

  // 点空白处或按 Esc 就关掉。浮层不该只能靠「再点一次自己」才收得回去。
  useEffect(() => {
    if (!open) return

    const onDown = (e: MouseEvent) => {
      // 浮层也挂在 row 里面，所以这一条同时兜住了「点浮层内部」
      if (rowRef.current?.contains(e.target as Node)) return
      setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 「想去哪」是唯一的文字输入，打开就该能直接打字
  useEffect(() => {
    if (open?.kind === 'dest') inputRef.current?.focus()
  }, [open])

  function toggle(kind: Kind, el: HTMLButtonElement) {
    if (open?.kind === kind) {
      setOpen(null)
      return
    }
    // 浮层挂在 pill 行的正下方、左缘对齐被点的 pill；
    // 靠右的 pill 要贴回右侧，否则会捅出容器 —— 窄屏上一定会遇到。
    //
    // 纵向位置也取自 pill 自己（而不是写死一个 top）：窄屏上 pill 会换行，
    // 写死的值会让第二行那几个的浮层飘到上一行下面去。
    const row = rowRef.current
    const maxLeft = row ? Math.max(0, row.clientWidth - POP_W) : 0
    setOpen({
      kind,
      left: Math.min(el.offsetLeft, maxLeft),
      top: el.offsetTop + el.offsetHeight + 10,
    })
  }

  const peopleText = prefs.companions === null ? null : numberToPeople(prefs.companions)
  const crowdText = prefs.crowdTolerance ? CROWD_LABEL[prefs.crowdTolerance] : null
  const destText = prefs.destination.trim() || null

  return (
    <div ref={rowRef} className="relative mt-3.5 flex flex-wrap items-center gap-2">
      <span className="pref-key mr-0.5 text-xs">偏好</span>

      <Pill
        text={peopleText ?? '同行人数'}
        filled={peopleText !== null}
        expanded={open?.kind === 'people'}
        onOpen={(el) => toggle('people', el)}
      />
      <Pill
        text={crowdText ?? '拥挤容忍度'}
        filled={crowdText !== null}
        expanded={open?.kind === 'crowd'}
        onOpen={(el) => toggle('crowd', el)}
      />
      <Pill
        text={destText ?? '想去哪'}
        filled={destText !== null}
        expanded={open?.kind === 'dest'}
        onOpen={(el) => toggle('dest', el)}
      />

      {open && (
        <div
          className="pref-pop anim-fade absolute"
          style={{ left: open.left, top: open.top, width: POP_W }}
        >
          {open.kind === 'people' && (
            <>
              <div className="pref-pop-key text-[11.5px]">同行人数</div>
              <ChipGroup
                options={PEOPLE}
                selected={peopleText ? [peopleText] : []}
                onToggle={(v) =>
                  // 用显示文案判「已选」而不是比数字：4 人也显示成「3–4 人」，
                  // 比数字会让「再点一次取消」失效
                  onChange({ ...prefs, companions: peopleText === v ? null : peopleToNumber(v) })
                }
              />
              <div className="pref-pop-hint text-[11.5px]">不选则按默认处理</div>
            </>
          )}

          {open.kind === 'crowd' && (
            <>
              <div className="pref-pop-key text-[11.5px]">拥挤容忍度</div>
              <ChipGroup
                options={CROWD}
                selected={crowdText ? [crowdText] : []}
                onToggle={(v) =>
                  onChange({
                    ...prefs,
                    crowdTolerance: crowdText === v ? null : CROWD_VALUE[v],
                  })
                }
              />
              <div className="pref-pop-hint text-[11.5px]">不选则按默认处理</div>
            </>
          )}

          {open.kind === 'dest' && (
            <>
              <div className="pref-pop-key text-[11.5px]">想去哪（可选）</div>
              <input
                ref={inputRef}
                value={prefs.destination}
                onChange={(e) => onChange({ ...prefs, destination: e.target.value })}
                placeholder="留空则在出发点附近找"
                className="pref-pop-input h-9 w-full rounded-sm border px-2.5 text-[13px] outline-none"
              />
              <div className="pref-pop-hint text-[11.5px]">填了就在这附近找，不算作出发点</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
