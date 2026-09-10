'use client'

// 全球指数监控墙：十一大市场 Tab（开闭 LED）× 91 指数实时网格 × 16 交易所时钟条 × 指数百科弹层
// - 数据：/api/indices（腾讯财经 + 雅虎双源；30 日 sparkline 渐进到达）
// - 交互：价格闪烁（对比上次拉取）、手动刷新、键盘左右键切 Tab、点击指数→实时走势详情、指数百科→全球指数目录
// - 布局：桌面 4 列 / 移动 2 列，gap-px 发丝级网格线；末行不满时自动跨列补满

import { useEffect, useRef, useState } from 'react'
import { DatabaseZap, LibraryBig, RefreshCw } from 'lucide-react'
import type { GroupKey } from '@/lib/data/quotes'
import type { IndexRow, IndicesPayload } from '@/hooks/use-indices'
import { formatPct } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { IndexDetailDialog } from './index-detail-dialog'
import { IndexEncyclopediaDialog } from './index-encyclopedia-dialog'
import { UniverseBoardDialog } from './universe-board-dialog'
import { WorldClockBar } from './world-clock'

export type MarketKey = GroupKey

/** HomeView 持有 useIndices 的返回值并向下传递（全局唯一轮询实例） */
export interface IndicesState {
  data: IndicesPayload | null
  loading: boolean
  refresh: () => Promise<void>
}

const MARKET_META: { key: MarketKey; label: string; en: string }[] = [
  { key: 'cn', label: 'A股', en: 'China A-Share · 上交所/深交所/北交所' },
  { key: 'hk', label: '港股', en: 'Hong Kong · 港交所' },
  { key: 'us', label: '美股', en: 'US Market · NYSE/NASDAQ' },
  { key: 'jp', label: '日本', en: 'Japan · 东京证券交易所' },
  { key: 'kr', label: '韩国', en: 'South Korea · 韩国交易所' },
  { key: 'tw', label: '台湾', en: 'Taiwan · 台湾证券交易所' },
  { key: 'eu', label: '欧洲', en: 'Europe · 法兰克福/巴黎/伦敦/米兰/马德里/苏黎世/阿姆斯特丹/北欧' },
  { key: 'emea', label: '中东', en: 'EMEA · 伊斯坦布尔/特拉维夫/利雅得' },
  { key: 'asia', label: '亚太', en: 'Asia-Pacific · 新加坡/印度/越南/印尼/马来西亚/泰国/澳洲/新西兰' },
  { key: 'americas', label: '美洲', en: 'Americas · 多伦多/圣保罗/墨西哥城/圣地亚哥' },
  { key: 'global', label: '全球', en: 'Global · MSCI/FTSE 全球型指数' },
]

// ---------- 格式化 ----------

function fmtIdx(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtChange(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ''
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}

/** 行情时间（2026-09-09 16:14:03 等）→ HH:MM */
function fmtQuoteTime(t: string | null): string {
  if (!t) return '--:--'
  // ISO 格式（雅虎源 2026-09-08T20:00:15Z）→ 转 HH:mm
  if (t.includes('T')) {
    const d = new Date(t)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
    }
  }
  const hm = t.includes(' ') ? (t.split(' ')[1] ?? '') : t
  return hm.slice(0, 5) || '--:--'
}

/** 末行不满列数时让最后一个单元格跨列补满（避免发丝网格出现空洞） */
function cellSpanCls(count: number, isLast: boolean): string {
  if (!isLast) return ''
  const rb = count % 2 // 移动端 2 列
  const rl = count % 4 // 桌面 4 列
  const parts: string[] = []
  if (rb !== 0) parts.push('col-span-2')
  if (rl !== 0) parts.push(4 - rl + 1 === 4 ? 'lg:col-span-4' : 'lg:col-span-2')
  return parts.join(' ')
}

// ---------- Sparkline（30 日收盘，内联 SVG 手绘） ----------

const SPARK_W = 88
const SPARK_H = 30

/**
 * 点位闪烁：在 effect 中与上一次拉取对比（不在 render 期访问 ref）
 * 返回 {code: 'flash-up' | 'flash-down'}；sparkline 到达 / 点位未变不触发
 */
