'use client'

// 终端流水线 Stepper：8 步 hairline 连接线 + 完成打勾 / 当前步 shimmer 扫描 / 待执行灰态
// 当前步携带执行引擎徽章（GLM-4.6 / mimo-v2.5 / 数据与规则引擎）与客户端实测耗时 T+mm:ss
// 移动端：浓缩状态行 + 全 8 步横向可滚动轨道

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { PIPELINE_STEPS, type PipelineStatus } from '@/lib/types'
import { STEP_ICONS } from '@/lib/client-utils'
import { ModelChip, fmtElapsed } from '@/components/research/bits'
import { cn } from '@/lib/utils'

interface StepperProps {
  status: PipelineStatus
  progress: number
  currentStepLabel: string | null
}

/** 每步执行引擎（与 runner 角色分配一致：planner/分析师/报告=GLM-4.6；辩论/风控/CIO=mimo-v2.5） */
const STEP_ENGINE: Partial<Record<PipelineStatus, { chip: string; tone: 'primary' | 'gold' | 'muted' }>> = {
  planning: { chip: 'GLM-4.6', tone: 'primary' },
  collecting: { chip: 'DATA FEED', tone: 'muted' },
  analyzing: { chip: 'GLM-4.6', tone: 'primary' },
  debating: { chip: 'mimo-v2.5', tone: 'gold' },
  risk_review: { chip: 'mimo-v2.5', tone: 'gold' },
  voting: { chip: 'RULES ENGINE', tone: 'muted' },
  decision: { chip: 'mimo-v2.5', tone: 'gold' },
  report: { chip: 'GLM-4.6', tone: 'primary' },
}

function stepNo(i: number): string {
  return String(i + 1).padStart(2, '0')
}

