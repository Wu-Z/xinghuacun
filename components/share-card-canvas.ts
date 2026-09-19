'use client'

import type { ShareCardData } from '@/lib/core/share-card'

/**
 * 把分享卡画成一张 PNG。
 *
 * 为什么是 Canvas 而不是「DOM 截图」：截图要引 html2canvas 之类的库
 * （几万行、把整棵 DOM 又实现一遍），而这张卡的版式是固定的几行字。
 * 自己画一遍比引进一个渲染器便宜，也不必担心它读不出来的 CSS。
 *
 * 代价是**版式在这两个地方各写一遍**（这里的常量 vs 浮层里的 CSS）。
 * 所以两边用的尺寸、文案顺序、颜色都从同一份 token 来：
 * 颜色取 globals.css 的 @theme 值，文案取 lib/core/share-card 的装配结果。
 */
const CARD_W = 1080

/** 与界面同一套玉色 / 暖白，见 app/globals.css 的 @theme */
const C = {
  jade: '#0f6e6e',
  jadeDeep: '#0b5252',
  ink: '#14181a',
  ink2: '#3c464a',
  ink3: '#5f686e',
  line: '#e4e1da',
  surface: '#ffffff',
} as const

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif'

const PAD = 72
/** 卡面圆角。与浮层预览里的 rounded-[28px] 对应（预览按 0.5 倍展示） */
const RADIUS = 48

const HEAD_TOP = 64
const HEAD_BOTTOM = 60
const LIST_TOP = 52
const LIST_BOTTOM = 44
const FOOT_TOP = 56
const FOOT_BOTTOM = 64

/** 一行文本的绘制规格：字号、行高、颜色、粗细 */
type TextSpec = {
  font: string
  size: number
  lineHeight: number
  color: string
  /** 顶端额外留白 */
  gap?: number
}

const SPEC = {
  context: { font: '400', size: 28, lineHeight: 36, color: 'rgba(255,255,255,.82)' },
  title: { font: '600', size: 62, lineHeight: 76, color: '#ffffff', gap: 18 },
  when: { font: '500', size: 28, lineHeight: 36, color: 'rgba(255,255,255,.86)', gap: 16 },
  summary: { font: '400', size: 28, lineHeight: 36, color: 'rgba(255,255,255,.82)', gap: 18 },
  stopName: { font: '600', size: 40, lineHeight: 50, color: C.ink },
  stopWhy: {
    font: '400',
    size: 27,
    lineHeight: 38,
    color: C.ink3,
    gap: 8,
  },
  leg: { font: '400', size: 27, lineHeight: 38, color: C.ink3 },
  brand: { font: '600', size: 34, lineHeight: 44, color: C.jade },
  disclaimer: { font: '400', size: 25, lineHeight: 34, color: C.ink3, gap: 10 },
} satisfies Record<string, TextSpec>

export type ShareCardDrawOptions = {
  /** 「厦门 · 集美 · 周六 · 晴 26°」。拼不出来的部分调用方就不放进来 */
  contextLabel: string | null
  brand?: string
}

/**
 * 按宽度裁到一行，超出加省略号。
 *
 * 不做多行：站名和理由都是一行的事，换行会把卡片撑成一张纸，
 * 而分享图的价值恰恰在于「一眼能看完」。
 */
function fitOneLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text

  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function line(ctx: CanvasRenderingContext2D, spec: TextSpec, x: number, baseline: number, text: string, maxWidth: number): void {
  ctx.font = `${spec.font} ${spec.size}px ${FONT}`
  ctx.fillStyle = spec.color
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(maxWidth > 0 ? fitOneLine(ctx, text, maxWidth) : text, x, baseline)
}

/** 头部高度：有出行时间就多一行 */
function headHeight(card: ShareCardData): number {
  let h = HEAD_TOP + SPEC.context.lineHeight + SPEC.title.gap + SPEC.title.lineHeight
  if (card.when) h += SPEC.when.gap + SPEC.when.lineHeight
  h += SPEC.summary.gap + SPEC.summary.lineHeight + HEAD_BOTTOM
  return h
}

/** 列表高度：每段 leg 单独占一行，不挤在站名旁边 —— 与界面上的时间轴同一套读法 */
function listHeight(card: ShareCardData): number {
  let h = 0
  for (const stop of card.stops) {
    h += SPEC.stopName.lineHeight + SPEC.stopWhy.gap + SPEC.stopWhy.lineHeight
    if (stop.leg) h += SPEC.leg.lineHeight + 18
  }
  return h
}

export function shareCardHeight(card: ShareCardData): number {
  return (
    headHeight(card) +
    LIST_TOP +
    listHeight(card) +
    LIST_BOTTOM +
    FOOT_TOP +
    SPEC.brand.lineHeight +
    SPEC.disclaimer.gap +
    SPEC.disclaimer.lineHeight +
    FOOT_BOTTOM
  )
}

