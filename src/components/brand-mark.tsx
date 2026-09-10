'use client'

/**
 * BrandMark — 智投委 AI 品牌标识 v2「共识核 · Consensus Core」
 *
 * 一枚徽章同时讲清产品的两大本质：
 *
 * 【金融量化的本质】
 * - 内核三根递升 K 线：价格行为 / K 线语言 / 多空博弈 —— 量化的第一性符号
 * - 贯穿 K 线顶部的信号曲线：收益结构向上，量化模型对 alpha 的追求
 * - 三节透明度递进（0.45 → 0.7 → 1）：数据 → 洞察 → 决策的信息提纯过程
 *
 * 【智能体的本质】
 * - 六边形双层晶格：Agent Cell（智能体蜂巢），多智能体系统的最小协作单元
 * - 外框六顶点各一枚席位节点 = 6 枚分析师席位，环绕委员会核心
 * - 信号曲线上 3 枚信号节点 + 6 枚席位节点 = 9 节点 —— 对应系统的 9 类 Agent
 * - 末端决策节点（绿 · 双环光环）= CIO 裁决输出：信号穿出内层晶格向外发射
 *
 * 变体：
 * - mono：全 currentColor，随容器文字色适配亮暗主题
 * - duotone：金色晶格×K线（--gold）× 多头绿决策线（--bull），大尺寸展示
 * - animated：席位/信号节点呼吸 + 决策线信号流光（respect prefers-reduced-motion）
 */

interface BrandMarkProps {
  className?: string
  variant?: 'mono' | 'duotone'
  animated?: boolean
}

const SEAT_COORDS: [number, number][] = [
  [24, 4],
  [41.32, 14],
  [41.32, 34],
  [24, 44],
  [6.68, 34],
  [6.68, 14],
]

export function BrandMark({ className, variant = 'mono', animated = false }: BrandMarkProps) {
  const duotone = variant === 'duotone'
  // anim 挂在 svg 根上，作为所有子节点动效选择器（.brand-anim .brand-seat 等）的作用域
  const svgCls = [animated ? 'brand-anim' : null, className].filter(Boolean).join(' ')

  const goldFill = duotone ? 'fill-gold' : 'fill-current'
  const goldStroke = duotone ? 'stroke-gold' : 'stroke-current'
  const bullStroke = duotone ? 'stroke-bull' : 'stroke-current'
  const bullFill = duotone ? 'fill-bull' : 'fill-current'

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={svgCls}
      role="img"
      aria-label="智投委 AI 标识：六边形智能体晶格内的递升 K 线与九节点协同网络（共识核）"
      focusable="false"
    >
      {/* 智能体晶格：外框（委员会主体）+ 内层 hairline（协作边界） */}
      <path
        d="M24 4 41.32 14v20L24 44 6.68 34V14L24 4Z"
        className={goldStroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d="M24 8 37.86 16v16L24 40 10.14 32V16L24 8Z"
        className={goldStroke}
        strokeWidth={0.75}
        strokeLinejoin="round"
        opacity={0.5}
      />

      {/* 六席位节点（外框六顶点）：环绕委员会的 6 枚分析师席位 */}
      <g className={goldFill}>
        {SEAT_COORDS.map(([cx, cy], i) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={1.5}
            className={animated ? 'brand-seat' : undefined}
            style={animated ? { animationDelay: `${i * 0.32}s` } : undefined}
          />
        ))}
      </g>

      {/* 量化 K 线：三根递升（0.45 → 0.7 → 1 信息提纯） */}
      <line x1="17" y1="25.5" x2="17" y2="33.5" className={goldStroke} strokeWidth={1.2} strokeLinecap="round" opacity={0.45} />
      <rect x="15.7" y="27" width="2.6" height="5" rx={0.5} className={goldFill} opacity={0.45} />
      <line x1="24" y1="21" x2="24" y2="30.5" className={goldStroke} strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
      <rect x="22.7" y="22.5" width="2.6" height="6.5" rx={0.5} className={goldFill} opacity={0.7} />
      <line x1="31" y1="15.5" x2="31" y2="27.5" className={goldStroke} strokeWidth={1.2} strokeLinecap="round" />
      <rect x="29.7" y="17" width="2.6" height="9" rx={0.5} className={goldFill} />

      {/* 智能体信号流：数据 → 洞察 → 决策（穿出内层晶格） */}
      <polyline
        points="17 25.5 24 21 31 15.5"
        className={`${bullStroke} ${animated ? 'brand-signal' : ''}`}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="25.5" r={1.8} className={`${bullFill} ${animated ? 'brand-node' : ''}`} opacity={0.55} />
      <circle
        cx="24"
        cy="21"
        r={1.8}
        className={`${bullFill} ${animated ? 'brand-node brand-node-d2' : ''}`}
        opacity={0.8}
      />
      {/* 决策节点：CIO 裁决输出 + 发射光环 */}
      <circle cx="31" cy="15.5" r={3.6} className={bullStroke} strokeWidth={1} opacity={0.4} />
      <circle cx="31" cy="15.5" r={2.1} className={`${bullFill} ${animated ? 'brand-node brand-node-d3' : ''}`} />
    </svg>
  )
}