export function usePriceFlash(data: IndicesPayload | null): Record<string, string> {
  const [flash, setFlash] = useState<Record<string, string>>({})
  const prevRef = useRef<Record<string, number | null>>({})

  useEffect(() => {
    if (!data) return
    const map: Record<string, string> = {}
    let changed = false
    for (const rows of Object.values(data.groups)) {
      for (const row of rows) {
        const prev = prevRef.current[row.code]
        if (prev != null && row.price != null && prev !== row.price) {
          map[row.code] = row.price > prev ? 'flash-up' : 'flash-down'
          changed = true
        }
        prevRef.current[row.code] = row.price ?? null
      }
    }
    if (!changed) return
    // 延迟一帧应用闪烁类：避免 effect 内同步 setState 级联渲染，且保证类加在已挂载的新节点上
    const raf = requestAnimationFrame(() => setFlash(map))
    return () => cancelAnimationFrame(raf)
  }, [data])

  return flash
}

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || Math.abs(max) || 1
  const pad = 3
  const innerH = SPARK_H - pad * 2
  const step = values.length > 1 ? SPARK_W / (values.length - 1) : SPARK_W
  const pts = values.map((v, i) => {
    const x = (i * step).toFixed(2)
    const y = (pad + innerH - ((v - min) / range) * innerH).toFixed(2)
    return `${x},${y}`
  })
  const bull = values[values.length - 1] >= values[0]
  const color = bull ? 'var(--bull)' : 'var(--bear)'
  const lastY = pts[pts.length - 1]?.split(',')[1] ?? String(SPARK_H / 2)

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      width={SPARK_W}
      height={SPARK_H}
      className="block"
      aria-hidden
      focusable="false"
    >
      <polygon
        points={`0,${SPARK_H} ${pts.join(' ')} ${SPARK_W},${SPARK_H}`}
        fill={color}
        fillOpacity="0.09"
        stroke="none"
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={SPARK_W - 1.5} cy={lastY} r="1.8" fill={color} />
    </svg>
  )
}

// ---------- 指数单元格 ----------

