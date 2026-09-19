const FALLBACK = '已选位置'

/**
 * 站在里面才算数。
 * 两百米开外那个 AOI 是另一片地方，拿它当「你在哪」就是一句自信的错话 ——
 * 宁可退回行政区划，也不挑一个不相干的区域名。
 */
const INSIDE_AOI_METERS = 200

export type AreaParts = {
  city?: string
  district?: string
  /** 高德返回的 AOI：你正站在里面的那片区域，如「软件园B区」「集美学村」 */
  area?: string
  /** 到这个 AOI 的距离（米） */
  areaDistanceMeters?: number
  township?: string
}

/**
 * 「你在哪」这个问题的答案：市 + 区 + 所在区域，如「厦门市集美区软件园B区」。
 *
 * 要的是**区域名**，不是**地址**。原来的做法是拼到街道一级
 * （「厦门市集美区集美街道」）—— 话没说错，但用户站在软件园三期里，
 * 这句话对他没有任何信息量。
 *
 * 所以优先用高德的 AOI：那是面状区域，正好是「你人在哪一片」。
 * 不用 POI（饭店、大厦那些点状物）：四十米外的一家沙县小吃不是你在的地方。
 *
 * 省一级省掉，门牌号天然不会有 —— 这个串是要显示给人看的，不是收件地址。
 */
export function areaLabel(parts: AreaParts): string {
  const area = (parts.area ?? '').trim()
  const inside = area !== '' && (parts.areaDistanceMeters ?? Infinity) <= INSIDE_AOI_METERS

  const raw = [parts.city, parts.district, inside ? area : parts.township]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)

  // 高德对直辖市会省市同名，这里去掉相邻重复项，免得拼出「厦门市厦门市」
  const deduped: string[] = []
  for (const piece of raw) {
    if (deduped[deduped.length - 1] !== piece) deduped.push(piece)
  }

  return deduped.length > 0 ? deduped.join('') : FALLBACK
}
