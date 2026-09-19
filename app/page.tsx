'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import ChipGroup from '@/components/ChipGroup'
import MapCanvas from '@/components/MapCanvas'
import SparkleIcon from '@/components/SparkleIcon'
import { setPlan, usePlan, type PlanDraft } from '@/lib/client/plan-session'
import { toGcj02 } from '@/lib/core/coordinate'
import type { LatLng, Preferences } from '@/lib/core/model'

const GEO_TIMEOUT_MS = 5000

const EMPTY_PREFS: Preferences = {
  intents: [],
  timeBudget: null,
  travelMode: [],
  companions: null,
  crowdTolerance: null,
  rawRequest: '',
  destination: '',
}

const CROWD_LABEL: Record<string, string> = { low: '低', medium: '一般', high: '无所谓' }
const CROWD_VALUE: Record<string, Preferences['crowdTolerance']> = {
  低: 'low',
  一般: 'medium',
  无所谓: 'high',
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-jade"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1116 0z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  )
}

export default function Home() {
  const router = useRouter()
  // 从结果页点「修改」回来时，之前填的东西要还在，不能清空重来
  const saved = usePlan()

  const [edited, setEdited] = useState<PlanDraft | null>(null)
  const [locating, setLocating] = useState(false)
  const [picking, setPicking] = useState(false)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const point: LatLng | null = edited?.point ?? saved?.point ?? null
  const label = edited?.label ?? saved?.label ?? ''
  const prefs = edited?.prefs ?? saved?.prefs ?? EMPTY_PREFS

  const update = useCallback(
    (patch: Partial<PlanDraft>) => {
      setEdited({ point, label, prefs, ...patch } as PlanDraft)
    },
    [point, label, prefs],
  )

  const setPrefs = useCallback((next: Preferences) => update({ prefs: next }), [update])

  /**
   * 把坐标换成一句人话（「厦门市集美区软件园B区」）。
   *
   * 失败就留着「当前位置」：坐标已经到手，位置名只是让它更可读，
   * 不该因为这一步失败就把人挡在这里。
   */
  const namePlace = useCallback(async (point: LatLng) => {
    try {
      const res = await fetch('/api/geocode/reverse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ point }),
      })
      if (!res.ok) return

      const data = (await res.json()) as { label?: string }
      if (!data.label) return

      // 函数式更新：这中间用户可能已经在输入框里打了字，
      // 不能拿发请求那一刻的快照把 prefs 覆盖回去
      setEdited((prev) => (prev ? { ...prev, label: data.label as string } : prev))
    } catch {
      // 静默 —— 逆地理编码只是锦上添花
    }
  }, [])

  const useGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('这个浏览器拿不到定位，直接在地图上选点吧')
      return
    }

    setLocating(true)
    setError(null)
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      setLocating(false)
      setError('定位超时了，直接在地图上选点吧')
    }, GEO_TIMEOUT_MS)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        setLocating(false)
        // 浏览器给的是 WGS-84，必须先转成 GCJ-02，
        // 否则会按偏了 100~700 米的位置去检索，推荐出一批别处的地方
        const point = toGcj02(
          { lng: pos.coords.longitude, lat: pos.coords.latitude },
          'geolocation',
        )
        // 先把坐标落下来（这一步是必然成功的），名字随后补上
        update({ point, label: '当前位置' })
        void namePlace(point)
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        setLocating(false)
        setError('没拿到定位权限，直接在地图上选点吧')
      },
      { timeout: GEO_TIMEOUT_MS, enableHighAccuracy: false },
    )
  }, [update, namePlace])

  const ready = point !== null

  const submit = () => {
    if (!ready) {
      setError('先选一个出发点')
      return
    }
    setPlan({ point, label: label || '已选位置', prefs })
    router.push('/plan')
  }

  return (
    // 靠上排而不是垂直居中：整块内容浮在屏幕正中间时，
    // 上下各留一大片空白，标题也失去了「从上面开始读」的锚点
    <main className="flex min-h-dvh justify-center bg-paper px-6 pb-16 pt-16 md:pt-24">
      <div className="w-full max-w-[680px]">
        <div className="text-[13.5px] font-semibold text-ink">周边去哪</div>

        {/*
          标题写的是用户的问题，不是产品的名字。
          首页只做一件事：让人把「想怎么玩」说出口 —— 表单、参数、选项都往后排。
        */}
        <h1 className="mt-4 text-[30px] font-semibold leading-[1.25] tracking-[-0.8px] text-ink">
          想去附近走走，
          <br />
          却不知道去哪好。
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-3">
          说一句想怎么玩，我挑出真值得去的地方，并按最优顺序排好。
        </p>

        {/*
          输入框与出发点是同一张卡：选点是发送前唯一的必填项，不该跟输入框分居两处。

          焦点态画在整张卡上（focus-within），不是画在里面的 textarea 上 ——
          输入区本身就是这张卡，方角的外框套在 22px 圆角里会错位。
        */}
        <div className="mt-8 rounded-xl border border-line bg-surface transition-colors focus-within:border-jade focus-within:ring-[3px] focus-within:ring-jade-50">
          <textarea
            value={prefs.rawRequest}
            onChange={(e) => setPrefs({ ...prefs, rawRequest: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            rows={3}
            autoFocus
            placeholder="例如：想找能坐下来喝咖啡、人不多的老街区"
            className="block w-full resize-none bg-transparent px-5 pb-1 pt-5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
          />

          <div className="flex items-center gap-3 px-5 pb-3">
            <span className="hidden text-xs text-ink-3 sm:inline">⌘ + ↵ 发送</span>
            {!ready && <span className="text-xs text-ink-3">先选出发点</span>}
            <button
              type="button"
              onClick={submit}
              aria-label="帮我推荐"
              title="帮我推荐"
              className={`ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all ${
                ready
                  ? 'bg-jade text-white hover:bg-jade-deep active:scale-95'
                  : 'cursor-not-allowed bg-mist-2 text-ink-3'
              }`}
            >
              <SparkleIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 border-t border-line px-5 py-3">
            <PinIcon />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-ink-3">出发点</div>
              <div
                className={`mt-0.5 truncate text-[13.5px] font-medium ${
                  ready ? 'text-ink' : 'text-ink-3'
                }`}
              >
                {ready ? label || '已选位置' : '还没选'}
              </div>
            </div>
            <button
              type="button"
              onClick={useGeolocation}
              disabled={locating}
              className="h-9 shrink-0 rounded-sm border border-line-2 bg-surface px-3 text-[13px] text-ink transition-colors hover:border-ink-3 disabled:cursor-not-allowed disabled:text-ink-3"
            >
              {locating ? '定位中…' : '用我的位置'}
            </button>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="h-9 shrink-0 rounded-sm border border-line-2 bg-surface px-3 text-[13px] text-ink transition-colors hover:border-ink-3"
            >
              地图选点
            </button>
          </div>
        </div>

        {/* 这些参数对结果影响很大，但不该吓退第一次输入的人 —— 所以默认收起来 */}
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="mt-4 flex items-center gap-1.5 rounded-xs px-1 py-1 text-[13px] text-ink-3 transition-colors hover:text-ink"
        >
          <span className={`transition-transform ${more ? 'rotate-90' : ''}`} aria-hidden>
            ▸
          </span>
          偏好（不填也行）
        </button>

        {more && (
          <div className="anim-fade mt-3 space-y-4 pl-5">
            <div className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-xs text-ink-3">同行人数</div>
              <input
                type="number"
                min={1}
                value={prefs.companions ?? ''}
                onChange={(e) =>
                  setPrefs({ ...prefs, companions: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="留空则由 skill 按默认处理"
                className="h-10 min-w-0 flex-1 rounded-sm border border-line-2 px-3 text-sm outline-none placeholder:text-ink-3 focus:border-jade focus:ring-[3px] focus:ring-jade-50"
              />
            </div>

            <ChipGroup
              label="拥挤容忍度"
              options={['低', '一般', '无所谓']}
              selected={prefs.crowdTolerance ? [CROWD_LABEL[prefs.crowdTolerance]] : []}
              onToggle={(v) => {
                const next = CROWD_VALUE[v]
                setPrefs({ ...prefs, crowdTolerance: prefs.crowdTolerance === next ? null : next })
              }}
            />

            <div>
              <div className="mb-2 text-xs text-ink-3">想去哪（可选）</div>
              <input
                value={prefs.destination}
                onChange={(e) => setPrefs({ ...prefs, destination: e.target.value })}
                placeholder="留空则在出发点附近找"
                className="h-10 w-full rounded-sm border border-line-2 px-3 text-sm outline-none placeholder:text-ink-3 focus:border-jade focus:ring-[3px] focus:ring-jade-50"
              />
            </div>
          </div>
        )}

        {/* 定位失败是「这条路的出口在别处」，不是操作失败 —— 用中性色，
            旁边的「地图选点」就是那句话的出口 */}
        {error && (
          <p className="mt-4 rounded-xs bg-mist px-3 py-2 text-[12.5px] text-ink-2">{error}</p>
        )}
      </div>

      {/* 地图选点：全屏浮层，选完即关。首页本体不放地图，免得跟输入框抢注意力 */}
      {picking && (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface">
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
            <span className="text-sm font-medium text-ink">在地图上点一下，作为出发点</span>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="ml-auto rounded-xs px-3 py-1.5 text-sm text-ink-3 transition-colors hover:bg-mist hover:text-ink"
            >
              取消
            </button>
          </div>
          <div className="relative flex-1">
            <MapCanvas
              origin={null}
              places={[]}
              visitOrder={[]}
              route={null}
              picking
              onPickLocation={(p) => {
                update({ point: p, label: '地图所选位置' })
                setPicking(false)
                setError(null)
              }}
            />
          </div>
        </div>
      )}
    </main>
  )
}
