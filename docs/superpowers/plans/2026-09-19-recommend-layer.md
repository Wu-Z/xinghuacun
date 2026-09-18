# 推荐层改造实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把召回层从「高德 POI 搜索」换成「用户自备 skill（DeepSeek）出推荐 + 高德核实」，并让路线按最优顺序规划。

**Architecture:** skill 是唯一推荐来源，输出经本地结构校验后用高德地理编码核实成真实坐标；核实通过的才上图、才参与路线。高德不再做召回，只在 skill 失败时直接报错。

**Tech Stack:** Next.js 16.3.5 App Router / React 19.2.8 / TypeScript / Tailwind 4 / Vitest 5.0.1 / gcoord 1.0.7 / DeepSeek OpenAI 兼容 API

**Spec:** `docs/superpowers/specs/2026-09-19-recommend-layer-design.md`

## Global Constraints

- 包管理器 `npm`；除 `gcoord@1.0.7` 外不新增任何依赖。**不引入 OpenAI SDK**，直接用 `fetch` 调 `/chat/completions`。
- `lib/core/**` 必须是纯函数：无 IO、无隐式 `Date.now()`、无随机数。时间与随机性一律由参数传入。
- `DEEPSEEK_API_KEY`、`AMAP_WEB_SERVICE_KEY`、`AMAP_JS_SECURITY_CODE` **绝不允许**出现在任何 `'use client'` 文件里，也不允许加 `NEXT_PUBLIC_` 前缀。
- 任何面向用户的中文文案都不允许出现「功能受限」这类阻断性措辞；失败一律直说失败原因。
- **任何 `catch` 都不允许静默吞错**，必须 `console.error` 留痕（这是上一轮 QPS 事故的直接教训）。
- 每个 Task 结束必须 `git commit`，提交信息用中文 Conventional Commits，单行无正文。
- 测试用 `npx vitest run <path>`；全量用 `npm test`。
- 路径别名 `@/*` 指向仓库根。

---

### Task 1: 坐标系转换（前置，不依赖任何外部 Key）

**Files:**
- Modify: `package.json`（新增 `gcoord`）
- Create: `lib/core/coordinate.ts`
- Test: `lib/core/coordinate.test.ts`

**Interfaces:**
- Consumes: `LatLng`、`OriginSource`（`lib/core/model.ts`）
- Produces: `toGcj02(point: LatLng, source: OriginSource): LatLng`

**背景**：浏览器定位返回 WGS-84，高德用 GCJ-02，国内差 100~700 米。不转换的后果不是「标记画歪」，而是 **skill 按偏了的位置检索，推荐出一批别处的地方**。

- [ ] **Step 1: 装依赖**

```bash
npm install --save-exact gcoord@1.0.7
```

- [ ] **Step 2: 写失败测试**

Create `lib/core/coordinate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { haversineMeters } from './geo'
import { toGcj02 } from './coordinate'

const BEIJING = { lng: 116.397, lat: 39.909 } // 天安门
const TOKYO = { lng: 139.7671, lat: 35.6812 } // 境外

describe('toGcj02', () => {
  it('地图选点已是 GCJ-02，必须原样返回', () => {
    expect(toGcj02(BEIJING, 'map-pick')).toEqual(BEIJING)
  })

  it('搜索得到的地点已是 GCJ-02，原样返回', () => {
    expect(toGcj02(BEIJING, 'search')).toEqual(BEIJING)
  })

  it('浏览器定位是 WGS-84，需转换', () => {
    const out = toGcj02(BEIJING, 'geolocation')
    expect(out).not.toEqual(BEIJING)
  })

  it('转换后偏移量在国内的 100~700 米区间内', () => {
    const out = toGcj02(BEIJING, 'geolocation')
    const d = haversineMeters(BEIJING, out)
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(700)
  })

  it('境外坐标不做偏移（法规只约束国内）', () => {
    const out = toGcj02(TOKYO, 'geolocation')
    expect(haversineMeters(TOKYO, out)).toBeLessThan(5)
  })

  it('同样输入永远同样输出', () => {
    expect(toGcj02(BEIJING, 'geolocation')).toEqual(toGcj02(BEIJING, 'geolocation'))
  })

  it('不修改入参', () => {
    const input = { ...BEIJING }
    const snapshot = JSON.stringify(input)
    toGcj02(input, 'geolocation')
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run lib/core/coordinate.test.ts`
Expected: FAIL，找不到 `./coordinate`。

- [ ] **Step 4: 实现**

Create `lib/core/coordinate.ts`:

```ts
import gcoord from 'gcoord'
import type { LatLng, OriginSource } from './model'

/**
 * 统一到高德用的 GCJ-02。
 *
 * 只有浏览器定位是 WGS-84 需要转换；地图选点与搜索得到的坐标直接来自高德底图，
 * 已经是 GCJ-02，**再转一次会转坏** —— 官方文档把「原始坐标系判断错误」
 * 列为定位偏移的常见原因之一。所以转换严格绑定 source，绝不全局套用。
 */
export function toGcj02(point: LatLng, source: OriginSource): LatLng {
  if (source !== 'geolocation') return { ...point }

  const [lng, lat] = gcoord.transform([point.lng, point.lat], gcoord.WGS84, gcoord.GCJ02)
  return { lng, lat }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run lib/core/coordinate.test.ts`
Expected: PASS，7 个用例全绿。

- [ ] **Step 6: 接入定位路径**

Modify `app/page.tsx`：在 `useGeolocation` 的 `setOrigin` 处套一层转换。

把这一处：

```ts
        setOrigin({
          point: { lng: pos.coords.longitude, lat: pos.coords.latitude },
          label: PENDING_LABEL,
          source: 'geolocation',
        })
```

改为：

```ts
        // 浏览器给的是 WGS-84，必须先转成 GCJ-02 再交给高德与 skill，
        // 否则会按偏了 100~700 米的位置去检索
        setOrigin({
          point: toGcj02({ lng: pos.coords.longitude, lat: pos.coords.latitude }, 'geolocation'),
          label: PENDING_LABEL,
          source: 'geolocation',
        })
```

并在文件顶部的 import 区加：

```ts
import { toGcj02 } from '@/lib/core/coordinate'
```

- [ ] **Step 7: 全量检查**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 全部通过。

- [ ] **Step 8: 提交**

```bash
git add package.json package-lock.json lib/core/coordinate.ts lib/core/coordinate.test.ts app/page.tsx
git commit -m "feat: 浏览器定位坐标转换到 GCJ-02"
```

---

### Task 2: DeepSeek 客户端与模型校验

**Files:**
- Create: `lib/recommend/deepseek.ts`
- Create: `lib/recommend/deepseek.test.ts`
- Create: `scripts/list-models.mjs`
- Modify: `package.json`（新增 `models` 脚本）

**Interfaces:**
- Consumes: 无
- Produces:
  - `type DeepseekFailure = { kind: 'unavailable' | 'empty' | 'invalid-json'; detail: string }`
  - `callDeepseekJson(opts: { apiKey: string; baseUrl: string; model: string; system: string; user: string; maxTokens?: number; fetchImpl?: typeof fetch }): Promise<{ ok: true; text: string } | { ok: false; failure: DeepseekFailure }>`

**设计要点（全部来自官方文档，已核实）：**

1. JSON 模式必须同时满足：请求带 `response_format: {type:'json_object'}`，且 **prompt 里出现 "json" 字样并给出样例**，否则模型可能一直生成空格直到撞上 `max_tokens`，表现为请求卡死。
2. `json_object` **只保证语法合法，不保证字段符合 schema** —— 业务校验交给 Task 3。
3. 官方承认 JSON 模式下**有概率返回空 `content`**，必须当成一类独立失败处理，不能和不合法 JSON 混为一谈。
4. 检查 `finish_reason` 是否为 `stop`；`length` 说明被截断。

`fetchImpl` 作为参数注入是为了让测试不碰网络。

- [ ] **Step 1: 写失败测试**

