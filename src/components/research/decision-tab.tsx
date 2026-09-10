'use client'

// 最终决策 Tab — CIO FINAL DECISION（仪式感）
// 超大弧形 AI Score 仪表（SVG 刻度 + 分数到位动画）+ 评级大字 + KPI 行
// 加权评分构成（7 维权重 SVG 横条 + Initial − Penalty → Final 瀑布）+ 投委投票（权重堆叠条 + 明细表）
// 投资逻辑树 / 核心逻辑 / 主要风险 / 加入自选池

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Clock, GitBranch, Info, ShieldAlert, Star } from 'lucide-react'
import type { DecisionDTO } from '@/lib/types'
import { DIMENSION_WEIGHTS, ratingTone, riskTone, voteTone } from '@/lib/client-utils'
import { ModelChip, ScoreDial } from '@/components/research/bits'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function WaterfallBlock({
  label,
  value,
  valueClass,
  note,
  emphasize,
  tone,
}: {
  label: string
  value: string | number
  valueClass: string
  note?: string
  emphasize?: boolean
  tone?: string
}) {
  return (
    <div className={cn('panel-flat w-32 px-4 py-3 text-center', emphasize && tone)}>
      <p className="micro-label">{label}</p>
      <p className={cn('num mt-1 text-2xl font-extrabold leading-none', valueClass)}>{value}</p>
      {note ? <p className="mt-1 text-[10px] leading-4 text-muted-foreground/80">{note}</p> : null}
    </div>
  )
}

/** 七维评分权重 SVG 横条（满分维 25% 为基准满宽） */
function WeightBars() {
  return (
    <div className="min-w-0 flex-1 space-y-2" role="img" aria-label="七维评分权重体系">
      {DIMENSION_WEIGHTS.map((d) => (
        <div key={d.key} className="flex items-center gap-3">
          <span className="w-16 shrink-0 truncate text-[11px] text-muted-foreground" title={`${d.label} ${d.weight}%`}>
            {d.label}
          </span>
          <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="h-1.5 min-w-0 flex-1" aria-hidden>
            <rect x="0" y="0" width="100" height="6" className="fill-muted" />
            <rect x="0" y="0" width={(d.weight / 25) * 100} height="6" className="fill-primary/75" />
          </svg>
          <span className="num w-9 shrink-0 text-right text-[11px] font-semibold text-foreground/80">{d.weight}%</span>
        </div>
      ))}
      <p className="num pt-1 text-[10px] text-muted-foreground/60">
        INITIAL SCORE = Σ(维度评分 × 权重) · 委员会投票加权聚合
      </p>
    </div>
  )
}

interface DecisionTabProps {
  decision: DecisionDTO
  sessionId?: string
  stockName?: string | null
}

