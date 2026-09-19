import type { LatLng, RecommendPlace } from './model'

/**
 * 地图上一个标记的形态。
 *
 * 三种形态与列表上那套编号圆点**同源**（设计稿里那条「实体 = 已选、
 * 空心 = 备选」）：用户在列表里看到的第 2 个，就是地图上带「2」的那个，
 * 也是时间轴里的第 2 站。
 *
 *   origin    —— 出发点，或者选点时刚点下的那个位置。徽标是「起」，不带编号
 *   selected  —— 已勾选、已进路线。玉色实心圆 + 编号
 *   candidate —— 列表里有、还没被勾。**空心**圆点，不带编号
 */
export type MapMarkerKind = 'origin' | 'selected' | 'candidate'

export type MapMarkerSpec = {
  /** 稳定标识，就是地点名 —— 悬停联动按它对应列表卡片。起点没有名字，给空串 */
  name: string
  /** 悬停气泡上的字。起点写「出发点」这类人话，不写地点名 */
  label: string
  point: LatLng
  kind: MapMarkerKind
  /** 路线里的序号，从 1 起。只有 selected 有；起点与备选都是 null */
  order: number | null
}

/**
 * 列表 → 地图标记。
 *
 * 两条硬规则，都在 `docs/开发须知.md` 里：
 *
 *   1. **只有高德核实通过的地点才能上图。** 核实不到的仍然留在列表里并标注
 *      「高德未能核实」—— 但地图上没有它的位置，因为那个位置本来就不知道。
 *      （这一点之前是漏的：地图上只有被勾选的那几个，列表里的候选一个都不显示，
 *      于是「能上图」这句话只兑现了一半。）
 *   2. **编号只给已选进路线的。** 备选是空心点。给备选也编号，等于在地图上
 *      替用户宣布了一个他还没做的决定，而列表里那一条此刻写的还是「+」。
 *
 * 顺序：备选在前、已选在后 —— 高德的覆盖物是后加的盖在上面，
 * 已选因此永远压得住同一位置的备选。
 */
export function buildPlaceMarkers(
  places: RecommendPlace[],
  visitOrder: string[],
): MapMarkerSpec[] {
  const candidates: MapMarkerSpec[] = []
  const selected: MapMarkerSpec[] = []

  for (const place of places) {
    /*
     * verified 与 point 今天总是同进同退（见 lib/providers/verify/amap），
     * 但规则说的是「核实通过才能上图」，所以两个都查：
     * 只有坐标而没核实通过的，仍然不该出现在地图上。
     */
    if (!place.verified || !place.point) continue

    const index = visitOrder.indexOf(place.name)
    const spec: MapMarkerSpec = {
      name: place.name,
      label: place.name,
      point: place.point,
      kind: index === -1 ? 'candidate' : 'selected',
      order: index === -1 ? null : index + 1,
    }

    if (index === -1) candidates.push(spec)
    else selected.push(spec)
  }

  return [...candidates, ...selected]
}
