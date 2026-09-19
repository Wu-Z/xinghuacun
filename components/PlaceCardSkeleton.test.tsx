// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PlaceCardSkeleton from './PlaceCardSkeleton'

afterEach(cleanup)

describe('PlaceCardSkeleton', () => {
  it('对读屏隐藏 —— 正在发生什么由旁边那条 role="status" 播报，不该听三遍', () => {
    const { container } = render(<PlaceCardSkeleton />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })

  it('骨架块在动：静止的占位跟没有占位一样，看不出它在等东西', () => {
    const { container } = render(<PlaceCardSkeleton />)
    expect(container.querySelectorAll('.anim-pulse').length).toBeGreaterThan(0)
  })
})