export function DecisionTab({ decision: d, sessionId, stockName }: DecisionTabProps) {
  const risk = riskTone(d.riskLevel)
  const tone = ratingTone(d.rating)
  const { toast } = useToast()
  const [watchState, setWatchState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const handleAddWatch = async () => {
    if (!sessionId || watchState === 'saving' || watchState === 'saved') return
    setWatchState('saving')
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) throw new Error(`(${res.status})`)
      setWatchState('saved')
      toast({ title: '已加入自选池', description: `${stockName ?? '该标的'} 已可在首页自选池中查看` })
    } catch {
      setWatchState('error')
      toast({ title: '加入自选失败', description: '请稍后重试', variant: 'destructive' })
    }
  }

  const voteRows = Array.isArray(d.voteSummary) ? d.voteSummary : []
  const thesis = Array.isArray(d.thesis) ? d.thesis : []
  const keyLogic = Array.isArray(d.keyLogic) ? d.keyLogic : []
  const keyRisks = Array.isArray(d.keyRisks) ? d.keyRisks : []

  // 投票权重堆叠（BUY / HOLD / SELL 占比，来自 voteSummary.weight 真实数据）
  const sumWeight = (vote: 'BUY' | 'HOLD' | 'SELL') =>
    voteRows.filter((v) => v.vote === vote).reduce((s, v) => s + v.weight, 0)
  const buyW = sumWeight('BUY')
  const holdW = sumWeight('HOLD')
  const sellW = sumWeight('SELL')
  const totalW = buyW + holdW + sellW

  return (
    <div className="space-y-4">
      {/* 裁决台 */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={cn(
          'panel relative overflow-hidden p-6 sm:p-8',
          d.rating.includes('BUY') && 'glow-emerald border-bull/30',
          !d.rating.includes('BUY') && !d.rating.includes('SELL') && 'glow-gold border-hold/30',
          d.rating.includes('SELL') && 'border-bear/30',
        )}
        aria-label="CIO 最终裁决"
      >
        <div className="flex flex-col items-center gap-8 md:flex-row md:gap-12">
          <ScoreDial value={d.finalScore} size={220} stroke={12} className="mx-auto" />
          <div className="min-w-0 flex-1 space-y-3.5 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <span className="micro-label rounded border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">
                CIO Final Decision
              </span>
              <span className="micro-label">首席投资官裁决</span>
              <ModelChip model="mimo-v2.5" tone="gold" />
            </div>
            <p className={cn('num text-4xl font-black tracking-tight sm:text-5xl', tone.text)}>{d.rating}</p>
            <p className="num text-xs text-muted-foreground">
              初始 {d.initialScore} − 风险调整 {d.riskPenalty} → 最终{' '}
              <span className={cn('font-bold', tone.text)}>{d.finalScore}</span>
            </p>
            {sessionId && (
              <button
                type="button"
                onClick={() => void handleAddWatch()}
                disabled={watchState === 'saving' || watchState === 'saved'}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-md border border-gold/40 px-3 text-xs font-semibold text-gold transition-colors hover:bg-gold/10 disabled:opacity-60',
                )}
                aria-label="加入自选池"
              >
                {watchState === 'saved' ? <Check className="size-3.5" aria-hidden /> : <Star className="size-3.5" aria-hidden />}
                {watchState === 'saved' ? '已在自选池' : watchState === 'saving' ? '加入中…' : '加入自选池'}
              </button>
            )}
          </div>
        </div>
      </motion.section>

      {/* KPI 行 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="panel-flat p-4">
          <span className="micro-label">Confidence · 置信度</span>
          <p className="num mt-1.5 text-xl font-bold leading-none">
            {d.confidence}
            <span className="text-sm text-muted-foreground">%</span>
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', d.confidence >= 70 ? 'bg-bull' : d.confidence >= 45 ? 'bg-hold' : 'bg-bear')}
              style={{ width: `${Math.min(100, d.confidence)}%` }}
            />
          </div>
        </div>
        <div className="panel-flat p-4">
          <span className="micro-label">Position · 建议仓位</span>
          <p className="num mt-1.5 text-xl font-bold leading-none">
            {d.positionMin}–{d.positionMax}
            <span className="text-sm text-muted-foreground">%</span>
          </p>
          <div className="relative mt-2 h-1 w-full rounded-full bg-muted" aria-hidden>
            <div
              className="absolute inset-y-0 rounded-full bg-primary/70"
              style={{ left: `${d.positionMin}%`, width: `${Math.max(2, d.positionMax - d.positionMin)}%` }}
            />
          </div>
        </div>
        <div className="panel-flat p-4">
          <span className="micro-label">Horizon · 周期</span>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold leading-none">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden />
            {d.horizon}
          </p>
          <p className="num mt-2 text-[10px] text-muted-foreground/60">INVESTMENT HORIZON</p>
        </div>
        <div className="panel-flat p-4">
          <span className="micro-label">Risk Level · 风险等级</span>
          <p className="mt-1.5 leading-none">
            <Badge variant="outline" className={cn('text-xs font-bold', risk.badge)}>
              {d.riskLevel ?? '—'}
            </Badge>
          </p>
          <p className="num mt-2 text-[10px] text-muted-foreground/60">RISK OFFICER VETO READY</p>
        </div>
      </div>

      {/* 加权评分构成：瀑布 + 七维权重 */}
      <section className="panel p-5" aria-label="评分构成">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
          <span className="micro-label">Score Construction · 加权评分构成</span>
          <span className="num text-[10px] text-muted-foreground/60">7-DIM WEIGHTED SCORING MODEL</span>
        </div>
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 sm:gap-3">
            <WaterfallBlock label="Initial Score" value={d.initialScore} valueClass="text-primary" note="五 Agent 加权初评" />
            <ArrowRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
            <WaterfallBlock label="Risk Penalty" value={`−${d.riskPenalty}`} valueClass="text-bear" note="Risk Officer 调整" />
            <ArrowRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
            <WaterfallBlock
              label="Final Score"
              value={d.finalScore}
              valueClass={tone.text}
              note="最终评分"
              emphasize
              tone={d.rating.includes('BUY') ? 'glow-emerald border-bull/40' : d.rating.includes('SELL') ? 'border-bear/40' : 'glow-gold border-hold/40'}
            />
          </div>
          <div className="hidden w-px shrink-0 self-stretch bg-border/50 lg:block" aria-hidden />
          <WeightBars />
        </div>
        {d.riskPenalty > 0 && (
          <p className="num mt-4 flex items-center justify-center gap-1.5 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
            <ShieldAlert className="size-3.5 shrink-0 text-risk" aria-hidden />
            Risk Officer 拥有否决与降级权：{d.initialScore} − {d.riskPenalty} → {d.finalScore}
          </p>
        )}
      </section>

      {/* 核心逻辑 vs 主要风险 */}
      {(keyLogic.length > 0 || keyRisks.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {keyLogic.length > 0 && (
            <section className="panel h-full p-5" aria-label="核心投资逻辑">
              <span className="micro-label text-bull">Key Logic · 核心投资逻辑</span>
              <ol className="mt-3 space-y-2.5">
                {keyLogic.map((k, i) => (
                  <li key={i} className="flex gap-3 text-[13px] leading-6">
                    <span className="num shrink-0 pt-0.5 text-[11px] font-bold text-bull">{String(i + 1).padStart(2, '0')}</span>
                    <span>{k}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {keyRisks.length > 0 && (
            <section className="panel h-full p-5" aria-label="主要风险">
              <span className="micro-label text-bear">Key Risks · 主要风险</span>
              <ul className="mt-3 space-y-2.5">
                {keyRisks.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-6">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-bear" aria-hidden />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* 投资逻辑树 */}
      {thesis.length > 0 && (
        <section className="panel p-5" aria-label="投资逻辑树">
          <span className="micro-label flex items-center gap-2">
            <GitBranch className="size-3.5 text-primary" aria-hidden />
            Investment Thesis · 投资逻辑树
          </span>
          <div className="relative mt-4 space-y-5 pl-6">
            <span className="absolute bottom-3 left-[7px] top-3 w-px bg-primary/25" aria-hidden />
            {thesis.map((node, i) => (
              <div key={i} className="relative">
                <span className="absolute -left-6 top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" aria-hidden />
                <h4 className="text-sm font-semibold">
                  <span className="num mr-2 text-[10px] text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                  {node.title}
                </h4>
                {node.points?.length > 0 && (
                  <ul className="mt-1 space-y-1 border-l border-border/60 pl-4">
                    {node.points.map((p, j) => (
                      <li key={j} className="flex gap-2 text-[13px] leading-5 text-muted-foreground">
                        <span className="shrink-0 text-primary" aria-hidden>
                          ·
                        </span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 投委投票：权重堆叠条 + 明细 */}
      {voteRows.length > 0 && (
        <section className="panel p-5" aria-label="投票记录">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
            <span className="micro-label">Vote Record · 投委会投票记录</span>
            <span className="num text-[10px] text-muted-foreground/60">
              {voteRows.length} VOTERS · WEIGHTED
            </span>
          </div>

          {/* 投票权重堆叠条 */}
          {totalW > 0 && (
            <div className="mt-4">
              <div
                className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`投票权重分布：BUY ${Math.round(buyW * 100)}%，HOLD ${Math.round(holdW * 100)}%，SELL ${Math.round(sellW * 100)}%`}
              >
                {buyW > 0 && <div className="h-full bg-bull" style={{ width: `${(buyW / totalW) * 100}%` }} />}
                {holdW > 0 && <div className="h-full bg-hold" style={{ width: `${(holdW / totalW) * 100}%` }} />}
                {sellW > 0 && <div className="h-full bg-bear" style={{ width: `${(sellW / totalW) * 100}%` }} />}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                {[
                  { label: 'BUY', w: buyW, cls: 'bg-bull' },
                  { label: 'HOLD', w: holdW, cls: 'bg-hold' },
                  { label: 'SELL', w: sellW, cls: 'bg-bear' },
                ].map((x) => (
                  <span key={x.label} className="num flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className={cn('size-1.5 rounded-full', x.cls)} aria-hidden />
                    {x.label} {Math.round(x.w * 100)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="nice-scroll mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>委员</TableHead>
                  <TableHead>投票</TableHead>
                  <TableHead className="w-[36%]">投票权重</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {voteRows.map((v) => {
                  const vt = voteTone(v.vote)
                  const w = Math.round(v.weight * 100)
                  return (
                    <TableRow key={v.agentKey}>
                      <TableCell className="text-[13px] font-medium">{v.agentName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px] font-bold', vt.badge)}>
                          {v.vote}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                            <div className={cn('h-full rounded-full', vt.bar)} style={{ width: `${w}%` }} />
                          </div>
                          <span className="num text-xs font-semibold text-muted-foreground">{w}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <Alert className="panel-flat border-border/70 bg-transparent">
        <Info className="size-4" aria-hidden />
        <AlertDescription className="text-xs leading-5 text-muted-foreground">
          AI 生成投研内容，仅供研究参考，不构成任何投资建议。评级与评分基于演示快照数据、腾讯财经实时行情与实时新闻检索，存在数据滞后与模型判断局限。
        </AlertDescription>
      </Alert>
    </div>
  )
}
