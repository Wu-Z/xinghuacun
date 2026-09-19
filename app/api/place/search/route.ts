import { parseLatLng } from '@/lib/core/coordinate'
import { AmapError } from '@/lib/providers/amap-fetch'
import { searchPlaces } from '@/lib/providers/place-search'
import { getVerifyProvider } from '@/lib/providers/verify'

/**
 * 地图选点里的 POI 搜索。Web 服务 key 只在服务端，所以走这一道。
 *
 * 只做一件事：给关键词（可选给一个「大概在哪」的坐标），回一串高德找到的地点。
 * **顺序就是高德返回的顺序**，这里不重排、不打分。
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (!q) return Response.json({ hits: [], reason: '没给搜索词' }, { status: 400 })

  // 没给坐标就不带城市限制。注意不能用 `Number(null)`——那是 0，
  // 会变成「几内亚湾附近」这么一个荒唐的搜索中心
  const lngText = url.searchParams.get('lng')
  const latText = url.searchParams.get('lat')
  const near =
    lngText && latText ? parseLatLng({ lng: Number(lngText), lat: Number(latText) }) : null

  /*
   * 先问出「大概在哪」，把搜索限在这个城市里。
   * 拿不到城市不拦搜索 —— 那样只是可能混进外地的同名地点，比搜不出来好。
   */
  let city = ''
  let adcode = ''
  if (near) {
    try {
      const area = await getVerifyProvider().reverseGeocode(near)
      city = area.city
      adcode = area.adcode?.trim() ?? ''
    } catch (error) {
      console.error('[place] 逆地理编码失败，本次搜索不限城市', error)
    }
  }

  try {
    const hits = await searchPlaces({ q, city, adcode })
    return Response.json({ hits, city, cityLimited: Boolean(adcode || city) })
  } catch (error) {
    // 不静默吞错：把原因回给客户端，它才知道该给用户哪个出口
    console.error('[place] POI 搜索失败', error)
    const reason = error instanceof AmapError ? error.message : '搜索暂时不可用'
    return Response.json({ hits: [], reason }, { status: 502 })
  }
}
