'use client'

// 核心流程：8 阶段投委会流水线（桌面横排链路 / 平板 2×4 / 移动纵排）
// 动效系统：connector 流动光点（数据流）+ 待机扫过高亮（流水线运转感）+ HoverCard 阶段说明（可解释性）
// 全部纯 CSS 动画，respect prefers-reduced-motion

import { Fragment } from 'react'
import { Users } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { PIPELINE_STEPS } from '@/lib/types'
import { STEP_ICONS } from '@/lib/client-utils'
import { cn } from '@/lib/utils'

const EN_LABELS: Record<string, string> = {
  planning: 'Planning',
  collecting: 'Collecting',
  analyzing: 'Analyzing',
  debating: 'Debate',
  risk_review: 'Risk Review',
  voting: 'Voting',
  decision: 'CIO Decision',
  report: 'Report',
}

/** 各阶段的参与角色（可解释性：谁在做这件事） */
const STEP_AGENTS: Record<string, string> = {
  planning: '研究规划师 Planner',
  collecting: '数据采集管道 · 腾讯 / 雅虎财经 + Web Search',
  analyzing: '基本面 · 行业 · 宏观 · 量化 · 舆情 5 分析师并行',
  debating: '多方辩护人 × 空方辩护人 × 冲突调解员',
  risk_review: '首席风控官 Risk Officer（一票关注权）',
  voting: '投资委员会 9 席加权投票',
  decision: '首席投资官 CIO 综合裁决',
  report: '报告生成器 · 结构化可解释报告',
}

/** 待机扫过：8 步 × 1.6s = 12.8s 一轮，每卡在第 i 拍亮起（CSS delay） */
const SCAN_STEP_S = 1.6
const SCAN_TOTAL_S = SCAN_STEP_S * 8

function StepBody({
  step,
  index,
  compact,
}: {
  step: (typeof PIPELINE_STEPS)[number]
  index: number
  compact?: boolean
}) {
  const Icon = STEP_ICONS[step.key]
  return (
    <div
      className="pipeline-scan panel-flat group relative flex min-w-0 flex-1 flex-col gap-2.5 p-3.5 transition-colors duration-150 hover:border-primary/40 hover:bg-muted/30"
      style={{ animationDelay: `${index * SCAN_STEP_S}s` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="num text-xs text-muted-foreground/70">{String(index + 1).padStart(2, '0')}</span>
        <span className="flex size-8 items-center justify-center rounded-md border border-border/70 bg-background/60 text-primary transition-colors duration-150 group-hover:border-primary/40">
          {Icon ? <Icon className="size-4" aria-hidden /> : null}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-tight">{step.label}</p>
        <p className="micro-label mt-1 truncate text-[9px]">{EN_LABELS[step.key] ?? step.key}</p>
      </div>
      {!compact && <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{step.desc}</p>}
    </div>
  )
}

/** 带阶段说明 HoverCard 的流程节点（可解释性） */
function StepNode({ step, index, compact }: { step: (typeof PIPELINE_STEPS)[number]; index: number; compact?: boolean }) {
  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg"
          aria-label={`阶段 ${index + 1} ${step.label}：${step.desc}。参与角色：${STEP_AGENTS[step.key] ?? '—'}`}
        >
          <StepBody step={step} index={index} compact={compact} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="center" className="w-72 p-0">
        <div className="flex items-center gap-2 border-b border-border/70 px-3.5 py-2.5">
          <span className="num text-xs font-bold text-primary">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-sm font-semibold">{step.label}</span>
          <span className="micro-label ml-auto text-[9px]">{EN_LABELS[step.key] ?? step.key}</span>
        </div>
        <div className="space-y-2.5 px-3.5 py-3">
          <p className="text-xs leading-5 text-foreground/85">{step.desc}</p>
          <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <Users className="mt-0.5 size-3.5 shrink-0 text-primary/80" aria-hidden />
            <span>
              <span className="font-medium text-foreground/75">参与角色：</span>
              {STEP_AGENTS[step.key] ?? '投委会系统'}
            </span>
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

/** 桌面 connector：发丝线 + 流动光点（数据流） */
function FlowConnector({ index }: { index: number }) {
  return (
    <span className="flex items-center px-1" aria-hidden>
      <span className="relative h-px w-5 overflow-visible bg-border">
        <span
          className="pipeline-dot absolute top-1/2 size-1 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]"
          style={{ animationDelay: `${index * 0.32}s` }}
        />
      </span>
    </span>
  )
}

export function PipelineFlow() {
  return (
    <section id="pipeline" className="scroll-mt-24">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="micro-label">Investment Pipeline</p>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">核心流程</h2>
        </div>
        <p className="hidden max-w-xs text-right text-xs leading-5 text-muted-foreground sm:block">
          从研究规划到 CIO 裁决，8 个专业角色协同工作，每一步可解释、可追溯。悬停查看阶段详情。
        </p>
      </div>

      {/* 桌面：横排链路 + 流动光点连线 */}
      <div className="hidden lg:flex lg:items-stretch">
        {PIPELINE_STEPS.map((step, i) => (
          <Fragment key={step.key}>
            {i > 0 && <FlowConnector index={i - 1} />}
            <StepNode step={step} index={i} compact />
          </Fragment>
        ))}
      </div>

      {/* 平板 2×4 / 移动纵排 */}
      <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:hidden')}>
        {PIPELINE_STEPS.map((step, i) => (
          <StepNode key={step.key} step={step} index={i} />
        ))}
      </div>
    </section>
  )
}
