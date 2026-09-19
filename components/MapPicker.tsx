'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toGcj02 } from '@/lib/core/coordinate'
import type { LatLng, OriginSource } from '@/lib/core/model'
import type { PlaceHit } from '@/lib/providers/place-search'
import MapCanvas from './MapCanvas'

type Props = {
  /** 在选什么。用在顶栏提示与确认按钮上（「出发点」/「终点」） */
  target: '出发点' | '终点'
  /** 限定搜索范围的中心（大概是出发点）。不给就不限城市 */
  near: LatLng | null
  /** 顺便在地图上标出来当参照的出发点（选终点时用得上：一眼看出远近） */
  origin?: LatLng | null
  /** 已选的当前值，重开时先显示出来 */
  initial?: { point: LatLng; label: string } | null
  /**
   * source 说明这个坐标**从哪来**：地图点的、搜到的、还是浏览器定位。
   * 调用方靠它决定要不要再补一次逆地理编码 —— 搜索与定位已经有名字了。
   */
  onConfirm: (point: LatLng, label: string, source: OriginSource) => void
  onClose: () => void
}

/** 输入停一下再搜。高德按秒限流，敲一个字打一次请求会自己把自己限住 */
const DEBOUNCE_MS = 320

/** 地图选点。首页的出发点与行程页的终点共用这一个 —— 两处是同一件事：选一个坐标出来 */
type Picked = { point: LatLng; name: string; address: string; source: OriginSource }

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-ink-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

