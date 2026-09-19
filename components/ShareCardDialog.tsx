'use client'

import { useEffect, useRef, useState } from 'react'
import { SHARE_WHEN_PRESETS, shareFileName, type ShareCardData } from '@/lib/core/share-card'
import { exportShareCardPng } from './share-card-canvas'

type Props = {
  card: ShareCardData
  /** 「厦门 · 集美 · 周六 · 晴 26°」；拼不出来就传 null，卡面直接不留这一行 */
  contextLabel: string | null
  onChangeTitle: (title: string) => void
  onChangeWhen: (when: string | null) => void
  onClose: () => void
}

const CUSTOM = '自定义…'

/**
 * 分享卡浮层。左边是卡面，右边是三个可选项。
 *
 * 卡面的名字**在卡上就能改**（标题本身是个输入框），面板里那个输入框改的是同一份状态：
 * 用户想改的正是他眼睛盯着的那几个字，让他先去右边找一个对应的输入框是多一步。
 *
 * 「保存图片」走 Canvas 端内导出（见 share-card-canvas.ts），不引新依赖。
 */
export default function ShareCardDialog({
  card,
  contextLabel,
  onChangeTitle,
  onChangeWhen,
  onClose,
}: Props) {
  const [custom, setCustom] = useState(false)
  const [customText, setCustomText] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const faceTitleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pickPreset = (value: string | null) => {
    setCustom(false)
    setSaved(false)
    onChangeWhen(value)
  }

  const save = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const blob = await exportShareCardPng(card, { contextLabel })
      // createObjectURL 的释放要排在点击之后：提前 revoke 会让部分浏览器
      // 拿到一个已经失效的地址，下载直接静默失败
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = shareFileName(card.title)
      a.click()
      URL.revokeObjectURL(url)
      setSaved(true)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '导出图片失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(20,24,26,.55)] px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="行程分享卡"
    >
      <div className="anim-rise flex w-full max-w-[860px] flex-col gap-5 md:flex-row md:items-start">
        {/* ── 卡面 ── */}
        <div className="w-full max-w-[360px] shrink-0 self-center overflow-hidden rounded-[22px] bg-surface shadow-3 md:self-start">
          <div className="bg-gradient-to-br from-jade to-jade-deep px-6 pb-5 pt-6 text-white">
            {contextLabel && (
              <div className="text-[12.5px] text-white/80">{contextLabel}</div>
            )}

            {/*
              卡面标题就是输入框：点它就能直接改，改什么立刻印什么。
              做成 input 而不是「按钮 → 弹一个框」：这里只有一个字段，
              中间再插一层弹窗只是让用户多按一次。
            */}
            <input
              ref={faceTitleRef}
              value={card.title}
              onChange={(e) => {
                setSaved(false)
                onChangeTitle(e.target.value)
              }}
              aria-label="卡片名称"
              className="mt-1.5 w-full bg-transparent text-[21px] font-semibold leading-[1.3] tracking-[-0.4px] text-white outline-none placeholder:text-white/60 focus:underline focus:decoration-white/40 focus:underline-offset-4"
              placeholder="给这次出行取个名字"
            />

            {card.when && <div className="mt-1.5 text-[12.5px] text-white/85">出行时间 · {card.when}</div>}
            <div className="mt-1.5 text-[12.5px] text-white/80">{card.summary}</div>
          </div>

          <div className="px-6 pb-4 pt-4">
            {card.stops.map((stop) => (
              <div key={`${stop.order}-${stop.name}`}>
                {stop.leg && (
                  <div className="mb-2 flex items-start gap-2 text-[11.5px] leading-[1.5] text-ink-3">
                    <span className="mt-[9px] h-px w-3 shrink-0 bg-line-2" />
                    <span className="min-w-0 flex-1">{stop.leg}</span>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <span className="tnum mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-jade text-[11.5px] font-semibold text-white">
                    {stop.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-medium leading-[1.4] text-ink">{stop.name}</div>
                    {stop.why && (
                      <div className="mt-0.5 text-[11.5px] leading-[1.55] text-ink-3">{stop.why}</div>
                    )}
                  </div>
                </div>
                <div className="h-3.5" />
              </div>
            ))}
          </div>

          <div className="border-t border-line px-6 py-4">
            <div className="text-[13.5px] font-semibold text-jade">周边去哪</div>
            <div className="mt-1 text-[11.5px] text-ink-3">{card.disclaimer}</div>
          </div>
        </div>

        {/* ── 面板 ── */}
        <div className="w-full min-w-0 flex-1 rounded-lg border border-line bg-surface p-5 shadow-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[15px] font-semibold text-ink">分享这张路书</h2>
            <button
              onClick={onClose}
              className="ml-auto rounded-xs px-2 py-1 text-[12.5px] text-ink-3 transition-colors hover:bg-mist hover:text-ink"
            >
              关闭
            </button>
          </div>

          <div className="mt-4">
            <label className="text-xs font-semibold text-ink-3" htmlFor="share-title">
              卡片名称
            </label>
            <input
              id="share-title"
              value={card.title}
              onChange={(e) => {
                setSaved(false)
                onChangeTitle(e.target.value)
              }}
              className="mt-1.5 h-10 w-full rounded-sm border border-line-2 bg-surface px-3 text-[13.5px] text-ink outline-none transition-colors focus:border-jade focus:ring-[3px] focus:ring-jade-50"
            />
            <p className="mt-1.5 text-[12px] leading-[1.6] text-ink-3">
              默认由系统按行程给（从哪一站起、一共几站）。<b>卡上的标题也能直接点着改</b>，
              名字跟着行程存，重新分享不用再打一遍。
            </p>
          </div>

          <div className="mt-5">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-ink-3">出行时间</span>
              <span className="text-[11.5px] text-ink-3">可选</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => pickPreset(null)}
                aria-pressed={!custom && card.when === null}
                className={`h-9 rounded-xl border px-3 text-[12.5px] transition-colors ${
                  !custom && card.when === null
                    ? 'border-jade bg-jade-50 text-jade-deep'
                    : 'border-line-2 bg-surface text-ink-2 hover:border-ink-3'
                }`}
              >
                不写
              </button>

              {SHARE_WHEN_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => pickPreset(preset)}
                  aria-pressed={!custom && card.when === preset}
                  className={`h-9 rounded-xl border px-3 text-[12.5px] transition-colors ${
                    !custom && card.when === preset
                      ? 'border-jade bg-jade-50 text-jade-deep'
                      : 'border-line-2 bg-surface text-ink-2 hover:border-ink-3'
                  }`}
                >
                  {preset}
                </button>
              ))}

              <button
                onClick={() => setCustom(true)}
                aria-pressed={custom}
                className={`h-9 rounded-xl border px-3 text-[12.5px] transition-colors ${
                  custom
                    ? 'border-jade bg-jade-50 text-jade-deep'
                    : 'border-line-2 bg-surface text-ink-2 hover:border-ink-3'
                }`}
              >
                {CUSTOM}
              </button>
            </div>

            {custom && (
              <input
                value={customText}
                onChange={(e) => {
                  setCustomText(e.target.value)
                  setSaved(false)
                  onChangeWhen(e.target.value.trim() ? e.target.value : null)
                }}
                maxLength={20}
                autoFocus
                placeholder="例如：周六 14:00"
                aria-label="自定义出行时间"
                className="mt-2 h-10 w-full rounded-sm border border-line-2 bg-surface px-3 text-[13.5px] text-ink outline-none transition-colors focus:border-jade focus:ring-[3px] focus:ring-jade-50"
              />
            )}

            <p className="mt-1.5 text-[12px] leading-[1.6] text-ink-3">
              你填什么就印什么。<b>它只是你写的一句话</b>，系统不会拿它去推算到站时刻
              —— 行程页依旧不排时刻表。默认不写，卡上就不出现那一行。
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={save}
              disabled={exporting}
              className="h-11 rounded-sm bg-jade text-[13.5px] font-medium text-white transition-colors hover:bg-jade-deep disabled:cursor-not-allowed disabled:bg-mist-2 disabled:text-ink-3"
            >
              {exporting ? '正在导出…' : '保存图片'}
            </button>
          </div>

          {exportError && (
            <p className="mt-3 rounded-xs border border-red-line bg-red-bg px-3 py-2 text-[12.5px] leading-[1.6] text-red">
              导出失败：{exportError}
            </p>
          )}
          {saved && !exportError && (
            <p className="mt-3 rounded-xs bg-mist px-3 py-2 text-[12.5px] text-ink-2" role="status">
              图片已保存到下载目录。
            </p>
          )}

          {/*
            不做「复制链接」：它要一个只读分享页 + 服务端短链，是后端新能力，
            这一版没有。放一颗按不动的按钮比没有更糟 —— 这里明说下一期有什么。
          */}
          <p className="mt-3 text-[12px] leading-[1.6] text-ink-3">
            分享链接（只读行程页、别人点开就能看）排在下一期 —— 它需要服务端存一份行程，
            这一版先只出图。卡上不带出发点坐标。
          </p>
        </div>
      </div>
    </div>
  )
}
