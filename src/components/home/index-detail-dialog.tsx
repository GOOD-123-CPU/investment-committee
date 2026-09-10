'use client'

// 指数详情弹层 — 全球指数监控墙点击单元格展开的实时走势详情层
// - 头部：指数名 / shortName micro-label / code / 数据源角标（YH · ≈代理）+ LIVE LED + 最后更新 + 手动刷新
// - 大字点位（.num 等宽，key=price 触发 flash-up/flash-down）+ 涨跌幅/涨跌额 + 货币
// - 关键统计发丝网格：今开 / 最高 / 最低 / 昨收 / 成交量（若有）/ 52周区间（若有）
// - 主图双模式：分时（AreaSeries 渐隐填充 + 昨收/首帧基准虚线）/ 日K（蜡烛·线形 + 成交量 + MA20/60 均线，60/120/250 周期）
// - 可配置 chips：MA20 / MA60 / 成交量开关 + 蜡烛/线形切换（日K 模式），useState 即时生效
// - 数据流：/api/quote?codes=&intraday= 弹层打开期间每 15s 轮询（关闭清理）；/api/kline?days=250 拉取一次缓存，
//   60/120 日视图由前端切片（均线基于全量历史预热后再过滤窗口，避免窗口头部均线失真），手动刷新可重拉
// - 图表：lightweight-charts v5（autoSize:false + 手动 width/height + ResizeObserver + remove 清理），
//   颜色一律使用主题感知 hex 常量（oklch CSS 变量解析会失败，参见 overview-tab KlineCard 教训）

import { useEffect, useMemo, useRef, useState } from 'react'
import { Database, RefreshCw, X } from 'lucide-react'
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from 'lightweight-charts'
import type { Time, UTCTimestamp } from 'lightweight-charts'
import type { IndexRow } from '@/hooks/use-indices'
import type { IntradayPoint, KlineBar, LiveQuote } from '@/lib/data/quotes'
import { formatPct } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

// ---------- 常量与格式化 ----------

/** 日K 一次拉取根数（拉满 250，60/120 日视图前端切片） */
const KLINE_DAYS = 250
const RANGES = [60, 120, 250] as const
type Range = (typeof RANGES)[number]

/** 分时 UTCTimestamp 固定纪元日：只取当日 HH:mm 序，UTC 分量提取无时区漂移 */
const EPOCH_DAY = Date.UTC(2020, 0, 1) / 1000

function fmtIdx(v: number | null | undefined): string {
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

/** 行情时间：腾讯 'yyyy-MM-dd HH:mm:ss' / 雅虎 ISO → 本地化 HH:mm:ss */
function fmtQuoteTime(t: string | null | undefined): string {
  if (!t) return '—'
  if (t.includes('T')) {
    const d = new Date(t)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('zh-CN', { hour12: false })
    }
  }
  return t.includes(' ') ? (t.split(' ')[1] ?? t) : t
}

function fmtClock(ts: number | null): string {
  return ts == null ? '--:--:--' : new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

/** HH:mm → 固定纪元日 UTCTimestamp（序内严格递增，重复时间取末值） */
function hhmmToTs(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return EPOCH_DAY + h * 3600 + min * 60
}

function fmtHhmm(t: Time): string {
  const sec = Number(t) - EPOCH_DAY
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 分时数据是否与上一次完全一致（一致则沿用旧引用，避免图表无谓重建） */
function samePoints(a: IntradayPoint[], b: IntradayPoint[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].time !== b[i].time || a[i].price !== b[i].price) return false
  }
  return true
}

/** 计算简单移动平均序列（与 overview-tab KlineCard 同算法；导出供股票详情图例复用） */
export function computeMA(closes: number[], windowSize: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]
    if (i >= windowSize) sum -= closes[i - windowSize]
    out.push(i >= windowSize - 1 ? sum / windowSize : null)
  }
  return out
}

/**
 * lightweight-charts 主题感知颜色常量（导出供 stock-detail-dialog 复用）
 * 注意：不可用 getComputedStyle 解析 CSS 变量 —— oklch 会被解析成 lab() 字符串导致图表空白
 */
