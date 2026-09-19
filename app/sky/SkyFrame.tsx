'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './sky.module.css'

/** 被模拟的「真实视口」：与用来看首页的桌面窗口同尺寸 */
const VIEW_W = 1440
const VIEW_H = 900

/**
 * 把一整块 1440×900 的**真实视口**等比缩放进预览格子里。
 *
 * 为什么不直接把天空铺进格子（第一版就是这么写的，看到的效果是错的）：
 * 天空的构图是按视口尺寸定的 —— 雨幕 tile 是固定的 200×360 像素，
 * 云的位置是百分比。格子一变小，雨丝在同样像素数里就显得又粗又密、
 * 像屏幕划痕，云和太阳还会整体偏出画面。
 *
 * 换句话说，被缩放的必须是**整个视口**，不是天空层。这样格子里每个
 * 像素都等于真实视口里的对应像素，构图和密度都是真的。
 *
 * 代价要说清楚：正文文字也跟着等比缩小了，所以这一页看的是**构图**，
 * 不是字号观感。字号的实感去 http://localhost:3000/ 看。
 */
export default function SkyFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  // 只是首帧兜底：SSR 量不到真实宽度，先按常见的两列宽度估一个
  const [k, setK] = useState(0.49)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    /*
     * 不在 effect 里再同步 setState 一次 —— ResizeObserver.observe()
     * 本身就会立刻回调一次，那一发就把初值补上了。
     * （手动同步设值正是 react-hooks/set-state-in-effect 要拦的写法。）
     */
    const ro = new ResizeObserver(() => setK(el.clientWidth / VIEW_W))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className={styles.frame}>
      <div
        className={styles.stage}
        style={{ width: VIEW_W, height: VIEW_H, transform: `scale(${k})` }}
      >
        {children}
      </div>
    </div>
  )
}
