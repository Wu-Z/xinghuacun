# 周边去哪 — MVP 设计（第一版）

- 日期：2026-09-18
- 状态：已与用户确认，待写实现计划
- 仓库：`/Users/wuzebin/code/xinghuacun`（从 0 开始，不沿用其他项目的约定）

## 1. 要解决的问题

出行选择困难。用户给出一个出发点，系统推荐附近可去的地方，用户勾选若干个，
系统在地图上把勾选的点按顺序连成一条路线，并且能点开每个点看「去了玩什么、大概多久」。

## 2. 本版范围

**目标平台：桌面 Web。** 明确不做移动端，也不按移动优先设计。界面按宽屏编排：
左侧栏放控制与列表，右侧整屏放地图，页面本身不滚动，只有列表内部滚动。

> 这条是 2026-09-18 用户明确的要求。此前旧 PRD 里的「C 端移动优先」不适用于本项目，
> 早先的实现按上下堆叠布局是错的，会产生地图信箱缝与超长行宽两个结构性问题。

**做：**

1. 出发点获取 —— 浏览器定位 / 地图上选点 / 搜索地点
2. 周边召回 —— 出发点的附近 POI，返回 4~6 张卡片
3. 卡片多选 —— 勾选顺序即路线顺序
4. 路线规划 —— 按勾选顺序规划，地图最上层画折线并标注 `1 → 2 → 4`
5. 停靠点详情 —— 点开后显示推荐游玩项目与建议时长

**不做，但架构必须不阻碍：**

账号体系、收藏、保存与分享、时间轴行程、真实游玩内容源、多日行程、自动优化访问顺序、
行程费用估算。

## 3. 关键决策

### 3.1 架构：Next.js 薄服务端 + 适配器层

Route Handlers 负责代理上游、归一化字段；客户端只认内部领域模型。

放弃的两个方案及原因：

- **纯客户端直连高德** —— 代码最少，但高德字段会渗透进每个组件，换不了地图商，
  且 Web 服务 Key 只能塞进浏览器。
- **独立后端服务** —— 对 MVP 是过度设计。

### 3.2 语言：TypeScript

本项目的核心工作是「把高德的复杂返回映射成我们自己的模型」。TS 让适配器层成为一道
真实的编译期边界：上游字段改名在构建时就报错，而不是运行时在 UI 里变成 `undefined`。

### 3.3 密钥与安全模型

三种凭据，浏览器可见性完全不同，必须分开对待：

| 凭据 | 使用位置 | 是否进浏览器 |
| --- | --- | --- |
| Web 服务 Key | 服务端 Route Handler 调周边搜索、路径规划 | **绝不** |
| Web 端 JS API Key | 浏览器渲染地图 | **必然可见**（设计如此） |
| 安全密钥 securityJsCode | 配合 JS API Key | 走代理转发，**不进浏览器** |

- JS API Key 的保护手段是**高德控制台的域名白名单**，不是隐藏。本地开发也要把
  `localhost` 加进白名单。
- 安全密钥通过 `serviceHost` 指向本站代理路由 `/api/amap-service/[...path]`，
  由服务端追加 `jscode` 参数。前端只拿到 `serviceHost` 这个路径，拿不到密钥本身。

  > **实测修正**：`_AMapService` 不是可以随便改的约定，JS API 会在运行时强校验它，
  > 路径不对会直接弹「使用 JSAPI 安全模式，代理服务请以 _AMapService 作为一级路由」。
  > 但 App Router 会把下划线开头的目录当 private folder 排除，直接建目录拿不到路由。
  > 解法是真实路由挂在 `/api/amap-service`，用 `next.config.ts` 的 `rewrites` 把
  > `/_AMapService/:path*` 映射过去 —— rewrite 发生在文件系统路由之前，不受该规则影响。
- `.env.local` 进 `.gitignore`；仓库内只提交 `.env.example`，只写变量名不写值。

### 3.4 已知近似：「游玩项目」是规则推导的

高德 POI **没有「游玩项目」字段**。本版的推荐游玩项目与建议时长由 `derive-rules.ts`
中的规则表按 POI 类别推导得出，属于**看起来合理，而非真实内容**。

