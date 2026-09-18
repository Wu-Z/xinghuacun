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
        update({
          point: toGcj02({ lng: pos.coords.longitude, lat: pos.coords.latitude }, 'geolocation'),
          label: '当前位置',
        })
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
  }, [update])

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
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-[680px]">
        <h1 className="text-xl font-semibold text-ink">周边去哪</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          一句话说清想怎么玩。我挑出真值得去的地方，并排好拜访顺序。
        </p>

        {/* 输入框是这一页的主角 */}
        <div className="group relative mt-8 rounded-2xl border border-line bg-paper transition-colors focus-within:border-jade">
          <textarea
            value={prefs.rawRequest}
            onChange={(e) => setPrefs({ ...prefs, rawRequest: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            rows={3}
            autoFocus
            placeholder="例如：想找能坐下来喝咖啡、人不多的老街区"
            className="block w-full resize-none bg-transparent px-5 pb-14 pt-5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-soft/60"
          />

          <div className="absolute inset-x-5 bottom-4 flex items-center gap-3">
            {!ready && <span className="text-xs text-ink-soft">先选出发点</span>}
            <button
              type="button"
              onClick={submit}
              aria-label="帮我推荐"
              title="帮我推荐"
              className={`ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all ${
                ready
                  ? 'bg-jade text-white hover:bg-jade-deep active:scale-95'
                  : 'cursor-not-allowed bg-mist text-ink-soft/50'
              }`}
            >
              <SparkleIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 出发点 */}
        <div className="mt-4 rounded-xl bg-mist px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-ink-soft">出发点</div>
              <div
                className={`mt-0.5 truncate text-sm font-medium ${
                  ready ? 'text-ink' : 'text-ink-soft'
                }`}
              >
                {ready ? label || '已选位置' : '还没选'}
              </div>
            </div>
            <button
              type="button"
              onClick={useGeolocation}
              disabled={locating}
              className="shrink-0 rounded-md bg-paper px-3 py-2 text-sm text-ink transition-colors hover:bg-line disabled:cursor-not-allowed disabled:text-ink-soft"
            >
              {locating ? '定位中…' : '用我的位置'}
            </button>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="shrink-0 rounded-md bg-paper px-3 py-2 text-sm text-ink transition-colors hover:bg-line"
            >
              地图选点
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="mt-4 flex items-center gap-1 text-xs text-ink-soft transition-colors hover:text-ink"
        >
          <span className={`transition-transform ${more ? 'rotate-90' : ''}`}>▸</span>
          {more ? '收起' : '更多（同行人 / 拥挤度 / 想去哪）'}
        </button>

        {more && (
          <div className="mt-4 space-y-4 pl-4">
            <div className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-xs text-ink-soft">同行人数</div>
              <input
                type="number"
                min={1}
                value={prefs.companions ?? ''}
                onChange={(e) =>
                  setPrefs({ ...prefs, companions: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="留空则由 skill 按默认处理"
                className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-jade"
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
              <div className="mb-2 text-xs text-ink-soft">想去哪（可选）</div>
              <input
                value={prefs.destination}
                onChange={(e) => setPrefs({ ...prefs, destination: e.target.value })}
                placeholder="留空则在出发点附近找"
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-jade"
              />
            </div>
          </div>
        )}

        {error && <p className="mt-5 text-sm text-red-700">{error}</p>}
      </div>

      {/* 地图选点：全屏浮层，选完即关。首页本体不放地图，免得跟输入框抢注意力 */}
      {picking && (
        <div className="fixed inset-0 z-50 flex flex-col bg-paper">
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
            <span className="text-sm font-medium text-ink">在地图上点一下，作为出发点</span>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="ml-auto rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-mist hover:text-ink"
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