export function themeColors() {
  const dark = document.documentElement.classList.contains('dark')
  return dark
    ? {
        bull: '#34d399',
        bear: '#f87171',
        hold: '#fbbf24',
        risk: '#fb923c',
        areaBullTop: 'rgba(52,211,153,0.20)',
        areaBullBottom: 'rgba(52,211,153,0.01)',
        areaBearTop: 'rgba(248,113,113,0.20)',
        areaBearBottom: 'rgba(248,113,113,0.01)',
        mutedText: 'rgba(235,240,255,0.55)',
        hairline: 'rgba(255,255,255,0.10)',
        grid: 'rgba(255,255,255,0.06)',
        volUp: 'rgba(52,211,153,0.45)',
        volDown: 'rgba(248,113,113,0.45)',
      }
    : {
        bull: '#059669',
        bear: '#dc2626',
        hold: '#b45309',
        risk: '#ea580c',
        areaBullTop: 'rgba(5,150,105,0.16)',
        areaBullBottom: 'rgba(5,150,105,0.01)',
        areaBearTop: 'rgba(220,38,38,0.16)',
        areaBearBottom: 'rgba(220,38,38,0.01)',
        mutedText: 'rgba(30,41,59,0.6)',
        hairline: 'rgba(0,0,0,0.10)',
        grid: 'rgba(0,0,0,0.05)',
        volUp: 'rgba(5,150,105,0.4)',
        volDown: 'rgba(220,38,38,0.4)',
      }
}

/** 点位闪烁：effect 中与上次值对比，rAF 延迟一帧应用闪烁类（规避 effect 同步 setState）；导出供股票详情复用 */
export function usePriceFlash(price: number | null): string {
  const [cls, setCls] = useState('')
  const prevRef = useRef<number | null>(null)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = price
    if (prev == null || price == null || prev === price) return
    const next = price > prev ? 'flash-up' : 'flash-down'
    const raf = requestAnimationFrame(() => setCls(next))
    return () => cancelAnimationFrame(raf)
  }, [price])

  return cls
}

// ---------- 分时图（AreaSeries 渐隐填充 + 基准虚线；导出供 stock-detail-dialog 复用） ----------

