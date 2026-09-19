'use client'

import { useEffect, useState } from 'react'
import type { Weather } from '@/lib/core/weather'
import type { LatLng } from '@/lib/core/model'
import { withToken } from './auth'

/**
 * 拉当前所在城市（出发点的城市）的天气。
 *
 * **永远不给错误态**：拿不到 —— 没配 key、城市查不出、高德限流 —— 就是 null。
 * 天气不是主流程的一部分，它的失败不需要、也不该出现在界面上。
 * 调用方的处理因此很简单：null 就整个不渲染。
 *
 * 返回值还额外绑了「它是哪个点查来的」（见下面的 key 比较）：
 * 换点之后再看清旧的天气，读那一行的人不会知道它属于上一个地方。
 */
export function useWeather(point: LatLng | null): Weather | null {
  const [state, setState] = useState<{ key: string; weather: Weather | null } | null>(null)

  useEffect(() => {
    if (!point) return

    const key = `${point.lng},${point.lat}`
    let alive = true
    const controller = new AbortController()

    void fetch(withToken('/api/weather'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ point }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ weather?: Weather | null }>) : null))
      .then((data) => {
        if (alive && data) setState({ key, weather: data.weather ?? null })
      })
      .catch(() => {
        // 中断也算失败：那行天气不显示就是了
      })

    return () => {
      alive = false
      controller.abort()
    }
  }, [point])

  const key = point ? `${point.lng},${point.lat}` : ''
  return state && state.key === key ? state.weather : null
}
