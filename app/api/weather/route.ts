import { parseLatLng } from '@/lib/core/coordinate'
import { getVerifyProvider } from '@/lib/providers/verify'
import { getWeatherProvider } from '@/lib/providers/weather'
import type { Weather } from '@/lib/core/weather'

/**
 * 同一座城市内的天气差别不大，而一次会话里反复拉同一个城市很常见
 * （首页改点、刷新、去挑完地方再回来看）。
 *
 * 进程内缓存 15 分钟：实况每小时更新多次、预报一天三次，
 * 缓存远比这个间隔短，不会给出旧数据，但能挡住 QPS。
 */
const CACHE_TTL_MS = 15 * 60 * 1000

type Entry = { at: number; weather: Weather | null }
const cache = new Map<string, Entry>()

function readCache(key: string): Weather | null | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return undefined
  }
  return hit.weather
}

/**
 * 拿不到 adcode 的城市可以有几千个，但一次只用得上现在这一个 ——
 * 缓存只留最后一个城市，不必给它一套淘汰策略。
 */
function writeCache(key: string, weather: Weather | null): void {
  if (cache.size > 16) cache.clear()
  cache.set(key, { at: Date.now(), weather })
}

/**
 * 给首页的天气条用。`weather: null` 是正常答复，不是错误 ——
 * 拿不到天气时推荐照常跑，界面也照常能发请求，只是不显示天气那一块。
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ reason: '请求体不是合法 JSON' }, { status: 400 })
  }

  const point = parseLatLng((body as { point?: unknown } | null)?.point)
  if (!point) return Response.json({ reason: '缺少合法的坐标' }, { status: 400 })

  // 逆地理编码失败也是可接受的：坐标还在，只是不知道城市，天气无从查
  let adcode = ''
  try {
    const place = await getVerifyProvider().reverseGeocode(point)
    adcode = place.adcode?.trim() ?? ''
  } catch (error) {
    console.error('[weather] 逆地理编码失败', error)
  }

  if (!adcode) return Response.json({ weather: null })

  const cached = readCache(adcode)
  if (cached !== undefined) return Response.json({ weather: cached })

  const weather = await getWeatherProvider().getWeather({ adcode })
  writeCache(adcode, weather)

  return Response.json(
    { weather },
    { headers: { 'cache-control': 'private, max-age=600' } },
  )
}
