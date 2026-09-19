'use client'

import type { RecommendPlace } from '@/lib/core/model'
import AmapLink from './AmapLink'

type Props = {
  place: RecommendPlace
  order: number | null
  /**
   * 生成/追问进行中。
   *
   * 这时卡片上只允许「看」：勾选和追问都要锁住 ——
   * 列表还在往下长，此刻勾中的是一个还会变的集合；而追问问的正是
   * 一个还没定型的列表，答回来的时候参照物已经换了一批。
   * 「详情」不受影响：它是只读的，锁它只会让人觉得页面卡了。
   */
  busy: boolean
  /**
   * 鼠标（或键盘焦点）正指着它 —— 可能是列表里指过来的，也可能是地图上
   * 指着那个点指过来的。两种来源用同一个状态：它们是同一件事。
   */
  hovered?: boolean
  /** 指着这一条 / 离开这一条（离开传 null）。调用方拿它去点亮地图上的点 */
  onHover?: (name: string | null) => void
  onToggle: (name: string) => void
  onOpenDetail: (name: string) => void
  onAsk: (name: string) => void
}

const STATUS: Record<string, string> = { open: '营业中', closed: '已打烊', unknown: '' }

/** 元信息之间的分隔点。比正文更淡，只起断句作用，不参与阅读 */
function Sep() {
  return <span className="text-line-2">·</span>
}

