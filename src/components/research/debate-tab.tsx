'use client'

// 投资辩论 Tab — INVESTMENT DEBATE · 多空辩论厅
// 双栏对峙（bull 左绿光晕 / bear 右红光晕）+ 居中窄卡（仲裁/风控）+ ROUND 回合时间线 + 冲突警示带
// 角色头像一律几何单色 SVG 徽章（GeoBadge），禁 emoji

import { Fragment, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Gavel, ShieldAlert, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import type { DebateDTO } from '@/lib/types'
import { GeoBadge, ModelChip, TerminalWait } from '@/components/research/bits'
import { cn } from '@/lib/utils'

const PHASE_TAG: Record<DebateDTO['phase'], string> = {
  opening: '第1轮 · 立论',
  rebuttal: '第2轮 · 反驳',
  crossexam: '第3轮 · 质询',
  conflict: '冲突仲裁',
  risk: '风控审查',
  closing: '裁决',
}

interface Segment {
  key: string
  kind: 'pair' | 'flow'
  round: number
  phase: DebateDTO['phase']
  bull: DebateDTO[]
  bear: DebateDTO[]
  flow: DebateDTO[]
}

/** 将连续同 (round, phase) 的消息分段；bull/bear 入双栏，其余全宽 */
function buildSegments(sorted: DebateDTO[]): Segment[] {
  const segments: Segment[] = []
  let cur: Segment | null = null
  for (const msg of sorted) {
    if (!cur || cur.round !== msg.round || cur.phase !== msg.phase) {
      cur = { key: `${msg.round}-${msg.phase}-${segments.length}`, kind: 'pair', round: msg.round, phase: msg.phase, bull: [], bear: [], flow: [] }
      segments.push(cur)
    }
    if (msg.stance === 'bull') cur.bull.push(msg)
    else if (msg.stance === 'bear') cur.bear.push(msg)
    else {
      // neutral / risk 消息居中窄卡展示；该段不再混入双栏
      cur.kind = 'flow'
      cur.flow.push(msg)
    }
  }
  return segments
}

function flowBadgeKind(msg: DebateDTO): 'risk' | 'conflict' | 'neutral' {
  if (msg.stance === 'risk') return 'risk'
  if (msg.speakerKey === 'conflict' || msg.phase === 'conflict') return 'conflict'
  return 'neutral'
}

function DebateMessage({ msg, side, index }: { msg: DebateDTO; side: 'bull' | 'bear' | 'flow'; index: number }) {
  const fromRight = side === 'bear'
  const badgeKind: 'bull' | 'bear' | 'risk' | 'conflict' | 'neutral' =
    side === 'bull' ? 'bull' : side === 'bear' ? 'bear' : flowBadgeKind(msg)
  return (
    <motion.article
      initial={{ opacity: 0, x: fromRight ? 16 : side === 'bull' ? -16 : 0, y: side === 'flow' ? 8 : 0 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2) }}
      className={cn(
        'rounded-lg border-l-2 px-4 py-3',
        side === 'bull' && 'border-l-bull bg-bull/5',
        side === 'bear' && 'border-l-bear bg-bear/5',
        side === 'flow' &&
          (msg.stance === 'risk'
            ? 'mx-auto w-full max-w-2xl border-l-risk bg-risk/5'
            : msg.phase === 'conflict'
              ? 'mx-auto w-full max-w-2xl border-l-gold bg-gold/5'
              : 'mx-auto w-full max-w-2xl border-l-border bg-muted/40'),
      )}
    >
      <header className="mb-1.5 flex items-center gap-2">
        <GeoBadge kind={badgeKind} className="size-7" />
        <span className="text-[13px] font-bold">{msg.speakerName}</span>
        <span className="micro-label rounded bg-muted/60 px-1.5 py-0.5 text-[9px]">{PHASE_TAG[msg.phase]}</span>
        <ModelChip model="mimo-v2.5" tone="gold" className="hidden sm:inline-flex" />
        <span className="num ml-auto shrink-0 text-[9px] text-muted-foreground/60">
          R{String(msg.round).padStart(2, '0')}
        </span>
      </header>
      <p className="whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">{msg.content}</p>
    </motion.article>
  )
}

