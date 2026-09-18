import type { RecommendPlace } from '@/lib/core/model'

/**
 * 细化完成后，给出新的默认选中集合。
 *
 * 粒度变了，原来的选择无法直接映射。规则是**子点继承父级**：
 * 用户选了「集美学村」，它的子点（龙舟池 / 集美大社 …）默认全部选中；
 * skill 在细化时新增、不属于任何已选父级的点默认不选。
 *
 * 为什么这样定：用户的意图（「我要去集美学村」）不该因为拆解而丢失，
 * 重点应该变成「取消掉不想要的子点」，而不是被逼着重新选一遍。
 *
 * 归属判定只看 `parent`，**不靠名字碰撞** —— 否则一个恰好与某个已选顶层
 * 同名的子点会被误选。
 */
export function inheritSelection(
  places: RecommendPlace[],
  previousSelected: string[],
): string[] {
  const selected = new Set(previousSelected)

  return places
    .filter((p) => (p.parent ? selected.has(p.parent) : selected.has(p.name)))
    .map((p) => p.name)
}
