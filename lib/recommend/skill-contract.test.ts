/**
 * 把 skill 的文档与样例，喂给平台自己的解析器。
 *
 * 为什么不用 Python 近似：字段名、必填性、tag 唯一、amap_url 白名单
 * 这些规则散在 `lib/recommend/schema.ts` 与 `lib/core/safe-url.ts` 里，
 * 手写一份「差不多的规则」只会验证到我自己的理解，而不是真实契约。
 *
 * 样例目录默认指向桌面测试包，不存在时跳过，不污染 npm test。
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSkillOutput } from '@/lib/recommend/schema'
import { isSafeAmapUrl } from '@/lib/core/safe-url'
import { buildUserMessage } from '@/lib/recommend/index'
import type { RecommendRequest } from '@/lib/core/model'

const SKILL_DIR =
  process.env.SKILL_DIR || '/Users/wuzebin/.workbuddy/skills/nearby-place-recommend'
const SAMPLE_DIR =
  process.env.SKILL_SAMPLE_DIR || '/Users/wuzebin/Desktop/测试/skills/nearby-place-recommend'
/** 平台实际加载的那份单文件提示词，默认取测试包里的草稿 */
const PROMPT_FILE = process.env.PROMPT_FILE || join(SAMPLE_DIR, 'prompt-draft.md')

type Block = { file: string; index: number; json: string; before: string; lang: string }

function collect(): Block[] {
  const files: string[] = [
    join(SKILL_DIR, 'SKILL.md'),
    join(SKILL_DIR, 'references/output-schema.md'),
    join(SKILL_DIR, 'references/task-examples.md'),
  ]
  if (existsSync(SAMPLE_DIR)) {
    for (const name of readdirSync(SAMPLE_DIR).sort()) {
      if (name.endsWith('.md') && name !== 'task-contract.md') files.push(join(SAMPLE_DIR, name))
    }
  }

  if (existsSync(PROMPT_FILE)) files.push(PROMPT_FILE)

  const out: Block[] = []
  for (const file of files) {
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    const re = /```(jsonc?)\n([\s\S]*?)\n```/g
    let m: RegExpExecArray | null
    let i = 0
    while ((m = re.exec(text))) {
      i += 1
      out.push({
        file,
        index: i,
        json: m[2],
        before: text.slice(Math.max(0, m.index - 320), m.index),
        lang: m[1],
      })
    }
  }
  return out
}

/**
 * 文档里刻意写的反例，预期失败。
 *
 * 判据不能只看「块前面的 320 字」——反例与正确示例常常紧挨着写，
 * 那个窗口会跨到相邻块，把跟在反例后面的正面例子一起误判。
 * 实测就撞到过：在某块标题里写了「反例」二字，紧跟其后的正确输出块
 * 立刻被判成反例、测试报红，最后只能改文档措辞绕开它。
 * **判据脆弱到反过来限制文档怎么写，就该修判据而不是改措辞。**
 *
 * 两条更紧的判据：块内自己有 ❌ / ✗ 标注，或紧邻的那一行写明了「反例 / 错误」。
 */
function isNegative(b: Block): boolean {
  if (/❌|✗/.test(b.json)) return true
  const lines = b.before.trimEnd().split('\n')
  const lastLine = lines[lines.length - 1] ?? ''
  return /反例|错误|不要这样|会被判失败/.test(lastLine)
}

const blocks = collect()

