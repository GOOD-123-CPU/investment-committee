'use client'

// 自选池：GET /api/watchlist（附带实时行情），行内 查看 / 删除；终端表格 + 价格闪烁
// Task 10-a 视觉打磨：表头色带 / 发丝分隔 / 150ms hover / 等宽数字，API 逻辑不变

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Inbox, Loader2, RefreshCw, ShieldAlert, Sparkles, X } from 'lucide-react'
import type { LiveQuote } from '@/lib/data/quotes'
import type { OpenSessionFn, WatchlistRow } from '@/lib/client-utils'
import { formatPct, ratingTone, riskTone, scoreBarClass } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type WatchRow = WatchlistRow & { quote?: LiveQuote | null }

/** 冷启动热门研究预设：点击直接发起投委会（完成后可加入自选池） */
const HOT_PRESETS: { name: string; code: string; market: string }[] = [
  { name: '贵州茅台', code: '600519', market: 'A股' },
  { name: '腾讯控股', code: '00700', market: '港股' },
  { name: '宁德时代', code: '300750', market: 'A股' },
  { name: '英伟达', code: 'NVDA', market: '美股' },
]

function QuoteCell({ row, flash }: { row: WatchRow; flash: Record<string, string> }) {
  const q = row.quote
  if (!q || !(q.price > 0)) return <span className="num text-muted-foreground">—</span>
  const up = q.changePct >= 0
  return (
    <div className="flex flex-col items-end leading-tight">
      <span key={q.price} className={cn('num text-sm font-medium', flash[row.stockCode])}>
        {q.price.toFixed(2)}
      </span>
      <span className={cn('num text-xs font-semibold', up ? 'text-bull' : 'text-bear')}>
        {up ? '▲' : '▼'} {formatPct(q.changePct)}
      </span>
    </div>
  )
}

function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground">—</span>
  const v = Math.round(score)
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="relative h-1 w-14 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full', scoreBarClass(score))}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </span>
      <span className="num w-6 text-right text-sm font-semibold">{v}</span>
    </div>
  )
}

function Chip({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold',
        cls,
      )}
    >
      {label}
    </span>
  )
}

function WatchlistSkeleton() {
  return (
    <div className="space-y-2 p-4 sm:p-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="shimmer relative h-12 w-full overflow-hidden rounded-lg" />
      ))}
    </div>
  )
}

interface WatchlistSectionProps {
  refreshKey: number
  onOpenSession: OpenSessionFn
  /** 冷启动热门预设：一键发起研究 */
  onQuickResearch?: (query: string) => void
}

