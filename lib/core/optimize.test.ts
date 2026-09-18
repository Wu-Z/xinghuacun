import { describe, expect, it } from 'vitest'
import type { LatLng } from './model'
import { optimizeOrder } from './optimize'

const ORIGIN: LatLng = { lng: 0, lat: 0 }

// 沿一条直线排列，最优拜访顺序必然是 s1 → s2 → s3 → s4
const s1 = { id: 's1', point: { lng: 1, lat: 0 } }
const s2 = { id: 's2', point: { lng: 2, lat: 0 } }
const s3 = { id: 's3', point: { lng: 3, lat: 0 } }
const s4 = { id: 's4', point: { lng: 4, lat: 0 } }

describe('optimizeOrder', () => {
  it('少于 2 个点原样返回', () => {
    expect(optimizeOrder(ORIGIN, [s1])).toEqual([s1])
    expect(optimizeOrder(ORIGIN, [])).toEqual([])
  })

  it('把折返的勾选顺序排成一条线', () => {
    const clicked = [s3, s1, s4, s2] // 勾选顺序：3,1,4,2
    expect(optimizeOrder(ORIGIN, clicked).map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4'])
  })

  it('结果包含全部输入且不重复', () => {
    const out = optimizeOrder(ORIGIN, [s3, s1, s4, s2])
    expect(out.map((s) => s.id).sort()).toEqual(['s1', 's2', 's3', 's4'])
  })

  it('同样输入永远同样输出', () => {
    const a = optimizeOrder(ORIGIN, [s3, s1, s4, s2]).map((s) => s.id)
    const b = optimizeOrder(ORIGIN, [s3, s1, s4, s2]).map((s) => s.id)
    expect(a).toEqual(b)
  })

  it('不修改入参数组', () => {
    const input = [s3, s1, s4, s2]
    const snapshot = JSON.stringify(input)
    optimizeOrder(ORIGIN, input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('原点不同，最优顺序也随之改变', () => {
    // 从最右边出发，最优顺序应当反过来
    const out = optimizeOrder({ lng: 5, lat: 0 }, [s1, s2, s3])
    expect(out.map((s) => s.id)).toEqual(['s3', 's2', 's1'])
  })

  it('接受可替换的距离函数 —— 将来换成真实行车矩阵不用改这里', () => {
    const from = { lng: 4, lat: 0 }
    const byHaversine = optimizeOrder(from, [s1, s2, s3]).map((s) => s.id)

    // 故意用一个和直线相反的距离函数：越近越"贵"
    const inverted = (a: LatLng, b: LatLng) => 10 - Math.abs(a.lng - b.lng)
    const byInverted = optimizeOrder(from, [s1, s2, s3], inverted).map((s) => s.id)

    // 断言的是「距离函数确实被用上了」，而不是我手算的最优解 ——
    // 手算 TSP 最优是件容易算错的事，那本来就是这个函数存在的意义
    expect(byInverted).not.toEqual(byHaversine)
    expect(byInverted.map((id) => id).sort()).toEqual(['s1', 's2', 's3'])
  })

  it('六个点（上限）也能算出精确最优', () => {
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