function RoundSeparator({ round, phase }: { round: number; phase: DebateDTO['phase'] }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={`第 ${round} 回合 · ${PHASE_TAG[phase]}`}>
      <span className="h-px flex-1 bg-border/80" aria-hidden />
      <span className="num rounded border border-border/70 bg-muted/50 px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
        ROUND {String(round).padStart(2, '0')} · {PHASE_TAG[phase]}
      </span>
      <span className="h-px flex-1 bg-border/80" aria-hidden />
    </div>
  )
}

function ConflictBanner() {
  return (
    <div className="overflow-hidden rounded-lg border border-gold/40" role="alert">
      {/* 顶部警示斜纹带 */}
      <div className="conflict-hazard h-1.5 w-full" aria-hidden />
      <div className="flex items-center gap-3 bg-gold/5 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gold/15 text-gold">
          <Zap className="size-4 live-dot" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="micro-label text-gold">Conflict Detected · 冲突检测触发</p>
          <p className="text-[13px] font-semibold text-gold">多空观点分差达标 — 冲突调解员已介入针对性论证</p>
        </div>
        <span className="micro-label ml-auto hidden shrink-0 text-gold/70 sm:inline">ARBITRATION</span>
      </div>
    </div>
  )
}

function TypingBubble({ side }: { side: 'bull' | 'bear' }) {
  return (
    <div className={cn('flex', side === 'bear' && 'justify-end')}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border-l-2 px-4 py-3',
          side === 'bull' ? 'border-l-bull bg-bull/5' : 'border-l-bear bg-bear/5',
        )}
        aria-label="发言生成中"
      >
        <GeoBadge kind={side} className="size-7" />
        <span className={cn('flex gap-1', side === 'bull' ? 'text-bull' : 'text-bear')} aria-hidden>
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
        <span className="num text-[10px] text-muted-foreground">{side === 'bull' ? 'BULL' : 'BEAR'} DRAFTING…</span>
      </div>
    </div>
  )
}

interface DebateTabProps {
  debates: DebateDTO[]
  debating: boolean
}

