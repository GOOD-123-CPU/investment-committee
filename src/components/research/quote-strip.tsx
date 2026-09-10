'use client'

// 行情指挥条 — 专业终端行情表头：
// 顶部状态带（LIVE LED / 市场状态 LED / 行情时间戳 / 手动刷新）
// 指挥区（大号等宽最新价 + 闪烁动画 + 涨跌额/幅彩色三角 + 日内区间与 52 周位置条）
// 底部 12 项统计网格（移动端横滚）
// 实时行情（/api/quote 15s 轮询）优先，降级 meta.quote 存证时点快照

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { QuoteSnapshot } from '@/lib/types'
import type { LiveQuote } from '@/lib/data/quotes'
import { useQuotes } from '@/hooks/use-quotes'
import { currencySymbol, formatPct } from '@/lib/client-utils'
import { fmtNum } from '@/components/research/bits'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface QuoteStripProps {
  stockName: string | null
  stockCode: string | null
  market: string | null
  snapshot: QuoteSnapshot | null
}

type QuoteSource = 'live' | 'snapshot' | 'none'
type MarketState = { state: 'open' | 'break' | 'closed'; label: string }

/** 沪深 / 港股交易时段判定（Asia/Shanghai；周末休市） */
function marketSession(market: string | null): MarketState {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const wd = get('weekday')
    if (wd === 'Sat' || wd === 'Sun') return { state: 'closed', label: '周末休市' }
    const mins = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10)
    const hk = (market ?? '').toUpperCase().includes('HK')
    const sessions: [number, number][] = hk
      ? [
          [570, 720],
          [780, 960],
        ]
      : [
          [570, 690],
          [780, 900],
        ]
    if (sessions.some(([a, b]) => mins >= a && mins < b)) return { state: 'open', label: hk ? '港股交易中' : '交易中' }
    if (mins >= sessions[0][1] && mins < sessions[1][0]) return { state: 'break', label: '午间休市' }
    return { state: 'closed', label: '已收盘' }
  } catch {
    return { state: 'closed', label: '—' }
  }
}

/** 方向三角（几何 SVG，非 emoji） */
function Tri({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 8 8" className="size-2 shrink-0 fill-current" aria-hidden>
      <path d={up ? 'M4 0.8 L7.6 7.2 H0.4 Z' : 'M4 7.2 L0.4 0.8 H7.6 Z'} />
    </svg>
  )
}

function StatCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="stat-cell flex shrink-0 flex-col gap-0.5 sm:shrink sm:min-w-0">
      <span className="stat-cell__label micro-label whitespace-nowrap">{label}</span>
      <span className={cn('num whitespace-nowrap text-[13px] font-semibold', tone)}>{value}</span>
    </div>
  )
}

