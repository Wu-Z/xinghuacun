import type { RecommendPlace } from '@/lib/core/model'

/**
 * 现在还能不能「细化」。
 *
 * 判据是**选中的里面还有没有可拆的复合地点**，而不是「列表里有没有带 parent 的点」。
 *
 * 后者是实测踩过的坑：选了非复合地点时，细化会把它们原样透传（parent 仍是 null），
 * 于是那个「已细化」的推断永远不成立 —— 按钮不消失、用户可以无限点，
 * 而每次点下去界面看起来毫无变化。
 *
 * 用「还有没有可拆的」则两种情形都自然成立：
 * 全是非复合地点 → 不给点；拆完之后选中的都成了子点（没有 contains）→ 按钮自己消失。
 */
export function canFinalize(places: RecommendPlace[], selected: string[]): boolean {
  const byName = new Map(places.map((p) => [p.name, p]))
  return selected.some((name) => (byName.get(name)?.contains?.length ?? 0) > 0)
}