这是本版唯一一处主动接受的近似。规则表是纯数据，后续换 LLM 或真实内容源时只替换
`derive.ts` 的实现，UI 与 API 契约不动。用户已确认此项，后续另行想办法优化。

### 3.5 高德接入的两条硬约束（实测得到，非推测）

这两条都是**用真实高德数据跑过之后才暴露**的，mock 数据下完全看不出来，因此记在这里
防止后续被「优化」掉：

1. **`serviceHost` 的一级路由必须是 `_AMapService`**，SDK 运行时强校验。与 App Router
   的 private folder 规则冲突，用 `rewrites` 化解（详见 3.3）。
2. **高德返回的字段不保证是字符串**：空字段返回 `[]`，有的字段返回数组或数字。
   实测 `biz_ext.open_time` 回来是数组，直接 `.trim()` 会让整个周边搜索 502。
   所有权宜之计都收敛在 `lib/core/coerce.ts` 的 `asText()` 里，调用点一律不直接
   做字符串操作。新增读取高德字段的代码必须走 `asText`。

### 3.6 已知的召回质量问题（本版未解决）

用真实数据跑周边搜索时会看到结果里混进「行李寄存点」「宾馆」「商务住宅」这类
**不是游玩去处**的 POI。原因是 `place/around` 返回全量 POI 类型，而本版没有做
类型过滤。

**为什么偏偏是这些类别**：高德官方文档说明，搜索 POI 接口**若不设置 `types`，
默认返回「餐饮服务」「商务住宅」「生活服务」三类**。实测结果与这条完全吻合 ——
我们拿到的正是 生活服务 / 住宿服务 / 商务住宅。这不是随机噪声，是文档写明的默认偏置。

另一个佐证：多样性惩罚（同类最多 2 张）在实测中**完全没用**，因为候选池里
清一色全是「商务住宅」—— 惩罚只能重排，变不出别的类别。多样性机制救不了召回。

修法：给请求加 `types` 白名单。高德 POI 用**六位编码、三级分类，前两位是大类**，
共 23 个大类。拟收录「可游玩」的五类：

| 大类 | 前缀 | 收录 |
| --- | --- | --- |
| 风景名胜 | 11 | ✅ 公园广场 110100、风景名胜 110200 |
| 餐饮服务 | 05 | ✅ |
| 购物服务 | 06 | ✅ |
| 体育休闲服务 | 08 | ✅ |
| 科教文化服务 | 14 | ✅ 博物馆、展馆 |
| 生活服务 | 07 | ❌ 实测产出行李寄存点 |
| 住宿服务 | 10 | ❌ 实测产出宾馆 |
| 商务住宅 | 12 | ❌ 实测产出写字楼与小区 |

编码表在高德「Web服务 API 相关下载」页可下载，官方明确说**编码会不定期更新**，
落地前应以当时下载到的表为准，不要照抄本表。

之所以本版不动：分类白名单是产品口径问题（「什么算游玩去处」），
编码选错会让召回**直接为空**，应当由产品决策而不是实现者顺手猜。

**附带发现**：本版用的是 `/v3/place/around` + `extensions=all`，营业时间要从
`biz_ext.open_time` 里解析，而该字段实测返回的是数组、结构不稳定（见 3.5）。
高德 `/v5/place/around` 配合 `show_fields=business` 会返回 `opentime_today` /
`opentime_week` / `rating` / `cost` 等结构化字段，比 v3 可靠得多。
**此项未在本会话验证**，属待验证的改进方向。

## 4. 目录结构

```
app/
  layout.tsx
  page.tsx                       主页面（单页应用）
  api/
    poi/search/route.ts          周边召回
    poi/[id]/route.ts            单点详情
    route/plan/route.ts          路线规划
    amap-service/[...path]/route.ts        安全密钥代理
lib/
  providers/                     ← 换地图商只改这里
    poi/    { types.ts, amap.ts, mock.ts, index.ts }
    route/  { types.ts, amap.ts, mock.ts, index.ts }
  core/                          ← 纯逻辑，无 IO，可单测
    model.ts                     内部领域模型
    rank.ts                      排序 + 同类多样性惩罚
    derive.ts                    Poi → 游玩项目与时长
    derive-rules.ts              规则表（纯数据）
    geo.ts                       距离、折线简化
components/
  MapCanvas.tsx                  高德地图（客户端）
  RouteOverlay.tsx               折线 + 序号标记
  PoiList.tsx
  PoiCard.tsx                    含多选勾选
  StopDetail.tsx                 玩什么、多久
  OriginPicker.tsx               定位 / 地图选点 / 搜索
```

