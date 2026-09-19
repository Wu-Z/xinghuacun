'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import MapPicker from '@/components/MapPicker'
import OriginRow from '@/components/OriginRow'
import PreferencePills from '@/components/PreferencePills'
import SparkleIcon from '@/components/SparkleIcon'
import WeatherBar from '@/components/WeatherBar'
import WeatherOverlay from '@/components/WeatherOverlay'
import { withToken } from '@/lib/client/auth'
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

export default function Home() {
  const router = useRouter()
  // 从结果页点「修改」回来时，之前填的东西要还在，不能清空重来
  const saved = usePlan()

  const [edited, setEdited] = useState<PlanDraft | null>(null)
  const [locating, setLocating] = useState(false)
  const [picking, setPicking] = useState(false)
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
      const res = await fetch(withToken('/api/geocode/reverse'), {
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
    router.push(withToken('/plan'))
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
          出发点在卡片**外面**，是一行语境不是表单里的一段。
          它原来和输入框同卡，于是那张卡同时承担「选点 / 打字 / 发送」三件事，
          三者的视觉权重不同，挤在一起谁都不是主角。

          代价是失去了「卡内 = 表单 = 必填」这层暗示，所以未选时它整行转琥珀
          （见 OriginRow 与 globals.css 的 .origin-row 段）。
          而「自动定位已经替你填好」之后，它多数时候本来就只是一句交代。
        */}
        <OriginRow
          label={label}
          ready={ready}
          locating={locating}
          onLocate={useGeolocation}
          onPick={() => setPicking(true)}
        />

        {/*
          输入卡只做一件事：打字 + 发送。

          焦点态画在整张卡上（focus-within），不是画在里面的 textarea 上 ——
          输入区本身就是这张卡，方角的外框套在 22px 圆角里会错位。
        */}
        <div className="sky-card mt-2.5 rounded-xl border border-line bg-surface transition-colors focus-within:border-jade focus-within:ring-[3px] focus-within:ring-jade-50">
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

          {/*
            右侧这三样都在回答「旁边这个键」：
              「先选出发点」→ 它为什么按不动（ink-2，更实）
              「⌘ + ↵ 发送」→ 它怎么用（ink-3，更弱）
            紧挨着键排，而不是各自缩在卡片两端 —— 原先那句话解释的正是这个键，
            却离它隔着一整行。
            发送提示在窄屏上省掉（手机没有 ⌘ 键），状态提示不能省。
          */}
          <div className="flex items-center gap-2.5 px-4 pb-3.5 pt-2.5">
            <span className="flex-1" />
            {!ready && <span className="shrink-0 text-xs text-ink-2">先选出发点</span>}
            <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">⌘ + ↵ 发送</span>
            <button
              type="button"
              onClick={submit}
              aria-label="帮我推荐"
              title="帮我推荐"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all ${
                ready
                  ? 'bg-jade text-white hover:bg-jade-deep active:scale-95'
                  : 'cursor-not-allowed bg-mist-2 text-ink-3'
              }`}
            >
              <SparkleIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/*
          这些参数对结果影响很大，但不该吓退第一次输入的人 —— 所以收成一行 pill：
          有值才展开浮层，不再靠「▸ 偏好（不填也行）」这个很弱的入口去揭示它们。
        */}
        <PreferencePills prefs={prefs} onChange={setPrefs} />

        {/* 定位失败是「这条路的出口在别处」，不是操作失败 —— 用中性色，
            旁边的「地图选点」就是那句话的出口 */}
        {error && (
          <p className="mt-4 rounded-xs bg-mist px-3 py-2 text-[12.5px] text-ink-2">{error}</p>
        )}
      </div>

      {/*
        地图选点：全屏浮层，选完即关。首页本体不放地图，免得跟输入框抢注意力。
        可以直接点地图，也可以搜一个地点（搜是后加的：盲点在陌生城市很难点对）。
      */}
      {picking && (
        <MapPicker
          target="出发点"
          near={point}
          initial={point ? { point, label: label || '已选位置' } : null}
          onConfirm={(p, name, source) => {
            update({ point: p, label: name })
            setPicking(false)
            setError(null)
            /*
             * 手点地图选出来的只有坐标，补一次逆地理编码给它一个人话名字。
             * 搜索与定位**不补**：搜到的 POI 名（「集美万达广场」）比逆地理编码
             * 能给的说法（「银江路」）更接近用户心里那个地方，覆盖掉是退步。
             */
            if (source === 'map-pick') void namePlace(p)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </main>
  )
}
