// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Itinerary } from '@/lib/core/itinerary'
import { buildShareCard } from '@/lib/core/share-card'
import type { RecommendPlace } from '@/lib/core/model'

/**
 * Canvas 在 jsdom 里没有实现，导出这条路径单独挡掉 ——
 * 它属于「不测」那类（真实绘制靠手工验收），这里测的是浮层对它的
 * 成功与失败**都有反应**：失败必须说出来，不许变成一个点了没反应的按钮。
 */
const exportRef = { fn: vi.fn() }
vi.mock('./share-card-canvas', () => ({
  exportShareCardPng: (...args: unknown[]) => exportRef.fn(...args),
}))

import ShareCardDialog from './ShareCardDialog'

afterEach(cleanup)

beforeEach(() => {
  exportRef.fn = vi.fn()
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
})

function itinerary(): Itinerary {
  return {
    stops: [
      { kind: 'start', name: '当前位置', point: { lng: 0, lat: 0 }, stopId: null },
      { kind: 'stop', name: '龙舟池畔', point: { lng: 1, lat: 1 }, stopId: '龙舟池畔' },
      { kind: 'stop', name: '集美大社', point: { lng: 2, lat: 2 }, stopId: '集美大社' },
    ],
    legs: [
      { fromName: '当前位置', toName: '龙舟池畔', mode: 'walking', durationSeconds: 480, distanceMeters: 600, degraded: false },
      { fromName: '龙舟池畔', toName: '集美大社', mode: 'walking', durationSeconds: 600, distanceMeters: 900, degraded: false },
    ],
    totalTravelMinutes: 18,
    totalDistanceMeters: 1500,
    hasDegradedLeg: false,
  }
}

function place(name: string, why: string): RecommendPlace {
  return {
    rank: 1,
    tier: '首选',
    name,
    category: '老街区',
    address: '厦门市集美区',
    fit: [{ tag: '人少', why }],
    amapUrl: '',
    point: { lng: 1, lat: 1 },
    verified: true,
  }
}

function renderDialog(over: { title?: string; when?: string | null } = {}) {
  const onChangeTitle = vi.fn()
  const onChangeWhen = vi.fn()
  const onClose = vi.fn()

  const card = buildShareCard({
    itinerary: itinerary(),
    places: [place('龙舟池畔', '午后人少 · 石栏可久坐'), place('集美大社', '骑楼长廊有茶配摊')],
    title: over.title ?? '学村半日闲走',
    when: over.when ?? null,
  })

  render(
    <ShareCardDialog
      card={card}
      contextLabel="厦门 · 集美 · 今天 · 26° 晴"
      onChangeTitle={onChangeTitle}
      onChangeWhen={onChangeWhen}
      onClose={onClose}
    />,
  )

  return { onChangeTitle, onChangeWhen, onClose, card }
}

describe('ShareCardDialog · 卡面', () => {
  it('站点按编号铺开，站间写怎么过来', () => {
    renderDialog()

    // 名字在卡面那个输入框里（它本身就是可编辑的）
    expect((screen.getAllByLabelText('卡片名称')[0] as HTMLInputElement).value).toBe('学村半日闲走')
    expect(screen.getByText('龙舟池畔')).toBeTruthy()
    expect(screen.getByText('集美大社')).toBeTruthy()
    expect(screen.getByText(/步行 10 分钟/)).toBeTruthy()
    // 卡面上不给出发点坐标，也不出现「当前位置」这一站
    expect(screen.queryByText('当前位置')).toBeNull()
  })

  it('核实口径那行固定跟着卡走', () => {
    renderDialog()
    expect(screen.getByText('地点经高德核实 · 距离为直线口径')).toBeTruthy()
  })

  it('没写出行时间时，卡上就没有那一行', () => {
    renderDialog({ when: null })
    expect(screen.queryByText(/^出行时间 · /)).toBeNull()

    cleanup()
    renderDialog({ when: '本周六 14:00' })
    expect(screen.getByText('出行时间 · 本周六 14:00')).toBeTruthy()
  })
})

describe('ShareCardDialog · 改名与出行时间', () => {
  it('卡上的标题直接可改，改什么回调什么', () => {
    const { onChangeTitle } = renderDialog()
    // 卡面那个是真的能点的（面板里还有一个同步的输入框）
    const [faceInput] = screen.getAllByLabelText('卡片名称')

    fireEvent.change(faceInput, { target: { value: '周六集美闲走' } })
    expect(onChangeTitle).toHaveBeenCalledWith('周六集美闲走')
  })

  it('默认「不写」是选中的 —— 卡上多一行时刻必须是用户自己要的', () => {
    renderDialog({ when: null })
    expect(screen.getByRole('button', { name: '不写' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('选一个预设就把那句话交出去', () => {
    const { onChangeWhen } = renderDialog({ when: null })
    fireEvent.click(screen.getByRole('button', { name: '今天下午' }))
    expect(onChangeWhen).toHaveBeenCalledWith('今天下午')
  })

  it('自定义输入原样交出去，清空则回到不写', () => {
    const { onChangeWhen } = renderDialog({ when: null })
    fireEvent.click(screen.getByRole('button', { name: '自定义…' }))

    const input = screen.getByLabelText('自定义出行时间')
    fireEvent.change(input, { target: { value: '周六 14:00' } })
    expect(onChangeWhen).toHaveBeenCalledWith('周六 14:00')

    fireEvent.change(input, { target: { value: '  ' } })
    expect(onChangeWhen).toHaveBeenLastCalledWith(null)
  })
})

describe('ShareCardDialog · 导出', () => {
  it('导出成功后说一声存哪了', async () => {
    exportRef.fn.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: '保存图片' }))
    await waitFor(() => expect(screen.getByText(/图片已保存到下载目录/)).toBeTruthy())
  })

  it('导出失败必须说出来 —— 点了没反应比报错更糟', async () => {
    exportRef.fn.mockRejectedValue(new Error('这台设备拿不到画布'))
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: '保存图片' }))
    await waitFor(() => expect(screen.getByText(/导出失败.*拿不到画布/)).toBeTruthy())
  })

  it('导出中按钮说「正在导出」并禁用，避免连点导出两次', async () => {
    let release: (b: Blob) => void = () => undefined
    exportRef.fn.mockReturnValue(new Promise<Blob>((resolve) => (release = resolve)))
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: '保存图片' }))
    const busy = await screen.findByRole('button', { name: '正在导出…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)

    release(new Blob(['x'], { type: 'image/png' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存图片' })).toBeTruthy())
  })
})

describe('ShareCardDialog · 关闭', () => {
  it('点关闭回调出去', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('按 Esc 也能关 —— 浮层里的惯例', () => {
    const { onClose } = renderDialog()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
