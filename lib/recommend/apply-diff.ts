import type { RecommendPlace } from '@/lib/core/model'

export type RefineDiff = {
  added: RecommendPlace[]
  removed: { name: string; reason: string }[]
}

export type ApplyResult = {
  places: RecommendPlace[]
  /** 被整体移除的顶层地点 */
  removedTopLevel: string[]
  /** 匹配不到顶层、于是从某个地点的 contains 里剔除的子点 */
  removedSubPoints: string[]
  /** 同名命中、原地替换的顶层地点 */
  updated: string[]
  /**
   * 真正追加到末尾的顶层地点名（同名 upsert 的归 `updated`，不算新增）。
   *
   * 调用方靠这个区分「新来的」与「本来就在的」：只有新来的才需要记下它
   * 是从哪次追问来的（锚点），本来就在的位置没变，不该被重新归属。
   */
  added: string[]
}

/**
 * 把追问返回的 diff 应用到当前列表。
 *
 * 两条规则，都是为了让「子点」有表达通道：
 *
 * 1. **同名 upsert**：`added` 里出现已有地点名 → 原地替换而非追加。
 *    用户说「不想去龙舟池」时，skill 返回一个 `contains` 已更新的「集美学村」，
 *    靠这条生效。顺带也堵住了「同一个地点被推两遍」的重复项。
 *
 * 2. **removed 先匹配顶层、再匹配子点**：匹配不到顶层地点名时，
 *    视为要剔除某个复合地点的子点，从它的 `contains` 里删掉。
 *
 * 抽成纯函数是因为它不再是「filter + 拼接」那么直白：
 * 顺序、去重、层级匹配都要能单独验证。
 */
export function applyDiff(places: RecommendPlace[], diff: RefineDiff): ApplyResult {
  const removedNames = new Set(diff.removed.map((r) => r.name))

  // 第一步：移除顶层
  const kept: RecommendPlace[] = []
  const removedTopLevel: string[] = []
  for (const p of places) {
    if (removedNames.has(p.name)) {
      removedTopLevel.push(p.name)
    } else {
      kept.push(p)
    }
  }

  // 第二步：移除没匹配到顶层的，从子点里剔除
  const removedSubPoints: string[] = []
  const stillMissing = new Set(
    diff.removed.map((r) => r.name).filter((n) => !removedTopLevel.includes(n)),
  )

  const cleaned = kept.map((p) => {
    if (!p.contains || p.contains.length === 0 || stillMissing.size === 0) return p

    const next = p.contains.filter((c) => {
      if (stillMissing.has(c)) {
        removedSubPoints.push(c)
        return false
      }
      return true
    })
    if (next.length === p.contains.length) return p

    // 清空时给 undefined 而不是空数组：空数组会被界面渲染成「含 0 个可玩点」
    return { ...p, contains: next.length > 0 ? next : undefined }
  })

  // 第三步：upsert。同名原地替换，新名追加到末尾
  const index = new Map(cleaned.map((p, i) => [p.name, i]))
  const out = cleaned.slice()
  const updated: string[] = []
  const added: string[] = []

  for (const item of diff.added) {
    const at = index.get(item.name)
    if (at !== undefined) {
      out[at] = item
      updated.push(item.name)
    } else {
      index.set(item.name, out.length)
      out.push(item)
      added.push(item.name)
    }
  }

  return { places: out, added, removedTopLevel, removedSubPoints, updated }
}