## 5. 领域模型

```ts
export type LatLng = { lng: number; lat: number }

export type TravelMode = 'driving' | 'transit' | 'walking' | 'bicycling'

export type OriginSource = 'geolocation' | 'map-pick' | 'search'

export type Origin = {
  point: LatLng
  label: string // 已模糊化，精度不细于街区
  source: OriginSource
}

export type OpenStatus = 'open' | 'closed' | 'unknown'

export type Poi = {
  id: string
  name: string
  category: string // 归一化大类，多样性惩罚用它
  categoryRaw: string // 高德原始 type
  point: LatLng
  distanceMeters: number
  address: string
  openStatus: OpenStatus
  rating?: number
  // 排序中间量，透出便于调试与后续调参
  score?: number
  scoreParts?: Record<string, number>
}

export type Activity = {
  title: string // 散步 / 拍照 / 野餐
  durationMinutes: number
  note?: string
}

export type PoiDetail = Poi & {
  activities: Activity[]
  suggestedDurationMinutes: number
  deriveSource: 'rules' // 预留 'llm' | 'curated'
}

export type RouteLeg = {
  fromIndex: number // -1 表示起点
  toIndex: number
  durationSeconds: number
  distanceMeters: number
  polyline: LatLng[]
  degraded?: boolean // 该段规划失败、已降级为直线
}

export type Route = {
  mode: TravelMode
  order: string[] // POI id，按勾选顺序
  legs: RouteLeg[]
  totalDurationSeconds: number
  totalDistanceMeters: number
  polyline: LatLng[] // 全量折线，供地图画线
}
```

## 6. API 契约

### POST /api/poi/search

```ts
// req
{ origin: LatLng; radiusMinutes: 30 | 60 | 120; mode: TravelMode; departAt?: string }
// res
{ origin: Origin; pois: Poi[] }
```

- `radiusMinutes` 是**时间半径**（默认 60），`mode` 决定用什么方式去估算这个时间半径。
  两者配合才等于「以出发点为中心的可达范围」。
- `origin.label` 由服务端逆地理编码得到，且**必须截断到不细于街区级**再返回。
  本版无数据库，精确坐标不落任何持久化存储。
- `departAt` 本版仅透传给高德路径规划作未来出行时间，**不参与 POI 排序**；
  上游不支持该参数时忽略，不报错。

### POST /api/route/plan

```ts
// req  stops 按勾选顺序传入
{ origin: LatLng; stops: { id: string; point: LatLng }[]; mode: TravelMode; departAt?: string }
// res
Route
```

### GET /api/poi/[id]

```ts
// res
PoiDetail
```

留在服务端而不是客户端直接算，是为了给后续换 LLM / 真实内容源留位置：
`deriveSource` 字段已经把这个意图表达出来了。

### ANY /api/amap-service/[...path]

转发到 `https://restapi.amap.com/<path>`，追加 `jscode` 后返回。仅服务端持有安全密钥。
浏览器端把 `serviceHost` 设成 `${location.origin}/_AMapService`（一级路由必须是这个名字），
由 rewrite 转到本路由。用页面自身 origin 拼绝对地址，因此本地和线上都不需要额外配置。

## 7. 排序规则

召回后按加权分排序，权重写在 `rank.ts` 顶部常量里，便于调参：

- 距离/车程匹配度 50%
- 营业状态 30%（`open` 满分，`unknown` 折半，`closed` 直接过滤掉）
- 内容热度 20%（有 rating 用 rating 归一化，无则取全体中位数）

**多样性惩罚**：同一 `category` 在一屏内最多 2 张，第 3 张起分数乘 0.6。

**硬过滤**：`openStatus === 'closed'` 的 POI 不进入结果。

`openStatus` 的判定：高德不保证返回营业时间字段（`biz_ext.open_time` / `opentime2`
可能缺失）。能判定出当前已打烊则给 `closed`，字段缺失一律给 `unknown`，
**不允许把「无法判断」当成「已关闭」而误杀**。

