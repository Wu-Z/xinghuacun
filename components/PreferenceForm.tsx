'use client'

import { useState } from 'react'

export type Preferences = {
  intents: string[]
  timeBudget: string | null
  travelMode: string[]
  companions: number | null
  crowdTolerance: 'low' | 'medium' | 'high' | null
  destination: string
}

export const EMPTY_PREFERENCES: Preferences = {
  intents: [],
  timeBudget: null,
  travelMode: [],
  companions: null,
  crowdTolerance: null,
  destination: '',
}

const INTENTS = ['拍照', '放松', '遛娃', '约会', '朋友聚会', '运动', '一个人待着']
const BUDGETS = ['1 小时内', '半天', '全天']
const MODES = ['步行', '骑行', '驾车', '打车', '公共交通']
const CROWDS: [Preferences['crowdTolerance'], string][] = [
  ['low', '低'],
  ['medium', '一般'],
  ['high', '无所谓'],
]

type Props = {
  value: Preferences
  onChange: (v: Preferences) => void
  onSubmit: () => void
  busy: boolean
}

const CHIP = 'rounded-md px-2.5 py-1 text-xs transition-colors'
const IDLE = 'bg-mist text-ink-soft hover:bg-line hover:text-ink'

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-ink-soft">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

export default function PreferenceForm({ value, onChange, onSubmit, busy }: Props) {
  const [more, setMore] = useState(false)

  return (
    <div className="space-y-3">
      <Field label="想干什么">
        {INTENTS.map((i) => (
          <button
            key={i}
            aria-pressed={value.intents.includes(i)}
            onClick={() => onChange({ ...value, intents: toggle(value.intents, i) })}
            className={`${CHIP} ${value.intents.includes(i) ? 'bg-jade text-white' : IDLE}`}
          >
            {i}
          </button>
        ))}
      </Field>

      <Field label="能花多久">
        {BUDGETS.map((b) => (
          <button
            key={b}
            aria-pressed={value.timeBudget === b}
            onClick={() => onChange({ ...value, timeBudget: value.timeBudget === b ? null : b })}
            className={`${CHIP} ${value.timeBudget === b ? 'bg-jade text-white' : IDLE}`}
          >
            {b}
          </button>
        ))}
      </Field>

      <Field label="怎么去">
        {MODES.map((m) => (
          <button
            key={m}
            aria-pressed={value.travelMode.includes(m)}
            onClick={() => onChange({ ...value, travelMode: toggle(value.travelMode, m) })}
            className={`${CHIP} ${value.travelMode.includes(m) ? 'bg-jade text-white' : IDLE}`}
          >
            {m}
          </button>
        ))}
      </Field>

      <button
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        className="text-xs text-ink-soft underline decoration-line underline-offset-4 hover:text-ink"
      >
        {more ? '收起更多选项' : '更多（同行人 / 拥挤度 / 想去哪）'}
      </button>

      {more && (
        <div className="space-y-3 pt-1">
          <div>
            <div className="mb-1.5 text-xs text-ink-soft">同行人数</div>
            <input
              type="number"
              min={1}
              value={value.companions ?? ''}
              onChange={(e) =>
                onChange({ ...value, companions: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="留空则由 skill 按默认处理"
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-jade"
            />
          </div>

          <Field label="拥挤容忍度">
            {CROWDS.map(([v, label]) => (
              <button
                key={String(v)}
                aria-pressed={value.crowdTolerance === v}
                onClick={() =>
                  onChange({ ...value, crowdTolerance: value.crowdTolerance === v ? null : v })
                }
                className={`${CHIP} ${value.crowdTolerance === v ? 'bg-jade text-white' : IDLE}`}
              >
                {label}
              </button>
            ))}
          </Field>

          <div>
            <div className="mb-1.5 text-xs text-ink-soft">想去哪（可选）</div>
            <input
              value={value.destination}
              onChange={(e) => onChange({ ...value, destination: e.target.value })}
              placeholder="留空则在出发点附近找"
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-jade"
            />
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={busy}
        className="w-full rounded-lg bg-jade py-2.5 text-sm font-semibold text-white transition-colors hover:bg-jade-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? '正在找…' : '帮我推荐'}
      </button>
    </div>
  )
}
