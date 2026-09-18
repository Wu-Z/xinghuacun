import type { RecommendRequest } from '@/lib/core/model'

/**
 * 假 skill。
 *
 * **只替换「调 LLM 生成推荐」这一步**，产出的仍然是 skill 的原始 JSON 形状
 * （snake_case、没有坐标），后面的结构校验与高德核实走的是和真实 skill
 * 完全相同的路径。这样演示才是真的在验证契约，而不是绕过它。
 *
 * 刻意用真实地名，高德地理编码能查到，演示里能看到真实坐标与真实路线。
 * 因此演示时出发点要选在厦门集美一带。
 */

const INITIAL = {
  recommendations: [
    {
      rank: 1,
      tier: '首选',
      name: '集美学村',
      category: '历史街区 / 风景名胜',
      address: '厦门市集美区集美学村',
      // 复合地点：细化后会被拆成三个可导航的站点
      contains: ['龙舟池', '集美大社', '嘉庚建筑群'],
      fit: [
        {
          tag: '拍照',
          why: '龙舟池畔的南薰楼、道南楼为嘉庚建筑，红瓦飞檐与池面倒影是主要机位；大社为 800 年古村，红砖古厝、南洋侨楼、涂鸦墙集中',
        },
        { tag: '放松', why: '社区内多家老厝咖啡馆可久坐；免门票' },
      ],
      best_time: '15:00-18:00',
      cost: '免费',
      crowd_level: 'low',
      crowd_note: '大社为本地人生活区，公开攻略描述为「游客极少」',
      transit_hint: '地铁 1 号线「集美学村」站下车即到',
      trade_off: '社区内咖啡馆多在 18:00-19:00 打烊',
      pick_if: '想一次拍到建筑和巷弄两种片子，且需要一个能坐下来的地方',
      indoor_outdoor: 'outdoor',
      confidence: 'high',
      source: '演示数据（mock）',
      amap_url: 'https://uri.amap.com/search?keyword=%E9%9B%86%E7%BE%8E%E5%AD%A6%E6%9D%91&city=%E5%8E%A6%E9%97%A8',
    },
    {
      rank: 2,
      tier: '备选 · 最清净',
      name: '集美集影视文创园',
      category: '文创园区',
      address: '厦门市集美区银江路 132 号',
      fit: [{ tag: '拍照', why: '老雨具厂改造，纯白建筑群、工业管道与五彩墙绘，主打韩系工业风' }],
      best_time: '全天',
      cost: '免费进园',
      transit_hint: '与集美学村同片区',
      trade_off: '园区体量不大，纯拍照撑不满 3 小时',
      confidence: 'high',
      source: '演示数据（mock）',
      amap_url: 'https://uri.amap.com/search?keyword=%E9%9B%86%E7%BE%8E%E9%9B%86%E5%BD%B1%E8%A7%86%E6%96%87%E5%88%9B%E5%9B%AD',
    },
    {
      rank: 3,
      tier: '备选 · 最出片',
      name: '厦门园林博览苑',
      category: '园林 / 公园',
      address: '厦门市集美区集杏海堤中段',
      fit: [{ tag: '拍照', why: '海上园林，岛屿与桥相连，日落时分光线最好' }],
      best_time: '16:00-18:30',
      cost: '需门票',
      crowd_level: 'medium',
      crowd_note: '面积大，人流分散但周末较多',
      trade_off: '园区极大，半天只能逛一小部分',
      confidence: 'medium',
      source: '演示数据（mock）',
      amap_url: 'https://uri.amap.com/search?keyword=%E5%8E%A6%E9%97%A8%E5%9B%AD%E6%9E%97%E5%8D%9A%E8%A7%88%E8%8B%91',
    },
  ],
  excluded: [
    { name: '鼓浪屿', reason: '需轮渡且单程通勤吃掉大半时间预算' },
    { name: '厦门方特', reason: '主题乐园，需门票，与「拍照放松」诉求不符' },
  ],
  meta: {
    assumptions: ['按半天、步行可达筛选', '免费优先'],
    unverified: ['各地点实时人流', '园区临时维护或围挡'],
    disclaimer: '这是演示数据（RECOMMEND_PROVIDER=mock），不是 skill 真实输出。',
  },
}

/** 细化时，复合地点拆成这些子点 */
const CHILDREN: Record<
  string,
  { name: string; address: string; fit: { tag: string; why: string }[] }[]
> = {
  集美学村: [
    {
      name: '龙舟池',
      address: '厦门市集美区集美学村龙舟池',
      fit: [
        { tag: '拍照', why: '南薰楼、道南楼环池而立，红瓦飞檐与池面倒影是主要机位' },
        { tag: '放松', why: '环池步道平整，适合慢走' },
      ],
    },
    {
      name: '集美大社',
      address: '厦门市集美区集美大社',
      fit: [{ tag: '拍照', why: '800 年古村，红砖古厝、南洋侨楼、涂鸦墙集中' }],
    },
    {
      name: '嘉庚建筑群',
      address: '厦门市集美区集美学村嘉庚建筑群',
      fit: [{ tag: '拍照', why: '嘉庚风格建筑的集中展示，燕尾脊与西式屋身混搭' }],
    },
  ],
}