export function IntradayChart({
  points,
  baseline,
  up,
}: {
  points: IntradayPoint[]
  baseline: number | null
  up: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  const data = useMemo(() => {
    const seen = new Map<number, number>()
    for (const p of points) {
      const ts = hhmmToTs(p.time)
      if (ts == null || !Number.isFinite(p.price) || p.price <= 0) continue
      seen.set(ts, p.price)
    }
    return Array.from(seen, ([time, value]) => ({ time: time as Time, value }))
  }, [points])

  useEffect(() => {
    const el = containerRef.current
    if (!el || data.length === 0) return
    const t = themeColors()
    const line = up ? t.bull : t.bear

    const chart = createChart(el, {
      autoSize: false,
      width: el.clientWidth,
      height: el.clientHeight || 320,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: t.mutedText,
        fontSize: 11,
      },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.hairline, scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: {
        borderColor: t.hairline,
        rightOffset: 2,
        tickMarkFormatter: (tm: Time) => fmtHhmm(tm),
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'zh-CN', timeFormatter: (tm: Time) => fmtHhmm(tm) },
    })

    const series = chart.addSeries(AreaSeries, {
      lineColor: line,
      topColor: up ? t.areaBullTop : t.areaBearTop,
      bottomColor: up ? t.areaBullBottom : t.areaBearBottom,
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })
    series.setData(data)

    // 分时基准线：昨收（优先）或首帧价格，虚线标注
    const base = baseline ?? data[0].value
    series.createPriceLine({
      price: base,
      color: t.hold,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '',
    })

    chart.timeScale().fitContent()

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      chart.applyOptions({ width: Math.max(80, Math.floor(rect.width)), height: Math.max(160, Math.floor(rect.height)) })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [data, baseline, up])

  return <div ref={containerRef} className="absolute inset-0" />
}

// ---------- 日K 图（蜡烛/线形 + 成交量 + MA20/60；导出供 stock-detail-dialog 复用） ----------

export function DailyChart({
  bars,
  range,
  showMA20,
  showMA60,
  showVol,
  style,
}: {
  bars: KlineBar[]
  range: Range
  showMA20: boolean
  showMA60: boolean
  showVol: boolean
  style: 'candles' | 'line'
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 展示窗口切片 + 均线（全量历史预热后过滤窗口，窗口头部均线不失真）
  const view = useMemo(() => {
    const shown = bars.slice(-range)
    const closes = bars.map((b) => b.close)
    const start = shown[0]?.date ?? ''
    const ma = (w: number) =>
      computeMA(closes, w)
        .map((v, i) => ({ time: bars[i].date as Time, value: v }))
        .filter((p): p is { time: Time; value: number } => p.value != null && String(p.time) >= start)
    return { shown, ma20: ma(20), ma60: ma(60) }
  }, [bars, range])

  useEffect(() => {
    const el = containerRef.current
    if (!el || view.shown.length === 0) return
    const t = themeColors()

    const chart = createChart(el, {
      autoSize: false,
      width: el.clientWidth,
      height: el.clientHeight || 340,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: t.mutedText,
        fontSize: 11,
      },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: {
        borderColor: t.hairline,
        scaleMargins: showVol ? { top: 0.06, bottom: 0.24 } : { top: 0.08, bottom: 0.06 },
      },
      timeScale: { borderColor: t.hairline, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'zh-CN' },
    })

    const lastClose = view.shown[view.shown.length - 1].close
    const firstClose = view.shown[0].close

    if (style === 'candles') {
      const candle = chart.addSeries(CandlestickSeries, {
        upColor: t.bull,
        downColor: t.bear,
        wickUpColor: t.bull,
        wickDownColor: t.bear,
        borderVisible: false,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      })
      candle.setData(
        view.shown.map((k) => ({ time: k.date as Time, open: k.open, high: k.high, low: k.low, close: k.close })),
      )
    } else {
      const line = chart.addSeries(LineSeries, {
        color: lastClose >= firstClose ? t.bull : t.bear,
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      })
      line.setData(view.shown.map((k) => ({ time: k.date as Time, value: k.close })))
    }

    if (showVol) {
      const volume = chart.addSeries(HistogramSeries, {
        priceScaleId: 'vol',
        priceFormat: { type: 'volume' },
        lastValueVisible: false,
        priceLineVisible: false,
      })
      volume.setData(
        view.shown.map((k) => ({
          time: k.date as Time,
          value: k.volume,
          color: k.close >= k.open ? t.volUp : t.volDown,
        })),
      )
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    }

    const addMA = (points: { time: Time; value: number }[], color: string) => {
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      })
      line.setData(points)
    }
    if (showMA20 && view.ma20.length > 0) addMA(view.ma20, t.hold)
    if (showMA60 && view.ma60.length > 0) addMA(view.ma60, t.risk)

    chart.timeScale().fitContent()

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      chart.applyOptions({ width: Math.max(80, Math.floor(rect.width)), height: Math.max(160, Math.floor(rect.height)) })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [view, showMA20, showMA60, showVol, style])

  return <div ref={containerRef} className="absolute inset-0" />
}

// ---------- 占位态（导出供 stock-detail-dialog 复用） ----------

export function ChartPlaceholder({ title, code }: { title: string; code: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <div className="absolute inset-3 rounded-md border border-dashed border-border/70" aria-hidden />
      <Database className="size-5 text-muted-foreground/50" aria-hidden />
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="num text-[10px] text-muted-foreground/70">{code}</p>
    </div>
  )
}

// ---------- 配置 chips / 分段按钮 ----------

function ConfigChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'num rounded-md border px-2 py-1 text-[10px] font-medium transition-colors duration-150',
        active
          ? 'border-primary/40 bg-primary/15 text-primary'
          : 'border-border/70 bg-muted/40 text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      onClick={onClick}
      aria-selected={active}
      className={cn(
        'px-2.5 py-1 text-[10px] font-medium transition-colors duration-150',
        active ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function ModeTab({
  active,
  onClick,
  zh,
  en,
}: {
  active: boolean
  onClick: () => void
  zh: string
  en: string
}) {
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

export interface IndexDetailDialogProps {
  open: boolean
  /** 弹层目标指数；父组件在关闭动画期间保留引用以保证平滑退出 */
  row: IndexRow | null
  onOpenChange: (open: boolean) => void
}

interface StatCellData {
  label: string
  en: string
  value: string
}

export function IndexDetailDialog({ open, row, onOpenChange }: IndexDetailDialogProps) {
  // 图表配置（跨打开保留用户偏好）
  const [mode, setMode] = useState<'intraday' | 'daily'>('intraday')
  const [range, setRange] = useState<Range>(120)
  const [showMA20, setShowMA20] = useState(true)
  const [showMA60, setShowMA60] = useState(true)
  const [showVol, setShowVol] = useState(true)
  const [candleStyle, setCandleStyle] = useState<'candles' | 'line'>('candles')

  // 数据状态（均携带 code，切换指数天然隔离，无需 effect 内同步重置）
  const [quoteState, setQuoteState] = useState<{ code: string; quote: LiveQuote | null } | null>(null)
  const [intradayState, setIntradayState] = useState<{ code: string; points: IntradayPoint[] } | null>(null)
  const [klineState, setKlineState] = useState<{ code: string; bars: KlineBar[] } | null>(null)
  const [updState, setUpdState] = useState<{ code: string; ts: number } | null>(null)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [quoteTick, setQuoteTick] = useState(0)
  const [klineTick, setKlineTick] = useState(0)
  const klineFetchedRef = useRef<{ code: string; tick: number } | null>(null)

  const code = row?.code ?? null

  // 行情 + 分时：弹层打开期间每 15s 轮询（setState 仅在异步回调中调用）
  useEffect(() => {
    if (!open || !code) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/quote?codes=${encodeURIComponent(code)}&intraday=${encodeURIComponent(code)}`, {
          cache: 'no-store',
        })
        const d = (await res.json()) as {
          quotes?: Record<string, LiveQuote>
          intraday?: IntradayPoint[] | null
          ts?: number
        }
        if (cancelled) return
        const nextPoints = Array.isArray(d.intraday) ? d.intraday : []
        setQuoteState({ code, quote: d.quotes?.[code] ?? null })
        setIntradayState((prev) =>
          prev && prev.code === code && samePoints(prev.points, nextPoints) ? prev : { code, points: nextPoints },
        )
        setUpdState({ code, ts: typeof d.ts === 'number' ? d.ts : Date.now() })
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
  }, [open, code, quoteTick])

  // 日K：每次打开/换指数/手动刷新拉取一次（klineFetchedRef 去重，弹层期间不重复拉取）
  useEffect(() => {
    if (!open || !code) return
    const fetched = klineFetchedRef.current
    if (fetched && fetched.code === code && fetched.tick === klineTick) return
    klineFetchedRef.current = { code, tick: klineTick }
    let cancelled = false
    fetch(`/api/kline?code=${encodeURIComponent(code)}&days=${KLINE_DAYS}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ kline?: KlineBar[] }>)
      .then((d) => {
        if (cancelled) return
        setKlineState({ code, bars: Array.isArray(d.kline) ? d.kline : [] })
      })
      .catch(() => {
        if (!cancelled) setKlineState({ code, bars: [] })
      })
    return () => {
      cancelled = true
    }
  }, [open, code, klineTick])

  // 手动刷新：立即重拉行情/分时 + 日K
  const handleRefresh = () => {
    if (!code) return
    setQuoteBusy(true)
    setQuoteTick((t) => t + 1)
    setKlineTick((t) => t + 1)
  }

  // 派生数据（按 code 隔离，避免切换指数时串数据）
  const quote = quoteState && quoteState.code === row?.code ? quoteState.quote : null
  const intraday = intradayState && intradayState.code === row?.code ? intradayState.points : null
  const bars = klineState && klineState.code === row?.code ? klineState.bars : null
  const updatedTs = updState && updState.code === row?.code ? updState.ts : null

  const price = quote?.price ?? row?.price ?? null
  const changePct = quote?.changePct ?? row?.changePct ?? null
  const change = quote?.change ?? row?.change ?? null
  const currency = quote?.currency ?? row?.currency ?? ''
  const flash = usePriceFlash(price)
  const up = (changePct ?? 0) >= 0

  // 分时基准：昨收优先，否则首帧价格；分时涨跌以基准线判定（面积渐隐填充绿/红）
  const baseline = quote?.prevClose ?? intraday?.[0]?.price ?? null
  const intradayUp =
    baseline != null ? (intraday?.[intraday.length - 1]?.price ?? price ?? baseline) >= baseline : up

  const intradayPhase: 'loading' | 'empty' | 'ok' =
    intraday == null ? 'loading' : intraday.length > 0 ? 'ok' : 'empty'
  const dailyPhase: 'loading' | 'empty' | 'ok' = bars == null ? 'loading' : bars.length > 0 ? 'ok' : 'empty'

  // 关键统计（发丝网格；成交量/52周仅在源返回时展示）
  const stats: StatCellData[] = [
    { label: '今开', en: 'OPEN', value: fmtIdx(quote?.open ?? null) },
    { label: '最高', en: 'HIGH', value: fmtIdx(quote?.high ?? row?.high ?? null) },
    { label: '最低', en: 'LOW', value: fmtIdx(quote?.low ?? row?.low ?? null) },
    { label: '昨收', en: 'PREV', value: fmtIdx(quote?.prevClose ?? row?.prevClose ?? null) },
  ]
  if (quote?.volume != null) stats.push({ label: '成交量', en: 'VOLUME', value: fmtVolume(quote.volume) })
  if (quote?.high52w != null || quote?.low52w != null) {
    stats.push({
      label: '52周区间',
      en: '52W H/L',
      value: `${fmtIdx(quote.high52w)} / ${fmtIdx(quote.low52w)}`,
    })
  }

  // 日K 图例读数（均线取最新值，与图表口径一致：全量历史计算后取末值）
  const closes = bars?.map((b) => b.close) ?? []
  const ma20Last = closes.length >= 20 ? computeMA(closes, 20).at(-1) : null
  const ma60Last = closes.length >= 60 ? computeMA(closes, 60).at(-1) : null
  const shownBars = bars && bars.length > 0 ? bars.slice(-range) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label={row ? `${row.name} 实时走势详情` : undefined}
        showCloseButton={false}
        className="gap-0 overflow-hidden border-border/80 p-0 shadow-2xl shadow-black/50 sm:max-w-4xl"
      >
        <div className="nice-scroll max-h-[85vh] overflow-y-auto">
          {row && (
            <>
              {/* 头部（sticky）：名称 / code / 数据源角标 + LIVE + 更新时间 + 刷新 + 关闭 */}
              <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="micro-label">{row.shortName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <DialogTitle className="text-base font-bold tracking-tight">{row.name}</DialogTitle>
                      <span className="num rounded-sm border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {row.code}
                      </span>
                      {row.proxyFor && (
                        <span
                          title={`实时源代理：以 ${row.proxyFor} 公开实时数据近似（${row.desc}）`}
                          className="cursor-help whitespace-nowrap rounded-sm border border-hold/30 bg-hold/5 px-1 py-px text-[9px] font-medium leading-3 text-hold/90"
                        >
                          ≈{row.proxyFor}
                        </span>
                      )}
                      {row.source === 'yahoo' && (
                        <span
                          title="数据源：Yahoo Finance"
                          className="cursor-help rounded-sm border border-border/70 px-1 py-px text-[9px] font-semibold leading-3 text-muted-foreground"
                        >
                          YH
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
                      <DialogClose aria-label="关闭指数详情">
                        <X aria-hidden className="size-3.5" />
                      </DialogClose>
                    </Button>
                  </div>
                </div>
                <DialogDescription className="sr-only">{row.desc}</DialogDescription>
              </div>

              {/* 大字点位 + 涨跌 + 货币 */}
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-4 pb-3 pt-4 sm:px-5">
                {/* key=price：点位变化重挂载以重触发闪烁动画 */}
                <p
                  key={price ?? 'na'}
                  className={cn('num text-3xl font-semibold leading-none tracking-tight sm:text-4xl', flash)}
                >
                  {fmtIdx(price)}
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
                    <span className="num rounded-sm border border-border/60 px-1 py-px text-[10px] text-muted-foreground">
                      {currency}
                    </span>
                  )}
                </div>
              </div>

              {/* 关键统计：发丝网格（flex + gap-px，末行不满自动拉伸无空洞） */}
              <div className="flex flex-wrap gap-px bg-border/50">
                {stats.map((s) => (
                  <div key={s.label} className="min-w-0 grow basis-1/3 bg-[var(--panel)] px-3 py-2 sm:px-4">
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
                      基准 {fmtIdx(baseline)}
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
                            r === range
                              ? 'bg-primary/15 text-primary'
                              : 'bg-muted/40 text-muted-foreground hover:text-foreground',
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
                  {intradayPhase === 'ok' && (
                    <IntradayChart points={intraday ?? []} baseline={baseline} up={intradayUp} />
                  )}
                  {intradayPhase === 'loading' && (
                    <div className="shimmer absolute inset-0 bg-muted/20" aria-label="分时加载中" />
                  )}
                  {intradayPhase === 'empty' && <ChartPlaceholder title="暂无当日分时数据" code="NO INTRADAY DATA" />}
                </div>
              ) : (
                <>
                  <div className="relative h-[280px] bg-[var(--panel)] sm:h-[320px]">
                    {dailyPhase === 'ok' && (
                      <DailyChart
                        bars={bars ?? []}
                        range={range}
                        showMA20={showMA20}
                        showMA60={showMA60}
                        showVol={showVol}
                        style={candleStyle}
                      />
                    )}
                    {dailyPhase === 'loading' && (
                      <div className="shimmer absolute inset-0 bg-muted/20" aria-label="K线加载中" />
                    )}
                    {dailyPhase === 'empty' && <ChartPlaceholder title="行情数据不可用" code="NO KLINE DATA" />}
                  </div>

                  {/* 日K 图例：MA 读数 + 窗口信息 */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 px-4 py-2 sm:px-5">
                    <span className={cn('num flex items-center gap-1.5 text-[11px] text-hold', !showMA20 && 'opacity-40')}>
                      <span aria-hidden className="h-px w-4 bg-hold" />
                      MA20 {fmtIdx(ma20Last)}
                    </span>
                    <span className={cn('num flex items-center gap-1.5 text-[11px] text-risk', !showMA60 && 'opacity-40')}>
                      <span aria-hidden className="h-px w-4 bg-risk" />
                      MA60 {fmtIdx(ma60Last)}
                    </span>
                    <span className="num ml-auto text-[10px] text-muted-foreground/70">
                      {shownBars.length > 0
                        ? `${shownBars.length} BARS · ${shownBars[0].date} → ${shownBars[shownBars.length - 1].date}`
                        : '—'}
                    </span>
                  </div>
                </>
              )}

              {/* 底部 meta：行情时间 / 数据源 / 自动刷新 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-4 py-2.5 sm:px-5">
                <span className="num text-[10px] text-muted-foreground/80">
                  行情时间 {fmtQuoteTime(quote?.time ?? row.time)}
                </span>
                <span aria-hidden className="h-3 w-px bg-border/50" />
                <span className="micro-label text-[9px]">
                  Source · {row.source === 'yahoo' ? 'Yahoo Finance' : 'Tencent Finance'}
                </span>
                {row.proxyFor && <span className="micro-label text-[9px]">≈ 以{row.proxyFor}代理</span>}
                <span className="num ml-auto text-[9px] text-muted-foreground/60">AUTO REFRESH 15s</span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
