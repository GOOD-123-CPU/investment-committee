'use client'

// 热门标的快照库 · 实时行情板
// - 数据底座：全球近万只热门标的（A+港+美，行情源验证零幻觉），实时价格 15s 自动轮询
// - 两种模式：热门榜（rank 分页 + 加载更多）/ 实时扫描榜（涨幅/跌幅/成交额/换手，服务端全市场扫描 90s 缓存）
// - 交互：市场 Tab、行内排序、搜索过滤（已加载行）、价格闪烁、整行点击查阅详情（分时/日K/指标）
//   一键发起研究

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ChevronDown, DatabaseZap, Layers, Search, X, Zap } from 'lucide-react'
import { formatPct } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { StockDetailDialog, type StockDetailRow } from './stock-detail-dialog'

// ---------- 类型 ----------

interface BoardRow {
  code: string
  name: string
  market: 'SH' | 'SZ' | 'BJ' | 'HK' | 'US'
  industry: string | null
  rank: number
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

interface BoardPayload {
  rows: BoardRow[]
  mode: 'rank' | 'scan'
  scan?: { cached: boolean; scannedAt: number; total: number }
  ts: number
  hasMore: boolean
  error?: string
}

type MarketTab = 'ALL' | 'SH' | 'SZ' | 'BJ' | 'HK' | 'US'
type SortKey = 'rank' | 'gain' | 'loss' | 'amount' | 'turnover'

const CHIP_CLS =
  'num inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-1 py-px text-[10px] font-semibold uppercase tracking-[0.14em]'

const MARKET_TABS: { key: MarketTab; label: string; en: string }[] = [
  { key: 'ALL', label: '全部', en: '全球热门' },
  { key: 'SH', label: '沪市', en: '上交所' },
  { key: 'SZ', label: '深市', en: '深交所' },
  { key: 'BJ', label: '北交所', en: '北交所' },
  { key: 'HK', label: '港股', en: '港交所' },
  { key: 'US', label: '美股', en: 'NYSE / NASDAQ' },
]

const SORT_TABS: { key: SortKey; label: string; scan: boolean }[] = [
  { key: 'rank', label: '热门榜', scan: false },
  { key: 'gain', label: '涨幅榜', scan: true },
  { key: 'loss', label: '跌幅榜', scan: true },
  { key: 'amount', label: '成交额榜', scan: true },
  { key: 'turnover', label: '换手榜', scan: true },
]

const PAGE = 60
const REFRESH_MS = 15_000

// ---------- 格式化 ----------

function fmtPrice(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—'
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 成交额（腾讯源统一「万」为单位）→ 自适应 亿/万 */
function fmtAmount(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—'
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}亿`
  if (v >= 1) return `${v.toFixed(0)}万`
  return '—'
}

function fmtCap(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '—'
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万亿`
  return `${v.toFixed(0)}亿`
}

const MARKET_TONE: Record<BoardRow['market'], string> = {
  SH: 'border-primary/35 bg-primary/10 text-primary',
  SZ: 'border-bull/35 bg-bull/10 text-bull',
  BJ: 'border-hold/35 bg-hold/10 text-hold',
  HK: 'border-gold/35 bg-gold/10 text-gold',
  US: 'border-bear/35 bg-bear/10 text-bear',
}

// ---------- 行组件 ----------

function BoardRowItem({
  row,
  flash,
  onResearch,
  onOpenDetail,
}: {
  row: BoardRow
  flash: string
  onResearch: (q: string) => void
  onOpenDetail: (row: BoardRow) => void
}) {
  const up = row.changePct >= 0
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail(row)
        }
      }}
      aria-label={`查看 ${row.name} 实时详情`}
      className="group grid cursor-pointer grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_5.2rem_4.6rem_4.4rem_3.6rem] items-center gap-2 border-b border-border/30 px-3 py-2 transition-colors last:border-b-0 hover:bg-muted/25 focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gold/60 sm:grid-cols-[2.2rem_minmax(0,1.6fr)_minmax(0,1fr)_6rem_5rem_5rem_4.6rem_4rem] sm:px-4"
    >
      <span className="num text-right text-[11px] leading-none text-muted-foreground/55">{row.rank}</span>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold leading-tight group-hover:text-foreground" title={row.name}>{row.name}</p>
        <p className="num mt-0.5 flex items-center gap-1.5 text-[9.5px] leading-none text-muted-foreground/65">
          <span className={cn('rounded-sm border px-1 py-px font-semibold', MARKET_TONE[row.market])}>{row.market}</span>
          {row.code}
          {row.industry && <span className="hidden truncate text-[9.5px] opacity-70 md:inline">· {row.industry}</span>}
        </p>
      </div>
      <span key={row.price} className={cn('num hidden text-right text-[13px] font-semibold leading-none sm:block', flash)} title={row.time}>
        {fmtPrice(row.price)}
        <span className="ml-1 text-[9px] font-normal text-muted-foreground/55">{row.currency}</span>
      </span>
      <span className={cn('num rounded-sm px-1.5 py-1 text-right text-[11.5px] font-semibold leading-none', up ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear')}>
        {formatPct(row.changePct)}
      </span>
      <span className="num hidden text-right text-[11px] leading-none text-muted-foreground/80 sm:block" title="成交额">{fmtAmount(row.amount)}</span>
      <span className="num hidden text-right text-[11px] leading-none text-muted-foreground/80 md:block" title="换手率 / 市盈率TTM">
        {row.turnoverRate != null ? `${row.turnoverRate.toFixed(2)}%` : '—'}
        <span className="ml-1 opacity-60">/ {row.peTtm != null && row.peTtm > 0 ? row.peTtm.toFixed(1) : '—'}</span>
      </span>
      <span className="num hidden text-right text-[11px] leading-none text-muted-foreground/70 lg:block" title="总市值">{fmtCap(row.marketCap)}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onResearch(`${row.name} 是否值得投资`)
        }}
        onKeyDown={(e) => e.stopPropagation()}
        title={`对 ${row.name} 发起多智能体研究`}
        className="flex h-7 cursor-pointer items-center justify-center gap-1 rounded-sm border border-border/60 bg-muted/20 text-[10.5px] font-semibold text-muted-foreground transition-all duration-150 hover:border-gold/50 hover:bg-gold/10 hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/60"
      >
        <Zap className="size-3" aria-hidden />
        研究
      </button>
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1.5fr)_5.2rem_4.6rem_3.6rem] items-center gap-2 border-b border-border/30 px-3 py-2 sm:grid-cols-[2.2rem_minmax(0,1.6fr)_minmax(0,1fr)_6rem_5rem_5rem_4.6rem_4rem] sm:px-4" aria-hidden>
      <div className="shimmer h-2.5 w-6 rounded-sm bg-muted/50" />
      <div className="min-w-0 space-y-1">
        <div className="shimmer h-2.5 w-24 rounded-sm bg-muted/50" />
        <div className="shimmer h-2 w-16 rounded-sm bg-muted/35" />
      </div>
      <div className="shimmer h-2.5 w-14 rounded-sm bg-muted/45" />
      <div className="shimmer h-2.5 w-12 rounded-sm bg-muted/45" />
      <div className="shimmer h-2.5 w-10 rounded-sm bg-muted/40" />
    </div>
  )
}

