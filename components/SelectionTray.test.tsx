// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SelectionTray from './SelectionTray'

afterEach(cleanup)

type Props = Parameters<typeof SelectionTray>[0]

function renderTray(over: Partial<Props> = {}) {
  const props: Props = {
    selectedCount: 1,
    unit: '个地方',
    canFinalize: false,
    busy: false,
    onClear: vi.fn(),
    onView: vi.fn(),
    onFinalize: vi.fn(),
    ...over,
  }
  return { ...render(<SelectionTray {...props} />), props }
}

describe('SelectionTray', () => {
  it('一个都没勾时不出现 —— 它既没有信息也没有动作，白占一条底边', () => {
    const { container } = renderTray({ selectedCount: 0 })
    expect(container.textContent).toBe('')
  })

  it('勾了 1 个时只给清空，并说清还差几个才能规划路线', () => {
    renderTray({ selectedCount: 1 })
    expect(screen.getByText(/已选/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '清空' })).toBeTruthy()
    // 不够 2 个点算不出路线，这时候给「看行程」等于把人送进空页面
    expect(screen.queryByRole('button', { name: /看行程/ })).toBeNull()
    expect(screen.getByText(/再选 1 个就能规划路线/)).toBeTruthy()
  })

  it('勾满 2 个后给出「看行程」', () => {
    const { props } = renderTray({ selectedCount: 2 })
    screen.getByRole('button', { name: /看行程/ }).click()
    expect(props.onView).toHaveBeenCalled()
    expect(screen.queryByText(/再选/)).toBeNull()
  })

  it('细化之后单位跟着变：同一批东西的性质不再是「地方」而是「站点」', () => {
    renderTray({ selectedCount: 3, unit: '个站点' })
    expect(screen.getByText(/个站点/)).toBeTruthy()
    expect(screen.queryByText(/个地方/)).toBeNull()
  })

  it('可细化时才给细化入口，点了回调出去', () => {
    const { props } = renderTray({ selectedCount: 2, canFinalize: true })
    screen.getByRole('button', { name: /细化成站点/ }).click()
    expect(props.onFinalize).toHaveBeenCalled()
  })

  it('已经在行程页时不给「看行程」—— 点下去什么也不会发生', () => {
    renderTray({ selectedCount: 3, showViewButton: false })
    expect(screen.queryByRole('button', { name: /看行程/ })).toBeNull()
    expect(screen.getByRole('button', { name: '清空' })).toBeTruthy()
  })

  it('清空回调出去', () => {
    const { props } = renderTray({ selectedCount: 2 })
    screen.getByRole('button', { name: '清空' }).click()
    expect(props.onClear).toHaveBeenCalled()
  })
})