export default function RecommendCard({
  place,
  order,
  busy,
  hovered,
  onHover,
  onToggle,
  onOpenDetail,
  onAsk,
}: Props) {
  const selectable = place.verified
  const selected = order !== null

  /*
   * 只把「主理由」放在卡片上。
   * skill 按用户说意图的先后顺序排 fit，所以第一条就是他最在意的那件事；
   * 剩下几条是补充证据，摊在卡片上只会让每条都变得一样重、一样要读 ——
   * 它们完整地留在详情面板里。
   */
  const [mainFit] = place.fit

  return (
    <div
      /*
       * data-place 是这一条的身份：地图上那个点要找回列表里的哪一张卡，
       * 靠的就是它（两边共用同一个名字，跟编号同源的道理一样）。
       */
      data-place={place.name}
      data-pointed={hovered ? 'true' : undefined}
      /*
       * 悬停与键盘焦点走同一套：焦点落在卡片里任何一个按钮上都算「正指着它」。
       * 只做鼠标的话，键盘用户就看不到「地图上那个点是它」这条线索了。
       */
      onMouseEnter={() => onHover?.(place.name)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(place.name)}
      onBlur={() => onHover?.(null)}
      className={`anim-fade relative flex gap-3 px-4 py-4 transition-colors ${
        selected ? 'bg-jade-50' : selectable ? 'hover:bg-paper' : 'stripe-locked'
      }`}
    >
      {/*
        被指到的那条画一圈内描边。
        用描边而不是换底色：底色在这个列表里已经有两种含义了
        （玉色底 = 已选、斜纹 = 未核实），再借它去说第三件事就会混。
        描边是中性的一层，压在任何底色上都不冲突。
      */}
      {hovered && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_2px_var(--color-jade-100)]"
        />
      )}

      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-jade" aria-hidden />}

      {/*
        未能核实的地点不占路线编号：它在语义上就不是一个可拜访的站点。
        编号位给的是「!」而**不是留空**：空白在那个位置会被读成「这里本该有个数字，
        但没渲染出来」—— 看起来像界面坏了。一个虚线圈里的感叹号说的是
        「这里本来就给不了编号」。
      */}
      {/*
        aria-label 始终只说这个按钮**是什么动作**（选择 / 取消选择 / 无法加入路线），
        不把「现在锁着」写进去：那是 disabled 自己要表达的状态，读屏会播。
        把状态揉进名字会让「同一张卡在生成前后叫两个不同的东西」——
        按名字找它的代码（含测试）会跟着断。
      */}
      <button
        onClick={() => selectable && onToggle(place.name)}
        disabled={!selectable || busy}
        title={busy && selectable ? '生成中，等它跑完再挑' : undefined}
        aria-label={
          selectable
            ? selected
              ? `取消选择 ${place.name}`
              : `选择 ${place.name}`
            : `${place.name} 高德未能核实，无法加入路线`
        }
        aria-pressed={selected}
        className={`tnum mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
          selected
            ? 'bg-jade text-white'
            : selectable
              ? busy
                ? 'border border-line-2 text-ink-3'
                : 'border border-line-2 text-ink-3 hover:border-jade hover:text-jade'
              : 'cursor-not-allowed border border-dashed border-line-2 text-ink-3'
        }`}
      >
        {selected ? order : selectable ? '+' : '!'}
      </button>

      <button onClick={() => onOpenDetail(place.name)} className="min-w-0 flex-1 text-left">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-[1.4] tracking-[-0.1px] text-ink">
            {place.name}
          </span>
          {/*
            高亮判据用 tier 而不是 rank === 1。
            rank 是顺序、tier 才是档位；而 parseSkillOutput 在 rank 缺失时
            会按 i+1 补位 —— 于是「追问中途补进来的沙茶面」会被高亮成「首选」。
            跟 tier 走则无论 rank 怎么写都不会错判。
          */}
          <span
            className={`shrink-0 rounded-xs px-2 py-0.5 text-xs font-medium ${
              place.tier.startsWith('首选')
                ? 'bg-jade-50 text-jade shadow-[inset_0_0_0_1px_var(--color-jade-100)]'
                : 'bg-mist text-ink-3'
            }`}
          >
            {place.tier}
          </span>
        </div>

        <div className="mt-px text-[12.5px] text-ink-3">{place.category}</div>

        {/* 主理由：这张卡片上唯一带强调的地方，扫读时一眼看到「为什么推荐它」 */}
        {mainFit && (
          <div className="mt-2 border-l-2 border-jade-100 pl-2.5 text-[13px] leading-[1.6] text-ink-2">
            <b className="font-semibold text-jade-deep">{mainFit.tag}</b>
            {` —— ${mainFit.why}`}
          </div>
        )}

        {/* 复合地点：提前告诉用户细化后会被拆开，否则列表突然变样会懵 */}
        {place.contains && place.contains.length > 0 && (
          <div className="mt-2.5 rounded-xs border border-line bg-paper px-2.5 py-2 text-xs leading-[1.6] text-ink-2">
            含 {place.contains.length} 个可玩点：{place.contains.join(' / ')}
            <br />
            <span className="text-ink-3">加入路线后会拆成独立站点，才能逐段规划</span>
          </div>
        )}

        {place.verified ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            {place.distanceMeters != null && (
              // 「直线」两个字不能省：这不是驾车里程，不标就是误导
              <span className="tnum">{(place.distanceMeters / 1000).toFixed(1)} 公里 · 直线</span>
            )}
            {place.distanceMeters != null && place.cost && <Sep />}
            {place.cost && <span>{place.cost}</span>}
            {(place.distanceMeters != null || place.cost) &&
              place.openStatus &&
              STATUS[place.openStatus] && <Sep />}
            {place.openStatus && STATUS[place.openStatus] && (
              <span className={place.openStatus === 'open' ? 'font-medium text-jade-deep' : ''}>
                {STATUS[place.openStatus]}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-2.5 rounded-xs border border-amber-line bg-amber-bg px-2.5 py-2 text-xs leading-[1.6] text-amber">
            高德未能核实到该地点，无法上图、不参与路线规划。
            <AmapLink url={place.amapUrl} className="underline underline-offset-2">
              在高德地图中查看
            </AmapLink>
          </div>
        )}
      </button>

      {/*
        操作列竖排在右：宽屏下它是卡片最右边一列，不跟正文抢横向空间。
        「详情」是新增的 —— 原来整张卡都是详情入口，但没有任何东西说明这一点。
      */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button
          onClick={() => onOpenDetail(place.name)}
          className="h-8 rounded-xs px-2.5 text-xs text-ink-3 transition-colors hover:bg-mist hover:text-jade-deep"
        >
          详情
        </button>
        <button
          onClick={() => onAsk(place.name)}
          disabled={busy}
          title={busy ? '等这条答完再问下一条' : undefined}
          className="h-8 rounded-xs px-2.5 text-xs text-ink-3 transition-colors hover:bg-mist hover:text-jade-deep disabled:cursor-not-allowed disabled:bg-mist-2 disabled:text-ink-3 disabled:hover:bg-mist-2"
        >
          追问
        </button>
      </div>
    </div>
  )
}
