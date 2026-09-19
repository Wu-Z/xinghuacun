'use client'

import { useSyncExternalStore } from 'react'
import { overlayKind, rainLevel, type Weather } from '@/lib/core/weather'

type Props = {
  weather: Weather | null
  /**
   * 只在预览页用：把「现在几点」钉死，好让 day / dusk / night 三态同屏摆开。
   * 真实调用**不要传** —— 天空的昼夜必须来自用户的真实时间。
   */
  hourOverride?: number
}

/**
 * 时间不需要订阅：一次会话里天空不跨昼夜，没必要为此挂一个定时器。
 * useSyncExternalStore 要求 subscribe 返回 unsubscribe，给个空的就行。
 */
const noSubscription = () => () => {}

/**
 * 负责把「现在外面的天」铺到首页背后。
 *
 * 这一层是**天**，不是纹理。顺序就是它该有的物理顺序：
 * 先有天空（__sky），再是天上的云、雨、雪、光、闪电。
 * 少了第一层，剩下的只是白纸上会动的灰线。
 *
 * 四条不可让的约束（globals.css 里那份注释讲的是同一件事）：
 *
 * 1. **不吃点击** —— `pointer-events:none`，永远不影响任何交互；
 * 2. **底部淡出** —— 天光融回纸白，不在页面底切出一条硬边；
 * 3. **认不出就不出** —— 归类不了 condition 时整层不渲染；
 * 4. **亮度服从可读性** —— 渐变的深色段必须盖住正文所在的区域。
 *
 * 雨、雪、云各有**前后两层**。单层图案看上去是一片会动的纹理，两层才有纵深 ——
 * 远景细而慢、近景粗而快，这是「外面在下雨」和「屏幕上有条纹」的区别。
 * 雷暴再多一层闪光，其余天气不需要它。
 */
export default function WeatherOverlay({ weather, hourOverride }: Props) {
  /*
   * 昼夜在**客户端**取，不能进 SSR —— 服务端时区和用户时区未必一致，
   * 直接算会导致水合前后不一致。
   *
   * 用 useSyncExternalStore 而不是「useState + useEffect」：后者在服务端渲染成
   * 默认值、水合后再重渲染一次，而且「在 effect 里直接 setState」本身就是
   * React 点名的反模式。这里服务端快照给 null、客户端快照给真值，
   * 语义正好对上「水合之前只能按默认值走」。
   *
   * 快照是数字，同一个小时内恒等 —— 不会把 React 拖进重渲染循环。
   */
  const hour = useSyncExternalStore(
    noSubscription,
    () => new Date().getHours(),
    () => null,
  )

  if (!weather) return null

  const kind = overlayKind(weather.condition)
  if (!kind) return null

  // 0 是合法的午夜时刻，所以这里只能判 null / undefined，不能判真假
  const h = hourOverride ?? hour ?? 12
  const day = h >= 19 || h < 6 ? 'night' : h >= 17 ? 'dusk' : 'day'

  // 「雷阵雨」和「暴雨」都归到 storm，但只有前者的原文里有「雷」。
  // 高德给的原话是唯一依据 —— 没有这个字就不闪，不替它猜。
  const thunder = kind === 'rain' && weather.conditionText.includes('雷')

  return (
    <div
      className="weather-sky"
      data-kind={kind}
      data-day={day}
      data-level={rainLevel(weather.condition)}
      data-thunder={thunder ? 'on' : undefined}
      aria-hidden
    >
      <span className="weather-sky__sky" />
      <span className="weather-sky__cloud weather-sky__cloud--far" />
      <span className="weather-sky__cloud weather-sky__cloud--near" />
      <span className="weather-sky__sun" />
      <span className="weather-sky__glare" />
      <span className="weather-sky__rain weather-sky__rain--far" />
      <span className="weather-sky__rain weather-sky__rain--near" />
      <span className="weather-sky__snow weather-sky__snow--far" />
      <span className="weather-sky__snow weather-sky__snow--near" />
      <span className="weather-sky__flash" />
    </div>
  )
}