export default function MapPicker({ target, near, origin, initial, onConfirm, onClose }: Props) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PlaceHit[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [picked, setPicked] = useState<Picked | null>(
    initial ? { point: initial.point, name: initial.label, address: '', source: 'map-pick' } : null,
  )

  const reqRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nearRef = useRef(near)
  useEffect(() => {
    nearRef.current = near
  }, [near])

  // 卸载时别让待发的那个定时器跑出来打请求
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const runSearch = useCallback(async (text: string) => {
    const id = ++reqRef.current

    const params = new URLSearchParams({ q: text })
    const center = nearRef.current
    if (center) {
      params.set('lng', String(center.lng))
      params.set('lat', String(center.lat))
    }

    try {
      const res = await fetch(`/api/place/search?${params.toString()}`)
      const data = (await res.json()) as { hits?: PlaceHit[]; reason?: string }
      if (id !== reqRef.current) return
      if (!res.ok) {
        setHits([])
        setSearchError(data.reason ?? '搜索失败')
        return
      }
      setHits(data.hits ?? [])
    } catch {
      // 不静默：搜索失败得让用户知道该改用地图点，而不是对着空列表发呆
      if (id === reqRef.current) {
        setHits([])
        setSearchError('搜索请求没发出去，可以直接在地图上点')
      }
    } finally {
      if (id === reqRef.current) {
        setSearching(false)
        setSearched(true)
      }
    }
  }, [])

  /*
   * 防抖放在**事件里**而不是 effect 里。
   *
   * 用 effect 监听 q 的写法要同步清状态（q 空了就清空结果），
   * 而那正是「在 effect 里同步改状态」——一敲键就多一轮级联渲染。
   * 搜索是被用户敲键盘触发的，本来就是事件，不是「与外部系统同步」。
   */
  const onQueryChange = (value: string) => {
    setQ(value)

    if (timerRef.current) clearTimeout(timerRef.current)
    const text = value.trim()

    if (!text) {
      setHits([])
      setSearched(false)
      setSearching(false)
      setSearchError(null)
      return
    }

    setSearching(true)
    setSearchError(null)
    timerRef.current = setTimeout(() => {
      void runSearch(text)
    }, DEBOUNCE_MS)
  }

  const locate = () => {
    if (!navigator.geolocation) {
      setSearchError('这个浏览器拿不到定位，直接在地图上选点吧')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        // 浏览器给的是 WGS-84，高德底图是 GCJ-02。不转就会偏 100~700 米
        const point = toGcj02({ lng: pos.coords.longitude, lat: pos.coords.latitude }, 'geolocation')
        setPicked({ point, name: '当前位置', address: '', source: 'geolocation' })
        onQueryChange('')
      },
      () => {
        setLocating(false)
        setSearchError('没拿到定位权限，直接在地图上选点吧')
      },
      { timeout: 5000, enableHighAccuracy: false },
    )
  }

  const choose = (hit: PlaceHit) => {
    setPicked({ point: hit.point, name: hit.name, address: hit.address, source: 'search' })
    // 选中即收起结果列表：地图上出现了标记，这时候列表挡着图反而是干扰
    onQueryChange('')
  }

  const listOpen = q.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-sm border border-line-2 px-3 transition-colors focus-within:border-jade md:h-10">
          <SearchIcon />
          <input
            value={q}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label={`搜索${target}`}
            placeholder={`搜一个${target}，或直接在地图上点`}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
          />
          {listOpen && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="shrink-0 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
            >
              清除
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-xs px-3 py-1.5 text-sm text-ink-3 transition-colors hover:bg-mist hover:text-ink"
        >
          取消
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <MapCanvas
          origin={origin ?? null}
          places={[]}
          visitOrder={[]}
          route={null}
          picking
          center={picked?.point ?? near}
          pickedPoint={picked?.point ?? null}
          pickingHint="在地图上点一下，或搜一个地点"
          onPickLocation={(point) => {
            // 手点地图就把搜索收起来：两者是同一个「选哪」的两个入口，
            // 同时开着会让人以为搜索结果还作数
            onQueryChange('')
            setPicked({ point, name: '地图所选位置', address: '', source: 'map-pick' })
          }}
        />

        {!listOpen && (
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="absolute left-3 top-3 flex h-9 items-center gap-1.5 rounded-sm border border-line-2 bg-surface px-3 text-[12.5px] text-ink shadow-2 transition-colors hover:border-ink-3 disabled:cursor-not-allowed disabled:text-ink-3"
          >
            {locating ? '定位中…' : '◉ 定位到我'}
          </button>
        )}

        {listOpen && (
          <div className="absolute inset-x-0 top-0 max-h-[72%] overflow-y-auto border-b border-line bg-surface shadow-3">
            <div className="border-b border-line px-4 py-2 text-[12px] text-ink-3">
              {searching
                ? `正在搜「${q.trim()}」…`
                : searchError
                  ? searchError
                  : `高德 POI 搜索「${q.trim()}」 · 返回 ${hits.length} 个结果`}
            </div>

            {!searching && hits.map((hit) => (
              <button
                key={`${hit.name}-${hit.point.lng}-${hit.point.lat}`}
                type="button"
                onClick={() => choose(hit)}
                className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-mist"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="min-w-0 truncate text-[13.5px] text-ink">{hit.name}</span>
                    {/* 「已打烊」确有其据（有营业时间且此刻在外面）。
                        「已停业」不标 —— 高德没有可靠的停业字段，标了就是编的 */}
                    {hit.openStatus === 'closed' && (
                      <span className="shrink-0 rounded-xs bg-amber-bg px-1.5 py-0.5 text-[11px] text-amber">
                        已打烊
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                    {[hit.address, hit.category].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))}

            {!searching && !searchError && searched && hits.length === 0 && (
              <div className="px-4 py-4 text-[12.5px] leading-[1.7] text-ink-2">
                没搜到「{q.trim()}」。换个说法再试，或者<b>直接在地图上点一下</b>。
              </div>
            )}

            {!searching && hits.length > 0 && (
              <p className="px-4 py-3 text-[11.5px] leading-[1.7] text-ink-3">
                顺序即高德返回的顺序，我们不做二次排序。选中即取该 POI 的坐标，
                它已经是高德坐标系（GCJ-02），不再转换。
              </p>
            )}
          </div>
        )}

        {picked && (
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5 shadow-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-ink">{picked.name}</div>
              {picked.address && (
                <div className="mt-0.5 truncate text-[12px] text-ink-3">
                  {picked.address} · 点地图可重新选
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="h-10 shrink-0 rounded-sm border border-line-2 bg-surface px-3 text-[13px] text-ink transition-colors hover:border-ink-3"
            >
              换个点
            </button>
            <button
              type="button"
              onClick={() => onConfirm(picked.point, picked.name, picked.source)}
              className="h-10 shrink-0 rounded-sm bg-jade px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-jade-deep"
            >
              设为{target}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
