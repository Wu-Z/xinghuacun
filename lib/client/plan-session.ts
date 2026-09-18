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

export type PlanDraft = {
  point: LatLng
  label: string
  prefs: Preferences
}

let draft: PlanDraft | null = null
const listeners = new Set<() => void>()

export function setPlan(next: PlanDraft): void {
  draft = next
  for (const l of listeners) l()
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
