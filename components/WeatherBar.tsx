'use client'

import { describeTonight, splitWeather, type Weather } from '@/lib/core/weather'

type Props = {
  weather: Weather | null
  className?: string
}

/**
 * 天气图标。
 *
 * 图标只画「认得出的差别」：雨按强度加线的条数，雷多一道闪电。
 * 数据源说了但归类不了的天气（unknown）不画 —— 画错比不画糟。
 */
export function WeatherGlyph({ condition, className = 'h-4 w-4' }: { condition: Weather['condition']; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {condition === 'unknown' ? (
        <circle cx="12" cy="12" r="7" strokeDasharray="3 3" />
      ) : (
        <>
          {condition === 'sunny' && (
            <>
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" />
            </>
          )}

          {(condition === 'cloudy' || condition === 'overcast' || condition === 'fog') && (
            <>
              <path d="M6.5 15.5h10a3 3 0 10-.9-5.86A4.4 4.4 0 006.5 15.5z" />
              {condition === 'fog' ? (
                <path d="M8 19h8M9.5 21.5h5" />
              ) : (
                condition === 'cloudy' && <path d="M17.4 6.2a3.4 3.4 0 014.3 4.3" />
              )}
            </>
          )}

          {(condition === 'shower' || condition === 'rain' || condition === 'storm' || condition === 'snow') && (
            <>
              <path d="M6.8 13h9.4a2.9 2.9 0 10-.9-5.66A4.3 4.3 0 006.8 13z" />
              {condition === 'storm' ? (
                <path d="M12.4 15.4l-2.2 3.4h2.6l-1.8 3" />
              ) : condition === 'snow' ? (
                <path d="M9 16.5v4M7.7 17.4l2.6 1.6M12.9 19l-2.6 1.6M14.5 16.5v4M13.2 17.4l2.6 1.6M18.4 19l-2.6 1.6" />
              ) : (
                <>
                  <path d="M9 15.6l-1 3.6" />
                  <path d="M13.4 15.6l-1 3.6" />
                  {condition === 'rain' && <path d="M17.8 15.6l-1 3.6" />}
                </>
              )}
            </>
          )}
        </>
      )}
    </svg>
  )
}

/** 报时里的日期前一天情景：「2026-09-19 09:00:00」→「09:00」 */
function updateLabel(reportTime: string): string | null {
  const m = reportTime.match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : null
}

/**
 * 首页右上角的天气：「外面现在是什么天」。
 *
 * 它为什么在这个位置：**它不是对某个输入的回答，而是这一页的环境**。
 * 一进首页定位就拿到了，早于用户做出任何选择；原来钉在输入卡的出发点下面，
 * 等于「不选出发点就没有天气」—— 而出门这件事里，天气和「去哪」本来就是并列的两条信息。
 *
 * 排两行（温度/天气 在上，风与出处 在下）是因为右上角宽度有限，
 * 且「28° 晴」要能一眼扫到，不该和后缀挤在一行里分掉注意力。
 *
 * 拿不到天气就**整个不渲染**（weather 为 null）：不留空白、不给「暂无数据」。
 * 天气失败和推荐失败不是一回事，后者要拦住用户，前者不值得占用注意力。
 */
export default function WeatherBar({ weather, className = '' }: Props) {
  if (!weather) return null

  const at = updateLabel(weather.reportTime)
  const tonight = describeTonight(weather)
  const { head, tail } = splitWeather(weather)
  const hasSub = Boolean(tail || tonight || at)

  return (
    <div className={`flex shrink-0 flex-col items-end gap-1 text-right ${className}`}>
      {/* 图标跟随父级颜色（sky-ink）：天暗则白，天不那么暗也仍是它该有的分量 */}
      <div className="sky-ink flex items-center gap-1.5">
        <WeatherGlyph condition={weather.condition} className="h-[15px] w-[15px]" />
        <span className="tnum text-[13.5px] font-medium">{head}</span>
      </div>

      {hasSub && (
        <div className="sky-ink-3 text-[11.5px] leading-relaxed">
          {tail && <span className="tnum">{tail}</span>}
          {tail && (tonight || at) && ' · '}
          {tonight && <span>{tonight}</span>}
          {tonight && at && ' · '}
          {at && (
            // 预报一天只更新三次。不标更新时间，用户会以为它是实时的 ——
            // 这是它自己的不确定性，和推荐的不确定性一样需要交代出处
            <span>
              更新于 <time className="tnum">{at}</time>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