describe('skill 文档与样例 ⇄ 平台解析器', () => {
  it('每个输出块都应通过 parseSkillOutput（除文档里标注的反例）', () => {
    const failures: string[] = []
    const report: string[] = []

    for (const b of blocks) {
      const where = `${b.file.split('/').pop()} 块${b.index}`
      let parsed: unknown
      let fragment = false
      try {
        parsed = JSON.parse(b.json)
      } catch {
        // jsonc 是文档用的带注释片段（正反例对照），不是输出契约，不参与解析
        if (b.lang === 'jsonc') {
          report.push(`${where} 跳过（jsonc 片段）`)
          continue
        }
        try {
          parsed = JSON.parse(`{${b.json}}`)
          fragment = true
        } catch (e) {
          failures.push(`${where} 不是合法 JSON：${(e as Error).message}`)
          continue
        }
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        report.push(`${where} 跳过（非对象）`)
        continue
      }
      const obj = parsed as Record<string, unknown>
      const negative = isNegative(b)

      if (Array.isArray(obj.recommendations)) {
        const r = parseSkillOutput(obj)
        const kind = obj.recommendations.some(
          (x) => x && typeof x === 'object' && 'parent' in (x as object),
        )
          ? 'finalize'
          : 'initial'
        if (negative) {
          if (r.ok) failures.push(`${where} 标注为反例，却通过了校验`)
          else report.push(`${where} [${kind}] 反例如期失败：${r.problems[0]}`)
        } else if (!r.ok) {
          failures.push(`${where} [${kind}] 期望通过，实际失败：${r.problems.join(' / ')}`)
        } else {
          const ranks = r.value.recommendations.map((p) => p.rank)
          const names = r.value.recommendations.map((p) => p.name)
          const dupName = names.filter((n, i) => names.indexOf(n) !== i)
          if (dupName.length) failures.push(`${where} 推荐内重名：${dupName.join('、')}`)
          if (new Set(ranks).size !== ranks.length) {
            failures.push(`${where} rank 重复：${ranks.join(',')}`)
          }
          report.push(
            `${where} [${kind}] ✅ ${r.value.recommendations.length} 条` +
              `，rank=[${ranks.join(',')}]，excluded ${r.value.excluded.length} 条`,
          )
        }
        continue
      }

      if (typeof obj.answer === 'string') {
        // 与 index.ts 的 parseRefineOutput 同路径
        const problems: string[] = []
        if (!Array.isArray(obj.added)) problems.push('缺少 added 数组')
        if (!Array.isArray(obj.removed)) problems.push('缺少 removed 数组')
        if (!obj.answer.trim()) problems.push('answer 为空')
        const added = Array.isArray(obj.added) ? (obj.added as unknown[]) : []
        const asRec = parseSkillOutput({ recommendations: added, excluded: [], meta: {} })
        if (!asRec.ok && added.length > 0) problems.push(`added 未过推荐校验：${asRec.problems[0]}`)
        for (const [i, item] of (obj.removed as unknown[]).entries()) {
          const rec = item as Record<string, unknown>
          if (!String(rec?.name ?? '').trim()) problems.push(`removed#${i + 1} 缺 name`)
          if (!String(rec?.reason ?? '').trim()) problems.push(`removed#${i + 1} 缺 reason`)
        }
        if (negative) {
          if (problems.length === 0) failures.push(`${where} 标注为反例，却通过了校验`)
          else report.push(`${where} [refine] 反例如期失败：${problems[0]}`)
        } else if (problems.length) {
          failures.push(`${where} [refine] ${problems.join(' / ')}`)
        } else {
          report.push(
            `${where} [refine] ✅ added ${added.length} 条，removed ${(obj.removed as unknown[]).length} 条`,
          )
        }
        continue
      }

      report.push(`${where} 跳过（${fragment ? '片段' : '非输出契约'}）`)
    }

    console.log(`\n${report.join('\n')}\n`)
    expect(failures).toEqual([])
  })

  it('输出示例里不得出现省略占位键', () => {
    // 示例会原样进系统提示词。用 `"...": "其余字段同上"` 省略字段，
    // 模型有相当概率照抄这个键，产出缺 amap_url / fit 的条目 → 平台判 ok:false。
    const bad: string[] = []
    for (const b of blocks) {
      if (isNegative(b)) continue
      const hits = b.json.match(/"(\.{2,}|其余字段[^"]*|同上[^"]*|省略[^"]*)"\s*:/g)
      if (hits) bad.push(`${b.file.split('/').pop()} 块${b.index}: ${hits.join(' , ')}`)
    }
    if (bad.length) console.log(`\n发现占位键：\n${bad.join('\n')}\n`)
    expect(bad).toEqual([])
  })

  it('全文出现的 amap 链接都必须是 https + 高德域名', () => {
    const bad: string[] = []
    const files = new Set(blocks.map((b) => b.file))
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const urls = text.match(/https?:\/\/[^\s"'`)<>（）]*amap[^\s"'`)<>（）]*/g) ?? []
      for (const u of urls) {
        const clean = u.replace(/[.,;、）)]+$/, '')
        if (!isSafeAmapUrl(clean)) bad.push(`${file.split('/').pop()}: ${clean}`)
      }
    }
    if (bad.length) console.log(`\n不合规链接：\n${bad.join('\n')}\n`)
    expect(bad).toEqual([])
  })

  it('每条推荐都带 &city= 参数（否则会搜到别的城市）', () => {
    const bad: string[] = []
    for (const b of blocks) {
      for (const m of b.json.matchAll(/"amap_url"\s*:\s*"([^"]+)"/g)) {
        if (!m[1].includes('city=')) bad.push(`${b.file.split('/').pop()} 块${b.index}: ${m[1]}`)
      }
    }
    if (bad.length) console.log(`\n缺 city= 的链接：\n${bad.join('\n')}\n`)
    expect(bad).toEqual([])
  })
})

