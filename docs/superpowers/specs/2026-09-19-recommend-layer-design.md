# 推荐层改造设计（skill 驱动）

- 日期：2026-09-19
- 状态：已与用户确认，待写实现计划
- 前置文档：`2026-09-18-xinghuacun-mvp-design.md`（本文件取代其第 2、7、8 节）

## 1. 为什么要改

第一版用高德 `place/around` 做召回，实测在**前门大街**（紧邻天安门、全国游客最密集地段之一）
返回的是：天安门城楼**存包处**、中山公园**售票处**、故宫**寄存处**、**检票处**、
以及「北京坊W5号楼」「团中央南楼」两个**写字楼**。**没有一条是游玩去处。**

根因由官方文档确认：**高德搜索 POI 接口不设置 `types` 时，默认只返回「餐饮服务 /
商务住宅 / 生活服务」三类。** 实测结果与这条完全吻合。

但补上 `types` 白名单后又暴露第二层问题：高德有一批「打卡点」粒度的 POI，如
「天安门-城楼-内部的中式宫灯(打卡点)」「中山公园-广场拍红墙建筑侧面(打卡点)」。
这些不是「地方」，是「地方里的一个拍照机位」。

**结论：高德的分类体系能回答「这里有什么」，回答不了「这里值不值得去」。**
后者需要判断力，改由 AI 承担。

## 2. 范围

**做：**

1. 接入用户自备的 skill（DeepSeek API）作为**唯一推荐来源**
2. 高德转为**核实层**：地理编码拿坐标、补距离与营业状态
3. 偏好采集表单 + 显式「帮我推荐」触发
4. 地点列表与详情展示 skill 输出的丰富字段
5. 勾选后按优化顺序做路径规划
6. 坐标系统转换（WGS-84 → GCJ-02）

**不做：**

高德召回作为推荐来源（已废弃，代码一并删除）、多轮对话式偏好澄清、
行程保存与分享、账号体系。

## 3. 关键决策

### 3.1 不合并两个来源

skill 输出 `fit[{tag, why}]`（带可核查证据）、`crowd_level`、`best_time`、`cost`、
`trade_off`、`confidence`、`source`；高德 POI 只有类别/距离/评分/营业状态。
两者结构完全不同，硬合并会出现「一半卡片有推荐理由、一半没有」的割裂感，
且 skill 已经给出 `rank` + `tier`，再拿高德召回混排会让排序逻辑打架。

**skill 出推荐，高德只做核实。**

### 3.2 显式按钮触发

skill 本质是一次 LLM 调用 + 联网检索，耗时数秒。第一版 UI 是「位置或条件一变
就自动重搜」，两者直接冲突。

**改为显式按钮**：用户选好位置与偏好，点「帮我推荐」才调用。
路径规划（高德，快）仍然自动跟勾选联动。

### 3.3 坐标系统必须转换（前置任务）

skill 的输入要求 `经纬度 + 坐标系`。两条位置获取路径产出的坐标系不同：

| 来源 | 坐标系 | 处理 |
| --- | --- | --- |
| 地图选点 | GCJ-02（高德底图原样） | **绝不能转换**，转了会转坏 |
| 浏览器定位 | WGS-84（GPS 原始） | **必须转换**为 GCJ-02 |

不转换的后果不是「标记点画歪了」，而是**skill 按偏了 100~700 米的位置去检索，
推荐出一批别处的地方**。这是坐标系问题第一次直接污染推荐结果。

转换严格绑定 `Origin.source`，不全局套用。

**转换实现用本地算法（如 `gcoord`）而非高德坐标转换 API**：纯函数、可离线单测、
不吃 LBS 配额，且我们只转换一个点，官方 API 的批量优势用不上。
注意高德**不提供** GCJ-02 → WGS-84 的反向接口（法规要求），我们只需要单向。

### 3.4 地理编码失败的地点不丢弃

skill 的来源是**网页检索核实**，不是凭记忆生成。所以地理编码查不到，更可能是
「高德没收录这个小店」，而非「AI 编造的」。

丢弃它等于**拿我们地理编码能力的短板去惩罚用户**，并浪费 skill 的检索成果。

处理：**列表保留，标注「高德未能核实」，并给出 skill 自带的 `amap_url`。**
它不参与地图显示与路径规划，但如实说明它存在。这与 skill 自身的
`confidence` / `unverified` 精神一致——如实说明，不假装。

### 3.5 失败即报错，不做后备

三种失败路径：DeepSeek 调用失败 / 返回空 `content`（官方承认的已知问题）/
JSON 不合法。

**统一处理：直接显示「推荐失败」+ 重试按钮。不做任何静默换源。**

