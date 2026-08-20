// 新星 Logo：四芒星 + 轨道环（寓意 agent loop：思考→行动闭环）
// 纯 SVG + CSS 动画，零依赖；animated 时轨道光点绕行、星芒呼吸
// 品牌配色：紫蓝渐变星体 + 星芒金核心
import { cn } from '../lib/utils'

export default function StarLogo({ size = 32, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  const gid = `nova-star-${size}-${animated ? 'a' : 's'}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('flex-none', className)} aria-label="Nova">
      <defs>
        <linearGradient id={`${gid}-star`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b7bff" />
          <stop offset="100%" stopColor="#4d6bfe" />
        </linearGradient>
        <radialGradient id={`${gid}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 背景微光（星芒金，极淡） */}
      <circle cx="32" cy="32" r="26" fill={`url(#${gid}-glow)`} opacity="0.35" />

      {/* 轨道环 + 绕行光点（animate-spin-slow 在 styles.css 定义，绕 SVG 中心旋转） */}
      <g className={animated ? 'origin-center animate-spin-slow' : undefined}>
        <ellipse cx="32" cy="32" rx="27" ry="11" fill="none" stroke="#4d6bfe" strokeOpacity="0.45" strokeWidth="1.5" transform="rotate(-24 32 32)" />
        <circle cx="59" cy="32" r="2.4" fill="#fbbf24" transform="rotate(-24 32 32) translate(27 0) rotate(24 32 32)" opacity={animated ? 1 : 0.85} />
      </g>

      {/* 四芒星（新星） */}
      <g className={animated ? 'origin-center animate-star-breathe' : undefined}>
        <path
          d="M32 8 C33.2 18 34.4 23.6 38 30 C34.4 36.4 33.2 42 32 52 C30.8 42 29.6 36.4 26 30 C29.6 23.6 30.8 18 32 8 Z"
          fill={`url(#${gid}-star)`}
        />
        <path
          d="M8 32 C18 30.8 23.6 29.6 30 26 C36.4 29.6 42 30.8 52 32 C42 33.2 36.4 34.4 30 38 C23.6 34.4 18 33.2 8 32 Z"
          fill={`url(#${gid}-star)`}
          opacity="0.75"
        />
      </g>

      {/* 星心（金色核心 = 新星被点亮处） */}
      <circle cx="32" cy="32" r="4" fill="#fbbf24" />
    </svg>
  )
}