/**
 * 输入侧的契约。skill 是按行 `键：值` 解析的：
 * 平台多下发一个 skill 不认识的键、或少下发一个它依赖的键，任务就会被读错。
 */
describe('输入契约（buildUserMessage）', () => {
  const PLACE = { label: '福建省厦门市集美区集美学村', city: '厦门市' }

  const base: RecommendRequest = {
    task: 'initial',
    origin: { point: { lng: 118.097, lat: 24.573 } },
    destination: { mode: 'nearby', requested: null },
    preferences: {
      intents: ['拍照', '放松'],
      timeBudget: '3 小时',
      travelMode: ['打车', '地铁'],
      companions: 2,
      crowdTolerance: 'low',
      rawRequest: '',
      destination: '',
    },
  }

  const previous = [
    { name: '龙舟池', tier: '首选', category: '景点' },
    { name: '集美大社', tier: '备选', category: '景点' },
  ]

  const keys = (msg: string) => msg.split('\n').map((l) => l.split('：')[0])
  const BASE_KEYS = [
    '任务',
    '位置',
    '坐标',
    '目的地',
    '想干什么',
    '能花多久',
    '怎么去',
    '同行人',
    '拥挤容忍度',
  ]

  it('initial：九个基础键', () => {
    expect(keys(buildUserMessage(base, PLACE))).toEqual(BASE_KEYS)
  })

  it('用户原话非空时才追加', () => {
    const withRaw = buildUserMessage(
      { ...base, preferences: { ...base.preferences, rawRequest: '想找能坐着喝咖啡的老街' } },
      PLACE,
    )
    expect(keys(withRaw)).toEqual([...BASE_KEYS, '用户原话'])
    expect(keys(buildUserMessage(base, PLACE))).not.toContain('用户原话')
  })

  it('refine 整批：追问范围 + 追问 + 当前列表', () => {
    const msg = buildUserMessage(
      { ...base, task: 'refine', focus: null, previous, followup: '增加点能观光的' },
      PLACE,
    )
    expect(keys(msg)).toEqual([...BASE_KEYS, '追问范围', '追问', '当前列表'])
    expect(msg).toContain('追问范围：整批')
  })

  it('refine 单点：带类别与地址，且同样下发当前列表', () => {
    // 单点追问也下发 previous —— 这是调用方的真实形态（app/plan/page.tsx）。
    // skill 靠它判断 added 是否重复了已有地点，包括复合地点括号里的子点。
    const msg = buildUserMessage(
      {
        ...base,
        task: 'refine',
        focus: { name: '集美大社', address: '厦门市集美区集美大社', category: '景点' },
        previous,
        followup: '我想在这吃点东西',
      },
      PLACE,
    )
    expect(msg).toContain('追问范围：单个地点「集美大社」（景点，厦门市集美区集美大社）')
    expect(msg).toContain('当前列表：')
  })

  it('finalize：追加选中的地点，含复合地点的子点', () => {
    const msg = buildUserMessage(
      {
        ...base,
        task: 'finalize',
        selected: [
          { name: '集美学村', address: '厦门市集美区', category: '历史街区', contains: ['龙舟池', '集美大社'] },
          { name: '厦门园林博览苑', address: '厦门市集美区', category: '园林' },
        ],
      },
      PLACE,
    )
    expect(keys(msg)).toEqual([...BASE_KEYS, '选中的地点'])
    expect(msg).toContain('集美学村（含 龙舟池、集美大社）')
  })
})
