/**
 * 「AI」的那个星芒标记。
 *
 * 用四角星而不是魔法棒或机器人：星芒是眼下大家共用的 AI 视觉语汇，
 * 一眼就能读懂「这里有个模型在干活」，不需要额外解释。
 * 一大一小两颗，比单个星星更像「生成」而不是「收藏」。
 */
export default function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M14.5 1 Q15.6 8.9 23.5 10 Q15.6 11.1 14.5 19 Q13.4 11.1 5.5 10 Q13.4 8.9 14.5 1 Z" />
      <path d="M4 15.5 Q4.5 19 8 19.5 Q4.5 20 4 23.5 Q3.5 20 0 19.5 Q3.5 19 4 15.5 Z" />
    </svg>
  )
}
