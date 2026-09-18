'use client'

import type { RecommendPlace } from '@/lib/core/model'
import RecommendCard from './RecommendCard'

type Props = {
  places: RecommendPlace[]
  visitOrder: string[]
  excluded: { name: string; reason: string }[]
  meta: { assumptions: string[]; unverified: string[] }
  onToggle: (name: string) => void
  onOpenDetail: (name: string) => void
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

export default function RecommendList({
  places,
  visitOrder,
  excluded,
  meta,
  onToggle,
  onOpenDetail,
}: Props) {
  const unverified = places.filter((p) => !p.verified).length

  return (
    <div>
      <div className="border-b border-line bg-mist px-4 py-2 text-[11.5px] text-ink-soft">
        {places.length} 条推荐
        {unverified > 0 && ` · ${unverified} 条未能核实`}
      </div>

      <div className="divide-y divide-line">
        {places.map((p) => {
          const i = visitOrder.indexOf(p.name)
          return (
            <RecommendCard
              key={p.name}
              place={p}
              order={i === -1 ? null : i + 1}
              onToggle={onToggle}
              onOpenDetail={onOpenDetail}
            />
          )
        })}
      </div>

      {/* skill 主动说明了排除了什么、依据什么假设 —— 丢掉可惜，直接回答「为什么没推荐 XX」 */}
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