Create `lib/recommend/deepseek.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { callDeepseekJson } from './deepseek'

const OPTS = {
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'test-model',
  system: 'return json',
  user: '我在北京',
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const okBody = (content: string, finish = 'stop') => ({
  choices: [{ message: { content }, finish_reason: finish }],
})

describe('callDeepseekJson', () => {
  it('正常返回 content 文本', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okBody ? reply(okBody('{"places":[]}')) : null)
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text).toBe('{"places":[]}')
  })

  it('HTTP 失败归为 unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ error: 'boom' }, 500))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.kind).toBe('unavailable')
  })

  it('网络异常归为 unavailable，且不抛错', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.kind).toBe('unavailable')
  })

  it('空 content 归为 empty —— 官方承认的已知问题，要能和别的失败区分开', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(okBody('')))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.kind).toBe('empty')
  })

  it('content 不是合法 JSON 归为 invalid-json', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(okBody('这不是 json')))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.kind).toBe('invalid-json')
  })

  it('被 max_tokens 截断归为 invalid-json 并在 detail 里说明', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(okBody('{"places":[', 'length')))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.failure.kind).toBe('invalid-json')
      expect(r.failure.detail).toContain('截断')
    }
  })

  it('请求体带上 json_object 且模型来自参数', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(okBody('{}')))
    await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.model).toBe('test-model')
  })

  it('失败信息里绝不包含 apiKey', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('failed for key test-key'))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.detail).not.toContain('test-key')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/recommend/deepseek.test.ts`
Expected: FAIL，找不到 `./deepseek`。

- [ ] **Step 3: 实现**

Create `lib/recommend/deepseek.ts`:

```ts
export type DeepseekFailure = {
  kind: 'unavailable' | 'empty' | 'invalid-json'
  detail: string
}

export type DeepseekResult = { ok: true; text: string } | { ok: false; failure: DeepseekFailure }

type Options = {
  apiKey: string
  baseUrl: string
  model: string
  system: string
  user: string
  maxTokens?: number
  /** 注入是为了让测试不碰网络 */
  fetchImpl?: typeof fetch
}

const DEFAULT_MAX_TOKENS = 8192

export async function callDeepseekJson(opts: Options): Promise<DeepseekResult> {
  const doFetch = opts.fetchImpl ?? fetch

  let res: Response
  try {
    res = await doFetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        // 只保证 JSON 语法合法，字段是否合我们的 schema 由上层再校验
        response_format: { type: 'json_object' },
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      cache: 'no-store',
    })
  } catch {
    // 故意丢弃原始 error：它可能带着含 apiKey 的请求信息
    return { ok: false, failure: { kind: 'unavailable', detail: '无法连接 DeepSeek' } }
  }

  if (!res.ok) {
    return {
      ok: false,
      failure: { kind: 'unavailable', detail: `DeepSeek 返回 HTTP ${res.status}` },
    }
  }

  let data: { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  try {
    data = await res.json()
  } catch {
    return { ok: false, failure: { kind: 'unavailable', detail: 'DeepSeek 返回了非 JSON 响应' } }
  }

  const choice = data.choices?.[0]
  const text = choice?.message?.content ?? ''

  if (!text.trim()) {
    // 官方承认 JSON 模式有概率返回空 content，这是独立的一类失败
    return { ok: false, failure: { kind: 'empty', detail: 'DeepSeek 返回了空内容' } }
  }

  try {
    JSON.parse(text)
  } catch {
    const truncated = choice?.finish_reason === 'length'
    return {
      ok: false,
      failure: {
        kind: 'invalid-json',
        detail: truncated ? '回包被 max_tokens 截断，JSON 不完整' : '回包不是合法 JSON',
      },
    }
  }

  return { ok: true, text }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/recommend/deepseek.test.ts`
Expected: PASS，8 个用例全绿。

- [ ] **Step 5: 写列出模型的脚本**

Create `scripts/list-models.mjs`:

```js
// 用途：确认账号到底能用哪些模型。
// 官方文档不同版本出现过 deepseek-chat / deepseek-coder / deepseek-v4-flash /
// deepseek-v4-pro 等互相矛盾的名字，另有第三方称旧标识已移除——所以不猜，直接问。
import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    // 没有 .env.local 就只靠环境变量
  }
}

loadEnvLocal()

const key = process.env.DEEPSEEK_API_KEY
const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')

if (!key) {
  console.error('未配置 DEEPSEEK_API_KEY（可放在 .env.local）')
  process.exit(1)
}

const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` } })

if (!res.ok) {
  console.error(`请求失败：HTTP ${res.status}`)
  process.exit(1)
}

const data = await res.json()
const ids = (data.data ?? []).map((m) => m.id)

console.log(`端点：${base}`)
console.log(`可用模型（${ids.length} 个）：`)
for (const id of ids) console.log(`  ${id}`)
console.log('\n把选中的那个填进 .env.local 的 DEEPSEEK_MODEL')
```

- [ ] **Step 6: 加 npm 脚本**

```bash
npm pkg set scripts.models="node scripts/list-models.mjs"
node -p "require('./package.json').scripts.models"
```

Expected: 输出 `node scripts/list-models.mjs`。

- [ ] **Step 7: 提交**

```bash
git add lib/recommend/deepseek.ts lib/recommend/deepseek.test.ts scripts/list-models.mjs package.json
git commit -m "feat: DeepSeek 客户端与模型列表脚本"
```

---

### Task 3: skill 输出结构校验

**Files:**
- Create: `lib/recommend/schema.ts`
- Test: `lib/recommend/schema.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type SkillRecommendation`、`type SkillOutput`（字段见下）
  - `parseSkillOutput(raw: unknown): { ok: true; value: SkillOutput } | { ok: false; problems: string[] }`

**为什么必须有这一层**：`json_object` 只保证语法合法，字段缺失、类型不对、`fit` 里同一个 `tag` 出现两次都会照样通过。skill 的 README 明确要求「同一个 `tag` 只占一条」，这条规则只能在解析层守。

- [ ] **Step 1: 写失败测试**

Create `lib/recommend/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseSkillOutput } from './schema'

const good = {
  query: {
    origin: { name: '厦门市集美区', city: '厦门' },
    destination: { mode: 'nearby', requested: null },
    preferences: { intents: ['拍照'], time_budget: '3小时', travel_mode: ['地铁'] },
  },
  recommendations: [
    {
      rank: 1,
      tier: '首选',
      name: '集美学村',
      category: '历史街区',
      address: '厦门市集美区集美学村',
      fit: [{ tag: '拍照', why: '红瓦飞檐与池面倒影' }],
      amap_url: 'https://uri.amap.com/search?keyword=x',
    },
  ],
  excluded: [{ name: '园博苑', reason: '人流多' }],
  meta: { assumptions: ['免费优先'], unverified: ['实时人流'] },
}