场景标签（亲子友好、宠物可带等）本版不做，见第 12 节。

## 8. 游玩项目推导规则（本版近似实现）

`derive-rules.ts` 按归一化后的 `category` 匹配，取第一条命中的规则：

| category | 游玩项目 | 建议时长 |
| --- | --- | --- |
| 公园 / 风景名胜 | 散步、拍照、野餐 | 90–120 分钟 |
| 博物馆 / 展馆 | 看展、听讲解 | 90 分钟 |
| 餐饮 | 吃饭、休息 | 60 分钟 |
| 亲子 / 儿童乐园 | 陪玩、游乐设施 | 120 分钟 |
| 购物 / 商圈 | 逛街、喝东西 | 90 分钟 |
| 其他 | 逛一逛 | 60 分钟 |

兜底规则必须存在，任何 POI 都要能拿到非空结果。

## 9. 边界与降级

| 情况 | 行为 |
| --- | --- |
| 定位失败或 5 秒超时 | 不阻塞页面，直接展示「地图选点 / 搜索」入口 |
| 用户拒绝定位授权 | 同上游，且**任何地方都不出现「功能受限」这类阻断提示** |
| 高德配额超限或报错 | 明确提示 + 可切 `POI_PROVIDER=mock` 兜底 |
| 勾选少于 2 个点 | 不规划路线，提示至少选 2 个 |
| 折线点数过多 | 画线前简化 |
| 单段路线规划失败 | 该段降级为直线并标 `degraded: true`，其余段正常，整体不失败 |
| 有路段降级 | 界面显示「有 N 段没规划出来，图中以直线示意」，**绝不用 0 冒充结果** |

### 9.1 高德 QPS 限制（实测踩过的坑）

高德按**每秒查询数**限流，超限返回 `CUQPS_HAS_EXCEEDED_THE_LIMIT`。这与月度配额是
两回事：月配额没超，照样会被按秒掐。

本版踩过的完整事故链，四个环节缺一不可：

1. UI 每次勾选变化都发一次路线请求 —— 连点 6 张卡就是 5 次请求
2. 每次请求服务端最多打 4 次 `/v3/direction`
3. 1 秒内十几次调用 → 撞上 QPS
4. `catch` 静默吞掉错误 → 降级直线 → 界面显示「0 分钟 0.0 公里」

**第 4 环最恶劣**：它把「限流失败」伪装成了一条零长度路线，让前三环几乎无法定位。

对应三条修复，缺一不可：

- **治根因**：UI 侧对路线请求防抖 400ms + `AbortController` 中止在途请求。
  实测 6 次连点从 5 次请求降到 **1 次**。
- **纵深**：`CUQPS_HAS_EXCEEDED_THE_LIMIT` 是按秒计的瞬时错误，退避 250ms 重试一次。
  其他错误（Key 无效、参数错）不重试 —— 重试解决不了它们。
- **诚实**：`RouteLeg.degraded` + 界面明示，让失败可见。

**降级分支绝不允许静默**：任何 `catch` 里必须留痕，否则下次同类问题照旧无从查起。

## 10. 配置

`.env.example`（只提交变量名）：

```
AMAP_WEB_SERVICE_KEY=
NEXT_PUBLIC_AMAP_JS_KEY=
AMAP_JS_SECURITY_CODE=
POI_PROVIDER=amap
ROUTE_PROVIDER=amap
```

`POI_PROVIDER` / `ROUTE_PROVIDER` 取 `amap` 或 `mock`，由 `lib/providers/*/index.ts`
在服务端读取并选择实现。**没有密钥时全站必须能以 `mock` 跑起来**，这样交互和数据流
可以先验证。

## 11. 验证方式

测试框架用 **Vitest**（Next.js + TS 下零配置成本最低，且不阻塞后续换测试运行器）。

- `lib/core/` 纯函数单测：`rank` 的多样性与权重、`derive` 的兜底规则、
  `geo` 的距离与简化。
