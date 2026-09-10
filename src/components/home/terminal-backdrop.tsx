'use client'

// Terminal Backdrop — 三层深度背景系统（固定于视口，Home / Research 双视图共用）
// 落地设计文档：AI_Investment_Terminal_Background_UI_Design.md
//   L1 基础空间层：双密度网格（56px 小格 / 224px 主格）+ 噪点 + 暗角
//   L2 环境光层：左侧 Emerald 研究光场（Query Field）× 右侧金色决策核心光场（Consensus Core）
//   L3 数据语义层：金融幽灵数据（PE/ROE/CONSENSUS…）+ 幽灵K线 + QUERY→CORE 数据流 + 扫描线
// 全部内容纯装饰（aria-hidden / pointer-events-none）；动画仅 transform/opacity；
// 尊重 prefers-reduced-motion（静态化 + 隐藏粒子流/扫描线）

import { cn } from '@/lib/utils'
import { QuantLayer } from './quant-layer'
import { StarField } from './star-field'

/** 放射坐标线：8 条（中心 370,370，内环 128 → 外环 318，45° 步进） */
const RADIALS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x1: 370 + 128 * c, y1: 370 + 128 * s, x2: 370 + 318 * c, y2: 370 + 318 * s }
})

/** 金融幽灵数据片段（透明度 2~4%，背景纹理而非可读信息） */
const GHOSTS: { t: string; pos: string; delay: string }[] = [
  { t: 'SH.000300 +0.86%', pos: 'left-[4.5%] top-[12.5%]', delay: '0s' },
  { t: 'PE 12.8 · ROE 14.2%', pos: 'left-[15%] top-[79%]', delay: '-3s' },
  { t: 'CONSENSUS 7/9', pos: 'right-[5.5%] top-[70%]', delay: '-6s' },
  { t: 'ALPHA 3.1 · BETA 0.94', pos: 'left-[38%] top-[7.5%]', delay: '-1.5s' },
  { t: 'MOMENTUM +1.8σ', pos: 'right-[28%] top-[88%]', delay: '-4.5s' },
  { t: 'VOL ¥42.1B', pos: 'left-[7%] top-[46%]', delay: '-7.5s' },
  { t: 'EPS 6.42', pos: 'right-[13%] top-[23%]', delay: '-2.5s' },
  { t: 'MACD DIF 0.42', pos: 'right-[42%] top-[5.5%]', delay: '-5.5s' },
  { t: 'MAX DD -12.4%', pos: 'right-[7%] top-[46%]', delay: '-8.5s' },
  { t: 'ROE BAND 13-16%', pos: 'left-[24%] top-[93%]', delay: '-9.5s' },
]

