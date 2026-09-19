import { asText } from '@/lib/core/coerce'
import type { LatLng, OpenStatus } from '@/lib/core/model'
import { parseOpenStatus } from '@/lib/core/open-hours'
import { amapGet } from './amap-fetch'
import { parseLocation } from './verify/amap'

/**
 * 地图选点里的「搜一个地方」。
 *
 * 与推荐层的关系：**只做客串**。推荐用不到它 —— 那条链路里地点名是 skill 给的，
 * 用户没有在搜什么。这里是用户在**自己找出发点或终点**：盲点地图在陌生城市很难点对，
 * 搜一下比对准得多。
 */
export type PlaceHit = {
  name: string
  address: string
  /** 高德底图的坐标，已是 GCJ-02。**不要再转一次** */
  point: LatLng
  /** 高德的 POI 类型里**最具体的那一段**（「购物服务;商场;购物中心」→「购物中心」） */
  category: string
  /**
   * 营业状态。判不出来一律 unknown。
   *
   * 刻意**不做「已停业」这个判断**：高德的返回里没有一个可靠的停业字段，
   * open_time 为空既可能是停业、也可能只是没收录。编一个出来就是给用户
   * 一个假的确定信息（这条和「认不出来返回 unknown」是同一条原则）。
   */
  openStatus: OpenStatus
}

type RawPoi = {
  name?: unknown
  address?: unknown
  location?: unknown
  type?: unknown
  biz_ext?: unknown
}

export type PoiSearchResponse = {
  pois?: RawPoi[]
  count?: unknown
}

/** 一次要多少条。高德上限 20，正好一屏多一点 */
const OFFSET = 20

function openStatusOf(poi: RawPoi, now: Date): OpenStatus {
  const biz = poi.biz_ext
  if (!biz || typeof biz !== 'object' || Array.isArray(biz)) return 'unknown'

  const record = biz as { open_time?: unknown; opentime2?: unknown }
  // 与核实层同一套读法：open_time 与新版的 opentime2 都可能出现
  return parseOpenStatus(asText(record.open_time) || asText(record.opentime2), now)
}

/**
 * 把高德的响应摊成结果列表，纯函数，便于单测。
 *
 * **顺序原样保留**：这就是高德的相关度排序（实测稳定），
 * 我们**不做二次打分** —— 改不了它，就不要假装排过。
 * 尤其不要改成「按离当前地图中心最近排序」：那是另一种意图，
 * 会让用户搜「厦门北站」却把附近同名小卖部排到第一个。
 */
export function mapPlaceSearch(data: PoiSearchResponse, now: Date): PlaceHit[] {
  const pois = Array.isArray(data.pois) ? data.pois : []
  const hits: PlaceHit[] = []

  for (const poi of pois) {
    const point = parseLocation(poi.location)
    // 没有坐标的结果点了也落不了地。这是搜索结果，不是用户的输入，不发出去
    if (!point) continue

    const name = asText(poi.name)
    if (!name) continue

    /*
     * 类型取**最后一段**，不取第一段。
     *
     * 高德的 type 由粗到细：「购物服务;商场;购物中心」。第一段是「购物服务」，
     * 那是给统计用的分类，「购物服务」这四个字摆在用户面前等于没说
     * （实测第一批结果里每条都写着「购物服务」）。最后一段才是这家店是什么。
     */
    const categories = asText(poi.type)
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)

    hits.push({
      name,
      address: asText(poi.address),
      point,
      category: categories[categories.length - 1] ?? '',
      openStatus: openStatusOf(poi, now),
    })
  }

  return hits
}

export type PlaceSearchInput = {
  q: string
  /** 城市名。与 adcode 二选一，adcode 更准 */
  city?: string
  adcode?: string
}

/** 只在服务端调用：AMAP_WEB_SERVICE_KEY 不能进浏览器 */
export async function searchPlaces(input: PlaceSearchInput): Promise<PlaceHit[]> {
  const data = await amapGet<PoiSearchResponse>('/v3/place/text', {
    keywords: input.q,
    // 限在当前城市。不限的话搜「万达」会把外地的同名商场一起返回，
    // 而用户要的是「附近那个」
    city: input.adcode || input.city,
    citylimit: input.adcode || input.city ? 'true' : 'false',
    offset: OFFSET,
    page: 1,
    // all 才带 biz_ext（营业时间），与核实层同一个理由
    extensions: 'all',
  })

  return mapPlaceSearch(data, new Date())
}
