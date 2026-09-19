'use client'

import type { RecommendPlace } from '@/lib/core/model'
import AmapLink from './AmapLink'

type Props = {
  place: RecommendPlace | null
  selected: boolean
  onToggle: (name: string) => void
  onClose: () => void
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  )
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 pt-4">
      <h3 className="text-xs font-semibold text-ink-3">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 border-b border-line py-2.5 text-[13px] last:border-0">
      <span className="w-16 shrink-0 text-[12.5px] text-ink-3">{label}</span>
      <span className="min-w-0 flex-1 leading-[1.6] text-ink-2">{children}</span>
    </div>
  )
}

/**
 * 停靠点详情：贴在侧栏底部，描述的是列表里被点开的那一项。
 *
 * 分区而不是一排 label–value：用户点开详情是想知道「为什么是它」「要付出什么代价」，
 * 不是来查字段的。混在一起的流水账会把这两个问题埋掉。
 *
 * 桌面端是侧栏内的面板（地图仍然可见）—— 详情是「补充」，不是「跳转」。
 */
export default function StopDetail({ place, selected, onToggle, onClose }: Props) {
  if (!place) return null

  const selectable = place.verified

  return (
    <div className="anim-rise absolute inset-x-0 bottom-0 max-h-[82%] overflow-y-auto border-t border-line bg-surface shadow-4">
      <div className="sticky top-0 z-10 border-b border-line bg-surface px-4 pb-2.5 pt-4">
        <h2 className="pr-9 text-[17px] font-semibold leading-[1.4] tracking-[-0.2px] text-ink">
          {place.name}
        </h2>
        <div className="mt-0.5 text-[12.5px] text-ink-3">
          {[place.category, place.tier].filter(Boolean).join(' · ')}
        </div>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-mist"
        >
          <CloseIcon />
        </button>
      </div>

      {!place.verified && (
        <div className="border-b border-amber-line bg-amber-bg px-4 py-3 text-[12.5px] leading-[1.65] text-amber">
          高德未能核实到该地点，无法上图、也不参与路线规划。可能只是它没被收录，
          你可以用下面的链接自己看一眼。
        </div>
      )}

      <Sec title="为什么推荐">
        {place.fit.map((f, i) => (
          // skill 按用户说意图的先后顺序排 fit，第一条就是他最在意的那件事
          <div
            key={f.tag}
            className={`text-[13px] leading-[1.6] text-ink-2 ${
              i === 0 ? 'border-l-2 border-jade-100 pl-2.5' : 'mt-1.5'
            }`}
          >
            <b className="font-semibold text-jade-deep">{f.tag}</b>
            {` —— ${f.why}`}
          </div>
        ))}

        <div className="mt-2">
          {place.bestTime && <Row label="最佳时段">{place.bestTime}</Row>}
          {place.cost && <Row label="费用">{place.cost}</Row>}
          {place.crowdLevel && (
            <Row label="拥挤度">
              {place.crowdLevel}
              {place.crowdNote && ` · ${place.crowdNote}`}
            </Row>
          )}
          {place.transitHint && <Row label="交通">{place.transitHint}</Row>}
        </div>
      </Sec>

      {(place.tradeOff || place.pickIf) && (
        <Sec title="取舍">
          <div className="text-[13px] leading-[1.6] text-ink-2">
            {place.pickIf && (
              <p>
                <span className="text-ink-3">适合：</span>
                {place.pickIf}
              </p>
            )}
            {place.tradeOff && (
              <p className={place.pickIf ? 'mt-1.5' : ''}>
                <span className="text-ink-3">代价：</span>
                {place.tradeOff}
              </p>
            )}
          </div>
        </Sec>
      )}

      {place.itinerary && place.itinerary.length > 0 && (
        <Sec title="如果只去这一个">
          <ul className="space-y-1">
            {place.itinerary.map((s, i) => (
              <li key={i} className="flex gap-4 text-[13px] leading-[1.6]">
                <time className="tnum w-16 shrink-0 text-[12.5px] text-ink-3">{s.time}</time>
                <span className="min-w-0 flex-1 text-ink-2">{s.action}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 rounded-xs bg-mist px-2.5 py-2 text-xs leading-[1.6] text-ink-3">
            这段动线是 skill 按它假设的时长排的。你实际勾选多个点时，总时长以地图顶部为准
            —— 两个数字回答的是不同问题，所以不合并。
          </p>
        </Sec>
      )}

      <Sec title="可信度">
        <Row label="来源">
          {[place.source, place.confidence].filter(Boolean).join(' · ') || '未说明'}
        </Row>
        {place.address && <Row label="地址">{place.address}</Row>}
      </Sec>

      {/* 读完就能做决定，手不用移开 */}
      <div className="sticky bottom-0 mt-4 flex gap-2 border-t border-line bg-surface px-4 py-3">
        {selectable ? (
          <button
            onClick={() => onToggle(place.name)}
            aria-pressed={selected}
            className={`h-10 flex-1 rounded-sm text-[13px] font-medium transition-colors ${
              selected
                ? 'border border-line-2 bg-surface text-ink hover:border-ink-3'
                : 'bg-jade text-white hover:bg-jade-deep'
            }`}
          >
            {selected ? '从路线中移除' : '加入路线'}
          </button>
        ) : (
          <button
            disabled
            className="h-10 flex-1 cursor-not-allowed rounded-sm bg-mist-2 text-[13px] text-ink-3"
          >
            无法加入路线
          </button>
        )}
        <AmapLink
          url={place.amapUrl}
          className="flex h-10 items-center rounded-sm border border-line-2 px-3.5 text-[13px] text-ink transition-colors hover:border-ink-3"
        >
          在高德打开
        </AmapLink>
      </div>
    </div>
  )
}
