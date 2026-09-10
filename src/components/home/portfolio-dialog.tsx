'use client'

// 组合诊断：动态持仓行 + POST /api/portfolio → PortfolioResult 渲染（风险报告读数风格）

import { useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Loader2,
  Minus,
  PieChart,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import type { PortfolioResult } from '@/lib/types'
import { riskTone } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { searchStocks } from '@/lib/data/stocks'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

interface HoldingRow {
  key: string
  name: string
  weight: string
}

interface SuggestionActionMeta {
  icon: typeof ArrowDown
  cls: string
  label: string
}

const ACTION_META: Record<PortfolioResult['suggestions'][number]['action'], SuggestionActionMeta> = {
  reduce: { icon: ArrowDown, cls: 'bg-bear/10 text-bear', label: '减持' },
  increase: { icon: ArrowUp, cls: 'bg-bull/10 text-bull', label: '增持' },
  hold: { icon: Minus, cls: 'bg-hold/10 text-hold', label: '持有' },
  watch: { icon: Eye, cls: 'bg-muted text-muted-foreground', label: '观察' },
}

const LEVEL_DOT: Record<PortfolioResult['metrics'][number]['level'], string> = {
  good: 'bg-bull',
  warn: 'bg-hold',
  bad: 'bg-bear',
}

let rowSeq = 0
const newRow = (): HoldingRow => {
  rowSeq += 1
  return { key: `row-${rowSeq}`, name: '', weight: '' }
}

function StockNameInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const hits = useMemo(() => (value.trim() ? searchStocks(value, 5) : []), [value])
  return (
    <div className="relative flex-1">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? '股票名称，如 贵州茅台'}
        aria-label="持仓股票名称"
        autoComplete="off"
        className="h-10"
      />
      {open && hits.length > 0 && (
        <ul className="panel nice-scroll absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto p-1">
          {hits.map((h) => (
            <li key={h.code}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(`${h.name}(${h.code})`)
                  setOpen(false)
                }}
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
              >
                <span className="truncate">
                  {h.name}
                  <span className="num ml-1.5 text-xs text-muted-foreground">{h.code}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{h.industry}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ResultSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="shimmer relative h-8 w-2/3 overflow-hidden rounded-md" />
      <Skeleton className="shimmer relative h-24 w-full overflow-hidden rounded-lg" />
      <Skeleton className="shimmer relative h-40 w-full overflow-hidden rounded-lg" />
    </div>
  )
}

interface PortfolioDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PortfolioDialog({ open, onOpenChange }: PortfolioDialogProps) {
  const [rows, setRows] = useState<HoldingRow[]>([newRow()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PortfolioResult | null>(null)
  const { toast } = useToast()
  const scrollRef = useRef<HTMLDivElement>(null)

  const totalWeight = rows.reduce((acc, r) => acc + (Number(r.weight) || 0), 0)
  const filledRows = rows.filter((r) => r.name.trim() && Number(r.weight) > 0)

  const reset = () => {
    setRows([newRow()])
    setResult(null)
    setError(null)
    setLoading(false)
  }

  const updateRow = (key: string, patch: Partial<HoldingRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const analyze = async () => {
    const holdings = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), weight: Number(r.weight) || 0 }))
    if (holdings.length === 0) {
      toast({ title: '请至少填写一只持仓', variant: 'destructive' })
      return
    }
    if (holdings.some((h) => h.weight <= 0)) {
      toast({ title: '每只持仓的权重需大于 0', variant: 'destructive' })
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings }),
      })
      const data = (await res.json().catch(() => null)) as { result?: PortfolioResult; error?: string } | null
      if (!res.ok || !data?.result) throw new Error(data?.error ?? `诊断失败 (${res.status})`)
      setResult(data.result)
      window.setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '请稍后重试'
      setError(msg)
      toast({ title: '组合诊断失败', description: msg, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const risk = riskTone(result?.riskLevel)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 sm:px-6">
          <p className="micro-label">Portfolio Risk Diagnostic</p>
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            <span className="flex size-8 items-center justify-center rounded-md border border-gold/40 bg-gold/10 text-gold">
              <PieChart className="size-4" aria-hidden />
            </span>
            组合诊断
          </DialogTitle>
          <DialogDescription>
            录入当前持仓与权重（0-100），AI 将从集中度、行业暴露与相关性角度给出体检报告。
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="nice-scroll flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {!result && !loading && (
            <div className="space-y-4">
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={row.key} className="flex items-center gap-2">
                    <span className="num w-6 shrink-0 text-center text-xs text-muted-foreground/70">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <StockNameInput
                      value={row.name}
                      onChange={(v) => updateRow(row.key, { name: v })}
                    />
                    <Input
                      value={row.weight}
                      onChange={(e) => updateRow(row.key, { weight: e.target.value.replace(/[^\d.]/g, '') })}
                      inputMode="decimal"
                      placeholder="权重 %"
                      aria-label={`第 ${i + 1} 只持仓权重百分比`}
                      className="num h-10 w-24 shrink-0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 shrink-0 text-muted-foreground hover:text-bear"
                      onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : prev))}
                      disabled={rows.length <= 1}
                      aria-label={`删除第 ${i + 1} 行持仓`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-9 gap-1"
                  onClick={() => setRows((prev) => (prev.length < 10 ? [...prev, newRow()] : prev))}
                  disabled={rows.length >= 10}
                >
                  <Plus className="size-4" aria-hidden />
                  添加持仓
                </Button>
                <span
                  className={cn(
                    'num text-xs',
                    Math.round(totalWeight) === 100 ? 'font-semibold text-bull' : 'text-muted-foreground',
                  )}
                >
                  合计 {totalWeight.toFixed(1)}%
                  <span className="ml-1 opacity-70">（建议 100%）</span>
                </span>
              </div>

              {error && (
                <Alert variant="destructive" className="border-bear/40">
                  <ShieldAlert className="size-4" aria-hidden />
                  <AlertTitle>诊断失败</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {loading && <ResultSkeleton />}

          {result && !loading && (
            <div className="space-y-5">
              {/* 集中度读数 */}
              <div className="panel-flat flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <p className="micro-label">Concentration · HHI</p>
                  <p className="num mt-1.5 text-4xl font-bold leading-none tracking-tight">
                    {result.concentrationHHI}
                  </p>
                  <p className="micro-label mt-2 text-gold">{result.concentrationLabel}</p>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold',
                    risk.badge,
                  )}
                >
                  <span aria-hidden className="led" />
                  组合风险 · {result.riskLevel}
                </span>
              </div>

              <p className="text-sm leading-7 text-muted-foreground">{result.summary}</p>

              {/* 持仓权重条 */}
              {filledRows.length > 0 && (
                <div>
                  <p className="micro-label mb-3">Holdings · 持仓权重</p>
                  <div className="space-y-2.5">
                    {filledRows.map((r) => {
                      const w = Number(r.weight) || 0
                      const pct = totalWeight > 0 ? (w / totalWeight) * 100 : 0
                      return (
                        <div key={r.key}>
                          <div className="mb-1 flex items-baseline justify-between gap-2">
                            <span className="truncate text-[13px] font-medium">{r.name.trim()}</span>
                            <span className="num shrink-0 text-xs text-muted-foreground">
                              {w.toFixed(1)}% · 占比 {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/80" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div aria-hidden className="h-px bg-border/60" />

              {/* 行业暴露 */}
              <div>
                <p className="micro-label mb-3">Sector Exposure · 行业暴露</p>
                <div className="space-y-3">
                  {result.sectorExposure.map((s) => (
                    <div key={s.sector}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium">{s.sector}</span>
                        <span className="num text-xs text-muted-foreground">{s.weight.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            s.weight >= 40 ? 'bg-risk/80' : 'bg-primary/80',
                          )}
                          style={{ width: `${Math.min(100, Math.max(0, s.weight))}%` }}
                        />
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{s.names.join(' · ')}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div aria-hidden className="h-px bg-border/60" />

              {/* 组合指标 */}
              <div>
                <p className="micro-label mb-3">Metrics · 组合指标</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {result.metrics.map((m) => (
                    <div key={m.name} className="panel-flat flex items-start gap-2.5 p-3">
                      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', LEVEL_DOT[m.level])} aria-hidden />
                      <div className="min-w-0">
                        <p className="flex items-baseline gap-2 text-[13px] font-medium">
                          {m.name}
                          <span className="num text-xs text-foreground/80">{m.value}</span>
                        </p>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{m.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div aria-hidden className="h-px bg-border/60" />

              {/* 调仓建议 */}
              <div>
                <p className="micro-label mb-3">Suggestions · 调仓建议</p>
                <ul className="space-y-2">
                  {result.suggestions.map((s, i) => {
                    const meta = ACTION_META[s.action]
                    const Icon = meta.icon
                    return (
                      <li key={`${s.name}-${i}`} className="panel-flat flex items-start gap-2.5 p-3">
                        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', meta.cls)}>
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">
                            {meta.label} · {s.name}
                          </p>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{s.reason}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border px-5 py-4 sm:justify-between sm:px-6">
          {result ? (
            <>
              <Button variant="ghost" onClick={reset} className="min-h-10">
                重新录入
              </Button>
              <Button onClick={() => onOpenChange(false)} className="min-h-10">
                完成
              </Button>
            </>
          ) : (
            <>
              <p className="hidden text-xs text-muted-foreground sm:block">诊断基于演示快照库与组合统计模型</p>
              <Button onClick={() => void analyze()} disabled={loading} className="min-h-10 gap-2">
                {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
                开始诊断
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