不静默退回高德召回的理由：界面语义会完全改变（一半卡片有推荐理由一半没有），
用户会误以为失败那次的结果也是 AI 给的。

### 3.6 `itinerary` 与跨点路线并存，不合并数字

skill 的 `itinerary[]` 是**单点**动线，按它假设的时长排的。平台的路线是**跨点**的。

例如 skill 按「3 小时」排了单点动线，而用户勾了 4 个点、每点建议停留 1.5 小时，
就是 6 小时——两个数字必然对不上。

处理：详情面板展示 skill 动线并标注「如果只去这一个」；地图顶部显示实际跨点
总时长。**两个数字回答的是两个不同问题，不合并。**

### 3.7 展示 `excluded` 与 `meta`

skill 会说明「排除了什么、为什么」以及「本次用了哪些假设、哪些未核实」。
这直接回答「为什么没推荐园博苑」这类疑问，是 skill 最值钱的部分之一。
做成折叠区，实现成本很低。

## 4. 架构与数据流

```
浏览器                     服务端（Next.js）                    外部
──────────────────────────────────────────────────────────────────────
位置选择 ───────────┐
偏好表单            │
[帮我推荐] ─────────┴──► POST /api/recommend
                          ├─ 坐标系统转换（若来源为定位）
                          ├─ 组装 skill 输入
                          ├─ 调 DeepSeek
                          ├─ 校验 JSON 结构
                          ├─ 逐条高德地理编码 → 坐标
                          └─ 高德补距离 / 营业状态
                                   │
地点列表 + 地图 ◄───────────────────┘
勾选 ──────────────────► POST /api/route/plan ──► 高德路径规划（顺序优化）
```

## 5. 数据模型

```ts
// 来自 skill 的输出，逐条核事后落到平台
export type RecommendPlace = {
  rank: number
  tier: string // 首选 / 备选 · 最清净 …
  name: string
  category: string
  address: string
  fit: { tag: string; why: string }[]
  crowdLevel?: string
  crowdNote?: string
  indoorOutdoor?: string
  bestTime?: string
  cost?: string
  transitHint?: string
  itinerary?: { time: string; action: string }[]
  pickIf?: string
  tradeOff?: string
  amapUrl: string
  confidence?: string
  source?: string
  // 以下由高德核实层补充
  point: LatLng | null // null = 地理编码未通过
  coordSystem: 'GCJ-02'
  verified: boolean // 高德是否核实到
  // 高德返回的正式名称。界面以 skill 的 name 为主，仅在两者差异明显时
  // 作为补充信息显示，不覆盖 skill 的命名
  verifiedName?: string
  distanceMeters?: number
  openStatus?: OpenStatus
}

export type RecommendResult = {
  query: SkillQuery // skill 原样透传，用于展示假设
  places: RecommendPlace[]
  excluded: { name: string; reason: string }[]
  meta: SkillMeta
}
```

`Poi` 类型及其相关的 `rank` / `derive` 机制在推荐主链路上废弃（见第 9 节）。

## 6. skill 输入契约

平台负责把用户输入组装成 skill 要求的形状。skill 要求的输入见其 README：

```ts
export type SkillInput = {
  origin: {
    name: string // 位置名称
    city: string // 必须；推不出要问，不臆测
    lng: number | null
    lat: number | null
    // 平台在发出前已统一转换，所以恒为 'GCJ-02'；
    // 字段保留是因为 skill 要求在有坐标时必须声明坐标系
    coordSystem: 'GCJ-02' | null
  }
  destination: {
    // 用户填了「想去哪」→ 'specified'，留空 → 'nearby'
    mode: 'nearby' | 'specified'
    requested: string | null
  }
  preferences: {
    intents: string[] // 拍照 / 放松 / 遛娃 / 约会 …（第一层）
    timeBudget: string | null // 1 小时内 / 半天 / 全天（第一层）
    travelMode: string[] // 步行 / 骑行 / 驾车 / 打车 / 公共交通（第一层）
    companions: number | null // 第三层，可空
    crowdTolerance: 'low' | 'medium' | 'high' | null // 第三层，可空
  }
}
```

**表单只强制第一层三问**（想干什么 / 能花多久 / 怎么去），其余收进「更多」可留空。
skill 明确支持模糊输入并会用默认值，再在 `assumptions` 里声明。

## 7. API 契约

### POST /api/recommend

```ts
// req
SkillInput
// res
RecommendResult
// 失败（三种原因统一）
{ error: '推荐失败', reason: string }  // HTTP 502
```

### POST /api/route/plan

不变（见前置文档第 6 节），但 `stops` 的坐标来自核实通过的地点。

## 8. 高德核实层

对 skill 返回的每条 `recommendations[]`：

