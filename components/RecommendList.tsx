'use client'

import type { RecommendPlace } from '@/lib/core/model'
import RecommendCard from './RecommendCard'
import ViewSwitch from './ViewSwitch'

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
  /** 有路线可看时才给切换（传了才渲染），否则这两个标签点了没反应 */
  viewSwitch?: { view: 'list' | 'timeline'; onChange: (view: 'list' | 'timeline') => void }
  /** 正被指着的那一条（可能是从地图上指过来的） */
  hovered?: string | null
  /** 指着某一条 / 离开（传 null）。调用方拿它去点亮地图上对应的点 */
  onHover?: (name: string | null) => void
  onToggle: (name: string) => void
  onOpenDetail: (name: string) => void
  onAsk: (name: string | null) => void
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="border-t border-line">
      <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] text-ink-3 hover:text-ink">
        {title}
      </summary>
      <div className="px-4 pb-3 text-[12.5px] leading-[1.8] text-ink-3">{children}</div>
    </details>
  )
}

type Section =
  | { kind: 'group'; parent: string; items: RecommendPlace[] }
  | { kind: 'anchored'; item: RecommendPlace; asked: RecommendPlace[] }
  | { kind: 'single'; item: RecommendPlace }

/**
 * 两种分组，语义完全不同，别混：
 *
 * - **`parent`**（细化）：一个复合地点被**拆开**成若干站点。子点继承父级选中是合理的，
 *   它们本来就是同一个地方。组头写「N 个站点（由 1 个复合地点拆出）」。
 * - **`askedFrom`**（追问）：一条推荐是「在某个地点旁边」被找出来的。这只是**来源归属**，
 *   两者是各自独立的行程项，**不级联选中**。组头写「的追问新增」。
 */
function buildSections(places: RecommendPlace[]): Section[] {
  const byName = new Map(places.map((p) => [p.name, p]))

  // 锚点必须确实在列表里、且它自己不是被追问带上来的，
  // 否则会形成「挂在一条本身也悬挂着的项下面」的链
  const childrenOf = new Map<string, RecommendPlace[]>()
  const consumed = new Set<string>()
  for (const p of places) {
    /*
     * 有 askedFrom 就归锚点，不看 parent。
     *
     * refine 里出现 parent 是 skill 违约（parent 属于 finalize，契约写死的），
     * 但真出现了也不能让它生效：那条「追问新增」会被塞进
     * 「集美学村 · N 个站点（由 1 个复合地点拆出）」的分组，而那句话是假的 ——
     * 根本没发生过拆解。来源归属才是这里唯一为真的事实。
     */
    const anchor = p.askedFrom
    if (!anchor) continue

    const target = byName.get(anchor)
    if (!target || target.askedFrom || target.parent) continue

    childrenOf.set(anchor, [...(childrenOf.get(anchor) ?? []), p])
    consumed.add(p.name)
  }

  const out: Section[] = []

  for (const p of places) {
    // 已经被挂到锚点下面的，不再单独出现在顶层
    if (consumed.has(p.name)) continue

    if (!p.parent) {
      const asked = childrenOf.get(p.name)
      out.push(asked ? { kind: 'anchored', item: p, asked } : { kind: 'single', item: p })
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
  viewSwitch,
  hovered,
  onHover,
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
        busy={busy}
        hovered={hovered === p.name}
        onHover={onHover}
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
        onAsk={onAsk}
      />
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-paper px-4 py-2.5 text-xs text-ink-3">
        <span>
          {places.length} 条推荐
          {unverified > 0 && ` · ${unverified} 条未能核实`}
        </span>
        {!refined && (
          <button
            onClick={() => onAsk(null)}
            disabled={busy}
            className="text-jade hover:underline disabled:text-ink-3"
          >
            对这批不满意？
          </button>
        )}
        {viewSwitch && (
          <div className="ml-auto">
            <ViewSwitch view={viewSwitch.view} onChange={viewSwitch.onChange} />
          </div>
        )}
      </div>

      {/*
        「直线」这件事一次说清楚，而不是每条卡片各藏一句。
        它是这个产品最容易让人误会的地方：列表上的公里数不是要走的路。
      */}
      <div className="border-b border-line bg-jade-50 px-4 py-2.5 text-[12.5px] leading-[1.65] text-jade-deep">
        距离是<b className="font-semibold">直线距离</b>，不是要走的路 —— 真实里程要等你选定后才算得出来。
      </div>

      {/* 追问的回答与它改动了什么 —— 变化必须可见、可解释 */}
      {lastExchange && (
        <div className="border-b border-line bg-jade-50/60 px-4 py-3 text-[12.5px] leading-[1.65]">
          <div className="text-ink">{lastExchange.answer}</div>
          {lastExchange.removed.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-ink-3">
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
        <div className="border-b border-line bg-jade-50 px-4 py-2.5 text-[12.5px] leading-[1.65] text-jade-deep">
          已把选中的 <b className="font-semibold">{finalizeNote.selected} 个</b>细化为{' '}
          <b className="font-semibold">{finalizeNote.after} 个站点</b>
          {finalizeNote.before > finalizeNote.selected && (
            <>
              ；没选的 <b className="font-semibold">{finalizeNote.before - finalizeNote.selected} 个</b>
              已从列表移除
            </>
          )}
          。子点沿用你原来的选择，<b className="font-semibold">请再过一遍</b>
          ；新增的站点需要你主动勾选。
        </div>
      )}

      <div className="divide-y divide-line">
        {sections.map((s) =>
          s.kind === 'single' ? (
            renderCard(s.item)
          ) : s.kind === 'anchored' ? (
            <div key={s.item.name} className="anim-fade">
              {renderCard(s.item)}
              {/*
                归属：缩进 + 左侧竖线 + 转角箭头 —— 读起来是「挂在上面那条下面」。
                措辞用「的追问新增」而不是「附近」，后者会替 skill
                担保一件它没说过的事：实测有新增项自己承认要接驳一站。

                这三样一个都不能省：卡片本身是整宽的，只挂一条 2px 的线
                而不缩进的话，子卡和顶层卡长得一模一样 —— 那就等于没表达。
              */}
              <div className="border-t border-line bg-mist/40 pb-2">
                <div className="flex items-baseline gap-1.5 py-1.5 pl-3 text-xs text-ink-2">
                  {/* 箭头是装饰，读屏不该念出来；归属靠它和缩进一起表达 */}
                  <span aria-hidden className="text-jade">
                    ↳
                  </span>
                  「{s.item.name}」的追问新增
                </div>
                <div className="ml-6 divide-y divide-line border-l-2 border-jade-100">
                  {s.asked.map(renderCard)}
                </div>
              </div>
            </div>
          ) : (
            <div key={s.parent}>
              <div className="flex items-center gap-2 bg-mist px-4 py-[7px] text-xs font-semibold text-ink-2">
                {s.parent}
                <span className="font-normal text-ink-3">
                  · {s.items.length} 个站点（由 1 个复合地点拆出）
                </span>
              </div>
              <div className="divide-y divide-line">{s.items.map(renderCard)}</div>
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