export const SHARE_CARD_WIDTH = CARD_W

export function drawShareCard(
  canvas: HTMLCanvasElement,
  card: ShareCardData,
  options: ShareCardDrawOptions,
): void {
  const brand = options.brand ?? '周边去哪'
  const height = shareCardHeight(card)

  canvas.width = CARD_W
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('这台设备拿不到画布，导不出图片')

  // 整张卡的底：先铺白，头部再盖一层玉色渐变
  ctx.clearRect(0, 0, CARD_W, height)
  roundRect(ctx, 0, 0, CARD_W, height, RADIUS)
  ctx.save()
  ctx.clip()
  ctx.fillStyle = C.surface
  ctx.fillRect(0, 0, CARD_W, height)

  const head = headHeight(card)
  const gradient = ctx.createLinearGradient(0, 0, CARD_W * 0.6, head)
  gradient.addColorStop(0, C.jade)
  gradient.addColorStop(1, C.jadeDeep)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CARD_W, head)

  // ── 头部 ──
  const innerW = CARD_W - PAD * 2
  let y = HEAD_TOP

  if (options.contextLabel) {
    y += SPEC.context.lineHeight
    line(ctx, SPEC.context, PAD, y - 8, options.contextLabel, innerW)
  } else {
    // 语境行不给时不留空档：卡片顶上去，不让读者以为这里漏了什么
    y -= SPEC.context.lineHeight
  }

  y += SPEC.title.gap + SPEC.title.lineHeight
  line(ctx, SPEC.title, PAD, y - 12, card.title, innerW)

  if (card.when) {
    y += SPEC.when.gap + SPEC.when.lineHeight
    // 「出行时间」四个字是给收到卡的人的交代：这是人写的，不是系统排的
    line(ctx, SPEC.when, PAD, y - 8, `出行时间 · ${card.when}`, innerW)
  }

  y += SPEC.summary.gap + SPEC.summary.lineHeight
  line(ctx, SPEC.summary, PAD, y - 8, card.summary, innerW)

  // ── 站点列表 ──
  y = head + LIST_TOP
  const dotX = PAD + 22
  const textX = PAD + 68

  card.stops.forEach((stop) => {
    // 编号圆点：与列表、地图、时间轴上的编号同源
    ctx.beginPath()
    ctx.arc(dotX, y + SPEC.stopName.lineHeight / 2 - 4, 22, 0, Math.PI * 2)
    ctx.fillStyle = C.jade
    ctx.fill()

    ctx.font = `600 24px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText(String(stop.order), dotX, y + SPEC.stopName.lineHeight / 2 + 4)
    ctx.textAlign = 'left'

    y += SPEC.stopName.lineHeight
    line(ctx, SPEC.stopName, textX, y - 10, stop.name, CARD_W - PAD - textX)

    if (stop.why) {
      y += SPEC.stopWhy.gap + SPEC.stopWhy.lineHeight
      line(ctx, SPEC.stopWhy, textX, y - 8, stop.why, CARD_W - PAD - textX)
    } else {
      y += SPEC.stopWhy.gap + SPEC.stopWhy.lineHeight
    }

    if (stop.leg) {
      y += SPEC.leg.lineHeight + 18
      // 段前一个短横：说明这行说的是「怎么从上一站过来」，而不是这一站的描述
      ctx.strokeStyle = C.line
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(textX, y - SPEC.leg.lineHeight + 12)
      ctx.lineTo(textX + 16, y - SPEC.leg.lineHeight + 12)
      ctx.stroke()
      line(ctx, SPEC.leg, textX + 28, y - 8, stop.leg, CARD_W - PAD - textX - 28)
    }
  })

  // ── 底部 ──
  y = height - FOOT_BOTTOM - SPEC.disclaimer.lineHeight - SPEC.disclaimer.gap - SPEC.brand.lineHeight
  ctx.strokeStyle = C.line
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(CARD_W - PAD, y)
  ctx.stroke()

  y += FOOT_TOP - 20 + SPEC.brand.lineHeight
  line(ctx, SPEC.brand, PAD, y - 10, brand, innerW)

  y += SPEC.disclaimer.gap + SPEC.disclaimer.lineHeight
  line(ctx, SPEC.disclaimer, PAD, y - 8, card.disclaimer, innerW)

  ctx.restore()
}

/** 导出成 PNG 字节流。失败必须抛 —— 静默吞掉会变成一个「点了没反应」的按钮 */
export async function exportShareCardPng(
  card: ShareCardData,
  options: ShareCardDrawOptions,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  drawShareCard(canvas, card, options)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('导出图片失败，可以试试点「保存图片」再来一次'))
    }, 'image/png')
  })
}