function finalize(req: RecommendRequest) {
  const selected = req.selected ?? []
  const places: Record<string, unknown>[] = []
  const excluded: { name: string; reason: string }[] = []

  for (const item of selected) {
    const children = CHILDREN[item.name]

    if (!children) {
      // 单一地点原样透传 —— 拆不出子点就不拆
      const src = INITIAL.recommendations.find((p) => p.name === item.name)
      places.push({ ...(src ?? {}), name: item.name, address: item.address, category: item.category })
      continue
    }

    children.forEach((child, i) => {
      places.push({
        rank: i + 1,
        tier: '细化',
        name: child.name,
        category: '景点',
        address: child.address,
        parent: item.name,
        fit: child.fit,
        cost: '免费',
        confidence: 'high',
        source: '演示数据（mock）',
        amap_url: `https://uri.amap.com/search?keyword=${encodeURIComponent(child.name)}&city=%E5%8E%A6%E9%97%A8`,
      })
    })

    // 细化时也会减 —— 让用户看到 removed 是怎么被解释的
    excluded.push({
      name: '集美学村·商业街',
      reason: '游客密集，与「想坐下来」冲突，未纳入站点',
    })
  }

  return {
    recommendations: places,
    excluded,
    meta: { ...INITIAL.meta, disclaimer: '演示数据（mock）· finalize' },
  }
}

function refine(req: RecommendRequest) {
  const followup = (req.followup ?? '').trim()
  const wantsFood = /吃|餐|饭|咖啡/.test(followup)
  const focusName = req.focus?.name

  const added = wantsFood
    ? [
        {
          rank: 99,
          tier: '追问新增',
          name: '集美大社沙茶面',
          category: '餐饮',
          address: '厦门市集美区集美大社',
          fit: [{ tag: '吃喝', why: '本地老店，沙茶面与土笋冻是招牌，适合中途坐下补给' }],
          best_time: '11:00-14:00 / 17:00-20:00',
          cost: '人均 25 元',
          transit_hint: focusName ? `步行至 ${focusName} 约 10 分钟` : '位于大社村内',
          confidence: 'medium',
          source: '演示数据（mock）',
          amap_url: 'https://uri.amap.com/search?keyword=%E9%9B%86%E7%BE%8E%E5%A4%A7%E7%A4%BE&city=%E5%8E%A6%E9%97%A8',
        },
      ]
    : [
        {
          rank: 99,
          tier: '追问新增',
          name: '集美塔',
          category: '观景',
          address: '厦门市集美区集美市民公园',
          fit: [{ tag: '观光', why: '登塔可俯瞰集美全景，作为动线中段的停留点很合适' }],
          best_time: '09:00-11:30 / 15:00-17:00',
          cost: '免费',
          confidence: 'high',
          source: '演示数据（mock）',
          amap_url: 'https://uri.amap.com/search?keyword=%E9%9B%86%E7%BE%8E%E5%A1%94&city=%E5%8E%A6%E9%97%A8',
        },
      ]

  return {
    answer: wantsFood
      ? `在${focusName ?? '这一带'}周边找到一处能坐下吃饭的地方，已加入列表。`
      : '按你说的补了一个适合中途观光的点，已加入列表。',
    added,
    removed: [
      {
        name: '厦门园林博览苑',
        reason: '不在集美区核心动线上，与「半天」冲突，已从列表移除',
      },
    ],
  }
}

/** 返回的仍然是 skill 的原始 JSON 形状，由调用方统一校验与核实 */
export async function mockSkillOutput(req: RecommendRequest): Promise<unknown> {
  // 留一点延迟，让加载态在演示里真的看得见
  await new Promise((r) => setTimeout(r, 900))

  if (req.task === 'refine') return refine(req)
  if (req.task === 'finalize') return finalize(req)
  return INITIAL
}

/**
 * 流式版的假 skill：把同一份 JSON 切成小块逐段吐出来，
 * 并模拟推理阶段。这样不接真实 Key 也能验证流式链路与增量渲染。
 */
export async function* mockSkillStream(
  req: RecommendRequest,
): AsyncGenerator<{ type: 'reasoning' } | { type: 'content'; text: string } | { type: 'done' }> {
  await new Promise((r) => setTimeout(r, 400))
  yield { type: 'reasoning' }
  await new Promise((r) => setTimeout(r, 700))

  const json = JSON.stringify(req.task === 'finalize' ? finalize(req) : INITIAL)

  // 按 60 字切块：足以跨越对象边界，能真实验证增量提取
  const CHUNK = 60
  for (let i = 0; i < json.length; i += CHUNK) {
    yield { type: 'content', text: json.slice(i, i + CHUNK) }
    await new Promise((r) => setTimeout(r, 40))
  }

  yield { type: 'done' }
}
