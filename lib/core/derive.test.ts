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
