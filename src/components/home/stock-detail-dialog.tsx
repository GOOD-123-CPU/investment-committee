'use client'

// 股票详情弹层 — 快照库行情板点击任意标的展开的实时走势详情层
// - 头部：名称 / 行业·市场·代码徽章 + LIVE LED + 最后更新 + 手动刷新 + 关闭
// - 大字价格（flash-up/down）+ 涨跌幅/涨跌额 + 货币
// - 关键统计发丝网格（股票特有）：今开/最高/最低/昨收/成交量/换手率/市盈率TTM/总市值/52周区间(有则)
// - 主图双模式：分时（Area 渐隐 + 昨收基准虚线）/ 日K（蜡烛·线形 + 成交量 + MA20/60，60/120/250 周期）
// - 金色 CTA：发起多智能体研究（直通投委会流水线）
// - 数据流：/api/quote?codes=&intraday= 打开期间 15s 轮询；/api/kline?days=250 打开/换标的时拉取一次
// - 图表复用 index-detail-dialog 导出的 IntradayChart/DailyChart（主题感知 hex，oklch 解析教训规避）

import { useEffect, useRef, useState } from 'react'
import { Briefcase, RefreshCw, X, Zap } from 'lucide-react'
import type { IntradayPoint, KlineBar, LiveQuote } from '@/lib/data/quotes'
import { formatPct } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ChartPlaceholder, DailyChart, IntradayChart, computeMA, usePriceFlash } from './index-detail-dialog'

// ---------- 常量与格式化 ----------

const KLINE_DAYS = 250
const RANGES = [60, 120, 250] as const
type Range = (typeof RANGES)[number]

/** 内部代码 → 腾讯符号（与 universe-board 数据层同构） */
function tencentSymbol(market: 'SH' | 'SZ' | 'BJ' | 'HK' | 'US', code: string): string {
  if (market === 'HK') return `hk${code.padStart(5, '0')}`
  if (market === 'US') return `us${code}`
  return `${market.toLowerCase()}${code}`
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtChange(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ''
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}

function fmtVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '—'
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万`
  return v.toLocaleString('zh-CN')
}

/** 成交额（腾讯源「万」）→ 亿/万 自适应 */
function fmtAmount(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '—'
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}亿`
  return `${v.toFixed(0)}万`
}

