/**
 * 天气层预览页（设计验证用，不参与任何业务流程）。
 *
 * 为什么需要它：首页的天空取决于「真实定位 + 真实天气」，一屏只能看到当下那一种，
 * 而 9 月的厦门大概率既不下雪也不打雷 —— 想核对某个组合，得等天气赏脸。
 * 这里把 8 种天气 × 昼夜共 15 个态一次摆开。
 *
 * 诚实的地方在于：每一格都是**等比缩小的真实视口**，里面渲染的是首页那**同一个**
 * WeatherOverlay 组件，没有平行实现、没有降级分支。只有两处被改过：
 *   1. CSS 里把 .weather-sky 从 position:fixed 收进画布（见 sky.module.css）；
 *   2. 传 hourOverride 把「现在几点」钉死，好让 day / dusk / night 同屏。
 * 所以在这里看到的构图，就是首页会画出来的构图。
 */
import type { Metadata } from 'next'
import WeatherOverlay from '@/components/WeatherOverlay'
import WeatherBar from '@/components/WeatherBar'
import { describeTonight, type Weather, type WeatherCondition } from '@/lib/core/weather'
import SkyFrame from './SkyFrame'
import styles from './sky.module.css'

export const metadata: Metadata = {
  title: '天气层预览 · 周边去哪',
  description: '把每一种天气 × 昼夜都摆在同一屏里，用来核对天空层的构图与配色。',
}

/** 造一份天气数据。字段填满，好让 describeWeather 真的拼出那一句 */
const mock = (
  condition: WeatherCondition,
  conditionText: string,
  temperatureC: number,
  tonight: Weather['tonight'] = null,
): Weather => ({
  city: '厦门',
  adcode: '350200',
  condition,
  conditionText,
  temperatureC,
  humidity: 74,
  windDirection: '东南风',
  windPower: '3',
  tonight,
  reportTime: '2026-09-19 08:00',
})

type Case = {
  /** 用「天气 + 时段」当键，一眼能对上号 */
  key: string
  /** 钉死的时刻。昼夜分界写在 WeatherOverlay 里：<6 夜 / <17 昼 / >=17 傍晚 / >=19 夜 */
  hour: number
  weather: Weather
}

const CASES: Case[] = [
  { key: 'sun-day', hour: 12, weather: mock('sunny', '晴', 31) },
  { key: 'sun-dusk', hour: 17, weather: mock('sunny', '晴', 28) },
  { key: 'sun-night', hour: 21, weather: mock('sunny', '晴', 26) },
  { key: 'cloud-day', hour: 12, weather: mock('cloudy', '多云', 29) },
  { key: 'cloud-dusk', hour: 17, weather: mock('cloudy', '多云', 27) },
  { key: 'cloud-night', hour: 21, weather: mock('cloudy', '多云', 25) },
  { key: 'overcast-day', hour: 12, weather: mock('overcast', '阴', 27) },
  { key: 'fog-day', hour: 12, weather: mock('fog', '雾', 25) },
  { key: 'shower-day', hour: 12, weather: mock('shower', '阵雨', 28) },
  { key: 'rain-day', hour: 12, weather: mock('rain', '中雨', 26) },
  { key: 'rain-night', hour: 21, weather: mock('rain', '中雨', 24) },
  {
    key: 'storm-day',
    hour: 12,
    weather: mock('storm', '雷阵雨', 26, {
      condition: 'shower',
      conditionText: '阵雨',
      temperatureC: 23,
    }),
  },
  { key: 'storm-night', hour: 21, weather: mock('storm', '雷阵雨', 24) },
  { key: 'snow-day', hour: 12, weather: mock('snow', '小雪', -2) },
  { key: 'snow-night', hour: 21, weather: mock('snow', '小雪', -5) },
]

export default function SkyPreview() {
  return (
    <div className={styles.deck}>
      <header className={styles.head}>
        <h1 className={styles.title}>天气层预览</h1>
        <p className={styles.note}>
          每格是一个 <strong>1440×900 真实视口的等比缩小版</strong>，里面跑的正是首页那同一个{' '}
          <code>WeatherOverlay</code>：只把天空从 <code>fixed</code> 收进画布、把时刻钉死，
          别无改动。所以请按<strong>构图与配色</strong>读它 —— 正文文字也跟着小了，
          字号实感去 <code>localhost:3000</code> 看。
        </p>
      </header>

      <div className={styles.grid}>
        {CASES.map((c) => {
          const tonight = describeTonight(c.weather)
          // data-case 是给截图 / 冒烟脚本用的稳定锚点：展示文案会改，这个键不会
          return (
            <section key={c.key} data-case={c.key} data-weather="on" className={styles.cell}>
              <SkyFrame>
                <WeatherOverlay weather={c.weather} hourOverride={c.hour} />

                <div className={styles.body}>
                  {/* 与首页 1:1 一致：品牌字与右上角天气同一行。天气行也是白字，
                      所以它必须和 h1 一起落在「不许放强云」的安全区里 */}
                  <div className="flex items-start justify-between gap-6">
                    <div className="sky-ink text-[13.5px] font-semibold">周边去哪</div>
                    <WeatherBar weather={c.weather} />
                  </div>

                  <h2 className="sky-ink mt-4 text-[30px] font-semibold leading-[1.25] tracking-[-0.8px]">
                    想去附近走走，
                    <br />
                    却不知道去哪好。
                  </h2>
                  <p className="sky-ink-3 mt-3 text-sm leading-relaxed">
                    说一句想怎么玩，我挑出真值得去的地方，并按最优顺序排好。
                  </p>

                  <div
                    className={`sky-card mt-8 rounded-xl border border-line bg-surface ${styles.card}`}
                  >
                    <div className={styles.placeholder}>
                      例如：想找能坐下来喝咖啡、人不多的老街区
                    </div>
                    {/* 首页的输入卡里没有天气（它在右上角），这里也不放 ——
                        预览页多一行，就会在「有没有回归」这件事上骗人 */}
                    <div className={styles.meta}>
                      <span className="text-xs text-ink-3">出发点</span>
                      <span className="text-[13.5px] font-medium text-ink">厦门市集美区</span>
                    </div>
                    {tonight && <div className={styles.tonight}>{tonight}</div>}
                  </div>
                </div>
              </SkyFrame>

              <div className={styles.tag}>{c.key}</div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
