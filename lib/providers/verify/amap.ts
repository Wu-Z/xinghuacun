import { blurAddress } from '@/lib/core/address'
import { asText } from '@/lib/core/coerce'
import { haversineMeters } from '@/lib/core/geo'
import type { LatLng, OpenStatus } from '@/lib/core/model'
import { parseOpenStatus } from '@/lib/core/open-hours'
import { amapGet } from '../amap-fetch'
import type { Verification, VerifyInput, VerifyProvider } from './types'

type PoiSearchResponse = {
  pois?: { location?: unknown; name?: unknown; biz_ext?: unknown }[]
}

function parseLocation(value: unknown): LatLng | null {
  const text = asText(value)
  if (!text) return null

  const [lngText, latText] = text.split(',')
  const lng = Number(lngText)
  const lat = Number(latText)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  return { lng, lat }
}

/**
 * 从 POI 关键字搜索的响应里取第一条，映射成核实结果。纯函数，便于单测。
 *
 * 取第一条而不是挑最近的：高德的相关度排序实测稳定（连查三次逐位相同），
 * 而「挑离出发点最近的」会把对的地点换掉 —— 真正的沙坡尾在思明区、离出发点
 * 14.5 公里，集美大悦城却有个同名的「沙坡尾酒场」在一公里内。
 */
export function mapPoiSearch(data: PoiSearchResponse, origin: LatLng): Verification {
  const first = data.pois?.[0]
  const point = parseLocation(first?.location)

  if (!point) return { point: null, verified: false }

  return {
    point,
    verified: true,
    // 高德返回的 POI 名称可能与 skill 给的写法不同
    verifiedName: asText(first?.name) || undefined,
    // 直线距离，不是驾车距离。界面必须标明，否则会被当成里程
    distanceMeters: haversineMeters(origin, point),
  }
}

/** 从 POI 搜索结果里取营业状态。判不出来一律 unknown。 */
export function mapPoiBusiness(data: PoiSearchResponse, now: Date): OpenStatus {
  const biz = data.pois?.[0]?.biz_ext
  if (!biz || typeof biz !== 'object' || Array.isArray(biz)) return 'unknown'

  const record = biz as { open_time?: unknown; opentime2?: unknown }
  const openTime = asText(record.open_time) || asText(record.opentime2)
  return parseOpenStatus(openTime, now)
}

export const amapVerifyProvider: VerifyProvider = {
  async verify({ name, city, origin }: VerifyInput): Promise<Verification> {
    /*
     * 用 POI 关键字搜索，不是地理编码。
     *
     * 地理编码回答的是「这个地址在哪」，而这里手上是一个 POI 名字。
     * 拿名字去地理编码，高德会做字符串匹配而不是找 POI —— 实测把
     * 「厦门老院子景区」放到了厦门北站的麦当劳、「厦门市图书馆集美新城馆区」
     * 放到了一公里外的住宅楼。同一个名字走关键字搜索则 8/8 全部命中。
     *
     * 也**不要**改回「拿 name 拼一个更完整的 address 再地理编码」：实测名字
     * 越完整越准（「海堤路（集美段）」能搜到集美区那条，「海堤路」反而
     * 落到湖里区），所以问题出在用错了接口，不是查询词不够长。
     */
    const search = await amapGet<PoiSearchResponse>('/v3/place/text', {
      keywords: name,
      city,
      extensions: 'all',
    })

    const result = mapPoiSearch(search, origin)
    if (!result.verified || !result.point) return result

    // biz_ext 就在同一条响应里，不必再打一次周边搜索；
    // 而且取匹配到的这个 POI 自己的营业时间，比「坐标 200 米内最近那个 POI」
    // 的营业时间更贴切。
    return { ...result, openStatus: mapPoiBusiness(search, new Date()) }
  },

  async reverseGeocode(point) {
    type RegeoResponse = {
      regeocode?: {
        addressComponent?: {
          province?: unknown
          city?: unknown
          district?: unknown
          township?: unknown
          streetNumber?: unknown
        }
      }
    }

    const data = await amapGet<RegeoResponse>('/v3/geocode/regeo', {
      location: `${point.lng},${point.lat}`,
      extensions: 'base',
    })

    const comp = data.regeocode?.addressComponent
    // 直辖市会返回 city 为空数组而不是字符串，这是高德返回结构里真实存在的坑
    const cityText = asText(comp?.city)

    const streetNumber = comp?.streetNumber
    const street =
      streetNumber && typeof streetNumber === 'object' && !Array.isArray(streetNumber)
        ? asText((streetNumber as { street?: unknown }).street)
        : ''

    return {
      label: blurAddress({
        province: asText(comp?.province),
        city: cityText,
        district: asText(comp?.district),
        township: asText(comp?.township),
        street,
      }),
      city: cityText || asText(comp?.province),
    }
  },
}