export function TerminalBackdrop() {
  return (
    <div aria-hidden className="terminal-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* ===== L1 基础空间层 ===== */}
      {/* 双密度网格（ oversized 224px 供一个主格周期的无缝漂移） */}
      <div className="tb-grid tb-grid-drift absolute -inset-60" />
      {/* 微弱噪点（静态 feTurbulence） */}
      <div className="tb-noise absolute inset-0" />

      {/* ===== L2 环境光层 ===== */}
      {/* 左：Query / Research Field（Emerald，围绕输入框与 CTA） */}
      <div className="tb-field-emerald tb-breathe-a absolute inset-0" />
      {/* 右：Consensus / Decision Core（Gold，围绕品牌徽章） */}
      <div className="tb-field-gold tb-breathe-b absolute inset-0" />

      {/* ===== L3 数据语义层（仅暗色主题渲染） ===== */}
      <div className="tb-sem absolute inset-0">
        {/* L5 星空量化层：视差星点 + 微型K线浮升粒子 + 偶发流星（Canvas，最底层铺垫） */}
        <StarField />

        {/* 决策核心：同心圆 + 外环细刻度 + 放射坐标线 + 金色不完整轨道 + 微弱节点（≥xl） */}
        <svg
          className="absolute -right-36 -top-10 hidden h-[740px] w-[740px] xl:block"
          viewBox="0 0 740 740"
          fill="none"
        >
          <g stroke="#fff" strokeOpacity="0.03">
            <circle cx="370" cy="370" r="128" />
            <circle cx="370" cy="370" r="208" />
            <circle cx="370" cy="370" r="318" />
          </g>
          {/* 外环细刻度（dasharray 刻度环） */}
          <circle cx="370" cy="370" r="318" stroke="#fff" strokeOpacity="0.055" strokeWidth="7" strokeDasharray="1 14.9" />
          {/* 放射坐标线 */}
          <g stroke="#fff" strokeOpacity="0.022">
            {RADIALS.map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
            ))}
          </g>
          {/* 金色不完整轨道（约 120° 弧段） */}
          <circle
            cx="370"
            cy="370"
            r="252"
            stroke="var(--gold)"
            strokeOpacity="0.055"
            strokeDasharray="528 1054"
            transform="rotate(-64 370 370)"
          />
          {/* 微弱节点（一颗呼吸） */}
          <circle cx="370" cy="162" r="2.5" fill="var(--gold)" fillOpacity="0.4" className="tb-radar-node" />
          <circle cx="578" cy="370" r="2" fill="#fff" fillOpacity="0.16" />
          <circle cx="222" cy="518" r="1.5" fill="var(--primary)" fillOpacity="0.34" />
          {/* 中心十字准星 */}
          <g stroke="#fff" strokeOpacity="0.05">
            <line x1="358" y1="370" x2="382" y2="370" />
            <line x1="370" y1="358" x2="370" y2="382" />
          </g>
        </svg>

        {/* QUERY → AGENTS → CONSENSUS 数据流（隐约的双虚线 + 稀疏粒子，≥lg） */}
        <svg className="absolute inset-0 hidden h-full w-full lg:block" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <g fill="none" strokeDasharray="3 9" vectorEffect="non-scaling-stroke">
            <path d="M 470 402 C 640 388, 800 356, 992 330" stroke="var(--primary)" strokeOpacity="0.06" />
            <path d="M 505 452 C 700 462, 860 424, 1005 366" stroke="var(--gold)" strokeOpacity="0.05" />
            {/* AI CORE → 下方行情监控区：数据读取通道 */}
            <path d="M 1105 330 C 1110 430, 1096 540, 1104 660" stroke="#fff" strokeOpacity="0.035" />
          </g>
          {/* 路径上的静态数据节点 */}
          <circle cx="742" cy="374" r="1.6" fill="var(--primary)" fillOpacity="0.3" />
          <circle cx="812" cy="434" r="1.4" fill="var(--gold)" fillOpacity="0.3" />
          <circle cx="1102" cy="520" r="1.4" fill="#fff" fillOpacity="0.14" />
          {/* 稀疏粒子：偶发光点沿流线移动（6~17s / 次，非连续高速） */}
          <circle r="2" fill="var(--primary)" opacity="0.5">
            <animateMotion dur="9s" begin="-2s" repeatCount="indefinite" path="M 470 402 C 640 388, 800 356, 992 330" />
          </circle>
          <circle r="1.6" fill="var(--primary)" opacity="0.4">
            <animateMotion dur="13s" begin="-7s" repeatCount="indefinite" path="M 505 452 C 700 462, 860 424, 1005 366" />
          </circle>
          <circle r="1.8" fill="var(--gold)" opacity="0.48">
            <animateMotion dur="17s" begin="-11s" repeatCount="indefinite" path="M 470 402 C 640 388, 800 356, 992 330" />
          </circle>
          <circle r="1.4" fill="#fff" opacity="0.3">
            <animateMotion dur="12s" begin="-4s" repeatCount="indefinite" path="M 1105 330 C 1110 430, 1096 540, 1104 660" />
          </circle>
        </svg>

        {/* 金融幽灵数据层：背景纹理般的指数/估值/风险片段 */}
        {GHOSTS.map((g) => (
          <span key={g.t} className={cn('tb-ghost tb-ghost-flicker hidden md:block', g.pos)} style={{ animationDelay: g.delay }}>
            {g.t}
          </span>
        ))}

        {/* L4 动态量化层：动态K线 / 实时分时 / 盘口深度 / 数字流 / 热力马赛克 */}
        <QuantLayer />
      </div>

      {/* ===== 氛围收尾 ===== */}
      {/* 扫描线：19s 一轮自上而下（仅暗色） */}
      <div className="tb-scanline" />
      {/* 暗角：四周渐隐，避免大面积纯黑过于纯净 */}
      <div className="tb-vignette absolute inset-0" />
    </div>
  )
}
