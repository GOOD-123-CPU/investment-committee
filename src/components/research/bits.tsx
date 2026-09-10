'use client'

// 研究视图共享终端微组件：SVG 径向仪表 / 分数语义色 / 证据链标签
// Task 10-b 新增：模型徽章 / 几何角色徽章 / 终端等待态 / Data unavailable / 大弧评分仪表 / 时间格式化
// 仅被 research/* 客户端组件导入

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/** 0-100 分数 → stroke/text 语义色（与 scoreBarClass 对齐） */
export function scoreTone(v: number): { stroke: string; text: string; bar: string } {
  if (v >= 70) return { stroke: 'stroke-bull', text: 'text-bull', bar: 'bg-bull' }
  if (v >= 50) return { stroke: 'stroke-hold', text: 'text-hold', bar: 'bg-hold' }
  if (v >= 30) return { stroke: 'stroke-risk', text: 'text-risk', bar: 'bg-risk' }
  return { stroke: 'stroke-bear', text: 'text-bear', bar: 'bg-bear' }
}

interface RadialGaugeProps {
  value: number
  size?: number
  stroke?: number
  label?: string
  className?: string
  valueClassName?: string
}

/**
 * 终端径向仪表：刻度圈 + 进度弧 + 中心大数字
 * 颜色由 scoreTone 决定（value ∈ 0-100）
 */
