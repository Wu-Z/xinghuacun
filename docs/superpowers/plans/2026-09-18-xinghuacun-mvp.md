# 周边去哪 MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出「周边去哪」的最小可用版本：给定出发点，推荐附近去处，勾选若干个后在地图上按勾选顺序画出路线，点开每个点能看到玩什么、多久。

**Architecture:** Next.js App Router 薄服务端 + 适配器层。所有高德调用走服务端 Route Handler（Web 服务 Key 不进浏览器）；浏览器只加载地图 JS API（Key 由域名白名单保护，安全密钥走本站代理路由）。`lib/core` 是纯逻辑无 IO，`lib/providers` 是可替换的上游实现，两者都有 mock 实现，没有密钥也能全链路跑通。

**Tech Stack:** Node v24.19.0 / Next 16.3.5 (App Router) / React 19.3.0 / TypeScript / Tailwind 4.3.3 / Vitest 5.0.1 / `@amap/amap-jsapi-loader` 1.0.1 / 高德 Web 服务 API + JS API 2.0

**Spec:** `docs/superpowers/specs/2026-09-18-xinghuacun-mvp-design.md`

## Global Constraints

- 包管理器 `npm`；依赖版本按上表精确固定，不额外引入运行时依赖。
- 所有 `lib/core` 函数必须是**纯函数**：无 IO、无 `Date.now()` 隐式调用、无随机数。需要时间或随机性的地方一律由参数传入。
- `process.env.AMAP_WEB_SERVICE_KEY` 与 `process.env.AMAP_JS_SECURITY_CODE` **绝不允许**出现在任何 `'use client'` 文件里，也不允许加 `NEXT_PUBLIC_` 前缀。
- 任何抛向用户的中文文案都不允许出现「功能受限」这类阻断性措辞。
- 每个 Task 结束必须 `git commit`，提交信息用中文 Conventional Commits，单行无正文。
- 测试用 `npx vitest run <path>`；全量用 `npm test`。
- 文件路径别名 `@/*` 指向仓库根。

---

### Task 1: 工程骨架与环境样板

**Files:**
- Create: 由 `create-next-app` 生成的全套脚手架
- Create: `.env.example`
- Create: `vitest.config.ts`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 Next 应用、`npm test` 命令、`.env.example` 中的变量名约定

- [ ] **Step 1: 在临时目录生成脚手架再并入仓库**

仓库根已有 `README.md` 和 `docs/`，`create-next-app` 直接在非空目录里跑会冲突，所以先生成到临时目录再同步过来。

```bash
rm -rf /tmp/xhc-scaffold
cd /tmp && npx --yes create-next-app@latest xhc-scaffold \
  --typescript --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --use-npm --no-turbopack --yes
```

Expected: `/tmp/xhc-scaffold` 生成成功，含 `app/`、`package.json`、`tsconfig.json`、`next.config.ts`。

`--yes` 用于吃掉 Next 16 可能追问的额外选项，避免卡在交互提示。

- [ ] **Step 2: 同步进仓库**

```bash
rsync -a --exclude .git /tmp/xhc-scaffold/ /Users/wuzebin/code/xinghuacun/
```

注意：这会覆盖仓库原有的两行 `README.md`，Step 6 会重写它。`docs/` 不在同步源里，不受影响。

- [ ] **Step 3: 装 Vitest**

```bash
npm install -D vitest@5.0.1
npm pkg set scripts.test="vitest run"
```

- [ ] **Step 4: 写 vitest 配置**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    environment: 'node',
  },
})
```

`environment: 'node'` 是故意的：本版所有自动化测试都只测纯逻辑和字段映射，不测 DOM。

- [ ] **Step 5: 写 `.env.example`，并把 `.env.local` 挡在仓库外**

Create `.env.example`:

```
# 服务端专用，绝不能加 NEXT_PUBLIC_ 前缀
AMAP_WEB_SERVICE_KEY=

# 浏览器可见，靠高德控制台域名白名单保护
NEXT_PUBLIC_AMAP_JS_KEY=

# 安全密钥，仅服务端代理路由使用，不进浏览器
AMAP_JS_SECURITY_CODE=

# amap | mock
POI_PROVIDER=mock
ROUTE_PROVIDER=mock
```

默认给 `mock`，这样**在你填密钥之前全站就能跑起来**，填好后再改成 `amap`。

追加到 `.gitignore`：

```
.env.local
.env*.local
```

用 `grep -n "env" .gitignore` 确认写入成功。

- [ ] **Step 6: 重写 README**

覆盖 `README.md`：

```markdown
# 周边去哪

按当前位置或地图选点推荐附近去处，勾选若干个后按勾选顺序在地图上画出路线。

## 跑起来

```bash
npm install
cp .env.example .env.local   # 填不填都能跑，默认走 mock
npm run dev
```

没有密钥时 `POI_PROVIDER=mock` / `ROUTE_PROVIDER=mock`，全链路用确定性假数据跑通。
填入高德密钥后把两个变量改成 `amap`。

## 密钥说明

| 变量 | 用途 | 是否进浏览器 |
| --- | --- | --- |
| `AMAP_WEB_SERVICE_KEY` | 服务端调周边搜索、路径规划 | 否 |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 浏览器渲染地图 | 是（靠域名白名单保护） |
| `AMAP_JS_SECURITY_CODE` | 配合 JS API | 否（走 `/api/amap-service` 代理） |

## 测试

```bash
npm test
```

只覆盖纯逻辑与字段映射。地图渲染与真实路线依赖高德线上数据，靠手工验收。

## 已知近似

「推荐游玩项目」是按 POI 类别规则推导的，不是真实内容。见设计文档第 3.4 节。
```

- [ ] **Step 7: 建目录占位并确认起得来**

```bash
mkdir -p lib/core lib/providers/poi lib/providers/route components
npm run dev
```

Expected: 打开 `http://localhost:3000` 看到 Next 默认页。确认后 `Ctrl-C` 停掉。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "chore: 初始化 Next.js 工程骨架与测试环境"
```

---

### Task 2: 领域模型与地理计算

**Files:**
- Create: `lib/core/model.ts`
- Create: `lib/core/geo.ts`
- Test: `lib/core/geo.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `model.ts` 导出全部类型：`LatLng`、`TravelMode`、`OriginSource`、`Origin`、`OpenStatus`、`Poi`、`Activity`、`PoiDetail`、`RouteLeg`、`Route`、`SearchRequest`、`SearchResponse`、`PlanRequest`、`ReverseGeocodeResult`
  - `geo.ts` 导出 `haversineMeters(a: LatLng, b: LatLng): number`、`MODE_SPEED_KMH`、`minutesToMeters(minutes: number, mode: TravelMode): number`、`simplifyPolyline(points: LatLng[], toleranceMeters: number): LatLng[]`

- [ ] **Step 1: 先写类型文件**

Create `lib/core/model.ts`:

```ts
export type LatLng = { lng: number; lat: number }

export type TravelMode = 'driving' | 'transit' | 'walking' | 'bicycling'

export type OriginSource = 'geolocation' | 'map-pick' | 'search'

export type Origin = {
  point: LatLng
  label: string
  source: OriginSource
}

export type OpenStatus = 'open' | 'closed' | 'unknown'

export type Poi = {
  id: string
  name: string
  category: string
  categoryRaw: string
  point: LatLng
  distanceMeters: number
  address: string
  openStatus: OpenStatus
  rating?: number
  score?: number
  scoreParts?: Record<string, number>
}

export type Activity = {
  title: string
  durationMinutes: number
  note?: string
}

export type PoiDetail = Poi & {
  activities: Activity[]
  suggestedDurationMinutes: number
  deriveSource: 'rules'
}

export type RouteLeg = {
  fromIndex: number
  toIndex: number
  durationSeconds: number
  distanceMeters: number
  polyline: LatLng[]
}

export type Route = {
  mode: TravelMode
  order: string[]
  legs: RouteLeg[]
  totalDurationSeconds: number
  totalDistanceMeters: number
  polyline: LatLng[]
}

export type SearchRequest = {
  origin: LatLng
  source: OriginSource
  radiusMinutes: 30 | 60 | 120
  mode: TravelMode
  departAt?: string
}

export type SearchResponse = {
  origin: Origin
  pois: Poi[]
}

export type PlanRequest = {
  origin: LatLng
  stops: { id: string; point: LatLng }[]
  mode: TravelMode
  departAt?: string
}

export type ReverseGeocodeResult = {
  label: string
  city: string
}
```

- [ ] **Step 2: 写 geo 的失败测试**

Create `lib/core/geo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { haversineMeters, minutesToMeters, simplifyPolyline } from './geo'

describe('haversineMeters', () => {
  it('同一点距离为 0', () => {
    expect(haversineMeters({ lng: 116.4, lat: 39.9 }, { lng: 116.4, lat: 39.9 })).toBe(0)
  })

  it('纬度差 0.009 度约等于 1000 米', () => {
    const d = haversineMeters({ lng: 116.4, lat: 39.9 }, { lng: 116.4, lat: 39.909 })
    expect(d).toBeGreaterThan(990)
    expect(d).toBeLessThan(1010)
  })
})

describe('minutesToMeters', () => {
  it('按方式取速度换算', () => {
    // driving 30km/h，60 分钟 = 30km = 30000 米
    expect(minutesToMeters(60, 'driving')).toBe(30000)
    // walking 4.5km/h，60 分钟 = 4500 米
    expect(minutesToMeters(60, 'walking')).toBe(4500)
  })

  it('步行的可达范围小于驾车', () => {
    expect(minutesToMeters(30, 'walking')).toBeLessThan(minutesToMeters(30, 'driving'))
  })
})

describe('simplifyPolyline', () => {
  it('少于 3 个点原样返回', () => {
    const two = [{ lng: 0, lat: 0 }, { lng: 1, lat: 1 }]
    expect(simplifyPolyline(two, 10)).toEqual(two)
  })

  it('丢掉共线中间点', () => {
    const line = [
      { lng: 0, lat: 0 },
      { lng: 0.001, lat: 0 },
      { lng: 0.002, lat: 0 },
    ]
    expect(simplifyPolyline(line, 10)).toEqual([line[0], line[2]])
  })

  it('保留明显拐点', () => {
    const corner = [
      { lng: 0, lat: 0 },
      { lng: 0.01, lat: 0 },
      { lng: 0.01, lat: 0.01 },
    ]
    expect(simplifyPolyline(corner, 10)).toHaveLength(3)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run lib/core/geo.test.ts`
Expected: FAIL，报错找不到 `./geo` 模块。

- [ ] **Step 4: 实现 geo**

Create `lib/core/geo.ts`:

