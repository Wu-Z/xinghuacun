'use client'

type Props = {
  /** 位置名（「厦门市集美区软件园B区」）。拿不到名字时传空串 */
  label: string
  ready: boolean
  locating: boolean
  onLocate: () => void
  onPick: () => void
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="origin-pin h-[17px] w-[17px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1116 0z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  )
}

/**
 * 出发点 = 卡片外面的一行语境。
 *
 * 原来它在输入卡内部，于是那张卡同时承担「选点 / 打字 / 发送」三件事，
 * 三者的视觉权重不同，挤在一起谁都不是主角。移出来之后卡片只剩一件事。
 *
 * 移出来也付了代价：卡内的元素天然有「这是表单」的暗示，卡外没有。
 * 所以**未选时整行变成琥珀提醒**（data-empty）——强调由状态决定，
 * 不靠一个常驻的标签去说「这里是必填」。
 *
 * ★ 它在卡片外面，压的是天空而不是白卡。已选态是深色字，
 * 在天空态下必须整行翻白（规则在 globals.css 的 .origin-row 段）。
 * 这是「把元素移出容器」必须回头检查的代价 —— 天气层那一轮已经因为
 * 同一类原因翻过车（把新文字搬进了白云的布景）。
 */
export default function OriginRow({ label, ready, locating, onLocate, onPick }: Props) {
  return (
    <div
      // 有值时不写这个属性（而不是写 ="false"）：CSS 里只判存在性
      data-empty={ready ? undefined : ''}
      className="origin-row mt-8 flex items-center gap-2.5 rounded-md border px-3.5 py-2.5"
    >
      <PinIcon />
      <span className="origin-key shrink-0 text-xs">从</span>
      <span className="origin-val min-w-0 truncate text-[13.5px]">
        {ready ? label || '已选位置' : '还没选出发点'}
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          className="origin-act rounded-xs px-2 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed"
        >
          {locating ? '定位中…' : '用我的位置'}
        </button>
        <button
          type="button"
          onClick={onPick}
          className="origin-act rounded-xs px-2 py-1.5 text-[12.5px] transition-colors"
        >
          地图选点
        </button>
      </span>
    </div>
  )
}