// ---------- 主组件 ----------

export function UniverseBoardDialog({
  open,
  onOpenChange,
  onResearch,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onResearch: (query: string) => void
}) {
  const [market, setMarket] = useState<MarketTab>('ALL')
  const [sort, setSort] = useState<SortKey>('rank')
  const [rows, setRows] = useState<BoardRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [scanInfo, setScanInfo] = useState<{ cached: boolean; total: number } | null>(null)
  const [q, setQ] = useState('')
  const [stats, setStats] = useState<{ total: number; byMarket: Record<string, number> } | null>(null)
  const [flash, setFlash] = useState<Record<string, string>>({})
  const prevPriceRef = useRef<Record<string, number>>({})
  const loadedRef = useRef(PAGE)
  // 股票详情弹层：selected 与 open 分离，关闭动画期间保留 row 引用保证平滑退出
  const [detailRow, setDetailRow] = useState<StockDetailRow | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const openDetail = useCallback((row: BoardRow) => {
    setDetailRow(row)
    setDetailOpen(true)
  }, [])

  const sortDef = SORT_TABS.find((s) => s.key === sort) ?? SORT_TABS[0]
  const isRank = sort === 'rank'

  // 打开时拉取库规模统计
  useEffect(() => {
    if (!open) return
    fetch('/api/universe?stats=1')
      .then((r) => r.json())
      .then((d: { total: number; byMarket: Record<string, number> }) => setStats(d))
      .catch(() => setStats(null))
  }, [open])

  const applyRows = useCallback((next: BoardRow[], replace: boolean) => {
    const map: Record<string, string> = {}
    let changed = false
    for (const r of next) {
      const key = `${r.market}:${r.code}`
      const prev = prevPriceRef.current[key]
      if (prev != null && r.price > 0 && prev !== r.price) {
        map[key] = r.price > prev ? 'flash-up' : 'flash-down'
        changed = true
      }
      // 价格为 0（本帧无行情）时保留上次价格基准，避免下次误闪
      prevPriceRef.current[key] = r.price > 0 ? r.price : prev ?? 0
    }
    const commit = () => {
      setRows((cur) => {
        const base = replace ? [] : cur
        const idx = new Map(base.map((r) => [`${r.market}:${r.code}`, r]))
        for (const r of next) idx.set(`${r.market}:${r.code}`, r)
        return [...idx.values()]
      })
      if (changed) setFlash(map)
    }
    requestAnimationFrame(commit)
  }, [])

  const fetchBoard = useCallback(
    async (opts: { append?: boolean } = {}) => {
      const append = opts.append && isRank
      const offset = append ? loadedRef.current : 0
      const limit = append ? PAGE : Math.max(loadedRef.current, PAGE)
      if (append) setLoading(true)
      else if (sortDef.scan) setScanning(true)
      else setLoading(true)
      try {
        const res = await fetch(
          `/api/universe/board?market=${market}&sort=${sort}&offset=${offset}&limit=${limit}`,
        )
        const data = (await res.json()) as BoardPayload
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
        if (append) loadedRef.current += data.rows.length
        else loadedRef.current = Math.max(data.rows.length, PAGE)
        applyRows(data.rows, !append)
        setHasMore(data.hasMore)
        setUpdatedAt(data.ts)
        setScanInfo(data.scan ? { cached: data.scan.cached, total: data.scan.total } : null)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : '拉取失败')
      } finally {
        setLoading(false)
        setScanning(false)
      }
    },
    [market, sort, isRank, sortDef.scan, applyRows],
  )

  // 市场/排序切换：重置状态重拉
  useEffect(() => {
    if (!open) return
    loadedRef.current = PAGE
    prevPriceRef.current = {}
    setRows([])
    setHasMore(false)
    setError(null)
    void fetchBoard()
  }, [open, market, sort, fetchBoard])

  // 15s 自动刷新（仅打开时）
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => void fetchBoard(), REFRESH_MS)
    return () => clearInterval(t)
  }, [open, fetchBoard])

  // 搜索过滤（作用于已加载行）
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(kw) ||
        r.code.toLowerCase().includes(kw) ||
        (r.industry ?? '').toLowerCase().includes(kw),
    )
  }, [rows, q])

  const upCount = rows.filter((r) => r.changePct > 0).length
  const downCount = rows.filter((r) => r.changePct < 0).length

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="panel-flat flex h-[calc(100%-2rem)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>热门标的快照库 · 实时行情板</DialogTitle>
          <DialogDescription>全球近万只热门标的实时行情监控，点击任意标的查阅实时走势详情</DialogDescription>
        </DialogHeader>

        {/* ===== 头部 ===== */}
        <div className="shrink-0 border-b border-border/70 bg-background/85 px-4 pb-3 pt-4 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-primary/40 bg-primary/10 text-primary">
              <DatabaseZap className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-baseline gap-2 text-base font-bold tracking-tight">
                热门标的快照库
                <span className={cn(CHIP_CLS, 'border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-primary')}>
                  {stats ? `${stats.total.toLocaleString()} stocks` : '10,000 stocks'}
                </span>
                {stats && (
                  <span className={cn(CHIP_CLS, 'hidden border border-border/60 bg-muted/30 px-1.5 py-0.5 text-muted-foreground sm:inline-flex')}>
                    A股 {(stats.byMarket.SH ?? 0) + (stats.byMarket.SZ ?? 0) + (stats.byMarket.BJ ?? 0)} · 港股 {stats.byMarket.HK ?? 0} · 美股 {stats.byMarket.US ?? 0}
                  </span>
                )}
                <span className={cn(CHIP_CLS, 'border border-bull/40 bg-bull/10 px-1.5 py-0.5 text-bull')}>
                  <span aria-hidden className="led mr-1" />
                  15s live
                </span>
              </h2>
              <p className="num mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Global Hot Stock Universe · 行情源验证零幻觉 · 点击任意行查阅实时详情 · 实时价格由腾讯/雅虎行情层注入
              </p>
            </div>
            <div className="relative ml-auto hidden w-52 shrink-0 md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="过滤已加载标的…"
                className="h-8 pl-8 text-xs"
                aria-label="过滤快照库行情"
              />
            </div>
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onOpenChange(false)} aria-label="关闭快照库行情板">
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          {/* 市场 Tab + 排序 + 涨跌家数 */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="按市场切换">
              {MARKET_TABS.map((m) => {
                const active = market === m.key
                const disabled = sortDef.scan && m.key === 'ALL'
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={disabled}
                    title={disabled ? '扫描榜仅支持单市场' : m.en}
                    onClick={() => {
                      // 全市场 + 扫描榜互斥：切到全部时若当前是扫描榜则回落热门榜
                      if (m.key === 'ALL' && sortDef.scan) setSort('rank')
                      setMarket(m.key)
                    }}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-sm border px-2.5 py-1 text-xs font-semibold transition-colors duration-150',
                      active ? 'border-gold/60 bg-gold/15 text-gold' : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                      disabled && 'cursor-not-allowed opacity-35',
                    )}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            <span aria-hidden className="hidden h-4 w-px bg-border/60 sm:block" />
            <div className="flex items-center gap-1" role="group" aria-label="按榜单切换">
              {SORT_TABS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={sort === s.key}
                  onClick={() => {
                    // 扫描榜不支持全市场：自动切到深市（成交额最活跃）并提示
                    if (s.scan && market === 'ALL') setMarket('SZ')
                    setSort(s.key)
                  }}
                  title={s.scan ? '全市场实时扫描排序（服务端 90s 缓存，需单市场）' : '按建库时成交额热度排序'}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-150',
                    sort === s.key ? 'border-bull/60 bg-bull/15 text-bull' : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s.scan && <Activity className="mr-1 inline size-3" aria-hidden />}
                  {s.label}
                </button>
              ))}
            </div>
            <span className="num hidden items-center gap-2 text-[10px] text-muted-foreground/80 sm:flex">
              <span className="text-bull">▲{upCount}</span>
              <span className="text-bear">▼{downCount}</span>
            </span>
          </div>
        </div>

        {/* ===== 表头 ===== */}
        <div className="grid shrink-0 grid-cols-[2rem_minmax(0,1.5fr)_5.2rem_4.6rem_3.6rem] gap-2 border-b border-border/60 bg-muted/15 px-3 py-1.5 sm:grid-cols-[2.2rem_minmax(0,1.6fr)_minmax(0,1fr)_6rem_5rem_5rem_4.6rem_4rem] sm:px-4">
          <span className="micro-label text-right text-[8.5px]">#</span>
          <span className="micro-label text-[8.5px]">标的 · Snapshot Universe</span>
          <span className="micro-label hidden text-right text-[8.5px] sm:block">最新价</span>
          <span className="micro-label text-right text-[8.5px]">涨跌幅</span>
          <span className="micro-label hidden text-right text-[8.5px] sm:block">成交额</span>
          <span className="micro-label hidden text-right text-[8.5px] md:block">换手 / PE</span>
          <span className="micro-label hidden text-right text-[8.5px] lg:block">市值</span>
          <span className="micro-label text-center text-[8.5px]">AI</span>
        </div>

        {/* ===== 行情行 ===== */}
        <div className="nice-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {error ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <DatabaseZap className="size-7 text-muted-foreground/60" aria-hidden />
              <p className="text-sm text-muted-foreground">行情板拉取失败：{error}</p>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void fetchBoard()}>
                重试
              </Button>
            </div>
          ) : rows.length === 0 && loading ? (
            Array.from({ length: 14 }).map((_, i) => <RowSkeleton key={i} />)
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Layers className="size-7 text-muted-foreground/60" aria-hidden />
              <p className="text-sm text-muted-foreground">暂无数据 — 切换市场或榜单试试</p>
            </div>
          ) : (
            <>
              {sortDef.scan && scanInfo && (
                <p className="num border-b border-border/40 bg-primary/5 px-3 py-1.5 text-[10px] text-muted-foreground/85 sm:px-4">
                  全市场实时扫描 · {scanInfo.total} 只 · {scanInfo.cached ? '90s 缓存' : '刚刚扫描'} · 仅展示前 {rows.length} 名
                </p>
              )}
              {filtered.map((r) => (
                <BoardRowItem
                  key={`${r.market}:${r.code}`}
                  row={r}
                  flash={flash[`${r.market}:${r.code}`] ?? ''}
                  onResearch={onResearch}
                  onOpenDetail={openDetail}
                />
              ))}
              {filtered.length === 0 && q && (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">已加载范围内没有匹配「{q}」的标的</p>
              )}
              {isRank && hasMore && !q && (
                <div className="flex items-center justify-center p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    disabled={loading}
                    onClick={() => void fetchBoard({ append: true })}
                  >
                    <ChevronDown className={cn('size-3.5', loading && 'animate-bounce')} aria-hidden />
                    加载更多（热门榜后续排名）
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ===== 底部状态条 ===== */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 bg-muted/15 px-4 py-2">
          <span className="num flex items-center gap-1.5 text-[10px] text-muted-foreground/85">
            <span aria-hidden className={cn('block size-1.5 rounded-full', scanning ? 'bg-gold live-dot' : 'bg-bull')} />
            {scanning ? '全市场扫描中…' : updatedAt ? `更新于 ${new Date(updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '--:--:--'}
            <span className="opacity-60">· 每 15s 自动刷新</span>
          </span>
          <span className="num hidden text-[10px] text-muted-foreground/70 sm:inline">
            已加载 {rows.length} / {stats?.total ?? '近万'} 只
          </span>
          <span className="num ml-auto hidden text-[10px] text-muted-foreground/60 lg:inline">
            热门榜 = 建库时成交额热度序 · 扫描榜 = 全市场实时排序 · 点行查阅详情 · 点「研究」发起多智能体投委会
          </span>
        </div>
      </DialogContent>
    </Dialog>
    <StockDetailDialog
      open={detailOpen}
      row={detailRow}
      onOpenChange={setDetailOpen}
      onResearch={onResearch}
    />
    </>
  )
}