export function Stepper({ status, progress, currentStepLabel }: StepperProps) {
  const failed = status === 'failed'
  const completed = status === 'completed'
  const running = !completed && !failed
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === status) // queued → -1
  const pct = Math.min(100, Math.max(0, completed ? 100 : failed ? progress : Math.max(progress, 0)))
  const doneCount = completed ? PIPELINE_STEPS.length : Math.max(0, currentIdx)
  const engine = running ? STEP_ENGINE[status] ?? null : null

  // 当前步真实耗时：状态/标签变化即重置起点（ref 记录，避免 effect 体内同步 setState）
  const stepStartRef = useRef<number>(Date.now())
  const prevKeyRef = useRef<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const key = `${status}|${currentStepLabel ?? ''}`
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key
      stepStartRef.current = Date.now()
    }
  }, [status, currentStepLabel])

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setTick((n) => (n + 1) % 100000), 1000)
    return () => clearInterval(t)
  }, [running])

  const elapsed = running ? fmtElapsed(Date.now() - stepStartRef.current) : null

  return (
    <section className="panel px-4 py-4 sm:px-5" aria-label="研究流水线进度">
      {/* 桌面：8 步横向 */}
      <div className="hidden items-center gap-0 md:flex">
        <div className="flex min-w-0 flex-1 items-center" role="list" aria-label="研究流程步骤">
          {PIPELINE_STEPS.map((step, i) => {
            const Icon = STEP_ICONS[step.key]
            const done = completed || (i < currentIdx && !failed)
            const isCurrent = running && i === currentIdx
            const isFailedStep = failed && i === currentIdx
            return (
              <div key={step.key} role="listitem" className="flex min-w-0 flex-1 items-center last:flex-none">
                <div className="flex w-[4.75rem] flex-col items-center gap-1 text-center">
                  <span
                    className={cn(
                      'relative flex size-9 items-center justify-center rounded-full border transition-colors',
                      done && 'border-primary/50 bg-primary/10 text-primary',
                      isCurrent && 'shimmer border-primary bg-primary/15 text-primary',
                      isFailedStep && 'border-bear/50 bg-bear/10 text-bear',
                      !done && !isCurrent && !isFailedStep && 'border-border/80 bg-muted/40 text-muted-foreground/70',
                    )}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {done ? (
                      <Check className="size-4" aria-hidden />
                    ) : (
                      <>
                        {Icon ? <Icon className="size-4" aria-hidden /> : null}
                        {isCurrent && <span className="led absolute -right-0.5 -top-0.5 text-hold" aria-hidden />}
                      </>
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] font-medium leading-tight',
                      done && 'text-primary',
                      isCurrent && 'text-foreground',
                      isFailedStep && 'text-bear',
                      !done && !isCurrent && !isFailedStep && 'text-muted-foreground/80',
                    )}
                  >
                    {step.label}
                  </span>
                  <span
                    className={cn(
                      'num text-[9px] tracking-widest',
                      done || isCurrent ? 'text-muted-foreground' : 'text-muted-foreground/50',
                    )}
                  >
                    {stepNo(i)}
                  </span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className="mt-[-1.4rem] h-px min-w-2 flex-1 bg-border/60" aria-hidden>
                    <div
                      className={cn(
                        'h-px transition-all duration-700',
                        done ? 'w-full bg-primary/60' : failed && i === currentIdx - 1 ? 'w-full bg-bear/60' : 'w-0',
                      )}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 右：总进度 */}
        <div className="ml-4 flex w-28 shrink-0 flex-col gap-1.5 border-l border-border/60 pl-4">
          <div className="flex items-baseline justify-between gap-1">
            <span className="micro-label">Progress</span>
            <span
              className={cn(
                'num text-lg font-bold leading-none',
                failed ? 'text-bear' : completed ? 'text-primary' : 'text-foreground',
              )}
            >
              {Math.round(pct)}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all duration-700', failed ? 'bg-bear' : 'bg-primary')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="num text-[10px] text-muted-foreground/70">{doneCount}/8 steps</span>
        </div>
      </div>

      {/* 移动端：浓缩状态行 + 可横滚步骤轨 */}
      <div className="md:hidden">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border',
                failed ? 'border-bear/50 bg-bear/10 text-bear' : 'border-primary/50 bg-primary/10 text-primary',
              )}
            >
              {failed ? (
                <span className="num text-[10px] font-bold">!</span>
              ) : completed ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <span className="led text-primary" aria-hidden />
              )}
            </span>
            <span className="truncate text-sm font-medium">
              {currentStepLabel ??
                (completed ? '全部完成' : failed ? '研究失败' : PIPELINE_STEPS[Math.max(0, currentIdx)]?.label ?? '准备中')}
            </span>
          </div>
          <div className="flex shrink-0 items-baseline gap-1">
            {elapsed && <span className="num mr-1 text-[10px] text-muted-foreground/70">T+{elapsed}</span>}
            <span className="num text-lg font-bold leading-none">{Math.round(pct)}%</span>
            <span className="num text-[10px] text-muted-foreground">{doneCount}/8</span>
          </div>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all duration-700', failed ? 'bg-bear' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* 横向可滚动全 8 步 */}
        <div className="nice-scroll -mx-4 mt-3 overflow-x-auto px-4 pb-1">
          <div className="flex min-w-max items-stretch" role="list" aria-label="研究流程步骤">
            {PIPELINE_STEPS.map((step, i) => {
              const Icon = STEP_ICONS[step.key]
              const done = completed || (i < currentIdx && !failed)
              const isCurrent = running && i === currentIdx
              const isFailedStep = failed && i === currentIdx
              return (
                <div key={step.key} role="listitem" className="flex items-center">
                  <div className="flex w-14 flex-col items-center gap-1 text-center">
                    <span
                      className={cn(
                        'relative flex size-7 items-center justify-center rounded-full border',
                        done && 'border-primary/50 bg-primary/10 text-primary',
                        isCurrent && 'shimmer border-primary bg-primary/15 text-primary',
                        isFailedStep && 'border-bear/50 bg-bear/10 text-bear',
                        !done && !isCurrent && !isFailedStep && 'border-border/80 bg-muted/40 text-muted-foreground/70',
                      )}
                      aria-current={isCurrent ? 'step' : undefined}
                    >
                      {done ? <Check className="size-3" aria-hidden /> : Icon ? <Icon className="size-3" aria-hidden /> : null}
                    </span>
                    <span
                      className={cn(
                        'w-14 truncate text-[10px] leading-tight',
                        done && 'text-primary',
                        isCurrent && 'font-semibold text-foreground',
                        isFailedStep && 'text-bear',
                        !done && !isCurrent && !isFailedStep && 'text-muted-foreground/80',
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <span
                      className={cn('mb-4 h-px w-5 shrink-0', done ? 'bg-primary/50' : 'bg-border/60')}
                      aria-hidden
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 当前步骤：日志行 + 引擎徽章 + 真实耗时 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">
        {running && <span className="led text-primary" aria-hidden />}
        <p className="num min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {currentStepLabel
            ? `>> ${currentStepLabel}`
            : completed
              ? '>> 投委会流程已全部完成'
              : failed
                ? '>> 流程中断，可重新发起研究'
                : '>> 排队等待中'}
        </p>
        {engine && <ModelChip model={engine.chip} tone={engine.tone} />}
        {elapsed && (
          <span className="num text-[10px] font-semibold text-muted-foreground/90" aria-label={`当前步已进行 ${elapsed}`}>
            T+{elapsed}
          </span>
        )}
      </div>
    </section>
  )
}
