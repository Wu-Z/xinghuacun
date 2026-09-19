'use client'

/**
 * 还没到的卡片的占位。
 *
 * 首屏可能等二十秒，只给一行文案的话，界面看起来跟卡死没区别；
 * 先把「卡片要落在这里」的位置画出来，用户就知道这块地方马上会有东西。
 *
 * aria-hidden：它是纯视觉占位，正在发生什么由旁边那条 role="status" 播报，
 * 读屏用户不需要听三遍「有个骨架在闪」。
 */
export default function PlaceCardSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-4" aria-hidden>
      <div className="anim-pulse mt-0.5 h-7 w-7 shrink-0 rounded-full bg-mist-2" />
      <div className="min-w-0 flex-1">
        <div className="anim-pulse h-4 w-[58%] rounded-xs bg-mist-2" />
        <div className="anim-pulse mt-2 h-3 w-[34%] rounded-xs bg-mist-2" />
        <div className="anim-pulse mt-2.5 h-3 w-[82%] rounded-xs bg-mist-2" />
      </div>
    </div>
  )
}