- provider 单测：`mock` 实现返回结构符合契约；`amap` 实现用固定响应体测字段映射。
- 手工验收三个场景：
  1. 允许定位 → 正常召回 → 勾选 3 个 → 画出 `1 → 2 → 3`
  2. 拒绝定位 → 落到地图选点 → 下游全部可用，无阻断提示
  3. 只勾选 1 个 → 不画线，提示至少 2 个
- 密钥未配置时，`mock` 模式下上述三个场景应当全部可走通。

## 12. 后续（不在本版）

自动优化访问顺序、真实游玩内容源、时间轴行程、保存与分享、账号与收藏、
行程费用估算、场景标签（亲子友好 / 宠物可带 / 无障碍可达 等多选筛选）。

## 13. 界面设计方向（2026-09-18 确认）

**出发点**：本版第一轮实现是 Tailwind 默认观感 + 移动端堆叠布局，在桌面宽屏上出现
「地图压成横向色带」和「卡片拉伸到 1440px 行长失控」两个结构性问题。用户确认改为
两栏布局并重塑视觉。

### 13.1 布局：侧栏 + 整屏地图

```
┌────────────────────┬──────────────────────────────────┐
│ 侧栏 400px（不滚）   │                                  │
│  出发点 / 出行方式    │            地  图                 │
│ ─────────────────  │      整屏高，永不滚走               │
│  卡片 1             │                                  │
│  卡片 2   ↕ 仅列表滚 │   顶部浮层：1 → 2 → 3 → 4         │
│  卡片 3             │                                  │
└────────────────────┴──────────────────────────────────┘
```

页面本身 `h-dvh` 不滚动；横向空间全部给地图。卡片宽度被约束在侧栏内，
行长自然回到可读区间。

### 13.2 设计取向：「遥指」

仓库名 **杏花村** 出自「借问酒家何处有，牧童遥指杏花村」。本产品的本质就是
**有人指给你去哪**，界面上连接编号点的那条线就是「遥指」本身。

因此：**让路线成为唯一的视觉重音，UI 退到后面。** 高德底图自带大量颜色，
界面 chrome 再抢就乱了。

### 13.3 色板

单一强调色，其余全中性：

| 名称 | 值 | 用途 |
| --- | --- | --- |
| 墨 | `#12171C` | 主文字（冷调近黑，非暖墨） |
| 纸 | `#FFFFFF` | 主表面 |
| 淡 | `#F2F4F5` | 侧栏底 / 次级面 |
| 线 | `#E3E7E9` | 分隔线与描边 |
| 青 | `#0F6E6E` | 路线、编号点、主操作 —— 唯一的彩色 |

选深青而非默认蓝：高德底图是暖米黄/白，深青在其上对比更强，且没有地图产品
用青色画路线，蓝是所有人都在用的默认。

**本版固定浅色，不跟随系统深色。** 界面颜色是显式指定的，跟随系统的深色背景
会让 body 变黑而组件仍是浅色，出现割裂。

### 13.4 字体

- 中文走系统栈（PingFang SC / 微软雅黑 / Noto Sans SC）：CJK 网络字体动辄数 MB，
  这是诚实的取舍而非偷懒。
- 数字与拉丁用 **IBM Plex Sans**：本产品的关键信息全是数字（`1 → 2 → 4`、
  3.1 公里、28 分钟），Plex 有真正的等宽数字且带导视标牌气质，不是 Geist/Inter
  这类默认脸。

### 13.5 明确避开的模板化特征

按 frontend-design 插件的要求做过自查，以下三处是**主动改掉的**：

1. **不用 `·` 连接元信息**（`餐饮 · 3.1 公里 · 营业中`）—— `A · B · C` 是 AI 生成页
   最典型的外观特征。改成结构化排版。
2. **不做「同款圆角浮空盒 + 同款柔和阴影」的卡片套件** —— 改成以分隔线切分，
   只有选中态才浮起。
3. **不用大写字距 eyebrow 标签、不给按钮加装饰性 `→`。**

**保留编号 `1/2/3`**：编号只在内容本身是序列时才成立，而路线顺序确实是序列，
属于「挣来的」而非装饰性使用。路线条里的 `→` 同理。

### 13.6 原则

1. 地图是主角，界面不与它竞争
2. 路线是唯一的视觉重音
3. 数字用等宽对齐，便于纵向扫读
4. 结构即信息，不做不承载信息的装饰