export function WatchlistSection({ refreshKey, onOpenSession, onQuickResearch }: WatchlistSectionProps) {
  const [items, setItems] = useState<WatchRow[]>([])
  const [flash, setFlash] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingCode, setDeletingCode] = useState<string | null>(null)
  const prevPriceRef = useRef<Record<string, number>>({})
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/watchlist', { cache: 'no-store' })
      const data = (await res.json().catch(() => null)) as { items?: WatchRow[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? `加载自选池失败 (${res.status})`)
      const next = Array.isArray(data?.items) ? data.items : []
      // 价格闪烁：与上一次拉取对比
      const nextFlash: Record<string, string> = {}
      for (const it of next) {
        const p = it.quote?.price
        if (!p || !(p > 0)) continue
        const prev = prevPriceRef.current[it.stockCode]
        if (prev !== undefined && prev !== p) {
          nextFlash[it.stockCode] = p > prev ? 'flash-up' : 'flash-down'
        }
        prevPriceRef.current[it.stockCode] = p
      }
      setFlash(nextFlash)
      setItems(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载自选池失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const handleDelete = async (row: WatchRow) => {
    setDeletingCode(row.stockCode)
    try {
      const res = await fetch(`/api/watchlist?code=${encodeURIComponent(row.stockCode)}`, { method: 'DELETE' })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? '删除失败')
      setItems((prev) => prev.filter((i) => i.id !== row.id))
      toast({ title: '已移出自选池', description: `${row.stockName}（${row.stockCode}）` })
    } catch (e) {
      toast({
        title: '删除失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setDeletingCode(null)
    }
  }

  return (
    <section id="watchlist" className="scroll-mt-24">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="micro-label flex items-center gap-2">
            Watchlist
            <span className="inline-flex items-center gap-1.5 text-bull">
              <span aria-hidden className="led" />
              Live
            </span>
          </p>
          <h2 className="mt-1.5 flex items-baseline gap-2.5 text-xl font-bold tracking-tight sm:text-2xl">
            自选池
            {!loading && items.length > 0 && (
              <span className="num rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {items.length}
              </span>
            )}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={() => void load()}
          disabled={loading}
          aria-label="刷新自选池"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden />
        </Button>
      </div>

      <div className="panel overflow-hidden">
        {loading && items.length === 0 ? (
          <WatchlistSkeleton />
        ) : error ? (
          <div className="p-4 sm:p-5">
            <Alert variant="destructive" className="border-bear/40">
              <ShieldAlert className="size-4" aria-hidden />
              <AlertTitle>加载失败</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                {error}
                <Button size="sm" variant="outline" onClick={() => void load()}>
                  重试
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : items.length === 0 ? (
          <div className="m-4 flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center sm:m-5">
            <Inbox className="size-6 text-muted-foreground/60" aria-hidden />
            <p className="text-sm text-muted-foreground">
              自选池为空 — 完成一次研究后点击「加入自选池」
            </p>
            {/* 冷启动：热门一键研究（完成后即可加入自选） */}
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <span className="micro-label inline-flex items-center gap-1 text-[9px]">
                <Sparkles className="size-3 text-gold" aria-hidden />
                热门研究
              </span>
              {HOT_PRESETS.map((h) => (
                <button
                  key={h.code}
                  type="button"
                  disabled={!onQuickResearch}
                  onClick={() => onQuickResearch?.(`分析 ${h.name}(${h.code}) 是否值得投资`)}
                  className="panel-flat inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-gold/50 hover:text-foreground"
                  title={`一键发起 ${h.name} 投委会研究`}
                >
                  <span className="font-medium">{h.name}</span>
                  <span className="num text-[10px] text-muted-foreground/80">{h.code}</span>
                  <span className="num text-[9px] text-gold/80">{h.market}</span>
                  <ArrowRight className="size-3 text-muted-foreground/60" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 桌面终端表格 */}
            <div className="hidden overflow-x-auto nice-scroll md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="micro-label px-4 py-3 text-left font-semibold">标的 / 代码</th>
                    <th className="micro-label px-4 py-3 text-right font-semibold">实时价</th>
                    <th className="micro-label px-4 py-3 text-right font-semibold">AI Score</th>
                    <th className="micro-label px-4 py-3 text-left font-semibold">评级</th>
                    <th className="micro-label px-4 py-3 text-left font-semibold">风险</th>
                    <th className="micro-label px-4 py-3 text-right font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const rTone = ratingTone(row.rating)
                    const risk = riskTone(row.riskLevel)
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/50 transition-colors duration-150 last:border-b-0 hover:bg-muted/40"
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-col leading-tight">
                            <span className="font-semibold">{row.stockName}</span>
                            <span className="num text-xs text-muted-foreground">{row.stockCode}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <QuoteCell row={row} flash={flash} />
                        </td>
                        <td className="px-4 py-3">
                          <ScoreCell score={row.aiScore} />
                        </td>
                        <td className="px-4 py-3">
                          {row.rating ? (
                            <Chip label={row.rating} cls={rTone.badge} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.riskLevel ? (
                            <Chip label={row.riskLevel} cls={risk.badge} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 px-2.5 text-xs"
                              onClick={() =>
                                onOpenSession(
                                  row.sessionId,
                                  [{ id: row.sessionId, stockName: row.stockName, stockCode: row.stockCode }],
                                  null,
                                )
                              }
                              aria-label={`查看 ${row.stockName} 的研究`}
                            >
                              查看研究
                              <ArrowRight className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-bear"
                              onClick={() => void handleDelete(row)}
                              disabled={deletingCode === row.stockCode}
                              aria-label={`删除 ${row.stockName}`}
                            >
                              {deletingCode === row.stockCode ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              ) : (
                                <X className="size-4" aria-hidden />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片 */}
            <div className="divide-y divide-border/50 md:hidden">
              {items.map((row) => {
                const rTone = ratingTone(row.rating)
                const risk = riskTone(row.riskLevel)
                const q = row.quote
                const up = (q?.changePct ?? 0) >= 0
                return (
                  <div key={row.id} className="p-4 transition-colors duration-150">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 leading-tight">
                        <p className="truncate font-semibold">{row.stockName}</p>
                        <p className="num text-xs text-muted-foreground">{row.stockCode}</p>
                      </div>
                      <div className="shrink-0 text-right leading-tight">
                        {q && q.price > 0 ? (
                          <>
                            <span key={q.price} className={cn('num text-sm font-medium', flash[row.stockCode])}>
                              {q.price.toFixed(2)}
                            </span>
                            <p className={cn('num text-xs font-semibold', up ? 'text-bull' : 'text-bear')}>
                              {up ? '▲' : '▼'} {formatPct(q.changePct)}
                            </p>
                          </>
                        ) : (
                          <span className="num text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex items-center gap-2">
                        <span className="micro-label text-[9px]">Score</span>
                        <span className="relative h-1 w-14 overflow-hidden rounded-full bg-muted">
                          {row.aiScore != null && (
                            <span
                              className={cn('absolute inset-y-0 left-0 rounded-full', scoreBarClass(row.aiScore))}
                              style={{ width: `${Math.min(100, Math.max(0, row.aiScore))}%` }}
                            />
                          )}
                        </span>
                        <span className="num text-sm font-semibold">{row.aiScore != null ? Math.round(row.aiScore) : '—'}</span>
                      </div>
                      {row.rating && <Chip label={row.rating} cls={rTone.badge} />}
                      {row.riskLevel && <Chip label={row.riskLevel} cls={risk.badge} />}
                    </div>

                    <div className="mt-3 flex items-center gap-1 border-t border-border/50 pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2.5 text-xs"
                        onClick={() =>
                          onOpenSession(
                            row.sessionId,
                            [{ id: row.sessionId, stockName: row.stockName, stockCode: row.stockCode }],
                            null,
                          )
                        }
                        aria-label={`查看 ${row.stockName} 的研究`}
                      >
                        查看研究
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-8 text-muted-foreground hover:text-bear"
                        onClick={() => void handleDelete(row)}
                        disabled={deletingCode === row.stockCode}
                        aria-label={`删除 ${row.stockName}`}
                      >
                        {deletingCode === row.stockCode ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <X className="size-4" aria-hidden />
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
