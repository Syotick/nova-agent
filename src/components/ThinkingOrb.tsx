// 思考 Orb：AI 干活时的呼吸光球（纯 CSS 层叠圆，零依赖）
// 空闲呼吸；active（streaming）时加速脉冲 + 光环旋转，配合"思考计时"做视觉双保险
import { cn } from '../lib/utils'

export default function ThinkingOrb({ active = false, size = 22 }: { active?: boolean; size?: number }) {
  return (
    <span
      className={cn('relative flex flex-none items-center justify-center', active ? 'orb-active' : 'orb-idle')}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* 外光环（旋转） */}
      <span className="absolute inset-0 rounded-full border border-primary/40" style={{ borderTopColor: 'transparent', borderBottomColor: 'transparent' }} />
      {/* 主体：多层径向渐变光球 */}
      <span
        className="absolute inset-[18%] rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #c4b5fd, #8b7bff 45%, #4d6bfe 80%)',
          boxShadow: '0 0 14px rgba(139,123,255,0.55), inset 0 0 8px rgba(255,255,255,0.35)',
        }}
      />
      {/* 星芒金核心（呼应 logo） */}
      <span className="absolute h-[30%] w-[30%] rounded-full" style={{ background: '#fbbf24', boxShadow: '0 0 6px rgba(251,191,36,0.9)' }} />
    </span>
  )
}