function fmtCap(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '—'
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万亿`
  return `${v.toFixed(0)}亿`
}

function fmtQuoteTime(t: string | null | undefined): string {
  if (!t) return '—'
  if (t.includes('T')) {
    const d = new Date(t)
    if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString('zh-CN', { hour12: false })
  }
  return t.includes(' ') ? (t.split(' ')[1] ?? t) : t
}

function fmtClock(ts: number | null): string {
  return ts == null ? '--:--:--' : new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function samePoints(a: IntradayPoint[], b: IntradayPoint[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].time !== b[i].time || a[i].price !== b[i].price) return false
  }
  return true
}

// ---------- 详情行类型（与行情板 BoardRow 结构对齐的最小集） ----------

export interface StockDetailRow {
  code: string
  name: string
  market: 'SH' | 'SZ' | 'BJ' | 'HK' | 'US'
  industry: string | null
  price: number
  change: number
  changePct: number
  amount: number
  turnoverRate: number | null
  peTtm: number | null
  marketCap: number | null
  currency: string
  time: string
}

const MARKET_TONE: Record<StockDetailRow['market'], string> = {
  SH: 'border-primary/35 bg-primary/10 text-primary',
  SZ: 'border-bull/35 bg-bull/10 text-bull',
  BJ: 'border-hold/35 bg-hold/10 text-hold',
  HK: 'border-gold/35 bg-gold/10 text-gold',
  US: 'border-bear/35 bg-bear/10 text-bear',
}

const MARKET_NAME: Record<StockDetailRow['market'], string> = {
  SH: '上交所',
  SZ: '深交所',
  BJ: '北交所',
  HK: '港交所',
  US: '美股',
}

// ---------- 配置 chips / 分段按钮（与指数详情同款） ----------

function ConfigChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'num rounded-md border px-2 py-1 text-[10px] font-medium transition-colors duration-150',
        active ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border/70 bg-muted/40 text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 text-[10px] font-medium transition-colors duration-150',
        active ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function ModeTab({ active, onClick, zh, en }: { active: boolean; onClick: () => void; zh: string; en: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-baseline gap-1.5 px-3 py-1.5 transition-colors duration-150',
        active ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="text-[11px] font-semibold">{zh}</span>
      <span className="num text-[8px] tracking-widest opacity-70">{en}</span>
    </button>
  )
}

// ---------- 主组件 ----------

export interface StockDetailDialogProps {
  open: boolean
  /** 弹层目标标的；父组件在关闭动画期间保留引用以保证平滑退出 */
  row: StockDetailRow | null
  onOpenChange: (open: boolean) => void
  /** 发起多智能体研究（父级负责关闭弹层并直通流水线） */
  onResearch?: (query: string) => void
}

interface StatCellData {
  label: string
  en: string
  value: string
}

export function StockDetailDialog({ open, row, onOpenChange, onResearch }: StockDetailDialogProps) {
  // 图表配置（跨打开保留用户偏好）
  const [mode, setMode] = useState<'intraday' | 'daily'>('intraday')
  const [range, setRange] = useState<Range>(120)
  const [showMA20, setShowMA20] = useState(true)
  const [showMA60, setShowMA60] = useState(true)
  const [showVol, setShowVol] = useState(true)
  const [candleStyle, setCandleStyle] = useState<'candles' | 'line'>('candles')

  // 数据状态（以 symbol 为键隔离，切换标的天然不串数据）
  const [quoteState, setQuoteState] = useState<{ sym: string; quote: LiveQuote | null } | null>(null)
  const [intradayState, setIntradayState] = useState<{ sym: string; points: IntradayPoint[] } | null>(null)
  const [klineState, setKlineState] = useState<{ sym: string; bars: KlineBar[] } | null>(null)
  const [updState, setUpdState] = useState<{ sym: string; ts: number } | null>(null)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [quoteTick, setQuoteTick] = useState(0)
  const [klineTick, setKlineTick] = useState(0)
  const klineFetchedRef = useRef<{ sym: string; tick: number } | null>(null)

  const sym = row ? tencentSymbol(row.market, row.code) : null

  // 行情 + 分时：弹层打开期间每 15s 轮询（实时信息更新）
  useEffect(() => {
    if (!open || !sym) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/quote?codes=${encodeURIComponent(sym)}&intraday=${encodeURIComponent(sym)}`, {
          cache: 'no-store',
        })
        const d = (await res.json()) as { quotes?: Record<string, LiveQuote>; intraday?: IntradayPoint[] | null; ts?: number }
        if (cancelled) return
        const nextPoints = Array.isArray(d.intraday) ? d.intraday : []
        setQuoteState({ sym, quote: d.quotes?.[sym] ?? null })
        setIntradayState((prev) =>
          prev && prev.sym === sym && samePoints(prev.points, nextPoints) ? prev : { sym, points: nextPoints },
        )
        setUpdState({ sym, ts: typeof d.ts === 'number' ? d.ts : Date.now() })
      } catch {
        // 静默：保留上一次数据
      } finally {
        if (!cancelled) setQuoteBusy(false)
      }
    }
    const kickoff = setTimeout(() => void load(), 0)
    const timer = setInterval(() => void load(), 15_000)
    return () => {
      cancelled = true
      clearTimeout(kickoff)
      clearInterval(timer)
    }
  }, [open, sym, quoteTick])

  // 日K：打开/换标的/手动刷新时拉取一次
  useEffect(() => {
    if (!open || !sym) return
    const fetched = klineFetchedRef.current
    if (fetched && fetched.sym === sym && fetched.tick === klineTick) return
    klineFetchedRef.current = { sym, tick: klineTick }
    let cancelled = false
    fetch(`/api/kline?code=${encodeURIComponent(sym)}&days=${KLINE_DAYS}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ kline?: KlineBar[] }>)
      .then((d) => {
        if (cancelled) return
        setKlineState({ sym, bars: Array.isArray(d.kline) ? d.kline : [] })
      })
      .catch(() => {
        if (!cancelled) setKlineState({ sym, bars: [] })
      })
    return () => {
      cancelled = true
    }
  }, [open, sym, klineTick])

  const handleRefresh = () => {
    if (!sym) return
    setQuoteBusy(true)
    setQuoteTick((t) => t + 1)
    setKlineTick((t) => t + 1)
  }

  // 派生数据（按 sym 隔离）
  const quote = quoteState && quoteState.sym === sym ? quoteState.quote : null
  const intraday = intradayState && intradayState.sym === sym ? intradayState.points : null
  const bars = klineState && klineState.sym === sym ? klineState.bars : null
  const updatedTs = updState && updState.sym === sym ? updState.ts : null

  const price = quote?.price ?? row?.price ?? null
  const changePct = quote?.changePct ?? row?.changePct ?? null
  const change = quote?.change ?? row?.change ?? null
  const currency = quote?.currency ?? row?.currency ?? ''
  const flash = usePriceFlash(price)
  const up = (changePct ?? 0) >= 0

  const baseline = quote?.prevClose ?? intraday?.[0]?.price ?? null
  const intradayUp = baseline != null ? (intraday?.[intraday.length - 1]?.price ?? price ?? baseline) >= baseline : up

  const intradayPhase: 'loading' | 'empty' | 'ok' = intraday == null ? 'loading' : intraday.length > 0 ? 'ok' : 'empty'
  const dailyPhase: 'loading' | 'empty' | 'ok' = bars == null ? 'loading' : bars.length > 0 ? 'ok' : 'empty'

  // 关键统计（股票特有九格）
  const stats: StatCellData[] = [
    { label: '今开', en: 'OPEN', value: fmtPrice(quote?.open ?? null) },
    { label: '最高', en: 'HIGH', value: fmtPrice(quote?.high ?? null) },
    { label: '最低', en: 'LOW', value: fmtPrice(quote?.low ?? null) },
    { label: '昨收', en: 'PREV', value: fmtPrice(quote?.prevClose ?? null) },
    { label: '成交量', en: 'VOLUME', value: fmtVolume(quote?.volume ?? null) },
    { label: '成交额', en: 'AMOUNT', value: fmtAmount(row?.amount ?? quote?.amount ?? null) },
    { label: '换手率', en: 'TURNOVER', value: row?.turnoverRate != null ? `${row.turnoverRate.toFixed(2)}%` : '—' },
    { label: '市盈率 TTM', en: 'PE', value: row?.peTtm != null && row.peTtm > 0 ? row.peTtm.toFixed(1) : '—' },
    { label: '总市值', en: 'MKT CAP', value: fmtCap(row?.marketCap ?? null) },
  ]
  if (quote?.high52w != null || quote?.low52w != null) {
    stats.push({ label: '52周区间', en: '52W H/L', value: `${fmtPrice(quote.high52w)} / ${fmtPrice(quote.low52w)}` })
  }

  // 日K 图例读数
  const closes = bars?.map((b) => b.close) ?? []
  const ma20Last = closes.length >= 20 ? computeMA(closes, 20).at(-1) : null
  const ma60Last = closes.length >= 60 ? computeMA(closes, 60).at(-1) : null
  const shownBars = bars && bars.length > 0 ? bars.slice(-range) : []

  const handleResearch = () => {
    if (!row) return
    onOpenChange(false)
    onResearch?.(`${row.name} 是否值得投资`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label={row ? `${row.name} 实时详情` : undefined}
        showCloseButton={false}
        className="gap-0 overflow-hidden border-border/80 p-0 shadow-2xl shadow-black/50 sm:max-w-4xl"
      >
        <div className="nice-scroll max-h-[85vh] overflow-y-auto">
          {row && (
            <>
              {/* 头部（sticky）：名称 / 徽章 + LIVE + 更新 + 刷新 + 关闭 */}
              <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="micro-label">{MARKET_NAME[row.market]} · SNAPSHOT DETAIL</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <DialogTitle className="text-base font-bold tracking-tight">{row.name}</DialogTitle>
                      <span className={cn('num rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold', MARKET_TONE[row.market])}>
                        {row.market}
                      </span>
                      <span className="num rounded-sm border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {row.code}
                      </span>
                      {row.industry && (
                        <span className="flex items-center gap-1 whitespace-nowrap rounded-sm border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <Briefcase className="size-2.5" aria-hidden />
                          {row.industry}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
                    <span className="micro-label flex items-center gap-1.5">
                      <span aria-hidden className="led text-bull" />
                      Live
                    </span>
                    <span className="num text-xs text-muted-foreground/90" aria-label="最后更新时间">
                      {fmtClock(updatedTs)}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-md"
                      onClick={handleRefresh}
                      disabled={quoteBusy}
                      aria-label="刷新行情与K线"
                    >
                      <RefreshCw className={cn('size-3.5', quoteBusy && 'animate-spin')} aria-hidden />
                    </Button>
                    <Button variant="outline" size="icon" className="size-8 rounded-md" asChild>
                      <DialogClose aria-label="关闭股票详情">
                        <X aria-hidden className="size-3.5" />
                      </DialogClose>
                    </Button>
                  </div>
                </div>
                <DialogDescription className="sr-only">
                  {row.name}（{row.code}，{MARKET_NAME[row.market]}）实时行情与K线详情，数据来源腾讯财经，每 15 秒自动刷新。
                </DialogDescription>
              </div>

              {/* 大字价格 + 涨跌 + 货币 */}
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-4 pb-3 pt-4 sm:px-5">
                <p key={price ?? 'na'} className={cn('num text-3xl font-semibold leading-none tracking-tight sm:text-4xl', flash)}>
                  {fmtPrice(price)}
                </p>
                <div className="flex items-end gap-2 pb-0.5">
                  <p
                    className={cn(
                      'num inline-flex items-center gap-1.5 text-sm font-semibold',
                      changePct == null ? 'text-muted-foreground' : up ? 'text-bull' : 'text-bear',
                    )}
                  >
                    {changePct != null && (
                      <span aria-hidden className="text-[9px] leading-none">
                        {up ? '▲' : '▼'}
                      </span>
                    )}
                    {changePct == null ? '—' : formatPct(changePct)}
                    {change != null && <span className="font-medium opacity-75">{fmtChange(change)}</span>}
                  </p>
                  {currency && (
                    <span className="num rounded-sm border border-border/60 px-1 py-px text-[10px] text-muted-foreground">{currency}</span>
                  )}
                </div>
              </div>

              {/* 关键统计：发丝网格 */}
              <div className="flex flex-wrap gap-px bg-border/50">
                {stats.map((s) => (
                  <div key={s.label} className="min-w-0 grow basis-1/3 bg-[var(--panel)] px-3 py-2 sm:px-4 sm:basis-[calc(25%-0.75px)]">
                    <p className="micro-label text-[9px]">
                      {s.label}
                      <span className="hidden sm:inline"> · {s.en}</span>
                    </p>
                    <p className="num mt-1 truncate text-[12px] font-semibold sm:text-[13px]">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* 图表头：双模式 Tab + 配置 chips */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-border/50 bg-muted/20 px-4 py-2.5 sm:px-5">
                <div className="flex overflow-hidden rounded-md border border-border/70" role="tablist" aria-label="走势图模式">
                  <ModeTab active={mode === 'intraday'} onClick={() => setMode('intraday')} zh="分时" en="INTRADAY" />
                  <ModeTab active={mode === 'daily'} onClick={() => setMode('daily')} zh="日K" en="DAILY" />
                </div>

                {mode === 'intraday' ? (
                  <div className="num ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>
                      基准 {fmtPrice(baseline)}
                      <span className="ml-1 text-[9px] text-muted-foreground/60">{quote?.prevClose != null ? '昨收' : '首帧'}</span>
                    </span>
                    <span aria-hidden className="h-3 w-px bg-border/60" />
                    <span>{intraday?.length ?? 0} PTS</span>
                  </div>
                ) : (
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <div className="flex overflow-hidden rounded-md border border-border/70" role="tablist" aria-label="图表样式">
                      <SegBtn active={candleStyle === 'candles'} onClick={() => setCandleStyle('candles')}>
                        蜡烛
                      </SegBtn>
                      <SegBtn active={candleStyle === 'line'} onClick={() => setCandleStyle('line')}>
                        线形
                      </SegBtn>
                    </div>
                    <ConfigChip active={showMA20} onClick={() => setShowMA20((v) => !v)}>
                      MA20
                    </ConfigChip>
                    <ConfigChip active={showMA60} onClick={() => setShowMA60((v) => !v)}>
                      MA60
                    </ConfigChip>
                    <ConfigChip active={showVol} onClick={() => setShowVol((v) => !v)}>
                      VOL
                    </ConfigChip>
                    <div className="flex overflow-hidden rounded-md border border-border/70" role="tablist" aria-label="K线周期">
                      {RANGES.map((r, i) => (
                        <button
                          key={r}
                          type="button"
                          role="tab"
                          aria-selected={r === range}
                          onClick={() => setRange(r)}
                          className={cn(
                            'num px-2 py-1 text-[10px] transition-colors duration-150',
                            i > 0 && 'border-l border-border/70',
                            r === range ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {r}日
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 主图区 */}
              {mode === 'intraday' ? (
                <div className="relative h-[300px] bg-[var(--panel)] sm:h-[340px]">
                  {intradayPhase === 'ok' && <IntradayChart points={intraday ?? []} baseline={baseline} up={intradayUp} />}
                  {intradayPhase === 'loading' && <div className="shimmer absolute inset-0 bg-muted/20" aria-label="分时加载中" />}
                  {intradayPhase === 'empty' && <ChartPlaceholder title="暂无当日分时数据" code="NO INTRADAY DATA" />}
                </div>
              ) : (
                <>
                  <div className="relative h-[280px] bg-[var(--panel)] sm:h-[320px]">
                    {dailyPhase === 'ok' && (
                      <DailyChart bars={bars ?? []} range={range} showMA20={showMA20} showMA60={showMA60} showVol={showVol} style={candleStyle} />
                    )}
                    {dailyPhase === 'loading' && <div className="shimmer absolute inset-0 bg-muted/20" aria-label="K线加载中" />}
                    {dailyPhase === 'empty' && <ChartPlaceholder title="行情数据不可用" code="NO KLINE DATA" />}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 px-4 py-2 sm:px-5">
                    <span className={cn('num flex items-center gap-1.5 text-[11px] text-hold', !showMA20 && 'opacity-40')}>
                      <span aria-hidden className="h-px w-4 bg-hold" />
                      MA20 {fmtPrice(ma20Last)}
                    </span>
                    <span className={cn('num flex items-center gap-1.5 text-[11px] text-risk', !showMA60 && 'opacity-40')}>
                      <span aria-hidden className="h-px w-4 bg-risk" />
                      MA60 {fmtPrice(ma60Last)}
                    </span>
                    <span className="num ml-auto text-[10px] text-muted-foreground/70">
                      {shownBars.length > 0
                        ? `${shownBars.length} BARS · ${shownBars[0].date} → ${shownBars[shownBars.length - 1].date}`
                        : '—'}
                    </span>
                  </div>
                </>
              )}

              {/* 底部 meta + 研究 CTA */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-4 py-2.5 sm:px-5">
                <span className="num text-[10px] text-muted-foreground/80">行情时间 {fmtQuoteTime(quote?.time ?? row.time)}</span>
                <span aria-hidden className="h-3 w-px bg-border/50" />
                <span className="micro-label text-[9px]">Source · Tencent Finance</span>
                <span className="num hidden text-[9px] text-muted-foreground/60 sm:inline">AUTO REFRESH 15s</span>
                <Button
                  size="sm"
                  className="ml-auto h-8 gap-1.5 rounded-sm border border-gold/50 bg-gold/15 px-3 text-[11.5px] font-semibold text-gold hover:bg-gold/25"
                  onClick={handleResearch}
                  aria-label={`对 ${row.name} 发起多智能体投委会研究`}
                >
                  <Zap className="size-3.5" aria-hidden />
                  发起多智能体研究
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
