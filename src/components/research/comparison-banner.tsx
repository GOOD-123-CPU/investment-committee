'use client'

// 对比模式裁决横幅：轮询 POST /api/compare，完成后渲染 VS 裁决台
// VS 得分对决（胜者金冠 + 分差 Δ）+ 裁决摘要 + 分维度对比 + 配置建议 + 明细表

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Crown, Sparkles, Trophy } from 'lucide-react'
import type { ComparisonVerdict } from '@/lib/types'
import { ratingTone } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function ComparisonSkeleton() {
  return (
    <section className="panel shimmer p-5" aria-label="对比裁决生成中">
      <div className="flex items-center gap-2">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="shimmer mt-3 h-4 w-full rounded" />
      <Skeleton className="shimmer mt-2 h-4 w-2/3 rounded" />
      <p className="num mt-3 text-[10px] text-muted-foreground">等待双方研究完成后生成对比裁决…</p>
    </section>
  )
}

function VsScoreBlock({
  name,
  code,
  score,
  rating,
  winner,
  delay,
}: {
  name: string
  code: string
  score: number
  rating: string
  winner: boolean
  delay: number
}) {
  const tone = ratingTone(rating)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={cn(
        'panel-flat relative flex flex-1 items-center gap-4 p-4',
        winner && 'glow-gold border-gold/50',
      )}
    >
      {winner && (
        <Crown className="absolute -top-2.5 left-4 size-5 rounded-full bg-background p-0.5 text-gold" aria-label="胜出" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{name}</p>
        <p className="num text-[11px] text-muted-foreground">{code}</p>
        <span className={cn('mt-1.5 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold', tone.badge)}>
          {rating}
        </span>
      </div>
      <p className={cn('num text-4xl font-extrabold leading-none', tone.text)}>{score}</p>
    </motion.div>
  )
}

interface ComparisonBannerProps {
  groupId: string
}

export function ComparisonBanner({ groupId }: ComparisonBannerProps) {
  const [verdict, setVerdict] = useState<ComparisonVerdict | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    const loop = async () => {
      try {
        const res = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId }),
          cache: 'no-store',
        })
        const data = (await res.json().catch(() => null)) as { verdict?: ComparisonVerdict | null } | null
        if (cancelled) return
        const v = data?.verdict ?? null
        setVerdict(v)
        if (!v) timerRef.current = setTimeout(loop, 3000)
      } catch {
        if (!cancelled) timerRef.current = setTimeout(loop, 4000)
      }
    }
    void loop()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [groupId])

  if (!verdict) return <ComparisonSkeleton />

  const rows = verdict.rows ?? []
  const topScore = Math.max(...rows.map((r) => r.finalScore))
  const delta = rows.length >= 2 ? Math.abs(rows[0].finalScore - rows[1].finalScore) : null

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="panel border-gold/40 p-5 sm:p-6"
      aria-label="对比裁决"
    >
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <span className="micro-label flex items-center gap-2 text-gold">
          <Trophy className="size-3.5" aria-hidden />
          Comparison Verdict · 对比裁决
        </span>
        <div className="flex items-center gap-2">
          {delta != null && (
            <span className="num rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Δ {delta} PTS
            </span>
          )}
          <span className="micro-label rounded border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">
            胜出 {verdict.winner}
          </span>
        </div>
      </div>

      {/* VS 得分对决 */}
      {rows.length >= 2 && (
        <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <VsScoreBlock
            name={rows[0].stockName}
            code={rows[0].stockCode}
            score={rows[0].finalScore}
            rating={rows[0].rating}
            winner={rows[0].finalScore >= topScore && rows[0].finalScore > rows[1].finalScore}
            delay={0}
          />
          <span
            className="num flex items-center justify-center text-sm font-black tracking-widest text-muted-foreground/60"
            aria-hidden
          >
            VS
          </span>
          <VsScoreBlock
            name={rows[1].stockName}
            code={rows[1].stockCode}
            score={rows[1].finalScore}
            rating={rows[1].rating}
            winner={rows[1].finalScore >= topScore && rows[1].finalScore > rows[0].finalScore}
            delay={0.08}
          />
        </div>
      )}

      <div className="mt-4">
        <span className="micro-label">Summary · 裁决摘要</span>
        <p className="mt-1 text-[13px] leading-6 text-foreground/90">{verdict.summary}</p>
      </div>

      {/* 分维度对比 */}
      {verdict.dimensions?.length > 0 && (
        <div className="mt-4 space-y-2">
          <span className="micro-label">Dimensions · 分维度对比</span>
          {verdict.dimensions.map((dim, i) => {
            const better = rows.find((r) => r.stockName === dim.better)
            const betterTone = better ? ratingTone(better.rating) : null
            return (
              <div
                key={i}
                className="grid gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-background/40 px-3 py-2 md:grid-cols-[2rem_9rem_7rem_1fr] md:items-baseline"
              >
                <span className="num text-[10px] font-bold text-muted-foreground/60">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] font-semibold">{dim.name}</span>
                <span
                  className={cn(
                    'micro-label w-fit rounded border px-1.5 py-0.5',
                    betterTone ? betterTone.badge : 'border-bull/30 bg-bull/10 text-bull',
                  )}
                >
                  {dim.better} 占优
                </span>
                <span className="min-w-0 text-xs leading-5 text-muted-foreground">{dim.reason}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* 配置建议 */}
      {verdict.allocationSuggestion && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.06] px-4 py-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="micro-label text-primary">Allocation Suggestion · 配置建议</p>
            <p className="mt-0.5 text-[13px] leading-6">{verdict.allocationSuggestion}</p>
          </div>
        </div>
      )}

      {/* 明细表 */}
      {rows.length > 0 && (
        <div className="nice-scroll mt-4 overflow-x-auto border-t border-border/50 pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标的</TableHead>
                <TableHead className="text-center">AI Score</TableHead>
                <TableHead>评级</TableHead>
                <TableHead className="hidden md:table-cell">最强项</TableHead>
                <TableHead className="hidden md:table-cell">最弱项</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const tone = ratingTone(row.rating)
                const isWinner = row.stockName === verdict.winner
                return (
                  <TableRow key={row.stockCode} className={cn(isWinner && 'bg-gold/[0.05]')}>
                    <TableCell>
                      <span className="text-[13px] font-semibold">
                        {isWinner && <Crown className="mr-1 inline size-3 text-gold" aria-label="胜出" />}
                        {row.stockName}
                      </span>
                      <span className="num ml-1.5 text-xs text-muted-foreground">{row.stockCode}</span>
                    </TableCell>
                    <TableCell className={cn('num text-center text-base font-bold', tone.text)}>{row.finalScore}</TableCell>
                    <TableCell>
                      <span className={cn('micro-label rounded border px-1.5 py-0.5', tone.badge)}>{row.rating}</span>
                    </TableCell>
                    <TableCell className="hidden max-w-56 align-top md:table-cell">
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground" title={row.strongest}>
                        {row.strongest}
                      </p>
                    </TableCell>
                    <TableCell className="hidden max-w-56 align-top md:table-cell">
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground" title={row.weakest}>
                        {row.weakest}
                      </p>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </motion.section>
  )
}
