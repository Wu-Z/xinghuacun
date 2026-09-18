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
