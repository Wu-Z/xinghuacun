'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import ChipGroup from '@/components/ChipGroup'
import MapCanvas from '@/components/MapCanvas'
import SparkleIcon from '@/components/SparkleIcon'
import WeatherBar from '@/components/WeatherBar'
import WeatherOverlay from '@/components/WeatherOverlay'
import { setPlan, usePlan, type PlanDraft } from '@/lib/client/plan-session'
import { useWeather } from '@/lib/client/weather'
import { toGcj02 } from '@/lib/core/coordinate'
import type { LatLng, Preferences } from '@/lib/core/model'

const GEO_TIMEOUT_MS = 5000

/**
 * 自动定位的等待上限。比手动点那次短：这一次是页面自己在跑，
 * 不该让人对着空白的右上角干等。
 */
const AUTO_GEO_TIMEOUT_MS = 4000

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

  // 天气跟着出发点走：定了在哪出发，才谈得上「那边现在什么天」
  const weather = useWeather(point)

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

  /**
   * 进首页就取一次位置 —— 「什么都不管」也要有天气。
   *
   * 天气是这一页的背景与右上角那两行信息，它必须**早于**用户的任何选择出现。
   * 原来要等用户先点「用我的位置」才取，等于这条信息默认缺席。
   *
   * 三条约束，缺一不可：
   * 1. **只自动尝试一次**（autoTried）。浏览器的权限弹窗不是能反复弹的东西，
   *    被拒了就安静收场，出口留给「用我的位置」和「地图选点」；
   * 2. **失败静默**。用户没主动要求过这件事，无端弹一句错误是骚扰 ——
   *    手动点那次仍照常报错，因为那是他自己要的；
   * 3. **不覆盖已有的出发点**。从结果页点「修改」回来时用户选过的点还在，
   *    自动定位不该把他挪到别处去。
   */
  const autoTried = useRef(false)
  useEffect(() => {
    if (autoTried.current) return
    autoTried.current = true

    if (saved?.point) return
    if (!navigator.geolocation) return

    let expired = false
    const timer = setTimeout(() => {
      // 超时之后回调再来就当它没发生 —— 页面已经往下走了
      expired = true
    }, AUTO_GEO_TIMEOUT_MS)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        if (expired) return
        // 浏览器给的是 WGS-84，必须先转成 GCJ-02，
        // 否则会按偏了 100~700 米的位置去取天气
        const point = toGcj02(
          { lng: pos.coords.longitude, lat: pos.coords.latitude },
          'geolocation',
        )
        // 函数式更新：定位返回的这几秒里用户可能已经自己选了点，他选的永远优先
        setEdited((prev) => (prev?.point ? prev : { point, label: '当前位置', prefs: EMPTY_PREFS }))
        // 名字随后补上。逆地理编码失败也只是显示「当前位置」，不影响天气
        void namePlace(point)
      },
      () => {
        clearTimeout(timer)
      },
      { timeout: AUTO_GEO_TIMEOUT_MS, enableHighAccuracy: false },
    )
    /*
     * ★ 这里刻意**不返回 cleanup**。
     *
     * React 在开发模式下会把 effect 跑两遍（挂载 → 卸载 → 再挂载），
     * 第一遍结束时 cleanup 会执行。若在 cleanup 里把「还活着」的标记置 false：
     * 第一遍发出的定位结果会被丢掉，第二遍又被 autoTried 挡回去 ——
     * 自动定位**永远不生效**。这个坑实测踩到了：data-weather 一直是 off、
     * 出发点一直停在「还没选」，而页面上没有任何报错。
     *
     * 定位是一次幂等的只读查询，取消它没有任何意义。让它跑完，
     * 回调里再判一次超时即可。
     */
  }, [saved, namePlace])

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
    <main
      // 天空出现 / 消失时，压在它上面的文字要跟着换色。开关放在页面根上，
      // 由 CSS 统一接管，省得在每个元素里判一次 weather。
      data-weather={weather ? 'on' : 'off'}
      // 这里**不能**再写 bg-paper：天空层是 z-index:-1 的 fixed 元素，
      // 铺在 body 底色之上、内容之下；父级一有不透明背景就会把它整片糊掉。
      className="flex min-h-dvh justify-center px-6 pb-16 pt-16 md:pt-24"
    >
      {/*
        蒙版挂在页面根的第一个子节点：它在 DOM 里先于所有内容，
        作为 fixed 层铺在背景之上、肉眼之下 —— pointer-events 与透明度
        的边界都写在 globals.css 的 .weather-sky 里。
      */}
      <WeatherOverlay weather={weather} />
      <div className="w-full max-w-[680px]">
        {/*
          天气与品牌字同一行、靠右：它是这一页的**环境**，不是对某个输入的回答。
          一进首页定位拿到就该出现，早于用户做出任何选择。
          拿不到天气时 WeatherBar 整个不渲染，这一行就只剩品牌字，间距也不会变。
        */}
        <div className="flex items-start justify-between gap-6">
          <div className="sky-ink text-[13.5px] font-semibold">周边去哪</div>
          <WeatherBar weather={weather} />
        </div>

        {/*
          标题写的是用户的问题，不是产品的名字。
          首页只做一件事：让人把「想怎么玩」说出口 —— 表单、参数、选项都往后排。
        */}
        <h1 className="sky-ink mt-4 text-[30px] font-semibold leading-[1.25] tracking-[-0.8px]">
          想去附近走走，
          <br />
          却不知道去哪好。
        </h1>
        <p className="sky-ink-3 mt-3 text-sm leading-relaxed">
          说一句想怎么玩，我挑出真值得去的地方，并按最优顺序排好。
        </p>

        {/*
          输入框与出发点是同一张卡：选点是发送前唯一的必填项，不该跟输入框分居两处。

          焦点态画在整张卡上（focus-within），不是画在里面的 textarea 上 ——
          输入区本身就是这张卡，方角的外框套在 22px 圆角里会错位。
        */}
        <div className="sky-card mt-8 rounded-xl border border-line bg-surface transition-colors focus-within:border-jade focus-within:ring-[3px] focus-within:ring-jade-50">
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
          className="sky-ink-3 mt-4 flex items-center gap-1.5 rounded-xs px-1 py-1 text-[13px] transition-colors"
        >
          <span className={`transition-transform ${more ? 'rotate-90' : ''}`} aria-hidden>
            ▸
          </span>
          偏好（不填也行）
        </button>

        {more && (
          <div className="anim-fade mt-3 space-y-4 pl-5">
            <div className="flex items-center gap-3">
              <div className="sky-ink-3 w-20 shrink-0 text-xs">同行人数</div>
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
              <div className="sky-ink-3 mb-2 text-xs">想去哪（可选）</div>
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
