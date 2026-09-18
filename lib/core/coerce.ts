/**
 * 高德返回的字段不保证是字符串：空字段是 `[]`，有的字段是数组或数字。
 * 全部收敛成字符串，避免在每个调用点各写一遍类型判断。
 *
 * 这个函数的存在是因为真实数据打脸过：`open_time` 回来是数组，
 * 直接 `.trim()` 会让整个周边搜索 502。
 */
export function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.length > 0 ? asText(value[0]) : ''
  return ''
}