export function DebateTab({ debates, debating }: DebateTabProps) {
  const sorted = useMemo(
    () =>
      [...debates].sort((a, b) => {
        if (a.round !== b.round) return a.round - b.round
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }),
    [debates],
  )
  const segments = useMemo(() => buildSegments(sorted), [sorted])

  // 打字指示：推断下一个发言方（最后一条是 bull → bear 起草，反之类）
  const lastMsg = sorted.length > 0 ? sorted[sorted.length - 1] : null
  const typingSide: 'bull' | 'bear' | null =
    debating && lastMsg
      ? lastMsg.stance === 'bull'
        ? 'bear'
        : lastMsg.stance === 'bear'
          ? 'bull'
          : null
      : debating && !lastMsg
        ? 'bull'
        : null
  const hasConflict = segments.some((s) => s.phase === 'conflict')
  const bullCount = sorted.filter((m) => m.stance === 'bull').length
  const bearCount = sorted.filter((m) => m.stance === 'bear').length

  return (
    <div className="space-y-4">
      {/* 辩论厅标头 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="micro-label flex items-center gap-2 text-foreground/80">
          <Gavel className="size-3.5 text-gold" aria-hidden />
          Investment Debate — 多空辩论厅
        </h2>
        <div className="flex items-center gap-3">
          <span className="micro-label flex items-center gap-1.5 text-bull">
            <TrendingUp className="size-3" aria-hidden /> BULL 多方
            <span className="num text-[10px] text-bull/70">×{bullCount}</span>
          </span>
          <span className="num text-[10px] text-muted-foreground/60">VS</span>
          <span className="micro-label flex items-center gap-1.5 text-bear">
            <span className="num text-[10px] text-bear/70">×{bearCount}</span>
            BEAR 空方 <TrendingDown className="size-3" aria-hidden />
          </span>
        </div>
      </div>

      {/* 辩论厅舞台 */}
      <div className="panel relative overflow-hidden px-4 py-5 sm:px-6">
        <div className="chamber-bull-side pointer-events-none absolute inset-y-0 left-0 w-1/2" aria-hidden />
        <div className="chamber-bear-side pointer-events-none absolute inset-y-0 right-0 w-1/2" aria-hidden />
        <div className="pointer-events-none absolute inset-y-4 left-1/2 hidden w-px bg-border/70 md:block" aria-hidden />

        {sorted.length === 0 ? (
          debating ? (
            <div className="relative mx-auto max-w-md">
              <TerminalWait label="DEBATE CHAMBER · 辩论准备中" model="mimo-v2.5" tone="gold" />
              <div className="mt-4 space-y-3" aria-hidden>
                <div className="shimmer h-16 rounded-lg bg-muted/40" />
                <div className="ml-auto w-5/6">
                  <div className="shimmer h-14 rounded-lg bg-muted/40" />
                </div>
              </div>
            </div>
          ) : (
            <p className="relative py-10 text-center text-sm text-muted-foreground">暂无辩论记录</p>
          )
        ) : (
          <div className="relative space-y-5">
            {segments.map((seg, si) => {
              const showRound = si === 0 || segments[si - 1].round !== seg.round
              return (
                <Fragment key={seg.key}>
                  {showRound && <RoundSeparator round={seg.round} phase={seg.phase} />}
                  {seg.phase === 'conflict' && (
                    <div className="space-y-3">
                      <ConflictBanner />
                      {seg.flow.map((msg, i) => (
                        <DebateMessage key={msg.id} msg={msg} side="flow" index={i} />
                      ))}
                    </div>
                  )}
                  {seg.kind === 'pair' ? (
                    <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                      <div className="space-y-3">
                        {seg.bull.map((msg, i) => (
                          <DebateMessage key={msg.id} msg={msg} side="bull" index={i} />
                        ))}
                        {typingSide === 'bull' && si === segments.length - 1 && <TypingBubble side="bull" />}
                      </div>
                      <div className="space-y-3">
                        {seg.bear.map((msg, i) => (
                          <DebateMessage key={msg.id} msg={msg} side="bear" index={i} />
                        ))}
                        {typingSide === 'bear' && si === segments.length - 1 && <TypingBubble side="bear" />}
                      </div>
                    </div>
                  ) : seg.phase !== 'conflict' ? (
                    <div className="space-y-3">
                      {seg.flow.map((msg, i) => (
                        <DebateMessage key={msg.id} msg={msg} side="flow" index={i} />
                      ))}
                    </div>
                  ) : null}
                </Fragment>
              )
            })}

            {/* 风控审查等待指示 */}
            {debating && typingSide == null && lastMsg && lastMsg.phase !== 'risk' && (
              <div className="flex items-center gap-2 border-t border-border/50 pt-3">
                <ShieldAlert className="size-3.5 text-risk" aria-hidden />
                <span className="num text-[10px] text-muted-foreground">RISK OFFICER REVIEWING…</span>
                <span className="flex gap-1 text-risk" aria-hidden>
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              </div>
            )}
          </div>
        )}

        {/* 冲突检测状态脚注 */}
        <div className="mt-4 flex items-center gap-2 border-t border-border/50 pt-2.5">
          <span className={cn('led', hasConflict ? 'text-gold' : debating ? 'text-hold' : 'text-muted-foreground/50')} aria-hidden />
          <span className="num text-[10px] text-muted-foreground/70">
            {hasConflict
              ? 'CONFLICT RESOLUTION EXECUTED · 冲突仲裁已完成'
              : debating
                ? 'CONFLICT MONITOR ACTIVE · 冲突检测监控中'
                : 'CONFLICT MONITOR STANDBY · 分差 ≥ 2 档自动触发仲裁'}
          </span>
          <span className="num ml-auto text-[10px] text-muted-foreground/50">{sorted.length} MESSAGES</span>
        </div>
      </div>
    </div>
  )
}
