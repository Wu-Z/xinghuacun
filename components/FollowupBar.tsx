'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  /** 为空表示整批追问；有值表示针对这个地点 */
  focusName: string | null
  busy: boolean
  onSubmit: (text: string) => void
  onCancel: () => void
}

const HINTS_BATCH = ['增加点能观光的地方', '换几个不那么挤的', '别去那么远']
const HINTS_ONE = ['我想在这吃点东西', '这里适合带小孩吗', '附近还有别的可去的吗']

/**
 * 追问面板内联在列表上方，不弹窗：
 * 用户要能一边看着现有结果一边提问，弹窗会把参照物挡住。
 *
 * **同一时间只允许一条在飞。** 这不是限制，是准确性：
 * 每条追问都要带一份「当前列表」作为参照，两条并行时第二份参照里
 * 还没有第一条的答案，回来的 diff 会各自基于不同版本去增删 ——
 * 结果是两边都自认为对，列表里却多出重复项。所以 busy 期间
 * 输入框、发送键、列表上的追问入口（RecommendCard）一起锁住，
 * 并把正在问的那句话显出来：锁住的时候得让人看见锁的是什么。
 */
export default function FollowupBar({ focusName, busy, onSubmit, onCancel }: Props) {
  const [text, setText] = useState('')
  /** 正在问的那句话。提交后 text 会被清空，但问题本身要留在屏幕上 */
  const [sent, setSent] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [focusName])

  const hints = focusName ? HINTS_ONE : HINTS_BATCH

  const submit = () => {
    const t = text.trim()
    if (!t || busy) return
    setSent(t)
    onSubmit(t)
    setText('')
  }

  return (
    <div className="shrink-0 border-b border-jade-100 bg-jade-50 px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-medium text-jade-deep">
          {focusName ? `追问「${focusName}」` : '对这批结果不满意？'}
        </span>
        <button
          onClick={onCancel}
          className="ml-auto text-xs text-ink-2 transition-colors hover:text-ink"
        >
          取消
        </button>
      </div>

      {busy && sent && (
        <p className="mt-2 text-xs leading-[1.6] text-jade-deep" role="status">
          正在追问「{sent}」，答完才能问下一条
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={busy}
          placeholder={
            busy
              ? '一条问完再问下一条'
              : focusName
                ? '例如：我想在这吃点东西'
                : '例如：我想增加点中间可以观光的地方'
          }
          className="h-10 min-w-0 flex-1 rounded-sm border border-jade-100 bg-surface px-3 text-sm outline-none placeholder:text-ink-3 disabled:text-ink-3 focus:border-jade focus:ring-[3px] focus:ring-jade-50"
        />
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="h-10 shrink-0 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep disabled:cursor-not-allowed disabled:bg-mist-2 disabled:text-ink-3"
        >
          {busy ? '思考中…' : '发送'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {hints.map((h) => (
          <button
            key={h}
            onClick={() => setText(h)}
            disabled={busy}
            className="rounded-xs bg-surface px-2 py-1 text-xs text-ink-3 transition-colors hover:text-jade disabled:text-ink-3/60"
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  )
}