```ts
import type { LatLng, TravelMode } from './model'

const EARTH_RADIUS_M = 6371008.8

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)))
}

export const MODE_SPEED_KMH: Record<TravelMode, number> = {
  driving: 30,
  transit: 20,
  walking: 4.5,
  bicycling: 12,
}

export function minutesToMeters(minutes: number, mode: TravelMode): number {
  return Math.round((MODE_SPEED_KMH[mode] * 1000 * minutes) / 60)
}

/** 垂足到线段的距离（米），用平面近似，几百米量级足够 */
function perpendicularMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const scale = Math.cos(toRad((a.lat + b.lat) / 2))
  const px = (p.lng - a.lng) * scale
  const py = p.lat - a.lat
  const bx = (b.lng - a.lng) * scale
  const by = b.lat - a.lat
  const lenSq = bx * bx + by * by
  if (lenSq === 0) return haversineMeters(p, a)
  let t = (px * bx + py * by) / lenSq
  t = Math.max(0, Math.min(1, t))
  const dx = px - t * bx
  const dy = py - t * by
  return Math.sqrt(dx * dx + dy * dy) * 111320
}

/** Douglas-Peucker，按容差丢掉近似共线的点 */
export function simplifyPolyline(points: LatLng[], toleranceMeters: number): LatLng[] {
  if (points.length < 3) return points.slice()

  let maxDist = 0
  let index = 0
  const last = points.length - 1
  for (let i = 1; i < last; i++) {
    const d = perpendicularMeters(points[i], points[0], points[last])
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }

  if (maxDist <= toleranceMeters) return [points[0], points[last]]

  const left = simplifyPolyline(points.slice(0, index + 1), toleranceMeters)
  const right = simplifyPolyline(points.slice(index), toleranceMeters)
  return left.slice(0, -1).concat(right)
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run lib/core/geo.test.ts`
Expected: PASS，8 个断言全绿。

- [ ] **Step 6: 提交**

```bash
git add lib/core/model.ts lib/core/geo.ts lib/core/geo.test.ts
git commit -m "feat: 领域模型与地理计算"
```

---

### Task 3: 营业状态解析与地址模糊化

**Files:**
- Create: `lib/core/open-hours.ts`
- Create: `lib/core/address.ts`
- Test: `lib/core/open-hours.test.ts`
- Test: `lib/core/address.test.ts`

**Interfaces:**
- Consumes: `LatLng`（不需要）
- Produces:
  - `parseOpenStatus(openTime: string | undefined, now: Date): OpenStatus`
  - `blurAddress(parts: { province?: string; city?: string; district?: string; township?: string; street?: string }): string`

`now` 必须由调用方传入，这是 Global Constraints 里「纯函数」的硬要求，也让测试可确定。

- [ ] **Step 1: 写营业状态的失败测试**

Create `lib/core/open-hours.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseOpenStatus } from './open-hours'

const at = (h: number, m = 0) => new Date(2026, 8, 18, h, m)

describe('parseOpenStatus', () => {
  it('字段缺失给 unknown，不给 closed', () => {
    expect(parseOpenStatus(undefined, at(10))).toBe('unknown')
    expect(parseOpenStatus('', at(10))).toBe('unknown')
  })

  it('识别不出来给 unknown', () => {
    expect(parseOpenStatus('详情咨询商家', at(10))).toBe('unknown')
  })

  it('在营业时段内给 open', () => {
    expect(parseOpenStatus('09:00-17:00', at(10))).toBe('open')
  })

  it('在营业时段外给 closed', () => {
    expect(parseOpenStatus('09:00-17:00', at(20))).toBe('closed')
  })

  it('边界：开始时刻算 open，结束时刻算 closed', () => {
    expect(parseOpenStatus('09:00-17:00', at(9))).toBe('open')
    expect(parseOpenStatus('09:00-17:00', at(17))).toBe('closed')
  })

  it('24 小时营业给 open', () => {
    expect(parseOpenStatus('24小时营业', at(3))).toBe('open')
  })

  it('跨夜时段在凌晨算 open', () => {
    expect(parseOpenStatus('20:00-02:00', at(1))).toBe('open')
    expect(parseOpenStatus('20:00-02:00', at(15))).toBe('closed')
  })

  it('多个时段用分号分隔，命中任一即 open', () => {
    expect(parseOpenStatus('09:00-12:00;14:00-18:00', at(15))).toBe('open')
    expect(parseOpenStatus('09:00-12:00;14:00-18:00', at(13))).toBe('closed')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/core/open-hours.test.ts`
Expected: FAIL，找不到 `./open-hours`。

- [ ] **Step 3: 实现营业状态解析**

Create `lib/core/open-hours.ts`:

```ts
import type { OpenStatus } from './model'

const RANGE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/

function toMinutes(h: number, m: number): number {
  return h * 60 + m
}

/**
 * 从高德的 open_time / opentime2 推断当前营业状态。
 * 判不出来一律 'unknown' —— 绝不把「不知道」当成「已打烊」，那样会误杀 POI。
 */
export function parseOpenStatus(openTime: string | undefined, now: Date): OpenStatus {
  if (!openTime) return 'unknown'
  const text = openTime.trim()
  if (!text) return 'unknown'
  if (/24\s*小时/.test(text)) return 'open'

  const segments = text.split(/[;；]/).map((s) => s.trim()).filter(Boolean)
  let matchedAny = false
  let openNow = false
  const nowMin = toMinutes(now.getHours(), now.getMinutes())

  for (const segment of segments) {
    const m = RANGE.exec(segment)
    if (!m) continue
    matchedAny = true
    const start = toMinutes(Number(m[1]), Number(m[2]))
    const end = toMinutes(Number(m[3]), Number(m[4]))
    if (start === end) {
      openNow = true
    } else if (start < end) {
      if (nowMin >= start && nowMin < end) openNow = true
    } else {
      // 跨夜，例如 20:00-02:00
      if (nowMin >= start || nowMin < end) openNow = true
    }
  }

  if (!matchedAny) return 'unknown'
  return openNow ? 'open' : 'closed'
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/core/open-hours.test.ts`
Expected: PASS，8 个用例全绿。

- [ ] **Step 5: 写地址模糊化的失败测试**

Create `lib/core/address.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { blurAddress } from './address'

describe('blurAddress', () => {
  it('只拼到街道，丢掉门牌号', () => {
    expect(
      blurAddress({ province: '北京市', city: '北京市', district: '朝阳区', township: '三里屯街道', street: '工体北路' }),
    ).toBe('北京市朝阳区三里屯街道工体北路')
  })

  it('直辖市的省市重名只保留一份', () => {
    expect(blurAddress({ province: '上海市', city: '上海市', district: '徐汇区' })).toBe('上海市徐汇区')
  })

  it('字段缺失时跳过，不留空档', () => {
    expect(blurAddress({ city: '杭州市', district: '西湖区' })).toBe('杭州市西湖区')
  })

  it('全都缺失时给兜底文案', () => {
    expect(blurAddress({})).toBe('已选位置')
  })
})
```

注意第一个用例：`province` 与 `city` 都是「北京市」，去重后只留一个。

- [ ] **Step 6: 跑测试确认失败**

Run: `npx vitest run lib/core/address.test.ts`
Expected: FAIL，找不到 `./address`。

- [ ] **Step 7: 实现地址模糊化**

Create `lib/core/address.ts`:

```ts
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
```

- [ ] **Step 8: 跑测试确认通过**

Run: `npx vitest run lib/core/address.test.ts`
Expected: PASS，4 个用例全绿。

- [ ] **Step 9: 提交**

```bash
git add lib/core/open-hours.ts lib/core/address.ts lib/core/open-hours.test.ts lib/core/address.test.ts
git commit -m "feat: 营业状态解析与地址模糊化"
```

---

### Task 4: 游玩项目推导

**Files:**
- Create: `lib/core/derive-rules.ts`
- Create: `lib/core/derive.ts`
- Test: `lib/core/derive.test.ts`

**Interfaces:**
- Consumes: `Activity`、`Poi`（只用 `category` / `categoryRaw` 两个字段）
- Produces:
  - `derive-rules.ts` 导出 `type DeriveRule = { match: string[]; activities: Activity[]; suggestedDurationMinutes: number }`、`DERIVE_RULES: DeriveRule[]`、`FALLBACK_RULE: DeriveRule`
  - `derive.ts` 导出 `deriveActivities(poi: Pick<Poi, 'category' | 'categoryRaw'>): { activities: Activity[]; suggestedDurationMinutes: number; deriveSource: 'rules' }`

- [ ] **Step 1: 写失败测试**

Create `lib/core/derive.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deriveActivities } from './derive'

describe('deriveActivities', () => {
  it('公园给出散步拍照野餐', () => {
    const r = deriveActivities({ category: '公园', categoryRaw: '风景名胜;公园广场;公园' })
    expect(r.activities.map((a) => a.title)).toEqual(['散步', '拍照', '野餐'])
    expect(r.suggestedDurationMinutes).toBe(105)
    expect(r.deriveSource).toBe('rules')
  })

  it('博物馆给出看展听讲解', () => {
    const r = deriveActivities({ category: '博物馆', categoryRaw: '科教文化服务;博物馆' })
    expect(r.activities.map((a) => a.title)).toEqual(['看展', '听讲解'])
    expect(r.suggestedDurationMinutes).toBe(90)
  })

  it('分类不认识时命中兜底，且结果非空', () => {
    const r = deriveActivities({ category: '加油站', categoryRaw: '汽车服务;加油站' })
    expect(r.activities.length).toBeGreaterThan(0)
    expect(r.suggestedDurationMinutes).toBeGreaterThan(0)
  })

  it('分类为空字符串时也命中兜底', () => {
    const r = deriveActivities({ category: '', categoryRaw: '' })
    expect(r.activities.length).toBeGreaterThan(0)
  })

  it('每个 activity 的时长之和不超过建议总时长', () => {
    const r = deriveActivities({ category: '餐饮', categoryRaw: '餐饮服务;中餐厅' })
    const sum = r.activities.reduce((acc, a) => acc + a.durationMinutes, 0)
    expect(sum).toBeLessThanOrEqual(r.suggestedDurationMinutes)
  })

  it('category 认不出但 categoryRaw 认得出时也能命中', () => {
    const r = deriveActivities({ category: '未知', categoryRaw: '体育休闲服务;影剧院' })
    expect(r.activities.map((a) => a.title)).toContain('看演出')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/core/derive.test.ts`
Expected: FAIL，找不到 `./derive`。

- [ ] **Step 3: 写规则表**

Create `lib/core/derive-rules.ts`:

```ts
import type { Activity } from './model'

export type DeriveRule = {
  match: string[]
  activities: Activity[]
  suggestedDurationMinutes: number
}

/**
 * 高德 POI 没有「游玩项目」字段，这里按类别推导。
 * 纯数据，后续换 LLM 或真实内容源时只替换 derive.ts 的实现。
 */
export const DERIVE_RULES: DeriveRule[] = [
  {
    match: ['公园', '风景名胜', '景点', '广场'],
    activities: [
      { title: '散步', durationMinutes: 45 },
      { title: '拍照', durationMinutes: 30 },
      { title: '野餐', durationMinutes: 30 },
    ],
    suggestedDurationMinutes: 105,
  },
  {
    match: ['博物馆', '展览馆', '展馆', '美术馆', '科技馆'],
    activities: [
      { title: '看展', durationMinutes: 60 },
      { title: '听讲解', durationMinutes: 30 },
    ],
    suggestedDurationMinutes: 90,
  },
  {
    match: ['餐饮', '中餐厅', '西餐厅', '快餐', '咖啡', '甜品'],
    activities: [
      { title: '吃饭', durationMinutes: 45 },
      { title: '休息', durationMinutes: 15 },
    ],
    suggestedDurationMinutes: 60,
  },
  {
    match: ['亲子', '儿童', '游乐园', '动物园', '水族馆'],
    activities: [
      { title: '陪玩', durationMinutes: 60 },
      { title: '游乐设施', durationMinutes: 60 },
    ],
    suggestedDurationMinutes: 120,
  },
  {
    match: ['购物', '商场', '商圈', '步行街', '超市'],
    activities: [
      { title: '逛街', durationMinutes: 60 },
      { title: '喝东西', durationMinutes: 30 },
    ],
    suggestedDurationMinutes: 90,
  },
  {
    match: ['影剧院', '电影院', '剧院', '演出'],
    activities: [
      { title: '看演出', durationMinutes: 120 },
      { title: '周边走走', durationMinutes: 20 },
    ],
    suggestedDurationMinutes: 140,
  },
]

export const FALLBACK_RULE: DeriveRule = {
  match: [],
  activities: [{ title: '逛一逛', durationMinutes: 60 }],
  suggestedDurationMinutes: 60,
}
```

- [ ] **Step 4: 实现推导**

Create `lib/core/derive.ts`:

```ts
import { DERIVE_RULES, FALLBACK_RULE } from './derive-rules'
import type { Activity, Poi } from './model'

function matches(rule: { match: string[] }, haystack: string): boolean {
  return rule.match.some((keyword) => haystack.includes(keyword))
}

export function deriveActivities(
  poi: Pick<Poi, 'category' | 'categoryRaw'>,
): { activities: Activity[]; suggestedDurationMinutes: number; deriveSource: 'rules' } {
  const haystack = `${poi.category ?? ''};${poi.categoryRaw ?? ''}`
  const rule = DERIVE_RULES.find((r) => matches(r, haystack)) ?? FALLBACK_RULE

  return {
    activities: rule.activities.map((a) => ({ ...a })),
    suggestedDurationMinutes: rule.suggestedDurationMinutes,
    deriveSource: 'rules',
  }
}
```

规则表里每条规则的 activity 时长之和都恰好等于建议总时长，所以第 5 个用例天然成立；兜底规则也必须非空，这是第 3、4 个用例在守的线。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run lib/core/derive.test.ts`
Expected: PASS，6 个用例全绿。

- [ ] **Step 6: 提交**

```bash
git add lib/core/derive.ts lib/core/derive-rules.ts lib/core/derive.test.ts
git commit -m "feat: 按类别推导游玩项目与建议时长"
```

---

### Task 5: 排序与多样性惩罚

**Files:**
- Create: `lib/core/rank.ts`
- Test: `lib/core/rank.test.ts`

**Interfaces:**
- Consumes: `Poi`、`rank` 内部会用到 `OpenStatus`
- Produces: `WEIGHTS`、`MAX_PER_CATEGORY = 2`、`DIVERSITY_PENALTY = 0.6`、`rankPois(pois: Poi[], opts: { radiusMeters: number }): Poi[]`

`rankPois` 返回**新数组**，每项带 `score` 与 `scoreParts`，不改动入参对象。

- [ ] **Step 1: 写失败测试**

Create `lib/core/rank.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rankPois } from './rank'
import type { OpenStatus, Poi } from './model'

function poi(over: Partial<Poi> & { id: string }): Poi {
  return {
    name: over.id,
    category: '公园',
    categoryRaw: '风景名胜;公园广场;公园',
    point: { lng: 116.4, lat: 39.9 },
    distanceMeters: 1000,
    address: '示例路 1 号',
    openStatus: 'open' as OpenStatus,
    ...over,
  }
}

const OPTS = { radiusMeters: 10000 }

