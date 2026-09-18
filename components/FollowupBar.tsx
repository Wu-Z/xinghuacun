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

export default function FollowupBar({ focusName, busy, onSubmit, onCancel }: Props) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [focusName])

  const hints = focusName ? HINTS_ONE : HINTS_BATCH

  const submit = () => {
    const t = text.trim()
    if (!t || busy) return
    onSubmit(t)
    setText('')
  }

  return (
    <div className="border-b border-line bg-jade-wash/60 px-4 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-xs font-medium text-jade">
          {focusName ? `追问「${focusName}」` : '对这批结果不满意？'}
        </span>
        <button onClick={onCancel} className="ml-auto text-[11px] text-ink-soft hover:text-ink">
          取消
        </button>
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={busy}
          placeholder={focusName ? '例如：我想在这吃点东西' : '例如：我想增加点中间可以观光的地方'}
          className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none placeholder:text-ink-soft/70 focus:border-jade disabled:opacity-60"
        />
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-md bg-jade px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
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
            className="rounded-md bg-paper px-2 py-1 text-[11px] text-ink-soft hover:text-jade disabled:opacity-50"
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  )
}
