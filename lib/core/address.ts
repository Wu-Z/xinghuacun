export type AddressParts = {
  province?: string
  city?: string
  district?: string
  township?: string
  street?: string
}

const FALLBACK = '已选位置'

/**
 * 只拼到街道一级，天然丢掉门牌号。
 * 高德对直辖市会同时返回省市同名，这里去掉相邻重复项。
 */
export function blurAddress(parts: AddressParts): string {
  const raw = [parts.province, parts.city, parts.district, parts.township, parts.street]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)

  const deduped: string[] = []
  for (const piece of raw) {
    if (deduped[deduped.length - 1] !== piece) deduped.push(piece)
  }

  return deduped.length > 0 ? deduped.join('') : FALLBACK
}
