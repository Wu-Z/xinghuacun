'use client'

import type { RecommendPlace } from '@/lib/core/model'
import RecommendCard from './RecommendCard'

type Props = {
  places: RecommendPlace[]
  visitOrder: string[]
  excluded: { name: string; reason: string }[]
  meta: { assumptions: string[]; unverified: string[] }
  /** 上一次追问的回答与原话，有值时在顶部提示 */
  lastExchange: { answer: string; removed: { name: string; reason: string }[] } | null
  busy: boolean
  /**
   * 刚细化完的账：列表原有几条、用户当初选了几个、细化出几个站点。
   * `selected` 必须是**细化前**的数量 —— 细化后 selectedOrder 会被继承重算，
   * 拿它当「用户选了几个」会得出「选了 4 个」这种与事实不符的说法。
   */
  finalizeNote: { before: number; selected: number; after: number } | null
  onToggle: (name: string) => void
  onOpenDetail: (name: string) => void
  onAsk: (name: string | null) => void
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="border-t border-line">
      <summary className="cursor-pointer px-4 py-2.5 text-xs text-ink-soft hover:text-ink">
        {title}
      </summary>
      <div className="px-4 pb-3 text-xs leading-relaxed text-ink-soft">{children}</div>
    </details>
  )
}

type Section =
  | { kind: 'group'; parent: string; items: RecommendPlace[] }
  | { kind: 'single'; item: RecommendPlace }

/** 细化后按 parent 分组；没有 parent 的按原顺序独立列出 */
function buildSections(places: RecommendPlace[]): Section[] {
  const out: Section[] = []

  for (const p of places) {
    if (!p.parent) {
      out.push({ kind: 'single', item: p })
      continue
    }

    const existing = out.find((s) => s.kind === 'group' && s.parent === p.parent)
    if (existing && existing.kind === 'group') {
      existing.items.push(p)
    } else {
      out.push({ kind: 'group', parent: p.parent, items: [p] })
    }
  }

  return out
}

export default function RecommendList({
  places,
  visitOrder,
  excluded,
  meta,
  lastExchange,
  busy,
  finalizeNote,
  onToggle,
  onOpenDetail,
  onAsk,
}: Props) {
  const unverified = places.filter((p) => !p.verified).length
  const sections = buildSections(places)
  // 用显式状态而不是 `places.some(p => p.parent)`：后者是「从数据反推用户做过什么」，
  // 一旦 skill 的细化输出漏了 parent（契约没把它列为必填），就什么说明都不显示了
  const refined = finalizeNote !== null

  const renderCard = (p: RecommendPlace) => {
    const i = visitOrder.indexOf(p.name)
    return (
      <RecommendCard
        key={p.name}
        place={p}
        order={i === -1 ? null : i + 1}
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
        onAsk={onAsk}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line bg-mist px-4 py-2 text-[11.5px] text-ink-soft">
        <span>
          {places.length} 条推荐
          {unverified > 0 && ` · ${unverified} 条未能核实`}
        </span>
        {!refined && (
          <button
            onClick={() => onAsk(null)}
            disabled={busy}
            className="ml-auto text-jade hover:underline disabled:opacity-50"
          >
            对这批不满意？
          </button>
        )}
      </div>

      {/* 追问的回答与它改动了什么 —— 变化必须可见、可解释 */}
      {lastExchange && (
        <div className="border-b border-line bg-jade-wash/60 px-4 py-3 text-xs leading-relaxed">
          <div className="text-ink">{lastExchange.answer}</div>
          {lastExchange.removed.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-ink-soft">
              {lastExchange.removed.map((r) => (
                <li key={r.name}>
                  移除了 <span className="text-ink">{r.name}</span> —— {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 细化完成后的说明。必须交代「未选的已移除」——
          否则用户会发现列表从 3 条变 1 条，以为东西丢了 */}
      {refined && finalizeNote && (
        <div className="border-b border-line bg-mist px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-soft">
          已把选中的 {finalizeNote.selected} 个细化为 {finalizeNote.after} 个站点
          {finalizeNote.before > finalizeNote.selected && (
            <>
              ；列表里其余 {finalizeNote.before - finalizeNote.selected} 个未选的地点已移除
            </>
          )}
          。子点默认继承你原来的选择，<span className="text-ink">请再过一遍</span>
          ，取消掉不想去的；新增的点需要你主动勾选。
        </div>
      )}

      <div className="divide-y divide-line">
        {sections.map((s) =>
          s.kind === 'single' ? (
            renderCard(s.item)
          ) : (
            <div key={s.parent}>
              <div className="bg-mist/70 px-4 py-1.5 text-[11.5px] font-medium text-ink-soft">
                {s.parent} <span className="text-ink-soft/60">↓ {s.items.length} 个站点</span>
              </div>
              <div className="divide-y divide-line border-t border-line">{s.items.map(renderCard)}</div>
            </div>
          ),
        )}
      </div>

      {/* skill 主动说明了排除了什么、依据什么假设 */}
      {excluded.length > 0 && (
        <Fold title={`排除了 ${excluded.length} 个地方`}>
          <ul className="space-y-1.5">
            {excluded.map((e) => (
              <li key={e.name}>
                <span className="text-ink">{e.name}</span>
                <span> —— {e.reason}</span>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      {(meta.assumptions.length > 0 || meta.unverified.length > 0) && (
        <Fold title="本次的假设与未核实项">
          {meta.assumptions.length > 0 && (
            <div className="mb-2">
              <div className="text-ink">假设</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {meta.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {meta.unverified.length > 0 && (
            <div>
              <div className="text-ink">未核实</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {meta.unverified.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </Fold>
      )}
    </div>
  )
}