export function RadialGauge({
  value,
  size = 120,
  stroke = 9,
  label = '/ 100',
  className,
  valueClassName,
}: RadialGaugeProps) {
  const clamped = Math.min(100, Math.max(0, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamped / 100)
  const tone = scoreTone(clamped)

  return (
    <div
      className={cn('relative shrink-0 select-none', tone.text, className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`评分 ${Math.round(clamped)} / 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-muted" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r - stroke / 2 - 1.5}
          strokeWidth={1}
          className="gauge-ticks stroke-foreground"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          className={cn('transition-[stroke-dashoffset] duration-700', tone.stroke)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('num font-extrabold leading-none', valueClassName ?? 'text-2xl')}>
          {Math.round(clamped)}
        </span>
        <span className="micro-label mt-1 text-[9px]">{label}</span>
      </div>
    </div>
  )
}

/** 证据链标签：Claim → Evidence → Source → Confidence */
export function EvidenceTrailChips({ className }: { className?: string }) {
  const chips = ['Claim', 'Evidence', 'Source', 'Confidence']
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label="证据链方法">
      {chips.map((c, i) => (
        <span key={c} className="flex items-center gap-1.5">
          {i > 0 && <span className="num text-[10px] text-muted-foreground/60">→</span>}
          <span className="micro-label rounded border border-border/80 bg-muted/50 px-1.5 py-0.5">{c}</span>
        </span>
      ))}
    </div>
  )
}

/** 置信度小点（High/Medium/Low） */
export function confidenceDot(level?: string | null): string {
  switch (level) {
    case 'High':
      return 'bg-bull'
    case 'Medium':
      return 'bg-hold'
    case 'Low':
      return 'bg-muted-foreground/50'
    default:
      return 'bg-muted-foreground/50'
  }
}

/** 数字安全格式化 */
export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

// ============================================================
// Task 10-b 新增
// ============================================================

/** 模型/引擎徽章：GLM-4.6（分析与报告）/ mimo-v2.5（博弈·风控·裁决）/ 中性引擎标签 */
export function ModelChip({
  model,
  tone = 'primary',
  className,
}: {
  model: string
  tone?: 'primary' | 'gold' | 'muted'
  className?: string
}) {
  return (
    <span
      className={cn(
        'num inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
        tone === 'gold' && 'border-gold/40 bg-gold/10 text-gold',
        tone === 'primary' && 'border-primary/30 bg-primary/5 text-primary',
        tone === 'muted' && 'border-border/70 bg-muted/60 text-muted-foreground',
        className,
      )}
    >
      {model}
    </span>
  )
}

/**
 * 几何单色徽章（辩论角色头像，禁 emoji）：
 * bull=上三角 / bear=下三角 / conflict=菱形+中线 / risk=六边形警示 / neutral=菱形
 */
export function GeoBadge({
  kind,
  className,
}: {
  kind: 'bull' | 'bear' | 'conflict' | 'risk' | 'neutral'
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-md border',
        kind === 'bull' && 'border-bull/35 bg-bull/10 text-bull',
        kind === 'bear' && 'border-bear/35 bg-bear/10 text-bear',
        kind === 'conflict' && 'border-gold/40 bg-gold/10 text-gold',
        kind === 'risk' && 'border-risk/35 bg-risk/10 text-risk',
        kind === 'neutral' && 'border-border bg-muted/60 text-muted-foreground',
        className,
      )}
      aria-hidden
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        {kind === 'bull' && <path d="M12 4.5 L20 18 H4 Z" />}
        {kind === 'bear' && <path d="M12 19.5 L4 6 H20 Z" />}
        {kind === 'conflict' && (
          <>
            <path d="M12 3.5 L20.5 12 L12 20.5 L3.5 12 Z" />
            <path d="M12 8.5 V15.5" strokeLinecap="round" />
          </>
        )}
        {kind === 'risk' && (
          <>
            <path d="M12 3 L19.8 7.5 V16.5 L12 21 L4.2 16.5 V7.5 Z" />
            <path d="M12 8 V12.6" strokeLinecap="round" />
            <path d="M12 15.6 V15.9" strokeLinecap="round" />
          </>
        )}
        {kind === 'neutral' && <path d="M12 3.5 L20.5 12 L12 20.5 L3.5 12 Z" />}
      </svg>
    </span>
  )
}

/**
 * 终端式等待态（替代普通骨架屏）：
 * micro-label + LED + typing-dot + shimmer 扫描发丝线
 */
export function TerminalWait({
  label,
  model,
  tone = 'primary',
  className,
}: {
  label: string
  model?: string
  tone?: 'primary' | 'gold'
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)} role="status" aria-label={`${label} 进行中`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('led', tone === 'gold' ? 'text-gold' : 'text-hold')} aria-hidden />
        <span className="micro-label">{label}</span>
        {model && <ModelChip model={model} tone={tone === 'gold' ? 'gold' : 'primary'} />}
        <span className={cn('ml-auto flex shrink-0 gap-1', tone === 'gold' ? 'text-gold' : 'text-hold')} aria-hidden>
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
      </div>
      <div className="shimmer relative h-px w-full bg-border/70" aria-hidden />
    </div>
  )
}

/** Data unavailable 统一空态：虚线框 + 灰字 + 原因说明 */
export function DataUnavailable({
  what,
  reason,
  className,
}: {
  what: string
  reason?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2.5',
        className,
      )}
    >
      <span className="micro-label text-muted-foreground/80">{what}</span>
      <span className="num rounded border border-border/70 px-1 py-px text-[9px] tracking-[0.14em] text-muted-foreground/60">
        DATA UNAVAILABLE
      </span>
      {reason && (
        <span className="min-w-0 flex-1 basis-full text-xs leading-5 text-muted-foreground/70 sm:basis-auto">
          {reason}
        </span>
      )}
    </div>
  )
}

/**
 * 超大弧形评分仪表（最终决策仪式感）：
 * 270° 弧 + SVG 刻度环 + 0/50/100 标注 + 分数 count-up 到位动画（easeOutCubic）
 */
export function ScoreDial({
  value,
  size = 220,
  stroke = 12,
  className,
}: {
  value: number
  size?: number
  stroke?: number
  className?: string
}) {
  const clamped = Math.min(100, Math.max(0, value))
  const [display, setDisplay] = useState(0)

  // 分数到位动画：rAF 回调中 setState（尊重 prefers-reduced-motion → 时长 0）
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const D = reduced ? 0 : 950
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = D === 0 ? 1 : Math.min(1, (t - t0) / D)
      setDisplay(clamped * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [clamped])

  const tone = scoreTone(clamped)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ARC = 0.75 // 270°
  const settled = display >= clamped - 0.05

  // 0 / 50 / 100 标注锚点（SVG y 向下：135°=左下起点，270°=正中，45°=右下终点）
  const labels: [number, string][] = [
    [135, '0'],
    [270, '50'],
    [45, '100'],
  ]
  const labelR = r + stroke / 2 + 12

  return (
    <div
      className={cn('relative shrink-0 select-none', tone.text, className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`AI Score ${Math.round(clamped)} / 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(135deg)' }}>
        {/* 270° 轨道 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * ARC} ${c}`}
          className="stroke-muted"
        />
        {/* 内侧刻度环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r - stroke / 2 - 4}
          fill="none"
          strokeWidth={1}
          className="gauge-ticks stroke-foreground"
        />
        {/* 进度弧 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * ARC * (display / 100)} ${c}`}
          className={tone.stroke}
        />
      </svg>

      {/* 量程标注 */}
      {labels.map(([deg, text]) => {
        const a = (deg * Math.PI) / 180
        return (
          <span
            key={text}
            className="num absolute text-[9px] text-muted-foreground/60"
            style={{
              left: size / 2 + labelR * Math.cos(a),
              top: size / 2 + labelR * Math.sin(a),
              transform: 'translate(-50%, -50%)',
            }}
            aria-hidden
          >
            {text}
          </span>
        )
      })}

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="micro-label text-[9px]">AI SCORE</span>
        <span
          className={cn(
            'num text-6xl font-black leading-none tracking-tight',
            settled && 'score-lock',
          )}
        >
          {Math.round(display)}
        </span>
        <span className="num mt-1.5 text-[10px] text-muted-foreground/70">/ 100</span>
      </div>
    </div>
  )
}

/** 秒表格式化：mm:ss（当前步真实耗时） */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 时间戳 → MM-DD HH:mm；解析失败原样返回 */
export function fmtDateTime(s?: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(d)
    .replace(/\//g, '-')
}
