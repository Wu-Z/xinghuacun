// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ViewSwitch from './ViewSwitch'

afterEach(cleanup)

describe('ViewSwitch', () => {
  it('当前视图是按下态，另一个不是', () => {
    render(<ViewSwitch view="list" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '列表' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '行程' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('点击把目标视图报出去', () => {
    const onChange = vi.fn()
    render(<ViewSwitch view="list" onChange={onChange} />)
    screen.getByRole('button', { name: '行程' }).click()
    expect(onChange).toHaveBeenCalledWith('timeline')
  })

  it('这组按钮有名字 —— 两个光秃秃的「列表 / 行程」在读屏里没有上下文', () => {
    render(<ViewSwitch view="list" onChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: '查看方式' })).toBeTruthy()
  })
})