/** 位置条：low —(昨收刻度)— high + 当前价游标 */
function RangeBar({
  label,
  low,
  high,
  pos,
  marker,
  note,
  posTone = 'bull',
}: {
  label: string
  low: number | null
  high: number | null
  pos: number | null
  marker?: number | null
  note?: string | null
  posTone?: 'bull' | 'bear'
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="micro-label">{label}</span>
        {note != null && <span className="num text-[10px] text-muted-foreground/80">{note}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="num shrink-0 text-[10px] text-muted-foreground/70">{low != null ? fmtNum(low) : '—'}</span>
        <div
          className="relative h-[3px] min-w-0 flex-1 rounded-full bg-gradient-to-r from-bear/50 via-muted-foreground/25 to-bull/50"
          aria-hidden
        >
          {marker != null && (
            <span
              className="absolute top-1/2 h-[7px] w-px -translate-y-1/2 bg-foreground/50"
              style={{ left: `${marker}%` }}
              title="昨收"
            />
          )}
          {pos != null && (
            <span
              className={cn(
                'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background ring-1 ring-border',
                posTone === 'bull' ? 'bg-bull' : 'bg-bear',
              )}
              style={{ left: `${pos}%` }}
            />
          )}
        </div>
        <span className="num shrink-0 text-[10px] text-muted-foreground/70">{high != null ? fmtNum(high) : '—'}</span>
      </div>
    </div>
  )
}

export function QuoteStrip({ stockName, stockCode, market, snapshot }: QuoteStripProps) {
  const { quotes, flash, loading, refresh } = useQuotes(stockCode ? [stockCode] : [], 15_000)
  const [refreshing, setRefreshing] = useState(false)
  const [mkt, setMkt] = useState<MarketState | null>(null)

  // 市场状态：定时器回调中更新（避免 effect 体内同步 setState）
  useEffect(() => {
    let alive = true
    const update = () => {
      if (alive) setMkt(marketSession(market))
    }
    const t0 = setTimeout(update, 0)
    const t = setInterval(update, 30_000)
    return () => {
      alive = false
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [market])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }, [refresh])

  const live: LiveQuote | undefined = stockCode ? quotes[stockCode] : undefined

  const source: QuoteSource = live ? 'live' : snapshot ? 'snapshot' : 'none'
  const price = live?.price ?? snapshot?.price ?? null
  const change = live?.change ?? snapshot?.change ?? null
  const changePct = live?.changePct ?? snapshot?.changePct ?? null
  const currency = live?.currency ?? snapshot?.currency ?? 'CNY'
  const sym = currencySymbol(currency)
  const up = (changePct ?? 0) >= 0
  const flashCls = stockCode ? (flash[stockCode] ?? '') : ''

  const low = live?.low ?? snapshot?.low ?? null
  const high = live?.high ?? snapshot?.high ?? null
  const prevClose = live?.prevClose ?? snapshot?.prevClose ?? null
  const rangePos =
    price != null && low != null && high != null && high > low
      ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100))
      : null
  const prevPos =
    prevClose != null && low != null && high != null && high > low
      ? Math.min(100, Math.max(0, ((prevClose - low) / (high - low)) * 100))
      : null

  const low52w = live?.low52w ?? snapshot?.low52w ?? null
  const high52w = live?.high52w ?? snapshot?.high52w ?? null
  const pos52w =
    price != null && low52w != null && high52w != null && high52w > low52w
      ? Math.min(100, Math.max(0, ((price - low52w) / (high52w - low52w)) * 100))
      : null

  const volumeWan = live?.volume ?? snapshot?.volume ?? null // 手
  const amountYi = live?.amount ?? snapshot?.amount ?? null // 万

  const stats: { label: string; value: string; tone?: string }[] = [
    { label: '今开', value: price != null ? fmtNum(live?.open ?? snapshot?.open) : '—' },
    { label: '昨收', value: price != null ? fmtNum(prevClose) : '—' },
    {
      label: '最高',
      value: price != null ? fmtNum(high) : '—',
      tone: high != null && prevClose != null && high >= prevClose ? 'text-bull' : undefined,
    },
    {
      label: '最低',
      value: price != null ? fmtNum(low) : '—',
      tone: low != null && prevClose != null && low < prevClose ? 'text-bear' : undefined,
    },
    {
      label: '成交量',
      value: volumeWan == null ? '—' : volumeWan >= 1e8 ? `${fmtNum(volumeWan / 1e8)}亿手` : `${fmtNum(volumeWan / 1e4)}万手`,
    },
    {
      label: '成交额',
      value: amountYi == null ? '—' : amountYi >= 1e8 ? `${fmtNum(amountYi / 1e8)}万亿` : `${fmtNum(amountYi / 1e4)}亿`,
    },
    {
      label: '换手率',
      value: (() => {
        const t = live?.turnoverRate ?? snapshot?.turnoverRate ?? null
        return t == null ? '—' : `${fmtNum(t)}%`
      })(),
    },
    { label: 'PE (TTM)', value: fmtNum(live?.peTtm ?? snapshot?.peTtm) },
    { label: 'PB', value: fmtNum(live?.pb ?? snapshot?.pb) },
    {
      label: '总市值',
      value: (live?.marketCap ?? snapshot?.marketCap) != null ? fmtNum(live?.marketCap ?? snapshot?.marketCap, 0) + '亿' : '—',
    },
    {
      label: '52周高',
      value: fmtNum(high52w),
      tone: 'text-bull/80',
    },
    {
      label: '52周低',
      value: fmtNum(low52w),
      tone: 'text-bear/80',
    },
  ]

  const timeText = live?.time ?? snapshot?.time ?? null

  return (
    <section className="panel relative overflow-hidden px-5 py-4" aria-label="实时行情">
      {!stockCode && !snapshot ? (
        /* 等待标的确认占位 */
        <div className="flex items-center gap-3 py-2">
          <span className="led text-hold" aria-hidden />
          <span className="micro-label">WAITING TARGET</span>
          <span className="text-sm text-muted-foreground">Research Planner 确认研究标的后，此处将展示实时行情</span>
        </div>
      ) : (
        <>
          {/* 顶部状态带 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 pb-2.5">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded border px-1.5 py-0.5',
                source === 'live' && 'border-bull/30 bg-bull/10 text-bull',
                source === 'snapshot' && 'border-hold/40 bg-hold/10 text-hold',
                source === 'none' && 'border-border bg-muted text-muted-foreground',
              )}
              aria-label={source === 'live' ? '实时行情' : source === 'snapshot' ? '存证时点行情' : '行情不可用'}
            >
              <span
                className={cn(
                  source === 'live' && 'led text-bull',
                  source === 'snapshot' && 'led text-hold',
                  source === 'none' && 'size-1.5 rounded-full bg-muted-foreground/60',
                )}
                aria-hidden
              />
              <span className="micro-label text-[9px]">
                {source === 'live' ? 'LIVE' : source === 'snapshot' ? '存证时点' : 'OFF'}
              </span>
            </span>

            {/* 市场状态 LED */}
            <span
              className="micro-label flex items-center gap-1.5"
              aria-label={`市场状态 ${mkt?.label ?? '检测中'}`}
            >
              {mkt ? (
                <span
                  className={cn(
                    'led',
                    mkt.state === 'open' && 'text-bull',
                    mkt.state === 'break' && 'text-hold',
                    mkt.state === 'closed' && 'text-muted-foreground/60',
                  )}
                  aria-hidden
                />
              ) : (
                <span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
              )}
              {mkt ? mkt.label : 'MARKET —'}
            </span>

            {market && (
              <span className="micro-label hidden md:inline">
                {market} · {currency}
              </span>
            )}

            <div className="ml-auto flex items-center gap-2.5">
              <span className="num text-[10px] text-muted-foreground/70">
                {timeText ? `QUOTE ${timeText}` : 'QUOTE —'} · {source === 'snapshot' ? '研究存证' : '腾讯财经'}
              </span>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing || !stockCode}
                className="flex size-6 items-center justify-center rounded border border-border/70 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                aria-label="手动刷新行情"
                title="手动刷新行情"
              >
                <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} aria-hidden />
              </button>
            </div>
          </div>

          {/* 指挥区：标的 + 大价格 + 区间位置 */}
          <div className="flex min-w-0 flex-col gap-4 pt-3.5 xl:flex-row xl:items-center">
            <div className="flex min-w-0 flex-wrap items-end gap-x-5 gap-y-3 xl:w-[24rem] xl:shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-bold tracking-tight sm:text-xl">{stockName ?? '研究中'}</h2>
                  {stockCode && <span className="num text-xs text-muted-foreground">{stockCode}</span>}
                  {market && (
                    <span className="micro-label rounded border border-border/80 bg-muted/50 px-1.5 py-0.5">{market}</span>
                  )}
                </div>
                <span className="micro-label mt-1.5 block">REALTIME QUOTE · 实时行情</span>
              </div>

              <div className="flex items-end gap-2.5" aria-live="polite">
                {loading && price == null ? (
                  <Skeleton className="h-10 w-36" />
                ) : (
                  <span
                    key={price ?? 'na'}
                    className={cn(
                      'num text-4xl font-extrabold leading-none tracking-tight sm:text-[2.75rem]',
                      flashCls,
                    )}
                  >
                    {price != null ? `${sym}${fmtNum(price)}` : '—'}
                  </span>
                )}
                {change != null && (
                  <span
                    className={cn('num flex items-center gap-1.5 pb-0.5 text-sm font-bold', up ? 'text-bull' : 'text-bear')}
                  >
                    <Tri up={up} />
                    <span>
                      {up ? '+' : ''}
                      {fmtNum(change)}
                    </span>
                    <span className="text-xs font-semibold">{changePct != null ? formatPct(changePct) : '—'}</span>
                  </span>
                )}
              </div>
            </div>

            {/* 日内区间 + 52 周位置 */}
            <div className="grid min-w-0 flex-1 gap-x-8 gap-y-3.5 border-border/60 sm:grid-cols-2 xl:border-l xl:pl-6">
              <RangeBar
                label="DAY RANGE · 日内区间"
                low={low}
                high={high}
                pos={rangePos}
                marker={prevPos}
                note={rangePos != null ? `${Math.round(rangePos)}%` : null}
                posTone={up ? 'bull' : 'bear'}
              />
              <RangeBar
                label="52W RANGE · 52周区间"
                low={low52w}
                high={high52w}
                pos={pos52w}
                note={pos52w != null ? `${Math.round(pos52w)}%` : null}
              />
            </div>
          </div>

          {/* 统计网格（移动端横滚） */}
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="nice-scroll -mx-1 flex gap-x-5 gap-y-2.5 overflow-x-auto px-1 py-0.5 sm:grid sm:grid-cols-3 sm:overflow-visible md:grid-cols-4 lg:grid-cols-6">
              {stats.map((s) => (
                <StatCell key={s.label} label={s.label} value={s.value} tone={s.tone} />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
