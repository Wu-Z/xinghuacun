// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Route } from '@/lib/core/model'
import RouteSummaryBar from './RouteSummaryBar'

afterEach(cleanup)

function route(over: Partial<Route> = {}): Route {
  return {
    order: ['公园A', '博物馆B'],
    legs: [
      {
        fromIndex: -1,
        toIndex: 0,
        mode: 'walking',
        durationSeconds: 600,
        distanceMeters: 700,
        polyline: [],
      },
      {
        fromIndex: 0,
        toIndex: 1,
        mode: 'transit',
        durationSeconds: 1800,
        distanceMeters: 8000,
        polyline: [],
      },
    ],
    totalDurationSeconds: 2400,
    totalDistanceMeters: 8700,
    polyline: [],
    ...over,
  }
}

const ORDER = ['公园A', '博物馆B']

describe('RouteSummaryBar', () => {
  it('选中不足 2 个时不出现 —— 没什么可排的', () => {
    const { container } = render(<RouteSummaryBar visitOrder={['公园A']} route={null} />)
    expect(container.textContent).toBe('')
  })

  it('路线还没回来时不替它担保「已按最短路径重排」', () => {
    // 这时候几个数字只是勾选顺序，说成「已重排」是把没算过的事说成算过了
    render(<RouteSummaryBar visitOrder={ORDER} route={null} />)

    expect(screen.getByText('公园A → 博物馆B')).toBeTruthy()
    expect(screen.queryByText(/拜访顺序/)).toBeNull()
  })

  it('混用方式时标签说全，不挑一个代表', () => {
    // 出行方式逐段定之后，一条路线可能一半走路一半坐地铁。
    // 这里只写一种，会和用户在地图上、时间轴上看到的对不上
    render(<RouteSummaryBar visitOrder={ORDER} route={route()} />)

    expect(screen.getByText('步行 + 公交/地铁')).toBeTruthy()
    expect(screen.getByText('40 分钟')).toBeTruthy()
    expect(screen.getByText('8.7 公里')).toBeTruthy()
    expect(screen.getByText('2 站')).toBeTruthy()
  })

  it('单一方式时不啰嗦，就写那一种', () => {
    const driving = route({
      legs: route().legs.map((l) => ({ ...l, mode: 'driving' as const })),
    })
    render(<RouteSummaryBar visitOrder={ORDER} route={driving} />)

    expect(screen.getByText('驾车')).toBeTruthy()
  })

  it('有路段没规划出来时不给汇总数字，改说实情', () => {
    // 上一轮就是这样把限流失败伪装成了「0 分钟 0.0 公里」的一条路线
    const degraded = route({
      legs: [{ ...route().legs[0], degraded: true }, route().legs[1]],
    })
    render(<RouteSummaryBar visitOrder={ORDER} route={degraded} />)

    expect(screen.getByText(/有 1 段没规划出来/)).toBeTruthy()
    expect(screen.queryByText('2 站')).toBeNull()
    expect(screen.queryByText('40 分钟')).toBeNull()
  })
})