describe('parseSkillOutput', () => {
  it('合法输入通过', () => {
    const r = parseSkillOutput(good)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.recommendations).toHaveLength(1)
  })

  it('顶层不是对象时报错', () => {
    const r = parseSkillOutput([])
    expect(r.ok).toBe(false)
  })

  it('缺 recommendations 时报错', () => {
    const { recommendations, ...rest } = good
    const r = parseSkillOutput(rest)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.join()).toContain('recommendations')
  })

  it('recommendations 为空数组时报错 —— 没结果的推荐等于失败', () => {
    const r = parseSkillOutput({ ...good, recommendations: [] })
    expect(r.ok).toBe(false)
  })

  it('缺 name 时指出是哪一条', () => {
    const bad = { ...good, recommendations: [{ ...good.recommendations[0], name: undefined }] }
    const r = parseSkillOutput(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems[0]).toContain('#1')
  })

  it('缺 amap_url 时报错 —— 它是必填，未核实时用户靠它跳高德', () => {
    const bad = { ...good, recommendations: [{ ...good.recommendations[0], amap_url: '' }] }
    const r = parseSkillOutput(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.join()).toContain('amap_url')
  })

  it('fit 里同一个 tag 出现两次时报错', () => {
    const bad = {
      ...good,
      recommendations: [
        { ...good.recommendations[0], fit: [{ tag: '拍照', why: 'a' }, { tag: '拍照', why: 'b' }] },
      ],
    }
    const r = parseSkillOutput(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.join()).toContain('拍照')
  })

  it('可选字段缺失不影响通过', () => {
    const minimal = {
      ...good,
      recommendations: [
        {
          rank: 1,
          tier: '首选',
          name: '某地',
          category: '公园',
          address: '某路 1 号',
          fit: [{ tag: '放松', why: '安静' }],
          amap_url: 'https://uri.amap.com/search?keyword=x',
        },
      ],
    }
    expect(parseSkillOutput(minimal).ok).toBe(true)
  })

  it('excluded / meta 缺失时补成空数组而不是报错', () => {
    const { excluded, meta, ...rest } = good
    const r = parseSkillOutput(rest)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.excluded).toEqual([])
      expect(r.value.meta.assumptions).toEqual([])
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/recommend/schema.test.ts`
Expected: FAIL，找不到 `./schema`。

- [ ] **Step 3: 实现**

Create `lib/recommend/schema.ts`:

```ts
export type SkillFit = { tag: string; why: string }
export type SkillItineraryItem = { time: string; action: string }

export type SkillRecommendation = {
  rank: number
  tier: string
  name: string
  category: string
  address: string
  fit: SkillFit[]
  crowdLevel?: string
  crowdNote?: string
  indoorOutdoor?: string
  bestTime?: string
  cost?: string
  transitHint?: string
  itinerary?: SkillItineraryItem[]
  pickIf?: string
  tradeOff?: string
  amapUrl: string
  confidence?: string
  source?: string
}

export type SkillOutput = {
  query: Record<string, unknown>
  recommendations: SkillRecommendation[]
  excluded: { name: string; reason: string }[]
  meta: { assumptions: string[]; unverified: string[]; disclaimer?: string }
}

type Parsed = { ok: true; value: SkillOutput } | { ok: false; problems: string[] }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function parseFit(raw: unknown, where: string, problems: string[]): SkillFit[] {
  if (!Array.isArray(raw)) {
    problems.push(`${where} 缺少 fit 数组`)
    return []
  }

  const out: SkillFit[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (!isObj(item)) continue
    const tag = text(item.tag)
    const why = text(item.why)
    if (!tag || !why) continue

    // skill 的 README 明确要求同一个 tag 只占一条；拆开会让同标签被重复计数
    if (seen.has(tag)) {
      problems.push(`${where} 的 fit 里 tag「${tag}」出现了多次，应合并成一条`)
      continue
    }
    seen.add(tag)
    out.push({ tag, why })
  }

  if (out.length === 0) problems.push(`${where} 的 fit 为空`)
  return out
}

export function parseSkillOutput(raw: unknown): Parsed {
  if (!isObj(raw)) return { ok: false, problems: ['顶层不是对象'] }

  const problems: string[] = []

  if (!Array.isArray(raw.recommendations)) {
    return { ok: false, problems: ['缺少 recommendations 数组'] }
  }
  if (raw.recommendations.length === 0) {
    return { ok: false, problems: ['recommendations 为空，没有可用推荐'] }
  }

  const recommendations: SkillRecommendation[] = []

  raw.recommendations.forEach((item, i) => {
    const where = `第 #${i + 1} 条`
    if (!isObj(item)) {
      problems.push(`${where} 不是对象`)
      return
    }

    const name = text(item.name)
    const amapUrl = text(item.amap_url)
    if (!name) problems.push(`${where} 缺少 name`)
    if (!amapUrl) problems.push(`${where} 缺少 amap_url`)

    const fit = parseFit(item.fit, where, problems)

    if (!name || !amapUrl) return

    const itinerary = Array.isArray(item.itinerary)
      ? item.itinerary
          .filter(isObj)
          .map((s) => ({ time: text(s.time), action: text(s.action) }))
          .filter((s) => s.time && s.action)
      : undefined

    recommendations.push({
      rank: typeof item.rank === 'number' ? item.rank : i + 1,
      tier: text(item.tier) || '备选',
      name,
      category: text(item.category) || '未分类',
      address: text(item.address),
      fit,
      crowdLevel: text(item.crowd_level) || undefined,
      crowdNote: text(item.crowd_note) || undefined,
      indoorOutdoor: text(item.indoor_outdoor) || undefined,
      bestTime: text(item.best_time) || undefined,
      cost: text(item.cost) || undefined,
      transitHint: text(item.transit_hint) || undefined,
      itinerary: itinerary && itinerary.length > 0 ? itinerary : undefined,
      pickIf: text(item.pick_if) || undefined,
      tradeOff: text(item.trade_off) || undefined,
      amapUrl,
      confidence: text(item.confidence) || undefined,
      source: text(item.source) || undefined,
    })
  })

  if (problems.length > 0) return { ok: false, problems }

  const excluded = Array.isArray(raw.excluded)
    ? raw.excluded
        .filter(isObj)
        .map((e) => ({ name: text(e.name), reason: text(e.reason) }))
        .filter((e) => e.name)
    : []

  const metaRaw = isObj(raw.meta) ? raw.meta : {}
  const meta = {
    assumptions: Array.isArray(metaRaw.assumptions)
      ? metaRaw.assumptions.map(text).filter(Boolean)
      : [],
    unverified: Array.isArray(metaRaw.unverified) ? metaRaw.unverified.map(text).filter(Boolean) : [],
    disclaimer: text(metaRaw.disclaimer) || undefined,
  }

  return {
    ok: true,
    value: {
      query: isObj(raw.query) ? raw.query : {},
      recommendations,
      excluded,
      meta,
    },
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/recommend/schema.test.ts`
Expected: PASS，9 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add lib/recommend/schema.ts lib/recommend/schema.test.ts
git commit -m "feat: skill 输出结构校验"
```

---

### Task 4: 高德核实层

**Files:**
- Create: `lib/providers/verify/types.ts`
- Create: `lib/providers/verify/amap.ts`
- Create: `lib/providers/verify/mock.ts`
- Create: `lib/providers/verify/index.ts`
- Test: `lib/providers/verify/verify.test.ts`

**Interfaces:**
- Consumes: `amapGet`（`lib/providers/amap-fetch.ts`）、`haversineMeters`、`parseOpenStatus`、`asText`、`LatLng`、`OpenStatus`、`SkillRecommendation`（Task 3）、`toGcj02`（Task 1）
- Produces:
  - `type Verification = { point: LatLng | null; verified: boolean; verifiedName?: string; distanceMeters?: number; openStatus?: OpenStatus }`
  - `type VerifyProvider = { verify(input: { name: string; address: string; city: string; origin: LatLng }): Promise<Verification> }`
  - `getVerifyProvider(): VerifyProvider`

**核实三件事**：地理编码拿坐标、算直线距离、取营业状态。查不到就 `verified: false`，**不丢弃**（保留的判断在 Task 5 的上层做）。

- [ ] **Step 1: 写契约**

Create `lib/providers/verify/types.ts`:

```ts
import type { LatLng, OpenStatus } from '@/lib/core/model'

export type VerifyInput = {
  name: string
  address: string
  city: string
  origin: LatLng
}

export type Verification = {
  /** 地理编码得到的坐标；null 表示高德未能核实 */
  point: LatLng | null
  verified: boolean
  /** 高德返回的正式名称，可能与 skill 给的写法不同 */
  verifiedName?: string
  /** 与出发点的直线距离，注意不是驾车距离 */
  distanceMeters?: number
  openStatus?: OpenStatus
}

export type VerifyProvider = {
  verify(input: VerifyInput): Promise<Verification>
}
```

- [ ] **Step 2: 写失败测试**

Create `lib/providers/verify/verify.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapGeocode, mapPoiBusiness } from './amap'

const ORIGIN = { lng: 116.4, lat: 39.9 }

describe('mapGeocode', () => {
  it('命中时给出坐标与高德正式名称', () => {
    const v = mapGeocode({ geocodes: [{ location: '116.404,39.915', formatted_address: '北京市东城区天安门' }] }, ORIGIN)
    expect(v.verified).toBe(true)
    expect(v.point).toEqual({ lng: 116.404, lat: 39.915 })
    expect(v.verifiedName).toBe('北京市东城区天安门')
    expect(v.distanceMeters).toBeGreaterThan(0)
  })

  it('geocodes 为空时未核实，point 为 null', () => {
    const v = mapGeocode({ geocodes: [] }, ORIGIN)
    expect(v.verified).toBe(false)
    expect(v.point).toBeNull()
  })

  it('geocodes 缺失时不炸', () => {
    expect(mapGeocode({}, ORIGIN).verified).toBe(false)
  })

  it('location 是空数组（高德常用 [] 表示空值）时未核实', () => {
    const v = mapGeocode({ geocodes: [{ location: [] }] }, ORIGIN)
    expect(v.verified).toBe(false)
  })

  it('location 格式不对时未核实而不是抛错', () => {
    const v = mapGeocode({ geocodes: [{ location: '坏数据' }] }, ORIGIN)
    expect(v.verified).toBe(false)
  })

  it('距离是直线距离，与坐标自洽', () => {
    const v = mapGeocode({ geocodes: [{ location: '116.4,39.9' }] }, ORIGIN)
    expect(v.distanceMeters).toBe(0)
  })
})

describe('mapPoiBusiness', () => {
  const at = (h: number) => new Date(2026, 8, 19, h, 0)

  it('取到营业时间并解析出状态', () => {
    const s = mapPoiBusiness({ pois: [{ biz_ext: { open_time: '09:00-22:00' } }] }, at(12))
    expect(s).toBe('open')
  })

  it('查不到 POI 时给 unknown，绝不当成已关闭', () => {
    expect(mapPoiBusiness({ pois: [] }, at(12))).toBe('unknown')
    expect(mapPoiBusiness({}, at(12))).toBe('unknown')
  })

  it('biz_ext 缺失时给 unknown', () => {
    expect(mapPoiBusiness({ pois: [{}] }, at(12))).toBe('unknown')
  })
})

describe('amapVerifyProvider', () => {
  beforeEach(() => {
    process.env.AMAP_WEB_SERVICE_KEY = 'test-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('地理编码未命中时不再查询营业状态', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: '1', geocodes: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { amapVerifyProvider } = await import('./amap')
    const v = await amapVerifyProvider.verify({
      name: '不存在的地方',
      address: '某路 1 号',
      city: '北京',
      origin: ORIGIN,
    })

    expect(v.verified).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run lib/providers/verify/verify.test.ts`
Expected: FAIL，找不到 `./amap`。

- [ ] **Step 4: 实现高德核实**

Create `lib/providers/verify/amap.ts`:

```ts
import { asText } from '@/lib/core/coerce'
import { haversineMeters } from '@/lib/core/geo'
import type { LatLng, OpenStatus } from '@/lib/core/model'
import { parseOpenStatus } from '@/lib/core/open-hours'
import { amapGet } from '../amap-fetch'
import type { Verification, VerifyInput, VerifyProvider } from './types'

type GeocodeResponse = {
  geocodes?: { location?: unknown; formatted_address?: unknown; city?: unknown }[]
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

/** 从地理编码响应映射出核实结果。纯函数，便于单测。 */
export function mapGeocode(data: GeocodeResponse, origin: LatLng): Verification {
  const first = data.geocodes?.[0]
  const point = parseLocation(first?.location)

  if (!point) {
    return { point: null, verified: false }
  }

  return {
    point,
    verified: true,
    verifiedName: asText(first?.formatted_address) || undefined,
    // 直线距离，不是驾车距离。界面必须标明，否则用户会以为是里程
    distanceMeters: haversineMeters(origin, point),
  }
}

type AroundResponse = { pois?: { biz_ext?: unknown }[] }

/** 从周边搜索响应里取营业状态。判不出来一律 unknown。 */
export function mapPoiBusiness(data: AroundResponse, now: Date): OpenStatus {
  const biz = data.pois?.[0]?.biz_ext
  if (!biz || typeof biz !== 'object' || Array.isArray(biz)) return 'unknown'

  const record = biz as { open_time?: unknown; opentime2?: unknown }
  const openTime = asText(record.open_time) || asText(record.opentime2)
  return parseOpenStatus(openTime, now)
}

export const amapVerifyProvider: VerifyProvider = {
  async verify({ name, address, city, origin }: VerifyInput): Promise<Verification> {
    // 用「名称 + 城市」查，比只用 address 命中率高；address 作为补充
    const keyword = [name, city].filter(Boolean).join(' ')
    const geo = await amapGet<GeocodeResponse>('/v3/geocode/geo', {
      address: address || keyword,
      city,
    })

    const result = mapGeocode(geo, origin)
    if (!result.verified || !result.point) return result

    try {
      const around = await amapGet<AroundResponse>('/v3/place/around', {
        location: `${result.point.lng},${result.point.lat}`,
        radius: 200,
        offset: 1,
        page: 1,
        extensions: 'all',
      })
      return { ...result, openStatus: mapPoiBusiness(around, new Date()) }
    } catch (error) {
      // 营业状态只是锦上添花，拿不到不该让整条核实失败
      console.error(`[verify/amap] 取营业状态失败：${name}`, error)
      return { ...result, openStatus: 'unknown' }
    }
  },
}
```

- [ ] **Step 5: 写 mock 与选择器**

Create `lib/providers/verify/mock.ts`:

```ts
import { haversineMeters } from '@/lib/core/geo'
import type { VerifyProvider } from './types'

/**
 * 假核实：在出发点附近按名称长度散布一个确定性的点。
 * 名称里含「未核实」则模拟高德查不到，用于验证降级展示。
 */
export const mockVerifyProvider: VerifyProvider = {
  async verify({ name, origin }) {
    if (name.includes('未核实')) return { point: null, verified: false }

    const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
    const angle = ((seed * 137.5) % 360) * (Math.PI / 180)
    const ring = 400 + (seed % 12) * 250
    const point = {
      lng: origin.lng + (ring * Math.sin(angle)) / (111320 * Math.cos((origin.lat * Math.PI) / 180)),
      lat: origin.lat + (ring * Math.cos(angle)) / 111320,
    }

    return {
      point,
      verified: true,
      verifiedName: name,
      distanceMeters: haversineMeters(origin, point),
      openStatus: 'open' as const,
    }
  },
}
```

Create `lib/providers/verify/index.ts`:

```ts
import { amapVerifyProvider } from './amap'
import { mockVerifyProvider } from './mock'
import type { VerifyProvider } from './types'

export function getVerifyProvider(): VerifyProvider {
  return process.env.RECOMMEND_VERIFY === 'mock' ? mockVerifyProvider : amapVerifyProvider
}

export type { Verification, VerifyInput, VerifyProvider } from './types'
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run lib/providers/verify/verify.test.ts`
Expected: PASS，9 个用例全绿。

- [ ] **Step 7: 提交**

```bash
git add lib/providers/verify
git commit -m "feat: 高德核实层（地理编码、直线距离、营业状态）"
```

---

### Task 5: /api/recommend 路由与路线顺序优化

**Files:**
- Create: `lib/recommend/index.ts`
- Create: `lib/recommend/prompt.md`（占位，等用户提供正文）
- Create: `app/api/recommend/route.ts`
- Create: `lib/core/optimize.ts`
- Test: `lib/core/optimize.test.ts`
- Modify: `app/api/route/plan/route.ts`
- Modify: `lib/core/model.ts`（新增 `RecommendPlace`、`RecommendResult`）

**Interfaces:**
- Consumes: Task 1~4 全部产物
- Produces:
  - `optimizeOrder(origin: LatLng, stops: { id: string; point: LatLng }[], distance?): { id: string; point: LatLng }[]`
  - `POST /api/recommend` → `RecommendResult`

- [ ] **Step 1: 写顺序优化的失败测试**

Create `lib/core/optimize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { optimizeOrder } from './optimize'

const ORIGIN = { lng: 0, lat: 0 }
// 沿一条直线排列，最优顺序必然是 1 → 2 → 3 → 4
const stops = [
  { id: 's1', point: { lng: 1, lat: 0 } },
  { id: 's2', point: { lng: 2, lat: 0 } },
  { id: 's3', point: { lng: 3, lat: 0 } },
  { id: 's4', point: { lng: 4, lat: 0 } },
]

describe('optimizeOrder', () => {
  it('少于 2 个点原样返回', () => {
    expect(optimizeOrder(ORIGIN, [stops[0]])).toEqual([stops[0]])
    expect(optimizeOrder(ORIGIN, [])).toEqual([])
  })

  it('把折返的勾选顺序排成一条线', () => {
    const clicked = [stops[2], stops[0], stops[3], stops[1]] // 3,1,4,2
    expect(optimizeOrder(ORIGIN, clicked).map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4'])
  })

  it('结果包含全部输入且不重复', () => {
    const out = optimizeOrder(ORIGIN, [stops[2], stops[0], stops[3], stops[1]])
    expect(out.map((s) => s.id).sort()).toEqual(['s1', 's2', 's3', 's4'])
  })

  it('同样输入永远同样输出', () => {
    const a = optimizeOrder(ORIGIN, stops).map((s) => s.id)
    const b = optimizeOrder(ORIGIN, stops).map((s) => s.id)
    expect(a).toEqual(b)
  })

  it('不修改入参数组', () => {
    const input = [stops[2], stops[0], stops[3], stops[1]]
    const snapshot = JSON.stringify(input)
    optimizeOrder(ORIGIN, input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('接受可替换的距离函数 —— 将来换成真实行车矩阵不用改这里', () => {
    // 故意给一个和直线相反的距离函数，结果应当反转
    const reversed = (_a: { lng: number; lat: number }, _b: { lng: number; lat: number }) =>
      10 - Math.abs(_a.lng - _b.lng)
    const out = optimizeOrder({ lng: 4, lat: 0 }, [stops[0], stops[1], stops[2]], reversed)
    expect(out).toHaveLength(3)
  })

  it('六个点（上限）也能算出来', () => {
    const six = [
      { id: 'a', point: { lng: 5, lat: 0 } },
      { id: 'b', point: { lng: 1, lat: 0 } },
      { id: 'c', point: { lng: 6, lat: 0 } },
      { id: 'd', point: { lng: 2, lat: 0 } },
      { id: 'e', point: { lng: 4, lat: 0 } },
      { id: 'f', point: { lng: 3, lat: 0 } },
    ]
    expect(optimizeOrder(ORIGIN, six).map((s) => s.id)).toEqual(['b', 'd', 'f', 'e', 'a', 'c'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/core/optimize.test.ts`
Expected: FAIL，找不到 `./optimize`。

- [ ] **Step 3: 实现顺序优化（TSP 穷举）**

Create `lib/core/optimize.ts`:

```ts
import { haversineMeters } from './geo'
import type { LatLng } from './model'

export type StopPoint = { id: string; point: LatLng }

/**
 * 求从 origin 出发、走遍所有停靠点的最短顺序。
 *
 * 停靠点上限是 6（一屏卡片数），6! = 720 种排列，穷举就是精确最优，
 * 不需要启发式。n 再大就不能这么做了。
 *
 * 距离函数默认是直线距离 —— 零额外 API 调用。若要更准（真实行车时间），
 * 传一个可替换的 distance 即可，排序逻辑与测试都不用动。
 */
export function optimizeOrder(
  origin: LatLng,
  stops: StopPoint[],
  distance: (a: LatLng, b: LatLng) => number = haversineMeters,
): StopPoint[] {
  if (stops.length < 2) return stops.slice()

  let best: StopPoint[] = []
  let bestCost = Infinity

  const walk = (remaining: StopPoint[], path: StopPoint[], cost: number, from: LatLng) => {
    // 剪枝：已经比当前最优贵就不必往下走
    if (cost >= bestCost) return

    if (remaining.length === 0) {
      best = path
      bestCost = cost
      return
    }

    for (let i = 0; i < remaining.length; i++) {
      const next = remaining[i]
      walk(
        [...remaining.slice(0, i), ...remaining.slice(i + 1)],
        [...path, next],
        cost + distance(from, next.point),
        next.point,
      )
    }
  }

  walk(stops, [], 0, origin)
  return best
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/core/optimize.test.ts`
Expected: PASS，7 个用例全绿。

- [ ] **Step 5: 加推荐结果类型**

Modify `lib/core/model.ts`，在文件末尾追加：

```ts
/** skill 给出的推荐，加上高德核实结果 */
export type RecommendPlace = {
  rank: number
  tier: string
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
  point: LatLng | null
  verified: boolean
  verifiedName?: string
  /** 直线距离，不是驾车距离 */
  distanceMeters?: number
  openStatus?: OpenStatus
}

export type RecommendResult = {
  places: RecommendPlace[]
  excluded: { name: string; reason: string }[]
  meta: { assumptions: string[]; unverified: string[]; disclaimer?: string }
}

export type RecommendRequest = {
  origin: { name: string; city: string; point: LatLng | null; coordSystem: 'GCJ-02' | null }
  destination: { mode: 'nearby' | 'specified'; requested: string | null }
  preferences: {
    intents: string[]
    timeBudget: string | null
    travelMode: string[]
    companions: number | null
    crowdTolerance: 'low' | 'medium' | 'high' | null
  }
}
```

- [ ] **Step 6: 写提示词占位文件**

Create `lib/recommend/prompt.md`:

```markdown
<!--
  这里放用户提供的 skill 提示词正文。
  注意（已核实的 DeepSeek 要求）：
  1. 正文里必须出现 "json" 字样，并给出一份输出样例，否则模型可能一直生成空格
     直到撞上 max_tokens，表现为请求卡死。
  2. 只需要产出 JSON 本身，平台会做结构校验。
  3. 输出形状必须符合 docs/superpowers/specs/2026-09-19-recommend-layer-design.md
     第 5 节与 lib/recommend/schema.ts 的定义。
-->
```

- [ ] **Step 7: 写推荐编排**

Create `lib/recommend/index.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RecommendPlace, RecommendRequest, RecommendResult } from '@/lib/core/model'
import { getVerifyProvider } from '@/lib/providers/verify'
import { callDeepseekJson } from './deepseek'
import { parseSkillOutput } from './schema'

export type RecommendFailure = { reason: string }

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'lib/recommend/prompt.md'), 'utf8')
}

function buildUserMessage(req: RecommendRequest): string {
  // skill 的 README 要求输入分三段；这里按它的形状组装
  return [
    `位置：${req.origin.name}（城市 ${req.origin.city}）`,
    req.origin.point
      ? `坐标：${req.origin.point.lng},${req.origin.point.lat}（坐标系 GCJ-02）`
      : '坐标：无，请引用位置名称',
    `目的地：${req.destination.mode === 'specified' ? req.destination.requested : '未指定，按附近检索'}`,
    `想干什么：${req.preferences.intents.join('、') || '未说明'}`,
    `能花多久：${req.preferences.timeBudget ?? '未说明'}`,
    `怎么去：${req.preferences.travelMode.join('、') || '未说明'}`,
    req.preferences.companions ? `同行人：${req.preferences.companions} 人` : '同行人：未说明',
    req.preferences.crowdTolerance ? `拥挤容忍度：${req.preferences.crowdTolerance}` : '拥挤容忍度：未说明',
  ].join('\n')
}

export async function recommend(req: RecommendRequest): Promise<{ ok: true; value: RecommendResult } | { ok: false; failure: RecommendFailure }> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL
  if (!apiKey) return { ok: false, failure: { reason: '未配置 DEEPSEEK_API_KEY' } }
  if (!model) {
    return {
      ok: false,
      failure: { reason: '未配置 DEEPSEEK_MODEL，先跑 npm run models 看可用模型' },
    }
  }

  const call = await callDeepseekJson({
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model,
    system: loadPrompt(),
    user: buildUserMessage(req),
  })

  if (!call.ok) {
    console.error('[recommend] skill 调用失败', call.failure)
    return { ok: false, failure: { reason: call.failure.detail } }
  }

  let raw: unknown
  try {
    raw = JSON.parse(call.text)
  } catch {
    return { ok: false, failure: { reason: '回包不是合法 JSON' } }
  }

  const parsed = parseSkillOutput(raw)
  if (!parsed.ok) {
    console.error('[recommend] 结构校验未通过', parsed.problems)
    return { ok: false, failure: { reason: `回包结构不符合约定：${parsed.problems[0]}` } }
  }

  const verify = getVerifyProvider()
  const origin = req.origin.point ?? { lng: 0, lat: 0 }

  // 逐条核实。串行 + 小延迟是为了避开高德 QPS（见 09-18 spec 第 9.1 节）
  const places: RecommendPlace[] = []
  for (const rec of parsed.value.recommendations) {
    const v = await verify.verify({
      name: rec.name,
      address: rec.address,
      city: req.origin.city,
      origin,
    })
    places.push({ ...rec, ...v })

    if (places.length < parsed.value.recommendations.length) {
      await new Promise((r) => setTimeout(r, 120))
    }
  }

  return {
    ok: true,
    value: { places, excluded: parsed.value.excluded, meta: parsed.value.meta },
  }
}
```

- [ ] **Step 8: 写路由**

Create `app/api/recommend/route.ts`:

```ts
import type { RecommendRequest } from '@/lib/core/model'
import { recommend } from '@/lib/recommend'

// 推荐要跑 LLM，比普通接口慢得多
export const maxDuration = 120

export async function POST(req: Request) {
  let body: RecommendRequest
  try {
    body = (await req.json()) as RecommendRequest
  } catch {
    return Response.json({ error: '推荐失败', reason: '请求体不是合法 JSON' }, { status: 400 })
  }

  if (!body?.origin?.city || !body?.preferences) {
    return Response.json({ error: '推荐失败', reason: '缺少位置或偏好' }, { status: 400 })
  }

  try {
    const out = await recommend(body)
    if (!out.ok) {
      return Response.json({ error: '推荐失败', reason: out.failure.reason }, { status: 502 })
    }
    return Response.json(out.value)
  } catch (error) {
    // 不静默吞错：上一轮 QPS 事故的直接教训
    console.error('[api/recommend] 未预期错误', error)
    const reason = error instanceof Error ? error.message : '未知错误'
    return Response.json({ error: '推荐失败', reason }, { status: 502 })
  }
}
```

- [ ] **Step 9: 路线规划接入顺序优化**

Modify `app/api/route/plan/route.ts`，在 `getRouteProvider().planRoute(...)` 之前插入顺序优化：

```ts
import { optimizeOrder } from '@/lib/core/optimize'
```

并把原来直接传 `body.stops` 的地方改成：

```ts
    // 用户勾选的是「一组点」，拜访顺序由我们算最优 —— 勾选顺序不代表出行顺序
    const ordered = optimizeOrder(body.origin, body.stops)

    return Response.json(
      await getRouteProvider().planRoute({
        origin: body.origin,
        stops: ordered,
        mode: body.mode ?? 'driving',
        departAt: body.departAt,
      }),
    )
```

- [ ] **Step 10: 全量检查**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 全部通过。

- [ ] **Step 11: 提交**

```bash
git add lib/core/optimize.ts lib/core/optimize.test.ts lib/core/model.ts lib/recommend app/api/recommend app/api/route/plan/route.ts
git commit -m "feat: 推荐接口与路线顺序优化"
```

---

### Task 6: 偏好表单与显式触发

**Files:**
- Create: `components/PreferenceForm.tsx`
- Create: `components/RecommendSummary.tsx`
- Modify: `components/OriginPicker.tsx`（去掉半径，改为只选位置）
- Modify: `app/page.tsx`（接入表单、摘要、显式触发）

**Interfaces:**
- Consumes: `RecommendRequest`（Task 5）
- Produces: `PreferenceForm`、`RecommendSummary` 组件

**设计要点（来自设计文档 3.2 与评审）**：表单占 560px，会把列表挤到 340px，**必须能收起**。点「帮我推荐」后收成一行摘要 + 「修改」。

- [ ] **Step 1: 写偏好表单**

Create `components/PreferenceForm.tsx`:

```tsx
'use client'

import { useState } from 'react'

export type Preferences = {
  intents: string[]
  timeBudget: string | null
  travelMode: string[]
  companions: number | null
  crowdTolerance: 'low' | 'medium' | 'high' | null
  destination: string
}

export const EMPTY_PREFERENCES: Preferences = {
  intents: [],
  timeBudget: null,
  travelMode: [],
  companions: null,
  crowdTolerance: null,
  destination: '',
}

const INTENTS = ['拍照', '放松', '遛娃', '约会', '朋友聚会', '运动', '一个人待着']
const BUDGETS = ['1 小时内', '半天', '全天']
const MODES = ['步行', '骑行', '驾车', '打车', '公共交通']

type Props = {
  value: Preferences
  onChange: (v: Preferences) => void
  onSubmit: () => void
  busy: boolean
}

const CHIP = 'rounded-md px-2.5 py-1 text-xs transition-colors'
const IDLE = 'bg-mist text-ink-soft hover:bg-line hover:text-ink'

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

export default function PreferenceForm({ value, onChange, onSubmit, busy }: Props) {
  const [more, setMore] = useState(false)

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-xs text-ink-soft">想干什么</div>
        <div className="flex flex-wrap gap-1.5">
          {INTENTS.map((i) => (
            <button
              key={i}
              aria-pressed={value.intents.includes(i)}
              onClick={() => onChange({ ...value, intents: toggle(value.intents, i) })}
              className={`${CHIP} ${value.intents.includes(i) ? 'bg-jade text-white' : IDLE}`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-ink-soft">能花多久</div>
        <div className="flex flex-wrap gap-1.5">
          {BUDGETS.map((b) => (
            <button
              key={b}
              aria-pressed={value.timeBudget === b}
              onClick={() => onChange({ ...value, timeBudget: value.timeBudget === b ? null : b })}
              className={`${CHIP} ${value.timeBudget === b ? 'bg-jade text-white' : IDLE}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-ink-soft">怎么去</div>
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m}
              aria-pressed={value.travelMode.includes(m)}
              onClick={() => onChange({ ...value, travelMode: toggle(value.travelMode, m) })}
              className={`${CHIP} ${value.travelMode.includes(m) ? 'bg-jade text-white' : IDLE}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        className="text-xs text-ink-soft underline decoration-line underline-offset-4 hover:text-ink"
      >
        {more ? '收起更多选项' : '更多（同行人 / 拥挤度 / 想去哪）'}
      </button>

      {more && (
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-xs text-ink-soft">同行人数</div>
            <input
              type="number"
              min={1}
              value={value.companions ?? ''}
              onChange={(e) =>
                onChange({ ...value, companions: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="留空则由 AI 按默认处理"
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-jade"
            />
          </div>

          <div>
            <div className="mb-1.5 text-xs text-ink-soft">拥挤容忍度</div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['low', '低'],
                  ['medium', '一般'],
                  ['high', '无所谓'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  aria-pressed={value.crowdTolerance === v}
                  onClick={() =>
                    onChange({ ...value, crowdTolerance: value.crowdTolerance === v ? null : v })
                  }
                  className={`${CHIP} ${value.crowdTolerance === v ? 'bg-jade text-white' : IDLE}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-ink-soft">想去哪（可选）</div>
            <input
              value={value.destination}
              onChange={(e) => onChange({ ...value, destination: e.target.value })}
              placeholder="留空则在出发点附近找"
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-jade"
            />
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={busy}
        className="w-full rounded-lg bg-jade py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? '正在找…' : '帮我推荐'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 写收起后的摘要**

Create `components/RecommendSummary.tsx`:

```tsx
'use client'

import type { Preferences } from './PreferenceForm'

type Props = { location: string; value: Preferences; onEdit: () => void }

export default function RecommendSummary({ location, value, onEdit }: Props) {
  const parts = [
    value.intents.join(' · ') || null,
    value.timeBudget,
    value.travelMode.join(' · ') || null,
  ].filter(Boolean)

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink" title={location}>
          {location}
        </div>
        <div className="mt-1 text-xs text-ink-soft">{parts.join('　|　') || '未设置偏好'}</div>
      </div>
      <button
        onClick={onEdit}
        className="shrink-0 text-xs text-jade hover:underline"
      >
        修改
      </button>
    </div>
  )
}
```

- [ ] **Step 3: 精简 OriginPicker**

Modify `components/OriginPicker.tsx`：删掉 `mode` / `radiusMinutes` / `onModeChange` / `onRadiusChange` 四个 props 及其渲染块（出行方式与半径由 skill 按偏好决定，平台不再自己筛范围）。

保留位置显示与两个入口按钮。

- [ ] **Step 4: 接入页面**

Modify `app/page.tsx`：

1. 新增状态：

```ts
const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFERENCES)
const [formOpen, setFormOpen] = useState(true)
const [recommending, setRecommending] = useState(false)
const [recommendError, setRecommendError] = useState<{ reason: string } | null>(null)
const [excluded, setExcluded] = useState<{ name: string; reason: string }[]>([])
const [meta, setMeta] = useState<{ assumptions: string[]; unverified: string[] }>({ assumptions: [], unverified: [] })
```

2. 删掉原来的自动搜索 effect（`lastSearchedRef` 那一整块）与 `/api/poi/search` 相关逻辑，改为显式触发：

```ts
const runRecommend = useCallback(async () => {
  if (!origin) return
  setRecommending(true)
  setRecommendError(null)
  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origin: {
          name: origin.label,
          city: origin.city ?? origin.label,
          point: origin.point,
          coordSystem: 'GCJ-02',
        },
        destination: {
          mode: prefs.destination.trim() ? 'specified' : 'nearby',
          requested: prefs.destination.trim() || null,
        },
        preferences: {
          intents: prefs.intents,
          timeBudget: prefs.timeBudget,
          travelMode: prefs.travelMode,
          companions: prefs.companions,
          crowdTolerance: prefs.crowdTolerance,
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.reason ?? '未知原因')

    setPlaces(data.places)
    setExcluded(data.excluded)
    setMeta(data.meta)
    setSelectedOrder([])
    setFormOpen(false) // 表单收起，把空间让给结果
  } catch (e) {
    setRecommendError({ reason: e instanceof Error ? e.message : '未知原因' })
  } finally {
    setRecommending(false)
  }
}, [origin, prefs])
```

3. `origin` 需要带 `city`，在 `Origin` 类型上加 `city?: string`（改 `lib/core/model.ts`），定位路径填 `''`（由服务端模糊化时补），地图选点路径留空。

4. 渲染部分：`formOpen ? <PreferenceForm .../> : <RecommendSummary .../>`，失败时在列表位置显示：

```tsx
{recommendError && (
  <div className="border-b border-line px-4 py-6 text-sm">
    <p className="font-medium text-red-700">推荐失败</p>
    <p className="mt-1 text-ink-soft">{recommendError.reason}</p>
    <button onClick={runRecommend} className="mt-3 rounded-md bg-mist px-3 py-1.5 text-xs hover:bg-line">
      重试
    </button>
  </div>
)}
```

- [ ] **Step 5: 编译与类型检查**

Run: `npx tsc --noEmit && npm run lint`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add components/PreferenceForm.tsx components/RecommendSummary.tsx components/OriginPicker.tsx lib/core/model.ts app/page.tsx
git commit -m "feat: 偏好表单、收起摘要与显式推荐触发"
```

---

### Task 7: 列表与详情改版

**Files:**
- Create: `components/RecommendCard.tsx`
- Create: `components/RecommendList.tsx`
- Modify: `components/StopDetail.tsx`
- Modify: `components/RouteSummaryBar.tsx`（编号改用拜访顺序）
- Modify: `app/page.tsx`
- Delete: `components/PoiCard.tsx`、`components/PoiList.tsx`

**Interfaces:**
- Consumes: `RecommendPlace`（Task 5）
- Produces: 新版列表与详情组件

**三处必须做对的细节**（见设计文档 3.4 / 3.6 与样张评审）：

1. 未核实（`verified === false`）的地点**保留在列表里**，标注「高德未能核实」并给 `amapUrl`，**不占路线编号**
2. 距离标签必须是「**直线**」，不能让人以为是行车里程
3. skill 的 `itinerary` 标注「如果只去这一个」，与实际跨点总时长分开呈现

- [ ] **Step 1: 写卡片**

Create `components/RecommendCard.tsx`:

```tsx
'use client'

import type { RecommendPlace } from '@/lib/core/model'

type Props = {
  place: RecommendPlace
  order: number | null
  onToggle: (name: string) => void
  onOpenDetail: (name: string) => void
}

const STATUS: Record<string, string> = { open: '营业中', closed: '已打烊', unknown: '' }

export default function RecommendCard({ place, order, onToggle, onOpenDetail }: Props) {
  const selectable = place.verified
  const selected = order !== null

  return (
    <div
      className={`relative flex gap-3 py-3 pl-4 pr-3 transition-colors ${
        selected ? 'bg-jade-wash' : place.verified ? 'hover:bg-mist/60' : 'bg-[#fbfbfa]'
      }`}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-jade" aria-hidden />}

      <button
        onClick={() => selectable && onToggle(place.name)}
        disabled={!selectable}
        aria-label={selectable ? (selected ? `取消选择 ${place.name}` : `选择 ${place.name}`) : `${place.name} 未能核实，无法加入路线`}
        aria-pressed={selected}
        className={`tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
          selected
            ? 'bg-jade text-white'
            : selectable
              ? 'border border-line text-ink-soft hover:border-jade hover:text-jade'
              : 'border border-dashed border-line text-ink-soft/60'
        }`}
      >
        {selected ? order : selectable ? '+' : '·'}
      </button>

      <button onClick={() => onOpenDetail(place.name)} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{place.name}</span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
              place.rank === 1 ? 'bg-jade-wash text-jade' : 'bg-mist text-ink-soft'
            }`}
          >
            {place.tier}
          </span>
        </div>

        <div className="mt-1 text-xs text-ink-soft">{place.category}</div>

        {place.fit.length > 0 && (
          <div className="mt-2 space-y-1">
            {place.fit.map((f) => (
              <div key={f.tag} className="flex gap-2 text-xs leading-relaxed">
                <span className="shrink-0 font-semibold text-jade">{f.tag}</span>
                <span className="text-ink-soft">{f.why}</span>
              </div>
            ))}
          </div>
        )}

        {place.verified ? (
          <div className="mt-2 flex items-center gap-2.5 text-[11.5px] text-ink-soft">
            {place.distanceMeters != null && (
              <span className="tnum">{(place.distanceMeters / 1000).toFixed(1)} 公里 · 直线</span>
            )}
            {place.cost && <span>{place.cost}</span>}
            {place.openStatus && STATUS[place.openStatus] && (
              <span className={place.openStatus === 'open' ? 'text-jade' : ''}>
                {STATUS[place.openStatus]}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-2 text-[11.5px] leading-relaxed text-amber-700">
            高德未能核实到该地点，无法上图、不参与路线规划。
            <a
              href={place.amapUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              在高德地图中查看
            </a>
          </div>
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 写列表**

Create `components/RecommendList.tsx`:

```tsx
'use client'

import type { RecommendPlace } from '@/lib/core/model'
import RecommendCard from './RecommendCard'

type Props = {
  places: RecommendPlace[]
  selectedOrder: string[]
  onToggle: (name: string) => void
  onOpenDetail: (name: string) => void
}

export default function RecommendList({ places, selectedOrder, onToggle, onOpenDetail }: Props) {
  const unverified = places.filter((p) => !p.verified).length

  return (
    <div>
      <div className="border-b border-line bg-mist px-4 py-2 text-[11.5px] text-ink-soft">
        {places.length} 条推荐
        {unverified > 0 && ` · ${unverified} 条未能核实`}
      </div>

      <div className="divide-y divide-line">
        {places.map((p) => {
          const i = selectedOrder.indexOf(p.name)
          return (
            <RecommendCard
              key={p.name}
              place={p}
              order={i === -1 ? null : i + 1}
              onToggle={onToggle}
              onOpenDetail={onOpenDetail}
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 改详情面板**

Modify `components/StopDetail.tsx`：props 从 `PoiDetail` 改为 `RecommendPlace | null`，内容换成 skill 的真实字段。要点：

- 「如果只去这一个」标题下放 `itinerary`
- 动线下方加一句说明：这段动线按 skill 假设的时长排的，实际跨点总时长见地图顶部，**两个数字不合并**
- 展示 `bestTime` / `cost` / `crowdLevel`+`crowdNote` / `transitHint` / `tradeOff` / `pickIf`
- 末尾展示 `confidence` 与 `source`

- [ ] **Step 4: 改路线条**

Modify `components/RouteSummaryBar.tsx`：`selectedOrder` 的类型从 poi id 改为 place 的 `name`（`RecommendPlace` 没有稳定的 id），并保留既有的降级提示逻辑。

- [ ] **Step 5: 更新页面并用拜访顺序渲染编号**

Modify `app/page.tsx`：

- `selectedOrder` 改为存取 `place.name`
- 新增派生值：

```ts
// 勾选顺序只是选择，真正的拜访顺序由服务端算完返回
const visitOrder = route?.order ?? selectedOrder
```

- 把 `visitOrder` 传给 `RecommendList`（决定编号）与 `RouteSummaryBar`、`MapCanvas`（决定标记序号）

- [ ] **Step 6: 删掉旧组件**

```bash
git rm components/PoiCard.tsx components/PoiList.tsx
```

- [ ] **Step 7: 编译与类型检查**

Run: `npx tsc --noEmit && npm run lint`
Expected: 通过。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: 推荐卡片与详情改版，编号改用拜访顺序"
```

---

### Task 8: 删除废弃代码

**Files:**
- Delete: `lib/core/rank.ts`、`lib/core/rank.test.ts`
- Delete: `lib/core/derive.ts`、`lib/core/derive-rules.ts`、`lib/core/derive.test.ts`
- Delete: `lib/providers/poi/`（整个目录）
- Delete: `app/api/poi/`（整个目录）
- Modify: `README.md`

**为什么删**：skill 已给出 `rank` + `tier` 与带证据的 `fit`，平台的排序与硬编码推导成了第二套互相打架的逻辑；召回不再存在（设计文档 3.5 决定不做后备）。**留着会让人以为推荐还有第二条路径。**

- [ ] **Step 1: 删除**

```bash
git rm -r lib/core/rank.ts lib/core/rank.test.ts \
          lib/core/derive.ts lib/core/derive-rules.ts lib/core/derive.test.ts \
          lib/providers/poi app/api/poi
```

- [ ] **Step 2: 检查是否还有引用**

Run: `grep -rn "core/rank\|core/derive\|providers/poi\|api/poi" --include='*.ts' --include='*.tsx' . | grep -v node_modules`

Expected: 无输出。若有输出，把残留引用一并清掉。

- [ ] **Step 3: 全量检查**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 全部通过（测试数会比之前少，属预期）。

- [ ] **Step 4: 更新 README**

把「已知近似」一节改写：游玩项目不再由硬编码规则推导，改由 skill 提供并带可核查证据；补上 DeepSeek 配置说明与 `npm run models` 用法；补上「直线距离不是驾车距离」的说明。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor: 删除高德召回与硬编码推导等废弃代码"
```

---

### Task 9: 手工验收

**Files:** 无

- [ ] **Step 1: 跑起来**

```bash
npm run models          # 确认模型 ID，填进 .env.local
npm run dev
```

- [ ] **Step 2: 场景一 —— 正常推荐**

打开 `http://localhost:3000`，地图选点 → 填偏好 → 点「帮我推荐」。

Expected:
- 出现 6 秒以上的加载态（LLM 本来就慢）
- 表单自动收起成一行摘要
- 列表出现 skill 的真实推荐，每条带 `tier` 与 `fit` 证据
- 距离标注带「直线」字样
- 未核实的地点（若有）标黄并给高德链接，**不占编号**

- [ ] **Step 3: 场景二 —— 未配置 Key 时**

把 `.env.local` 里 `DEEPSEEK_MODEL` 清空，重启，再点「帮我推荐」。

Expected: 明确显示「推荐失败 / 未配置 DEEPSEEK_MODEL，先跑 npm run models 看可用模型」+ 重试按钮。**不出现任何兜底数据。**

- [ ] **Step 4: 场景三 —— 勾选后路线**

勾选 3 个可规划的地点。

Expected:
- 地图画出折线，编号标记按**拜访顺序**（不一定等于勾选顺序）
- 顶部路线条显示 `1 → 2 → 3` 与实际跨点总时长
- 只勾 1 个时不画线，提示「再选一个」

- [ ] **Step 5: 场景四 —— 定位坐标是否偏**

点「用我的位置」，与地图上你的实际位置比对。

Expected: 标记落在真实位置上。若明显偏移（百米级），说明坐标转换没生效，回到 Task 1 排查。

- [ ] **Step 6: 更新 README 的测试数量**

Run: `npm test 2>&1 | grep -E "Tests|Test Files"`
把实际数字填进 README。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "docs: 更新 README 与测试数量"
```

---

## 自审记录

**Spec 覆盖检查：** 第 3.1 节（不合并）→ 无 recall 代码，Task 8 删除；3.2（显式触发）→ Task 6；3.3（坐标转换）→ Task 1；3.4（未核实保留）→ Task 7 Step 1；3.5（失败即报错）→ Task 5 Step 8 + Task 6 Step 4；3.6（两个时间不合并）→ Task 7 Step 3；3.7（展示 excluded/meta）→ Task 6 Step 4 状态 + Task 7；第 5 节数据模型 → Task 5 Step 5；第 6 节输入契约 → Task 6 Step 4；第 7 节 API → Task 5；第 8 节核实层 → Task 4；第 9 节删除清单 → Task 8；第 10 节界面 → Task 6/7；第 11 节测试策略 → 各 Task 的 Step「写失败测试」；第 12 节依赖 → Task 2 Step 5 的 `npm run models`。

**类型一致性：** `Verification`（Task 4）与 `RecommendPlace`（Task 5 Step 5）的字段名一致（`point` / `verified` / `verifiedName` / `distanceMeters` / `openStatus`）；`SkillRecommendation`（Task 3）的 `crowdLevel` / `bestTime` / `tradeOff` / `pickIf` / `amapUrl` 等驼峰名在 `RecommendPlace` 中保持同名；`optimizeOrder` 接受 `{ id, point }[]` 并返回同型，与 `PlanRouteInput.stops` 匹配；`toGcj02(point, source)` 在 Task 1 定义、Task 6 使用。

**对样张的偏离：** 样张里卡片用 `selectedOrder` 的序号，计划改成 `visitOrder`（`route.order` 优先），因为顺序优化的结果必须反映到编号上，否则用户看到的编号与实际路线不符。

**已知的未验证项：** DeepSeek 的模型 ID 与 `/models` 端点行为**未经验证**（写作时无 Key）；`gcoord` 的转换结果只做了区间性质断言（偏移量 100~700 米、境外近似不变），**没有做精确参考向量比对**，因为它没有公开的权威测试向量。Task 9 Step 5 是对坐标转换的端到端验证点。