1. **地理编码**：`/v3/geocode/geo`，用 `address`（含城市）查询
   - 命中 → 得到坐标与高德正式名称，`verified: true`
   - 未命中 → `point: null`，`verified: false`，保留在列表但不参与地图与路线
2. **距离**：用地理编码得到的坐标与出发点算**直线距离**（`haversineMeters`）。
   注意这与第一版的「驾车距离」不是一回事，界面上必须标明是直线距离，
   不能让用户以为是实际行车里程。真实行车距离只在规划出路线之后才有
3. **营业状态**：以地理编码坐标为圆心做一次小半径 POI 查询以取 `biz_ext`，
   解析失败或查不到一律给 `unknown`。**绝不允许把「无法判断」当成「已关闭」**

地理编码与状态查询都走既有的 `amap-fetch`，**复用 QPS 退避重试**（见前置文档 9.1）。

## 9. 代码去留

### 保留

| 文件 | 原因 |
| --- | --- |
| `lib/providers/amap-fetch.ts` | 核实层与路线层都用 |
| `lib/core/coerce.ts` | 高德字段归一化，仍然必需 |
| `lib/core/open-hours.ts` | 营业状态解析 |
| `lib/core/geo.ts` | 距离与折线简化 |
| `lib/core/address.ts` | 地址模糊化 |
| `lib/providers/route/*` | 路径规划不变 |
| `components/MapCanvas.tsx` `RouteOverlay.ts` | 地图与覆盖层不变 |

### 删除

| 文件 | 原因 |
| --- | --- |
| `lib/core/rank.ts` + 测试 | skill 已给出 `rank` + `tier`，平台排序成为第二套互相打架的逻辑 |
| `lib/core/derive.ts` / `derive-rules.ts` + 测试 | skill 的 `fit` 带**可核查证据**，硬编码的「散步/拍照/野餐」没有任何理由继续存在 |
| `lib/providers/poi/*` | 召回不再存在（3.5 已决定不做后备） |
| `app/api/poi/search/route.ts` | 同上 |
| `app/api/poi/[id]/route.ts` | skill 的输出已含详情所需全部字段，无需二次请求 |

**删除是刻意的，不是顺手清理。** 留着这些代码会让人以为推荐还有第二条路径。

## 10. 界面变化

| 区域 | 变化 |
| --- | --- |
| 顶部 | 位置选择不变；新增偏好表单（三问）+「帮我推荐」按钮；「想去哪」可选 |
| 列表 | 展示 `tier` / `fit` 证据 / `confidence`；未核实项标注「高德未能核实」并给 `amap_url` |
| 详情面板 | 换成 skill 的真实内容：`fit` 证据、`best_time`、`cost`、`trade_off`、`pick_if`、`transit_hint`、`itinerary`（标注「如果只去这一个」） |
| 折叠区 | 「排除了什么、为什么」（`excluded`）+「本次假设与未核实项」（`meta`） |
| 地图 | 顺序优化后的编号标记与折线；顶部显示实际跨点总时长 |
| 失败态 | 明确的「推荐失败」+ 重试 |

## 11. 测试策略

**纯函数单测**（离线，不依赖网络）：

- 坐标转换：已知点的 WGS-84 → GCJ-02 转换结果、境内/境外行为、幂等性
- skill 输出校验：合法 / 缺必填字段 / `fit` 内 tag 重复 / 数组为空
- skill 响应解析：三种失败路径（调用失败 / 空 content / JSON 不合法）
- 地理编码结果合并：命中与未命中两种分支

**不测**：DeepSeek 真实调用、高德真实地理编码（靠手工验收）。

## 12. 依赖与待办

实现推荐层需要用户提供：

1. **skill 提示词正文**
2. **DeepSeek API Key**（填 `.env.local`，不进仓库）
3. **模型 ID** —— 存在不确定性：不同版本的官方文档出现过 `deepseek-chat`、
   `deepseek-coder`、`deepseek-v4-flash`、`deepseek-v4-pro` 等不一致的名字，另有
   第三方站点称旧标识已于 2026-07-24 移除。**实现时第一件事是打模型列表接口
   确认，不写死可能失效的名字。**

DeepSeek 调用要点（已核实）：

- OpenAI 兼容，`base_url: https://api.deepseek.com`
- 用 `response_format: { type: 'json_object' }`，且**提示词中必须出现 "json" 字样
  并给出输出样例**，否则模型可能持续生成空格直到撞上长度上限，表现为请求卡死
- `max_tokens` 默认 4096，需防截断；检查 `finish_reason` 是否为 `stop`
- `json_object` **只保证 JSON 语法合法，不保证字段符合 schema**，业务校验必须自己做