function IndexCell({
  row,
  spark,
  sparkLoaded,
  flash,
  wide,
  onOpen,
}: {
  row: IndexRow
  spark?: number[]
  /** spark 批次是否已到达（区分加载中与无历史源） */
  sparkLoaded: boolean
  flash: string
  wide?: boolean
  /** 点击打开实时走势详情弹层 */
  onOpen: (row: IndexRow) => void
}) {
  const pct = row.changePct
  const pctNull = pct == null
  const up = (pct ?? 0) >= 0

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      aria-haspopup="dialog"
      title={`查看 ${row.name} 实时走势详情`}
      className="group relative flex min-w-0 cursor-pointer flex-col bg-[var(--panel)] p-3 text-left outline-none transition-colors duration-150 hover:bg-[var(--panel-2)] focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-inset sm:p-3.5"
    >
      {/* 名称行 + 数据源 / 代理角标 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight" title={row.desc}>
            {row.name}
          </p>
          <p className="micro-label mt-1 truncate text-[9px]">{row.shortName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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

      {/* 点位 + 涨跌 + sparkline */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {/* key=price：点位变化时重挂载以重触发闪烁动画 */}
          <p
            key={row.price ?? 'na'}
            className={cn('num text-lg font-semibold leading-none tracking-tight sm:text-xl', flash)}
          >
            {fmtIdx(row.price)}
          </p>
          <p
            className={cn(
              'num mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold',
              pctNull ? 'text-muted-foreground' : up ? 'text-bull' : 'text-bear',
            )}
          >
            {!pctNull && (
              <span aria-hidden className="text-[8px] leading-none">
                {up ? '▲' : '▼'}
              </span>
            )}
            {pct == null ? '—' : formatPct(pct)}
            {pct != null && <span className="font-medium opacity-75">{fmtChange(row.change)}</span>}
          </p>
        </div>
        <div className="shrink-0 pb-0.5">
          {spark && spark.length > 1 ? (
            <Sparkline values={spark} />
          ) : sparkLoaded ? (
            // spark 批次已到达但该指数无历史源（如北证50）：静态占位，不做 shimmer
            <div className="flex h-[30px] w-[88px] items-center justify-center rounded-sm border border-dashed border-border/50" aria-hidden>
              <span className="text-[8px] leading-none tracking-widest text-muted-foreground/50">NO HIST</span>
            </div>
          ) : (
            <div className="shimmer relative h-[30px] w-[88px] overflow-hidden rounded-sm bg-muted/50" aria-hidden />
          )}
        </div>
      </div>

      {/* 底部 meta 行：行情时间 / 货币；跨列宽格附带 日内高低 + 昨收 */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2">
        <span className="num text-[10px] leading-3 text-muted-foreground/80">
          {fmtQuoteTime(row.time)}
          <span className="ml-1.5 font-medium text-muted-foreground/50">{row.currency}</span>
        </span>
        {wide ? (
          <span className="num truncate text-[10px] leading-3 text-muted-foreground/80">
            H {fmtIdx(row.high)} · L {fmtIdx(row.low)} · 昨收 {fmtIdx(row.prevClose)}
          </span>
        ) : (
          <span aria-hidden className="num text-[9px] leading-3 text-muted-foreground/40">
            30D
          </span>
        )}
      </div>
    </button>
  )
}

function CellSkeleton() {
  return (
    <div className="flex flex-col bg-[var(--panel)] p-3 sm:p-3.5" aria-hidden>
      <div className="shimmer relative h-3.5 w-2/3 overflow-hidden rounded-sm bg-muted/60" />
      <div className="shimmer relative mt-2 h-2 w-1/2 overflow-hidden rounded-sm bg-muted/40" />
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="shimmer relative h-5 w-20 overflow-hidden rounded-sm bg-muted/60" />
        <div className="shimmer relative h-[30px] w-[88px] overflow-hidden rounded-sm bg-muted/40" />
      </div>
      <div className="mt-4 border-t border-border/40 pt-2">
        <div className="shimmer relative h-2 w-16 overflow-hidden rounded-sm bg-muted/40" />
      </div>
    </div>
  )
}

// ---------- 主组件 ----------

export function MarketMonitor({
  indices,
  onResearch,
}: {
  indices: IndicesState
  /** 由行内「研究」发起多智能体研究（HomeView.onSubmit） */
  onResearch?: (query: string) => void
}) {
  const { data, loading, refresh } = indices
  const [active, setActive] = useState<MarketKey>('cn')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  // 指数详情弹层：selected 与 open 分离，关闭动画期间保留 row 引用保证平滑退出
  const [selected, setSelected] = useState<IndexRow | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [encyOpen, setEncyOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const openIndex = (row: IndexRow) => {
    setSelected(row)
    setDetailOpen(true)
  }

  // 价格闪烁（effect 对比上次拉取）
  const flashMap = usePriceFlash(data)

  const rows = data?.groups[active] ?? []
  const sparks = data?.sparks ?? null
  const total = data ? Object.values(data.groups).reduce((n, rows) => n + rows.length, 0) : 0
  const updated = data ? new Date(data.ts).toLocaleTimeString('zh-CN', { hour12: false }) : null

  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const idx = MARKET_META.findIndex((m) => m.key === active)
    const delta = e.key === 'ArrowRight' ? 1 : MARKET_META.length - 1
    const next = MARKET_META[(idx + delta) % MARKET_META.length]
    setActive(next.key)
    tabRefs.current[next.key]?.focus()
  }

  return (
    <section id="markets" className="scroll-mt-24" aria-label="全球指数监控">
      <div className="panel overflow-hidden">
        {/* 全球交易所时钟条：12 大交易所 当地年月日 + 时间 + 开/休市 LED */}
        <WorldClockBar />

        {/* 头部：标题 + 数据源 + 更新时间 + 手动刷新 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border/60 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <p className="micro-label">Global Market Monitor</p>
            <h2 className="mt-1 flex items-baseline gap-2 text-lg font-bold tracking-tight">
              全球指数监控
              <span className="num rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {total > 0 ? total : '—'}
              </span>
              <span className="micro-label hidden text-[9px] lg:inline">{total > 0 ? total : '—'} Indices · {MARKET_META.length} Markets</span>
            </h2>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="micro-label hidden items-center gap-1.5 md:inline-flex">
              <span aria-hidden className="led text-bull" />
              Tencent/Yahoo · Live
            </span>
            <span aria-hidden className="hidden h-4 w-px bg-border/60 md:block" />
            {/* key=ts：数据刷新时重挂载重触发金色微闪（数据是活的） */}
            <span
              key={data?.ts ?? 'na'}
              className="num flash-refresh text-xs text-muted-foreground/90"
              aria-label="最后更新时间"
            >
              {updated ?? '--:--:--'}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
              onClick={() => setBoardOpen(true)}
              aria-haspopup="dialog"
              title="热门标的快照库：A股/港股/美股近万只热门标的实时行情板"
            >
              <DatabaseZap className="size-3.5 text-primary" aria-hidden />
              <span className="hidden sm:inline">快照库</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
              onClick={() => setEncyOpen(true)}
              aria-haspopup="dialog"
              title="全球股票市场与主要指数大全：指数百科与层级关系"
            >
              <LibraryBig className="size-3.5 text-gold" aria-hidden />
              <span className="hidden sm:inline">指数百科</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-md"
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="刷新全球指数行情"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden />
            </Button>
          </div>
        </div>

        {/* 市场 Tabs：开闭 LED + 指数数量 + 活动市场当地时间（九大市场横向滚动） */}
        <div
          role="tablist"
          aria-label="按市场切换指数"
          onKeyDown={onTablistKeyDown}
          className="flex items-stretch overflow-x-auto border-b border-border/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {MARKET_META.map((m) => {
            const isActive = m.key === active
            const status = data?.markets?.[m.key]
            const count = data?.groups[m.key]?.length ?? 0
            return (
              <button
                key={m.key}
                ref={(el) => {
                  tabRefs.current[m.key] = el
                }}
                type="button"
                role="tab"
                id={`tab-${m.key}`}
                title={m.en}
                aria-selected={isActive}
                aria-controls={`panel-${m.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(m.key)}
                className={cn(
                  'relative flex min-h-12 shrink-0 items-center gap-2 px-4 outline-none transition-colors duration-150 sm:px-5',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex w-2.5 items-center justify-center',
                    status === 'open' ? 'text-bull' : 'text-muted-foreground/50',
                  )}
                  aria-label={status === 'open' ? '开市' : status === 'closed' ? '休市' : '加载中'}
                >
                  {status === 'open' ? (
                    <span aria-hidden className="led" />
                  ) : (
                    <span aria-hidden className="block size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="text-[13px] font-semibold">{m.label}</span>
                <span className="num rounded-sm border border-border/70 px-1 py-px text-[10px] font-medium text-muted-foreground">
                  {count > 0 ? count : '—'}
                </span>
                {isActive && <span aria-hidden className="absolute inset-x-2 bottom-0 h-[2px] bg-gold sm:inset-x-3" />}
              </button>
            )
          })}
        </div>

        {/* 指数网格：gap-px + 边框色底 → 发丝级单元格分隔 */}
        <div
          role="tabpanel"
          id={`panel-${active}`}
          aria-labelledby={`tab-${active}`}
          className="grid grid-cols-2 gap-px bg-border/50 lg:grid-cols-4"
        >
          {rows.length === 0
            ? Array.from({ length: 8 }).map((_, i) => <CellSkeleton key={i} />)
            : rows.map((row, i) => (
                <IndexCell
                  key={row.code}
                  row={row}
                  spark={sparks?.[row.code]}
                  sparkLoaded={sparks !== null}
                  flash={flashMap[row.code] ?? ''}
                  wide={cellSpanCls(rows.length, i === rows.length - 1) !== ''}
                  onOpen={openIndex}
                />
              ))}
        </div>
      </div>

      {/* 指数详情弹层：实时走势 + 分时/日K 双模式 + 配置 chips */}
      <IndexDetailDialog open={detailOpen} row={selected} onOpenChange={setDetailOpen} />

      {/* 指数百科弹层：《全球指数大全》目录 + 实时点位联动 */}
      <IndexEncyclopediaDialog open={encyOpen} onOpenChange={setEncyOpen} indices={indices} onOpenIndex={openIndex} />

      {/* 快照库实时行情板：全球近万只热门标的 15s 自动刷新 */}
      <UniverseBoardDialog
        open={boardOpen}
        onOpenChange={setBoardOpen}
        onResearch={(query) => {
          setBoardOpen(false)
          onResearch?.(query)
        }}
      />
    </section>
  )
}
