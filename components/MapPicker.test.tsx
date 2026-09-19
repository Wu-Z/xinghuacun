// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 高德 JS API 在 jsdom 里加载不起来，地图本身在这里测不了（属于「不测」那类） */
vi.mock('./MapCanvas', () => ({
  default: ({
    onPickLocation,
    pickedPoint,
  }: {
    onPickLocation: (p: { lng: number; lat: number }) => void
    pickedPoint?: { lng: number; lat: number } | null
  }) => (
    <button data-testid="map" onClick={() => onPickLocation({ lng: 118.2, lat: 24.6 })}>
      {pickedPoint ? '有标记' : '无标记'}
    </button>
  ),
}))

import MapPicker from './MapPicker'

afterEach(cleanup)

let calls: string[] = []
let response: { ok: boolean; status?: number; body: unknown } = { ok: true, body: { hits: [] } }

beforeEach(() => {
  calls = []
  response = { ok: true, body: { hits: [] } }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url))
      return new Response(JSON.stringify(response.body), {
        status: response.status ?? (response.ok ? 200 : 502),
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
})

const HIT = {
  name: '集美万达广场',
  address: '福建省厦门市集美区银江路 168 号',
  point: { lng: 118.097, lat: 24.573 },
  category: '购物中心',
  openStatus: 'open' as const,
}

function renderPicker(over: Partial<Parameters<typeof MapPicker>[0]> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()

  render(
    <MapPicker
      target="出发点"
      near={{ lng: 118.1, lat: 24.5 }}
      onConfirm={onConfirm}
      onClose={onClose}
      {...over}
    />,
  )

  return { onConfirm, onClose }
}

/** 输入关键词并等结果回来 */
async function search(text: string) {
  fireEvent.change(screen.getByLabelText('搜索出发点'), { target: { value: text } })
  await waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 2000 })
  await waitFor(() => expect(screen.queryByText(/正在搜/)).toBeNull(), { timeout: 2000 })
}

describe('MapPicker · 搜索', () => {
  it('搜完给结果列表，标题带上关键词与条数', async () => {
    response = { ok: true, body: { hits: [HIT] } }
    renderPicker()

    await search('集美 万达')

    expect(calls[0]).toContain('/api/place/search?')
    expect(calls[0]).toContain('q=%E9%9B%86%E7%BE%8E')
    // 搜索范围跟着 near 走，免得搜出外地的同名商场
    expect(calls[0]).toContain('lng=118.1')
    expect(screen.getByText('集美万达广场')).toBeTruthy()
    expect(screen.getByText(/银江路 168 号 · 购物中心/)).toBeTruthy()
  })

  it('不到点不发请求 —— 敲一个字打一次会把高德的秒级限流撞满', async () => {
    renderPicker()
    const input = screen.getByLabelText('搜索出发点')

    fireEvent.change(input, { target: { value: '集' } })
    fireEvent.change(input, { target: { value: '集美' } })
    fireEvent.change(input, { target: { value: '集美万' } })

    await waitFor(() => expect(calls.length).toBe(1), { timeout: 2000 })
  })

  it('搜不到时给出口，而不是留一个空列表', async () => {
    response = { ok: true, body: { hits: [] } }
    renderPicker()

    await search('不存在的地方')

    expect(screen.getByText(/没搜到/)).toBeTruthy()
    expect(screen.getByText(/直接在地图上点一下/)).toBeTruthy()
  })

  it('搜索失败要说出来 —— 静默会让人对着空列表发呆', async () => {
    response = { ok: false, body: { hits: [], reason: '高德接口返回失败：CUQPS' } }
    renderPicker()

    await search('集美')

    expect(screen.getByText(/CUQPS/)).toBeTruthy()
  })

  it('已打烊的 POI 照常返回但打标 —— 删掉等于替用户做决定', async () => {
    response = {
      ok: true,
      body: { hits: [HIT, { ...HIT, name: '老万达影城', openStatus: 'closed' }] },
    }
    renderPicker()

    await search('万达')

    expect(screen.getByText('老万达影城')).toBeTruthy()
    expect(screen.getByText('已打烊')).toBeTruthy()
  })
})

describe('MapPicker · 选中与确认', () => {
  it('选一条搜索结果 → 确认条给名字与地址 → 确认交出去 source=search', async () => {
    response = { ok: true, body: { hits: [HIT] } }
    const { onConfirm } = renderPicker()

    await search('万达')
    fireEvent.click(screen.getByText('集美万达广场'))

    // 结果列表收起来，确认条接管
    expect(screen.queryByText(/高德 POI 搜索/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '设为出发点' }))

    expect(onConfirm).toHaveBeenCalledWith(HIT.point, '集美万达广场', 'search')
  })

  it('点地图选出来的点标 source=map-pick，名字用「地图所选位置」', () => {
    const { onConfirm } = renderPicker()

    fireEvent.click(screen.getByTestId('map'))
    fireEvent.click(screen.getByRole('button', { name: '设为出发点' }))

    expect(onConfirm).toHaveBeenCalledWith({ lng: 118.2, lat: 24.6 }, '地图所选位置', 'map-pick')
  })

  it('选中后地图上出现标记，换个点又清掉', () => {
    renderPicker()

    expect(screen.getByTestId('map').textContent).toBe('无标记')
    fireEvent.click(screen.getByTestId('map'))
    expect(screen.getByTestId('map').textContent).toBe('有标记')

    fireEvent.click(screen.getByRole('button', { name: '换个点' }))
    expect(screen.getByTestId('map').textContent).toBe('无标记')
    expect(screen.queryByRole('button', { name: '设为出发点' })).toBeNull()
  })

  it('终点场景的确认按钮跟着说「设为终点」', () => {
    renderPicker({ target: '终点' })
    fireEvent.click(screen.getByTestId('map'))
    expect(screen.getByRole('button', { name: '设为终点' })).toBeTruthy()
  })

  it('没选点时不出现确认条 —— 没有可确认的东西', () => {
    renderPicker()
    expect(screen.queryByRole('button', { name: /设为/ })).toBeNull()
  })
})

describe('MapPicker · 关闭', () => {
  it('取消回调出去', () => {
    const { onClose } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalled()
  })
})