describe('rankPois', () => {
  it('已关闭的 POI 被硬过滤掉', () => {
    const out = rankPois([poi({ id: 'a' }), poi({ id: 'b', openStatus: 'closed' })], OPTS)
    expect(out.map((p) => p.id)).toEqual(['a'])
  })

  it('其他条件相同时近的排前面', () => {
    const out = rankPois([poi({ id: 'far', distanceMeters: 8000 }), poi({ id: 'near', distanceMeters: 500 })], OPTS)
    expect(out[0].id).toBe('near')
  })

  it('营业中的排在营业状态未知的前面', () => {
    const out = rankPois(
      [
        poi({ id: 'unknown', openStatus: 'unknown', distanceMeters: 500 }),
        poi({ id: 'open', openStatus: 'open', distanceMeters: 500 }),
      ],
      OPTS,
    )
    expect(out[0].id).toBe('open')
  })

  it('同类别第 3 张会被压到其他类别后面', () => {
    const list = [
      poi({ id: 'park1', category: '公园', distanceMeters: 100 }),
      poi({ id: 'park2', category: '公园', distanceMeters: 110 }),
      poi({ id: 'park3', category: '公园', distanceMeters: 120 }),
      poi({ id: 'museum1', category: '博物馆', distanceMeters: 300 }),
    ]
    const out = rankPois(list, OPTS)
    // museum1 距离更远但类别未满，应当挤到 park3 前面
    expect(out.map((p) => p.id)).toEqual(['park1', 'park2', 'museum1', 'park3'])
  })

  it('每个结果都带上 score 与 scoreParts 便于调参', () => {
    const out = rankPois([poi({ id: 'a' })], OPTS)
    expect(out[0].score).toBeGreaterThan(0)
    expect(Object.keys(out[0].scoreParts ?? {}).sort()).toEqual(['distance', 'openStatus', 'popularity'])
  })

  it('不改动入参数组与对象', () => {
    const input = [poi({ id: 'a' }), poi({ id: 'b' })]
    const snapshot = JSON.stringify(input)
    rankPois(input, OPTS)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('全部没有评分时不炸，热度取中性值', () => {
    const out = rankPois([poi({ id: 'a' }), poi({ id: 'b', distanceMeters: 2000 })], OPTS)
    expect(out).toHaveLength(2)
    expect(out[0].scoreParts?.popularity).toBe(0.5)
  })

  it('超出半径的 POI 距离分被夹到 0 而不是负数', () => {
    const out = rankPois([poi({ id: 'a', distanceMeters: 20000 })], OPTS)
    expect(out[0].scoreParts?.distance).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/core/rank.test.ts`
Expected: FAIL，找不到 `./rank`。

- [ ] **Step 3: 实现排序**

Create `lib/core/rank.ts`:

```ts
import type { Poi } from './model'

export const WEIGHTS = {
  distance: 0.5,
  openStatus: 0.3,
  popularity: 0.2,
} as const

export const MAX_PER_CATEGORY = 2
export const DIVERSITY_PENALTY = 0.6

const OPEN_STATUS_SCORE = { open: 1, unknown: 0.5, closed: 0 } as const

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function medianRating(pois: Poi[]): number | null {
  const ratings = pois.map((p) => p.rating).filter((r): r is number => typeof r === 'number')
  if (ratings.length === 0) return null
  const sorted = [...ratings].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function rankPois(pois: Poi[], opts: { radiusMeters: number }): Poi[] {
  const median = medianRating(pois)

  const scored = pois
    .filter((p) => p.openStatus !== 'closed')
    .map((p) => {
      const scoreParts = {
        distance: clamp01(1 - p.distanceMeters / opts.radiusMeters),
        openStatus: OPEN_STATUS_SCORE[p.openStatus],
        // 没有评分时取全体中位数；全体都没有评分时取中性 0.5
        popularity: p.rating != null ? clamp01(p.rating / 5) : median != null ? clamp01(median / 5) : 0.5,
      }
      const score =
        scoreParts.distance * WEIGHTS.distance +
        scoreParts.openStatus * WEIGHTS.openStatus +
        scoreParts.popularity * WEIGHTS.popularity
      return { ...p, score, scoreParts }
    })

  // 贪心：每次从剩下的里取「施加多样性惩罚后」分数最高的一个。
  // 这样同类别第 3 张会被压到其他类别后面，且不会来回震荡。
  const remaining = scored.slice()
  const out: Poi[] = []
  const categoryCount = new Map<string, number>()

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestScore = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const used = categoryCount.get(remaining[i].category) ?? 0
      const penalized = (remaining[i].score ?? 0) * (used >= MAX_PER_CATEGORY ? DIVERSITY_PENALTY : 1)
      if (penalized > bestScore) {
        bestScore = penalized
        bestIndex = i
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1)
    categoryCount.set(chosen.category, (categoryCount.get(chosen.category) ?? 0) + 1)
    out.push({ ...chosen, score: bestScore })
  }

  return out
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/core/rank.test.ts`
Expected: PASS，8 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add lib/core/rank.ts lib/core/rank.test.ts
git commit -m "feat: 候选排序与同类多样性惩罚"
```

---

### Task 6: Provider 契约与 mock 实现

**Files:**
- Create: `lib/providers/poi/types.ts`
- Create: `lib/providers/poi/mock.ts`
- Create: `lib/providers/poi/index.ts`
- Create: `lib/providers/route/types.ts`
- Create: `lib/providers/route/mock.ts`
- Create: `lib/providers/route/index.ts`
- Test: `lib/providers/providers.test.ts`

**Interfaces:**
- Consumes: `LatLng`、`Poi`、`Route`、`RouteLeg`、`TravelMode`、`ReverseGeocodeResult`、`minutesToMeters`、`haversineMeters`
- Produces:
  - `PoiProvider = { searchNearby(input: SearchNearbyInput): Promise<Poi[]>; getDetail(id: string): Promise<Poi | null>; reverseGeocode(point: LatLng): Promise<ReverseGeocodeResult> }`
  - `RouteProvider = { planRoute(input: PlanRouteInput): Promise<Route> }`
  - `getPoiProvider(): PoiProvider`、`getRouteProvider(): RouteProvider`
  - `mockPoisAround(origin: LatLng, count?: number): Poi[]`

- [ ] **Step 1: 写 poi provider 契约**

Create `lib/providers/poi/types.ts`:

```ts
import type { LatLng, Poi, ReverseGeocodeResult, TravelMode } from '@/lib/core/model'

export type SearchNearbyInput = {
  origin: LatLng
  radiusMeters: number
  mode: TravelMode
  limit: number
}

export type PoiProvider = {
  searchNearby(input: SearchNearbyInput): Promise<Poi[]>
  getDetail(id: string): Promise<Poi | null>
  /** 逆地理编码。返回的 label 必须已经模糊到不细于街区 */
  reverseGeocode(point: LatLng): Promise<ReverseGeocodeResult>
}
```

- [ ] **Step 2: 写 route provider 契约**

Create `lib/providers/route/types.ts`:

```ts
import type { LatLng, Route, TravelMode } from '@/lib/core/model'

export type PlanRouteInput = {
  origin: LatLng
  stops: { id: string; point: LatLng }[]
  mode: TravelMode
  departAt?: string
}

export type RouteProvider = {
  planRoute(input: PlanRouteInput): Promise<Route>
}
```

- [ ] **Step 3: 写 mock 实现的失败测试**

Create `lib/providers/providers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mockPoisAround, mockPoiProvider } from './poi/mock'
import { mockRouteProvider } from './route/mock'

const ORIGIN = { lng: 116.4, lat: 39.9 }

describe('mock POI provider', () => {
  it('同一出发点每次生成完全一样的结果', () => {
    expect(mockPoisAround(ORIGIN, 12)).toEqual(mockPoisAround(ORIGIN, 12))
  })

  it('生成数量与请求一致', () => {
    expect(mockPoisAround(ORIGIN, 24)).toHaveLength(24)
  })

  it('每个 POI 的 distanceMeters 与坐标自洽', () => {
    for (const p of mockPoisAround(ORIGIN, 24)) {
      expect(p.distanceMeters).toBeGreaterThan(0)
      expect(Number.isFinite(p.point.lng)).toBe(true)
      expect(Number.isFinite(p.point.lat)).toBe(true)
    }
  })

  it('字段齐全，符合 Poi 契约', () => {
    for (const p of mockPoisAround(ORIGIN, 24)) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.category).toBe('string')
      expect(['open', 'closed', 'unknown']).toContain(p.openStatus)
    }
  })

  it('同时产出 open / closed / unknown 三种营业状态，好验证过滤逻辑', () => {
    const statuses = new Set(mockPoisAround(ORIGIN, 24).map((p) => p.openStatus))
    expect(statuses).toContain('open')
    expect(statuses).toContain('closed')
    expect(statuses).toContain('unknown')
  })

  it('searchNearby 按 limit 截断且不超过半径', async () => {
    const out = await mockPoiProvider.searchNearby({ origin: ORIGIN, radiusMeters: 3000, mode: 'driving', limit: 6 })
    expect(out).toHaveLength(6)
    for (const p of out) expect(p.distanceMeters).toBeLessThanOrEqual(3000)
  })

  it('getDetail 命中已生成的 id，未知 id 返回 null', async () => {
    const known = mockPoisAround(ORIGIN, 5)[0]
    expect((await mockPoiProvider.getDetail(known.id))?.id).toBe(known.id)
    expect(await mockPoiProvider.getDetail('不存在')).toBeNull()
  })

  it('reverseGeocode 返回模糊到街区级的 label 与城市名', async () => {
    const r = await mockPoiProvider.reverseGeocode(ORIGIN)
    expect(r.label.length).toBeGreaterThan(0)
    expect(r.city.length).toBeGreaterThan(0)
    // 不允许带门牌号
    expect(r.label).not.toMatch(/\d+\s*号/)
  })
})

describe('mock Route provider', () => {
  const stops = [
    { id: 'a', point: { lng: 116.41, lat: 39.9 } },
    { id: 'b', point: { lng: 116.42, lat: 39.9 } },
  ]

  it('按传入顺序生成段，fromIndex 起点为 -1', async () => {
    const route = await mockRouteProvider.planRoute({ origin: ORIGIN, stops, mode: 'driving' })
    expect(route.order).toEqual(['a', 'b'])
    expect(route.legs).toHaveLength(2)
    expect(route.legs[0].fromIndex).toBe(-1)
    expect(route.legs[0].toIndex).toBe(0)
    expect(route.legs[1].fromIndex).toBe(0)
    expect(route.legs[1].toIndex).toBe(1)
  })

  it('总时长与总距离等于各段之和', async () => {
    const route = await mockRouteProvider.planRoute({ origin: ORIGIN, stops, mode: 'driving' })
    const dur = route.legs.reduce((a, l) => a + l.durationSeconds, 0)
    const dist = route.legs.reduce((a, l) => a + l.distanceMeters, 0)
    expect(route.totalDurationSeconds).toBe(dur)
    expect(route.totalDistanceMeters).toBe(dist)
  })

  it('折线点数不少于停靠点数', async () => {
    const route = await mockRouteProvider.planRoute({ origin: ORIGIN, stops, mode: 'walking' })
    expect(route.polyline.length).toBeGreaterThanOrEqual(stops.length)
  })

  it('少于 2 个停靠点也能返回，不抛错', async () => {
    const route = await mockRouteProvider.planRoute({ origin: ORIGIN, stops: [stops[0]], mode: 'driving' })
    expect(route.legs).toHaveLength(1)
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

Run: `npx vitest run lib/providers/providers.test.ts`
Expected: FAIL，找不到 `./poi/mock`。

- [ ] **Step 5: 实现 mock POI provider**

Create `lib/providers/poi/mock.ts`:

```ts
import { haversineMeters, minutesToMeters } from '@/lib/core/geo'
import type { LatLng, OpenStatus, Poi, ReverseGeocodeResult } from '@/lib/core/model'
import type { PoiProvider } from './types'

const CATEGORIES = ['公园', '博物馆', '餐饮', '购物', '亲子', '风景名胜'] as const

/** 确定性假数据：同一出发点永远得到同一批 POI，便于反复验证交互 */
export function mockPoisAround(origin: LatLng, count = 24, maxRadiusMeters = 20000): Poi[] {
  const out: Poi[] = []
  const latScale = Math.cos((origin.lat * Math.PI) / 180)

  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[i % CATEGORIES.length]
    // 黄金角铺开，避免所有点挤在一条线上
    const ring = 600 + (i % 7) * (maxRadiusMeters / 12)
    const angle = (i * 137.508 * Math.PI) / 180
    const point: LatLng = {
      lng: origin.lng + (ring * Math.sin(angle)) / (111320 * latScale),
      lat: origin.lat + (ring * Math.cos(angle)) / 111320,
    }
    const openStatus: OpenStatus = i % 9 === 0 ? 'closed' : i % 7 === 0 ? 'unknown' : 'open'
    out.push({
      id: `mock-${i + 1}`,
      name: `${category}示例地 ${i + 1}`,
      category,
      categoryRaw: `mock;${category}`,
      point,
      distanceMeters: haversineMeters(origin, point),
      address: `示例路 ${i + 1} 号`,
      openStatus,
      rating: i % 5 === 0 ? undefined : Number((3.4 + (i % 16) / 10).toFixed(1)),
    })
  }

  return out
}

export const mockPoiProvider: PoiProvider = {
  async searchNearby({ origin, radiusMeters, limit }) {
    return mockPoisAround(origin, 24, radiusMeters)
      .filter((p) => p.distanceMeters <= radiusMeters)
      .slice(0, limit)
  },

  async getDetail(id) {
    const all = mockPoisAround({ lng: 116.4, lat: 39.9 }, 24)
    return all.find((p) => p.id === id) ?? null
  },

  async reverseGeocode(): Promise<ReverseGeocodeResult> {
    return { label: '示例市中心区域', city: '示例市' }
  },
}
```

- [ ] **Step 6: 实现 mock Route provider**

Create `lib/providers/route/mock.ts`:

```ts
import { MODE_SPEED_KMH, haversineMeters } from '@/lib/core/geo'
import type { LatLng, Route, RouteLeg } from '@/lib/core/model'
import type { RouteProvider } from './types'

function interpolate(a: LatLng, b: LatLng, steps = 8): LatLng[] {
  const out: LatLng[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    out.push({ lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t })
  }
  return out
}

export const mockRouteProvider: RouteProvider = {
  async planRoute({ origin, stops, mode }): Promise<Route> {
    const points = [origin, ...stops.map((s) => s.point)]
    const legs: RouteLeg[] = []

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      const distanceMeters = haversineMeters(from, to)
      const speedMs = (MODE_SPEED_KMH[mode] * 1000) / 3600
      legs.push({
        fromIndex: i - 1,
        toIndex: i,
        distanceMeters,
        durationSeconds: speedMs > 0 ? Math.round(distanceMeters / speedMs) : 0,
        polyline: interpolate(from, to),
      })
    }

    return {
      mode,
      order: stops.map((s) => s.id),
      legs,
      totalDurationSeconds: legs.reduce((a, l) => a + l.durationSeconds, 0),
      totalDistanceMeters: legs.reduce((a, l) => a + l.distanceMeters, 0),
      polyline: points,
    }
  },
}
```

- [ ] **Step 7: 写两个 index 选择器**

Create `lib/providers/poi/index.ts`:

```ts
import { amapPoiProvider } from './amap'
import { mockPoiProvider } from './mock'
import type { PoiProvider } from './types'

export function getPoiProvider(): PoiProvider {
  return process.env.POI_PROVIDER === 'mock' ? mockPoiProvider : amapPoiProvider
}

export type { PoiProvider, SearchNearbyInput } from './types'
```

Create `lib/providers/route/index.ts`:

```ts
import { amapRouteProvider } from './amap'
import { mockRouteProvider } from './mock'
import type { RouteProvider } from './types'

export function getRouteProvider(): RouteProvider {
  return process.env.ROUTE_PROVIDER === 'mock' ? mockRouteProvider : amapRouteProvider
}

export type { PlanRouteInput, RouteProvider } from './types'
```

这两个文件此刻会报「找不到 `./amap`」——Task 7 会补上。为了让本 Task 的测试能跑，先建两个最小占位文件：

Create `lib/providers/poi/amap.ts` 与 `lib/providers/route/amap.ts`，内容暂时各为：

```ts
export const amapPoiProvider = null as never
```

（`route/amap.ts` 里对应 `export const amapRouteProvider = null as never`。Task 7 会整体替换掉。）

- [ ] **Step 8: 跑测试确认通过**

Run: `npx vitest run lib/providers/providers.test.ts`
Expected: PASS，12 个用例全绿。

- [ ] **Step 9: 提交**

```bash
git add lib/providers
git commit -m "feat: provider 契约与确定性 mock 实现"
```

---

### Task 7: 高德 provider 实现

**Files:**
- Create: `lib/providers/amap-fetch.ts`
- Modify: `lib/providers/poi/amap.ts`（整体替换 Task 6 的占位）
- Modify: `lib/providers/route/amap.ts`（整体替换 Task 6 的占位）
- Test: `lib/providers/amap.test.ts`

**Interfaces:**
- Consumes: `PoiProvider`、`RouteProvider`、`parseOpenStatus`、`blurAddress`、`haversineMeters`、`simplifyPolyline`
- Produces:
  - `amapGet<T>(path: string, params: Record<string, string | number | undefined>): Promise<T>`
  - `mapAmapPoi(raw: AmapRawPoi, origin: LatLng, fallbackId: string, now: Date): Poi`
  - `parseAmapPolyline(text: string): LatLng[]`
  - `amapPoiProvider: PoiProvider`、`amapRouteProvider: RouteProvider`

- [ ] **Step 1: 写 HTTP 封装**

Create `lib/providers/amap-fetch.ts`:

```ts
const BASE = 'https://restapi.amap.com'

export class AmapError extends Error {
  constructor(message: string, readonly info?: string) {
    super(message)
    this.name = 'AmapError'
  }
}

/**
 * 只在服务端调用。AMAP_WEB_SERVICE_KEY 绝不允许出现在 'use client' 文件里。
 */
export async function amapGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const key = process.env.AMAP_WEB_SERVICE_KEY
  if (!key) throw new AmapError('未配置 AMAP_WEB_SERVICE_KEY')

  const url = new URL(path, BASE)
  url.searchParams.set('key', key)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new AmapError(`高德接口 HTTP ${res.status}`)

  const data = (await res.json()) as T & { status?: string; info?: string }
  if (data.status !== undefined && data.status !== '1') {
    throw new AmapError(`高德接口返回失败：${data.info ?? '未知原因'}`, data.info)
  }
  return data
}
```

- [ ] **Step 2: 写字段映射的失败测试**

Create `lib/providers/amap.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapAmapPoi, parseAmapPolyline } from './poi/amap'

const NOW = new Date(2026, 8, 18, 10, 0)

const RAW = {
  id: 'B0FFH12345',
  name: '示例公园',
  type: '风景名胜;公园广场;公园',
  typecode: '110101',
  location: '116.401,39.901',
  distance: '1234',
  address: '示例路 1 号',
  tel: '010-12345678',
  biz_ext: { rating: '4.5', open_time: '09:00-17:00' },
}

describe('mapAmapPoi', () => {
  it('字段映射齐全', () => {
    const p = mapAmapPoi(RAW, { lng: 116.4, lat: 39.9 }, 'fallback', NOW)
    expect(p.id).toBe('B0FFH12345')
    expect(p.name).toBe('示例公园')
    expect(p.point).toEqual({ lng: 116.401, lat: 39.901 })
    expect(p.distanceMeters).toBe(1234)
    expect(p.rating).toBe(4.5)
    expect(p.openStatus).toBe('open')
  })

  it('type 只取第一段作为归一化大类', () => {
    expect(mapAmapPoi(RAW, { lng: 116.4, lat: 39.9 }, 'f', NOW).category).toBe('风景名胜')
  })

  it('rating 为空串时视为没有评分', () => {
    const p = mapAmapPoi({ ...RAW, biz_ext: { rating: '' } }, { lng: 116.4, lat: 39.9 }, 'f', NOW)
    expect(p.rating).toBeUndefined()
  })

  it('biz_ext 整个缺失时不炸，营业状态为 unknown', () => {
    const { biz_ext, ...withoutExt } = RAW
    const p = mapAmapPoi(withoutExt, { lng: 116.4, lat: 39.9 }, 'f', NOW)
    expect(p.openStatus).toBe('unknown')
    expect(p.rating).toBeUndefined()
  })

  it('location 缺失时回落到传入的 origin，且距离重算', () => {
    const { location, distance, ...withoutLoc } = RAW
    const p = mapAmapPoi(withoutLoc, { lng: 116.4, lat: 39.9 }, 'f', NOW)
    expect(p.point).toEqual({ lng: 116.4, lat: 39.9 })
    expect(p.distanceMeters).toBe(0)
  })

  it('id 缺失时用传入的 fallbackId 兜底', () => {
    const { id, ...withoutId } = RAW
    expect(mapAmapPoi(withoutId, { lng: 116.4, lat: 39.9 }, 'fallback-7', NOW).id).toBe('fallback-7')
  })

  it('距离缺失时用坐标现算', () => {
    const { distance, ...withoutDistance } = RAW
    const p = mapAmapPoi(withoutDistance, { lng: 116.4, lat: 39.9 }, 'f', NOW)
    expect(p.distanceMeters).toBeGreaterThan(0)
    expect(p.distanceMeters).toBeLessThan(300)
  })

  it('空 name 给兜底名称，不留空标题', () => {
    const p = mapAmapPoi({ ...RAW, name: '' }, { lng: 116.4, lat: 39.9 }, 'f', NOW)
    expect(p.name.length).toBeGreaterThan(0)
  })
})

describe('parseAmapPolyline', () => {
  it('解析分号分隔的 lng,lat 串', () => {
    expect(parseAmapPolyline('116.4,39.9;116.41,39.91')).toEqual([
      { lng: 116.4, lat: 39.9 },
      { lng: 116.41, lat: 39.91 },
    ])
  })

  it('空串给空数组', () => {
    expect(parseAmapPolyline('')).toEqual([])
  })

  it('跳过格式不对的片段而不是抛错', () => {
    expect(parseAmapPolyline('116.4,39.9;坏数据;116.41,39.91')).toHaveLength(2)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run lib/providers/amap.test.ts`
Expected: FAIL，`./poi/amap` 里没有 `mapAmapPoi`。

- [ ] **Step 4: 实现高德 POI provider**

覆盖 `lib/providers/poi/amap.ts`：

```ts
import { blurAddress } from '@/lib/core/address'
import { haversineMeters } from '@/lib/core/geo'
import type { LatLng, Poi, ReverseGeocodeResult } from '@/lib/core/model'
import { parseOpenStatus } from '@/lib/core/open-hours'
import { amapGet } from '../amap-fetch'
import type { PoiProvider } from './types'

export type AmapRawPoi = {
  id?: string
  name?: string
  type?: string
  typecode?: string
  location?: string
  distance?: string
  address?: string
  tel?: string
  biz_ext?: { rating?: string; open_time?: string; opentime2?: string }
}

function parseLocation(text: string | undefined): LatLng | null {
  if (!text) return null
  const [lngText, latText] = text.split(',')
  const lng = Number(lngText)
  const lat = Number(latText)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

export function parseAmapPolyline(text: string): LatLng[] {
  if (!text) return []
  const out: LatLng[] = []
  for (const chunk of text.split(';')) {
    const point = parseLocation(chunk.trim())
    if (point) out.push(point)
  }
  return out
}

export function mapAmapPoi(
  raw: AmapRawPoi,
  origin: LatLng,
  fallbackId: string,
  now: Date,
): Poi {
  const point = parseLocation(raw.location) ?? { ...origin }
  const rawDistance = Number(raw.distance)
  const distanceMeters = Number.isFinite(rawDistance) && raw.distance !== ''
    ? Math.round(rawDistance)
    : haversineMeters(origin, point)

  const rawRating = raw.biz_ext?.rating
  const rating = rawRating ? Number(rawRating) : Number.NaN
  const openTime = raw.biz_ext?.open_time ?? raw.biz_ext?.opentime2

  const typeText = raw.type ?? ''
  const category = typeText.split(';')[0]?.trim() || '其他'

  return {
    id: raw.id?.trim() || fallbackId,
    name: raw.name?.trim() || '未命名地点',
    category,
    categoryRaw: typeText,
    point,
    distanceMeters,
    address: raw.address?.trim() ?? '',
    openStatus: parseOpenStatus(openTime, now),
    rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
  }
}

type AroundResponse = { pois?: AmapRawPoi[] }
type DetailResponse = { pois?: AmapRawPoi[] }
type RegeoResponse = {
  regeocode?: {
    formatted_address?: string
    addressComponent?: {
      province?: string
      city?: string
      district?: string
      township?: string
      streetNumber?: { street?: string }
    }
  }
}

export const amapPoiProvider: PoiProvider = {
  async searchNearby({ origin, radiusMeters, limit }) {
    const data = await amapGet<AroundResponse>('/v3/place/around', {
      location: `${origin.lng},${origin.lat}`,
      radius: Math.min(Math.round(radiusMeters), 50000),
      offset: Math.min(limit * 4, 25),
      page: 1,
      extensions: 'all',
    })
    const now = new Date()
    return (data.pois ?? []).map((raw, i) => mapAmapPoi(raw, origin, `amap-${i + 1}`, now))
  },

  async getDetail(id) {
    const data = await amapGet<DetailResponse>('/v3/place/detail', { id })
    const raw = data.pois?.[0]
    if (!raw) return null
    const point = parseLocation(raw.location) ?? { lng: 0, lat: 0 }
    return mapAmapPoi(raw, point, id, new Date())
  },

  async reverseGeocode(point): Promise<ReverseGeocodeResult> {
    const data = await amapGet<RegeoResponse>('/v3/geocode/regeo', {
      location: `${point.lng},${point.lat}`,
      extensions: 'base',
    })
    const comp = data.regeocode?.addressComponent
    return {
      label: blurAddress({
        province: comp?.province,
        city: typeof comp?.city === 'string' ? comp.city : undefined,
        district: comp?.district,
        township: comp?.township,
        street: comp?.streetNumber?.street,
      }),
      city: (typeof comp?.city === 'string' && comp.city) || comp?.province || '',
    }
  },
}
```

`city` 在直辖市会返回空数组而不是字符串，所以两处都做了 `typeof === 'string'` 判断，这是高德返回结构里真实存在的坑。

- [ ] **Step 5: 实现高德 Route provider**

覆盖 `lib/providers/route/amap.ts`：

```ts
import { simplifyPolyline } from '@/lib/core/geo'
import type { Route, RouteLeg } from '@/lib/core/model'
import { amapGet } from '../amap-fetch'
import { parseAmapPolyline } from '../poi/amap'
import type { RouteProvider } from './types'

type DirectionResponse = {
  route?: {
    paths?: {
      distance?: string
      duration?: string
      steps?: { polyline?: string; duration?: string; distance?: string }[]
    }[]
  }
}

const ENDPOINT = {
  driving: '/v3/direction/driving',
  walking: '/v3/direction/walking',
  bicycling: '/v3/direction/bicycling',
  transit: '/v3/direction/transit/integrated',
} as const

/**
 * 逐段规划：每段一次请求。这样每段的时长/折线天然分开，
 * 且某一段失败时可以只降级那一段（见 spec 第 9 节）。
 */
export const amapRouteProvider: RouteProvider = {
  async planRoute({ origin, stops, mode, departAt }): Promise<Route> {
    const points = [origin, ...stops.map((s) => s.point)]
    const legs: RouteLeg[] = []

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      const fromIndex = i - 1
      const toIndex = i

      try {
        const data = await amapGet<DirectionResponse>(ENDPOINT[mode], {
          origin: `${from.lng},${from.lat}`,
          destination: `${to.lng},${to.lat}`,
          extensions: 'all',
          depart_at: departAt,
        })
        const path = data.route?.paths?.[0]
        if (!path) throw new Error('高德未返回可用路径')

        const polyline = (path.steps ?? []).flatMap((s) => parseAmapPolyline(s.polyline ?? ''))
        legs.push({
          fromIndex,
          toIndex,
          distanceMeters: Math.round(Number(path.distance) || 0),
          durationSeconds: Math.round(Number(path.duration) || 0),
          polyline: simplifyPolyline(polyline, 5),
        })
      } catch {
        // 单段失败降级成直线，不让整条路线失败
        legs.push({
          fromIndex,
          toIndex,
          distanceMeters: 0,
          durationSeconds: 0,
          polyline: [from, to],
        })
      }
    }

    return {
      mode,
      order: stops.map((s) => s.id),
      legs,
      totalDurationSeconds: legs.reduce((a, l) => a + l.durationSeconds, 0),
      totalDistanceMeters: legs.reduce((a, l) => a + l.distanceMeters, 0),
      polyline: points,
    }
  },
}
```

公交（`transit`）还需要 `city` 参数才能出结果，缺失时上面的 `try/catch` 会自动把它降级成直线，不会中断流程。

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run lib/providers/amap.test.ts`
Expected: PASS，11 个用例全绿。

- [ ] **Step 7: 跑全量测试**

Run: `npm test`
Expected: 全绿，Task 2~7 的所有用例都通过。

- [ ] **Step 8: 提交**

```bash
git add lib/providers
git commit -m "feat: 高德 provider 与字段映射"
```

---

### Task 8: 服务端 API 路由

**Files:**
- Create: `app/api/poi/search/route.ts`
- Create: `app/api/poi/[id]/route.ts`
- Create: `app/api/route/plan/route.ts`
- Create: `app/api/amap-service/[...path]/route.ts`

**Interfaces:**
- Consumes: `getPoiProvider`、`getRouteProvider`、`rankPois`、`deriveActivities`、`minutesToMeters`
- Produces: 四个 HTTP 端点，契约见 spec 第 6 节

- [ ] **Step 1: 写周边搜索端点**

Create `app/api/poi/search/route.ts`:

```ts
import { minutesToMeters } from '@/lib/core/geo'
import type { SearchRequest, SearchResponse } from '@/lib/core/model'
import { rankPois } from '@/lib/core/rank'
import { getPoiProvider } from '@/lib/providers/poi'

// 不能 export —— Next 会校验 route 文件的导出，多余的导出会导致构建失败
const MAX_CARDS = 6

export async function POST(req: Request) {
  let body: SearchRequest
  try {
    body = (await req.json()) as SearchRequest
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  if (!body?.origin || !Number.isFinite(body.origin.lng) || !Number.isFinite(body.origin.lat)) {
    return Response.json({ error: '缺少合法的出发点坐标' }, { status: 400 })
  }

  const radiusMinutes = body.radiusMinutes ?? 60
  const mode = body.mode ?? 'driving'
  const radiusMeters = minutesToMeters(radiusMinutes, mode)
  const provider = getPoiProvider()

  try {
    const [pois, geocode] = await Promise.all([
      provider.searchNearby({ origin: body.origin, radiusMeters, mode, limit: MAX_CARDS * 4 }),
      provider.reverseGeocode(body.origin),
    ])

    const result: SearchResponse = {
      origin: { point: body.origin, label: geocode.label, source: body.source ?? 'map-pick' },
      pois: rankPois(pois, { radiusMeters }).slice(0, MAX_CARDS),
    }
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: `周边搜索失败：${message}` }, { status: 502 })
  }
}
```

- [ ] **Step 2: 写单点详情端点**

Create `app/api/poi/[id]/route.ts`:

```ts
import { deriveActivities } from '@/lib/core/derive'
import { getPoiProvider } from '@/lib/providers/poi'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Next 15 起 params 是 Promise，必须 await
  const { id } = await ctx.params

  try {
    const poi = await getPoiProvider().getDetail(id)
    if (!poi) return Response.json({ error: '找不到该地点' }, { status: 404 })

    return Response.json({ ...poi, ...deriveActivities(poi) })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: `获取详情失败：${message}` }, { status: 502 })
  }
}
```

- [ ] **Step 3: 写路线规划端点**

Create `app/api/route/plan/route.ts`:

```ts
import type { PlanRequest } from '@/lib/core/model'
import { getRouteProvider } from '@/lib/providers/route'

export async function POST(req: Request) {
  let body: PlanRequest
  try {
    body = (await req.json()) as PlanRequest
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  if (!body?.origin || !Array.isArray(body.stops) || body.stops.length < 2) {
    return Response.json({ error: '至少需要 2 个停靠点才能规划路线' }, { status: 400 })
  }

  try {
    return Response.json(
      await getRouteProvider().planRoute({
        origin: body.origin,
        stops: body.stops,
        mode: body.mode ?? 'driving',
        departAt: body.departAt,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: `路线规划失败：${message}` }, { status: 502 })
  }
}
```

- [ ] **Step 4: 写安全密钥代理**

Create `app/api/amap-service/[...path]/route.ts`:

```ts
const UPSTREAM = 'https://restapi.amap.com'

/**
 * 高德 JS API 的 serviceHost 代理。
 * 安全密钥只在这里被追加，浏览器永远拿不到它。
 * 路径不能叫 _AMapService —— App Router 会把下划线开头的目录排除在路由之外。
 */
async function proxy(req: Request, path: string[]): Promise<Response> {
  const code = process.env.AMAP_JS_SECURITY_CODE
  if (!code) return new Response('未配置 AMAP_JS_SECURITY_CODE', { status: 500 })

  const incoming = new URL(req.url)
  const target = new URL(`/${path.join('/')}`, UPSTREAM)
  incoming.searchParams.forEach((value, key) => target.searchParams.set(key, value))
  target.searchParams.set('jscode', code)

  const upstream = await fetch(target, {
    method: req.method,
    headers: req.method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
    body: req.method === 'POST' ? await req.text() : undefined,
    cache: 'no-store',
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path)
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path)
}
```

- [ ] **Step 5: 起服务确认端点在**

```bash
npm run dev
```

另开一个终端：

```bash
curl -s -X POST localhost:3000/api/poi/search \
  -H 'content-type: application/json' \
  -d '{"origin":{"lng":116.4,"lat":39.9},"source":"map-pick","radiusMinutes":60,"mode":"driving"}'
```

Expected: 返回 JSON，`pois` 是 6 条（`POI_PROVIDER=mock` 时来自假数据），`origin.label` 为「示例市中心区域」。

```bash
curl -s -X POST localhost:3000/api/route/plan \
  -H 'content-type: application/json' \
  -d '{"origin":{"lng":116.4,"lat":39.9},"stops":[{"id":"mock-1","point":{"lng":116.41,"lat":39.9}},{"id":"mock-2","point":{"lng":116.42,"lat":39.9}}],"mode":"driving"}'
```

Expected: 返回 `order: ["mock-1","mock-2"]`，`legs` 长度 2，`legs[0].fromIndex` 为 `-1`。

- [ ] **Step 6: 提交**

```bash
git add app/api
git commit -m "feat: 周边搜索、单点详情、路线规划与安全密钥代理端点"
```

---

### Task 9: 地图与路线覆盖层

**Files:**
- Create: `types/amap.d.ts`
- Create: `lib/amap/loader.ts`
- Create: `components/MapCanvas.tsx`
- Create: `components/RouteOverlay.ts`

**Interfaces:**
- Consumes: `LatLng`、`Poi`、`Route`
- Produces:
  - `loadAmap(): Promise<any>` —— 幂等，重复调用只加载一次
  - `buildRoutePolyline(AMap, route: Route): any` —— 折线，最上层
  - `buildStopMarkers(AMap, map, points: { point: LatLng; label: string; order: number }[]): any[]` —— 带序号的标记
  - `MapCanvas` 组件，props 见下

**关于 AMap 的类型：** `@amap/amap-jsapi-loader` 不自带类型，其类型包版本我没验证过，所以本版只在 `types/amap.d.ts` 里声明 `window.AMap` 为 `any`，把类型风险挡在一个文件里。等真需要类型时再补。

- [ ] **Step 1: 声明 AMap 全局**

Create `types/amap.d.ts`:

```ts
declare global {
  interface Window {
    AMap?: any
    _AMapSecurityConfig?: {
      serviceHost?: string
      securityJsCode?: string
    }
  }
}

export {}
```

- [ ] **Step 2: 写加载器**

Create `lib/amap/loader.ts`:

```ts
let loading: Promise<any> | null = null

/**
 * 幂等加载高德 JS API 2.0。
 * 安全密钥不进浏览器：只把 serviceHost 指向本站代理，由服务端追加 jscode。
 * _AMapSecurityConfig 必须在脚本加载前设置好，所以这里在 load 之前赋值。
 */
export function loadAmap(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('loadAmap 只能在浏览器中调用'))
  if (window.AMap) return Promise.resolve(window.AMap)
  if (loading) return loading

  window._AMapSecurityConfig = {
    serviceHost: `${window.location.origin}/api/amap-service`,
  }

  const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY
  if (!key) return Promise.reject(new Error('未配置 NEXT_PUBLIC_AMAP_JS_KEY'))

  loading = import('@amap/amap-jsapi-loader')
    .then(({ default: AMapLoader }) =>
      AMapLoader.load({ key, version: '2.0', plugins: ['AMap.ToolBar', 'AMap.Scale'] }),
    )
    .then((AMap) => {
      window.AMap = AMap
      return AMap
    })
    .catch((error) => {
      loading = null
      throw error
    })

  return loading
}
```

- [ ] **Step 3: 写路线覆盖层**

Create `components/RouteOverlay.ts`:

```ts
import type { LatLng, Route } from '@/lib/core/model'

/** 折线画在所有覆盖物最上层，保证压在标记和底图之上 */
export function buildRoutePolyline(AMap: any, route: Route): any {
  const path = route.legs.flatMap((leg) => leg.polyline)
  return new AMap.Polyline({
    path: path.map((p) => [p.lng, p.lat]),
    strokeColor: '#2563eb',
    strokeWeight: 6,
    strokeOpacity: 0.9,
    lineJoin: 'round',
    zIndex: 200,
  })
}

export type StopMarkerSpec = { point: LatLng; label: string; order: number }

/** order 从 1 开始；起点传 0，渲染成「起」 */
export function buildStopMarkers(AMap: any, specs: StopMarkerSpec[]): any[] {
  return specs.map((spec) => {
    const badge = spec.order === 0 ? '起' : String(spec.order)
    return new AMap.Marker({
      position: [spec.point.lng, spec.point.lat],
      zIndex: 300,
      content: `<div style="
        display:flex;align-items:center;justify-content:center;
        width:28px;height:28px;border-radius:9999px;
        background:#2563eb;color:#fff;font-size:13px;font-weight:600;
        border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);
      ">${badge}</div>`,
      offset: new AMap.Pixel(-14, -14),
      title: spec.label,
    })
  })
}
```

- [ ] **Step 4: 写地图组件**

Create `components/MapCanvas.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { loadAmap } from '@/lib/amap/loader'
import type { LatLng, Poi, Route } from '@/lib/core/model'
import { buildRoutePolyline, buildStopMarkers, type StopMarkerSpec } from './RouteOverlay'

type Props = {
  origin: LatLng | null
  pois: Poi[]
  selectedOrder: string[]
  route: Route | null
  picking: boolean
  onPickLocation: (point: LatLng) => void
}

export default function MapCanvas({ origin, pois, selectedOrder, route, picking, onPickLocation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const pickRef = useRef(onPickLocation)
  pickRef.current = onPickLocation

  // 初始化地图，只做一次
  useEffect(() => {
    let cancelled = false

    loadAmap()
      .then((AMap) => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const map = new AMap.Map(containerRef.current, {
          zoom: 12,
          center: [116.4, 39.9],
          viewMode: '2D',
        })
        map.on('click', (e: any) => {
          pickRef.current({ lng: e.lnglat.getLng(), lat: e.lnglat.getLat() })
        })
        mapRef.current = map
      })
      .catch((e: Error) => setError(e.message))

    return () => {
      cancelled = true
      mapRef.current?.destroy?.()
      mapRef.current = null
    }
  }, [])

  // 同步覆盖物
  useEffect(() => {
    const AMap = typeof window !== 'undefined' ? window.AMap : undefined
    const map = mapRef.current
    if (!AMap || !map) return

    map.remove(overlaysRef.current)
    overlaysRef.current = []

    if (origin) {
      const specs: StopMarkerSpec[] = [
        { point: origin, label: '出发点', order: 0 },
        ...selectedOrder
          .map((id, index) => {
            const poi = pois.find((p) => p.id === id)
            return poi ? { point: poi.point, label: poi.name, order: index + 1 } : null
          })
          .filter((s): s is StopMarkerSpec => s !== null),
      ]
      overlaysRef.current.push(...buildStopMarkers(AMap, specs))
    }

    if (route) {
      // 后 add 的在上面，所以折线最后加
      overlaysRef.current.push(buildRoutePolyline(AMap, route))
    }

    map.add(overlaysRef.current)

    if (origin) map.setCenter([origin.lng, origin.lat])
  }, [origin, pois, selectedOrder, route])

  const points = route?.legs.flatMap((l) => l.polyline) ?? []
  useEffect(() => {
    const map = mapRef.current
    if (!map || points.length === 0) return
    map.setFitView(overlaysRef.current, false, [60, 60, 60, 60])
  }, [points.length])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className={`h-full w-full ${picking ? 'cursor-crosshair' : ''}`} />
      {picking && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1.5 text-sm text-white shadow">
          点击地图选择出发点
        </div>
      )}
      {error && (
        <div className="absolute inset-x-4 bottom-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 shadow">
          地图加载失败：{error}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 编译确认无类型错误**

```bash
npx tsc --noEmit
```

Expected: 无输出（通过）。

- [ ] **Step 6: 提交**

```bash
git add types/amap.d.ts lib/amap/loader.ts components/MapCanvas.tsx components/RouteOverlay.ts
git commit -m "feat: 地图画布与路线覆盖层"
```

---

### Task 10: 交互组件

**Files:**
- Create: `components/RouteSummaryBar.tsx`
- Create: `components/OriginPicker.tsx`
- Create: `components/PoiCard.tsx`
- Create: `components/PoiList.tsx`
- Create: `components/StopDetail.tsx`

**Interfaces:**
- Consumes: `Poi`、`PoiDetail`、`Origin`、`LatLng`、`TravelMode`、`Route`
- Produces: 五个展示型组件，props 如下

- [ ] **Step 1: 路线顺序条**

Create `components/RouteSummaryBar.tsx`:

```tsx
'use client'

import type { Poi, Route } from '@/lib/core/model'

type Props = { selectedOrder: string[]; pois: Poi[]; route: Route | null }

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

export default function RouteSummaryBar({ selectedOrder, pois, route }: Props) {
  if (selectedOrder.length < 2) return null

  const orderText = selectedOrder
    .map((id, index) => `${index + 1}. ${pois.find((p) => p.id === id)?.name ?? id}`)
    .join(' → ')

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
      <div className="mx-auto max-w-2xl rounded-xl bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <div className="text-sm font-medium text-slate-900">
          {selectedOrder.map((_, i) => i + 1).join(' → ')}
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{orderText}</div>
        {route && (
          <div className="mt-1 text-xs text-slate-600">
            全程 {formatDuration(route.totalDurationSeconds)} · {(route.totalDistanceMeters / 1000).toFixed(1)} 公里
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 出发点选择器**

Create `components/OriginPicker.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { LatLng, Origin, TravelMode } from '@/lib/core/model'

type Props = {
  origin: Origin | null
  locating: boolean
  mode: TravelMode
  radiusMinutes: 30 | 60 | 120
  onUseGeolocation: () => void
  onStartPick: () => void
  picking: boolean
  onModeChange: (mode: TravelMode) => void
  onRadiusChange: (minutes: 30 | 60 | 120) => void
}

const MODES: { value: TravelMode; label: string }[] = [
  { value: 'driving', label: '驾车' },
  { value: 'transit', label: '公交' },
  { value: 'walking', label: '步行' },
  { value: 'bicycling', label: '骑行' },
]

const RADII: (30 | 60 | 120)[] = [30, 60, 120]

export default function OriginPicker({
  origin, locating, mode, radiusMinutes,
  onUseGeolocation, onStartPick, picking, onModeChange, onRadiusChange,
}: Props) {
  const [showOptions, setShowOptions] = useState(false)

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate text-sm text-slate-700">
          {origin ? origin.label : '还没有出发点'}
        </div>
        {/* 两个入口视觉权重相同，没有任何一个被弱化成次要选项 */}
        <button
          onClick={onUseGeolocation}
          disabled={locating}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {locating ? '定位中…' : '用我的位置'}
        </button>
        <button
          onClick={onStartPick}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            picking ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {picking ? '选点中…' : '地图选点'}
        </button>
      </div>

      <button
        onClick={() => setShowOptions((v) => !v)}
        className="mt-2 text-xs text-slate-500 underline"
      >
        {showOptions ? '收起选项' : '出行方式与时间范围（可选）'}
      </button>

      {showOptions && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onModeChange(m.value)}
                className={`rounded-full px-3 py-1 text-xs ${
                  mode === m.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RADII.map((r) => (
              <button
                key={r}
                onClick={() => onRadiusChange(r)}
                className={`rounded-full px-3 py-1 text-xs ${
                  radiusMinutes === r ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {r} 分钟
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 单张卡片**

Create `components/PoiCard.tsx`:

```tsx
'use client'

import type { Poi } from '@/lib/core/model'

type Props = {
  poi: Poi
  order: number | null
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
}

const STATUS_TEXT: Record<Poi['openStatus'], string> = {
  open: '营业中',
  closed: '已打烊',
  unknown: '',
}

export default function PoiCard({ poi, order, onToggle, onOpenDetail }: Props) {
  const selected = order !== null

  return (
    <div
      className={`flex gap-3 rounded-xl border p-3 transition ${
        selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'
      }`}
    >
      <button
        onClick={() => onToggle(poi.id)}
        aria-label={selected ? `取消选择 ${poi.name}` : `选择 ${poi.name}`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          selected ? 'bg-blue-600 text-white' : 'border border-slate-300 text-transparent'
        }`}
      >
        {selected ? order : '·'}
      </button>

      <button onClick={() => onOpenDetail(poi.id)} className="flex-1 text-left">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-slate-900">{poi.name}</span>
          {poi.rating != null && <span className="text-xs text-amber-600">{poi.rating} 分</span>}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {poi.category} · {(poi.distanceMeters / 1000).toFixed(1)} 公里
          {STATUS_TEXT[poi.openStatus] && ` · ${STATUS_TEXT[poi.openStatus]}`}
        </div>
        {poi.address && <div className="mt-0.5 truncate text-xs text-slate-400">{poi.address}</div>}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: 卡片列表**

Create `components/PoiList.tsx`:

```tsx
'use client'

import type { Poi } from '@/lib/core/model'
import PoiCard from './PoiCard'

type Props = {
  pois: Poi[]
  selectedOrder: string[]
  loading: boolean
  error: string | null
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
}

export default function PoiList({ pois, selectedOrder, loading, error, onToggle, onOpenDetail }: Props) {
  if (loading) return <p className="p-3 text-sm text-slate-500">正在找附近的地方…</p>
  if (error) return <p className="p-3 text-sm text-red-600">{error}</p>
  if (pois.length === 0) return <p className="p-3 text-sm text-slate-500">附近没有找到合适的地方</p>

  return (
    <div className="space-y-2">
      {pois.map((poi) => {
        const index = selectedOrder.indexOf(poi.id)
        return (
          <PoiCard
            key={poi.id}
            poi={poi}
            order={index === -1 ? null : index + 1}
            onToggle={onToggle}
            onOpenDetail={onOpenDetail}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: 停靠点详情**

Create `components/StopDetail.tsx`:

```tsx
'use client'

import type { PoiDetail } from '@/lib/core/model'

type Props = {
  detail: PoiDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
}

export default function StopDetail({ detail, loading, error, onClose }: Props) {
  if (!detail && !loading && !error) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl rounded-t-2xl bg-white p-4 shadow-2xl">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{detail?.name ?? '加载中…'}</h2>
        <button onClick={onClose} className="text-sm text-slate-400" aria-label="关闭">
          关闭
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">正在加载…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {detail && (
        <>
          <p className="text-xs text-slate-500">
            建议停留 {detail.suggestedDurationMinutes} 分钟
          </p>
          <ul className="mt-3 space-y-1.5">
            {detail.activities.map((a) => (
              <li key={a.title} className="flex justify-between text-sm">
                <span className="text-slate-800">{a.title}</span>
                <span className="text-slate-400">{a.durationMinutes} 分钟</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            游玩项目按地点类别推导，仅供参考
          </p>
        </>
      )}
    </div>
  )
}
```

最后那行说明是必须的：spec 第 3.4 节明确本版游玩项目是规则推导而非真实内容，界面上不能让用户误以为是权威信息。

- [ ] **Step 6: 编译确认无类型错误**

```bash
npx tsc --noEmit
```

Expected: 无输出（通过）。

- [ ] **Step 7: 提交**

```bash
git add components
git commit -m "feat: 出发点选择、卡片多选、路线条与详情面板"
```

---

### Task 11: 主页面装配与手工验收

**Files:**
- Modify: `app/page.tsx`（整体替换脚手架默认内容）
- Modify: `app/layout.tsx`（改标题与语言）
- Modify: `README.md`（补实际测试数量）

**Interfaces:**
- Consumes: 前面所有 Task 的产物
- Produces: 可运行的单页应用

- [ ] **Step 1: 改 layout**

覆盖 `app/layout.tsx`：

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '周边去哪',
  description: '按当前位置或地图选点推荐附近去处，并规划路线',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-slate-50 antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: 写主页面**

覆盖 `app/page.tsx`：

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import MapCanvas from '@/components/MapCanvas'
import OriginPicker from '@/components/OriginPicker'
import PoiList from '@/components/PoiList'
import RouteSummaryBar from '@/components/RouteSummaryBar'
import StopDetail from '@/components/StopDetail'
import type { LatLng, Origin, Poi, PoiDetail, Route, SearchResponse, TravelMode } from '@/lib/core/model'

const GEO_TIMEOUT_MS = 5000

export default function Home() {
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [mode, setMode] = useState<TravelMode>('driving')
  const [radiusMinutes, setRadiusMinutes] = useState<30 | 60 | 120>(60)
  const [locating, setLocating] = useState(false)
  const [picking, setPicking] = useState(false)

  const [pois, setPois] = useState<Poi[]>([])
  const [selectedOrder, setSelectedOrder] = useState<string[]>([])
  const [route, setRoute] = useState<Route | null>(null)

  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [detail, setDetail] = useState<PoiDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const search = useCallback(
    async (point: LatLng, source: Origin['source']) => {
      const id = ++requestIdRef.current
      setListLoading(true)
      setListError(null)
      try {
        const res = await fetch('/api/poi/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ origin: point, source, radiusMinutes, mode }),
        })
        const data = (await res.json()) as SearchResponse & { error?: string }
        if (!res.ok) throw new Error(data.error ?? '周边搜索失败')
        if (id !== requestIdRef.current) return // 已有更新的请求，丢弃这次结果

        setOrigin(data.origin)
        setPois(data.pois)
        setSelectedOrder([])
        setRoute(null)
      } catch (e) {
        if (id !== requestIdRef.current) return
        setListError(e instanceof Error ? e.message : '周边搜索失败')
      } finally {
        if (id === requestIdRef.current) setListLoading(false)
      }
    },
    [mode, radiusMinutes],
  )

  const useGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setListError('这个浏览器拿不到定位，直接在地图上选点吧')
      return
    }
    setLocating(true)
    let settled = false
    // 5 秒没回来就放行，不阻塞页面
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      setLocating(false)
      setListError('定位超时了，直接在地图上选点吧')
    }, GEO_TIMEOUT_MS)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        setLocating(false)
        void search({ lng: pos.coords.longitude, lat: pos.coords.latitude }, 'geolocation')
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        setLocating(false)
        setListError('没拿到定位权限，直接在地图上选点吧')
      },
      { timeout: GEO_TIMEOUT_MS, enableHighAccuracy: false },
    )
  }, [search])

  // 选了出发点之后自动搜一次
  const lastSearchedRef = useRef('')
  useEffect(() => {
    if (!origin) return
    const fingerprint = `${origin.point.lng},${origin.point.lat}|${mode}|${radiusMinutes}`
    if (fingerprint === lastSearchedRef.current) return
    lastSearchedRef.current = fingerprint
    void search(origin.point, origin.source)
  }, [origin, mode, radiusMinutes, search])

  // 选中 2 个以上就规划路线
  useEffect(() => {
    if (selectedOrder.length < 2 || !origin) {
      setRoute(null)
      return
    }
    const stops = selectedOrder
      .map((id) => pois.find((p) => p.id === id))
      .filter((p): p is Poi => Boolean(p))
      .map((p) => ({ id: p.id, point: p.point }))

    let cancelled = false
    void fetch('/api/route/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin: origin.point, stops, mode }),
    })
      .then((res) => res.json())
      .then((data: Route & { error?: string }) => {
        if (cancelled || data.error) return
        setRoute(data)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [selectedOrder, pois, origin, mode])

  const handlePickLocation = useCallback(
    (point: LatLng) => {
      if (!picking) return
      setPicking(false)
      void search(point, 'map-pick')
    },
    [picking, search],
  )

  const togglePoi = useCallback((id: string) => {
    setSelectedOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    try {
      const res = await fetch(`/api/poi/${encodeURIComponent(id)}`)
      const data = (await res.json()) as PoiDetail & { error?: string }
      if (!res.ok) throw new Error(data.error ?? '获取详情失败')
      setDetail(data)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : '获取详情失败')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  return (
    <main className="flex h-dvh flex-col">
      <div className="relative h-[45%] shrink-0">
        <MapCanvas
          origin={origin?.point ?? null}
          pois={pois}
          selectedOrder={selectedOrder}
          route={route}
          picking={picking}
          onPickLocation={handlePickLocation}
        />
        <RouteSummaryBar selectedOrder={selectedOrder} pois={pois} route={route} />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <OriginPicker
          origin={origin}
          locating={locating}
          mode={mode}
          radiusMinutes={radiusMinutes}
          onUseGeolocation={useGeolocation}
          onStartPick={() => setPicking((v) => !v)}
          picking={picking}
          onModeChange={setMode}
          onRadiusChange={setRadiusMinutes}
        />

        {selectedOrder.length === 1 && (
          <p className="text-xs text-slate-500">再选一个就能规划路线</p>
        )}

        <PoiList
          pois={pois}
          selectedOrder={selectedOrder}
          loading={listLoading}
          error={listError}
          onToggle={togglePoi}
          onOpenDetail={openDetail}
        />
      </div>

      <StopDetail
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          setDetail(null)
          setDetailError(null)
        }}
      />
    </main>
  )
}
```

注意 `search` 里那个 `requestIdRef`：定位、地图选点、改出行方式都会触发搜索，慢的请求回来时可能已经过期，用递增 id 丢弃过期结果，避免列表被旧数据覆盖。

- [ ] **Step 3: 跑全量测试与类型检查**

```bash
npm test && npx tsc --noEmit && npm run lint
```

Expected: 测试全绿，类型检查无输出，lint 无 error。

- [ ] **Step 4: 手工验收场景 1 —— 允许定位**

```bash
npm run dev
```

打开 `http://localhost:3000`，点「用我的位置」并允许授权。

Expected:
- 卡片渲染出 6 张，同类别最多连续 2 张
- 已打烊的 POI 不出现在列表里
- 勾选第 1、2 张后，地图上出现折线与 `起`/`1`/`2` 标记，顶部出现 `1 → 2`
- 底部展开的路线条显示全程时长与公里数

- [ ] **Step 5: 手工验收场景 2 —— 拒绝定位**

刷新页面，点「用我的位置」并在浏览器弹窗里选「阻止」。

Expected:
- 页面**不出现任何「功能受限」之类的阻断提示**
- 提示文案是「没拿到定位权限，直接在地图上选点吧」
- 点「地图选点」后在地图上点一下，卡片列表照常出现，多选与路线规划全部可用

- [ ] **Step 6: 手工验收场景 3 —— 只选 1 个点**

只勾选 1 张卡片。

Expected: 不画路线，顶部不出现路线条，列表上方提示「再选一个就能规划路线」。

- [ ] **Step 7: 切到真实高德数据**

在 `.env.local` 里把两个 provider 改成 `amap` 并填入密钥，重启 `npm run dev`，重复场景 1。

Expected:
- 地图正常渲染（白屏则检查 JS API Key 与域名白名单是否包含 `localhost`）
- 卡片来自真实高德数据
- 路线折线贴合真实道路，而非直线

若此时报 `INVALID_USER_KEY` / `INVALID_USER_SCODE`：检查 Key 类型是否为「Web端(JS API)」、安全密钥是否填进了 `AMAP_JS_SECURITY_CODE`。

- [ ] **Step 8: 更新 README 的测试数量**

把 README 里 `npm test` 一节补上实际用例数：

```bash
npm test 2>&1 | grep -E "Tests|Test Files"
```

把输出里的数字填进 README。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "feat: 装配主页面并完成手工验收"
```

---

## 自审记录

**Spec 覆盖检查：** 第 2 节 5 项功能对应 Task 8（接口）与 Task 9~11（交互）；第 3.3 节密钥模型对应 Task 1 的 `.env.example`、Task 7 的 `amap-fetch`、Task 8 的代理路由；第 7 节排序对应 Task 5；第 8 节推导对应 Task 4；第 9 节降级对应 Task 8（400/502）、Task 10（`unknown` 文案）、Task 11（定位 5 秒超时、单选不画线）、Task 7（单段降级为直线）；第 11 节验证对应各 Task 的测试与 Task 11 的三个场景。

**对 spec 的两处偏离（已在 spec 中同步修正）：**

1. 代理路由从 `/api/_AMapService` 改为 `/api/amap-service` —— 下划线开头会被 App Router 当 private folder 排除，原路径根本不会生成路由。
2. 计划新增了 spec 目录树里没有的三个文件：`lib/providers/amap-fetch.ts`、`lib/amap/loader.ts`、`types/amap.d.ts`、`components/RouteSummaryBar.tsx`。前三个是把「服务端密钥」「浏览器密钥」「AMap 类型」三件事各关进一个文件，第四个承载「地图最上层显示 1 → 2 → 4」这条需求。

**类型一致性检查：** `rankPois` 在 Task 5 定义、Task 8 使用，签名一致；`deriveActivities` 在 Task 4 定义、Task 8 使用；`minutesToMeters` 在 Task 2 定义、Task 6 与 Task 8 使用；`parseAmapPolyline` 在 Task 7 的 `poi/amap.ts` 定义并被同 Task 的 `route/amap.ts` 引用；`buildStopMarkers` / `buildRoutePolyline` 在 Task 9 定义并在同 Task 的 `MapCanvas` 使用；`StopMarkerSpec` 在两个文件间一致。`RouteLeg.fromIndex` 语义（起点为 `-1`）在 Task 2 定义、Task 6 测试、Task 7 实现三处一致。

**已知未验证项：** `@amap/amap-jsapi-loader` 与 Next 16 / React 19 的组合、以及 `window._AMapSecurityConfig.serviceHost` 接受本站相对 origin 这两点，我没有实机验证过，Task 9 Step 5 与 Task 11 Step 7 是它们的验证点。若 serviceHost 方式不通，退路是在 `loader.ts` 里改回明文 `securityJsCode`（仅本地开发可接受）。
