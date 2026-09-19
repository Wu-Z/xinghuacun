'use client'

import { useSyncExternalStore } from 'react'
import type { LatLng, Preferences } from '@/lib/core/model'

/**
 * 首页填的东西要传给结果页。
 *
 * 用模块级 store 而不是 sessionStorage 或 URL 参数：
 * - sessionStorage 在 SSR 时不存在，首帧会 hydration 不一致
 * - 偏好里有多选数组和一段自由文本，塞进 query string 又长又难读
 *
 * useSyncExternalStore 的第三个参数（服务端快照）返回 null，
 * 服务端与客户端首帧一致，之后客户端再切到真实值。
 */
const SERVER_SNAPSHOT: PlanDraft | null = null

export type ShareDraft = {
  /** 卡片名称。null = 没改过，用系统按行程给的默认名 */
  title: string | null
  /** 出行时间。**用户自己写的一句话**，不是系统排的时刻。null = 不写、不上卡 */
  when: string | null
}

export type PlanDraft = {
  point: LatLng
  label: string
  prefs: Preferences
  /**
   * 分享卡上那两个可改的字段。
   *
   * 跟草稿一起存，是为了「名字存进行程，重新分享不用再打一遍」——
   * 存在组件 state 里的话，关掉浮层再打开就白打了。
   */
  share?: ShareDraft
}

let draft: PlanDraft | null = null
const listeners = new Set<() => void>()

export function setPlan(next: PlanDraft): void {
  draft = next
  for (const l of listeners) l()
}

/** 只改分享卡那几个字段，不碰出发点与偏好 */
export function patchShare(patch: Partial<ShareDraft>): void {
  if (!draft) return
  setPlan({ ...draft, share: { title: null, when: null, ...draft.share, ...patch } })
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): PlanDraft | null {
  return draft
}

function getServerSnapshot(): PlanDraft | null {
  return SERVER_SNAPSHOT
}

export function usePlan(): PlanDraft | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
