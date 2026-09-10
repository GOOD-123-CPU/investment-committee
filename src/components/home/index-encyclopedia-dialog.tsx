'use client'

// 指数百科弹层：《全球股票市场与主要指数大全》知识库浏览器（深度优化版）
// - 布局：头部（标题/统计/搜索）+ 左侧市场导航（桌面）+ 右侧目录网格 + 知识详情抽屉
// - 每个指数都可点开：有实时源 → 实时走势详情（IndexDetailDialog）；无实时源 → 知识详情抽屉
// - 工程要点：弹层内所有 flex/grid 子项显式 min-w-0（修复 grid item min-width:auto 导致第三列被裁切）
// - 实时联动：凡接入行情源的条目展示实时点位/涨跌幅/30日走势缩略图，点击下钻

import { useDeferredValue, useMemo, useState } from 'react'
import {
  BookMarked,
  ChevronRight,
  CornerDownLeft,
  Info,
  LibraryBig,
  LineChart,
  Search,
  TrendingUp,
  X,
} from 'lucide-react'
import { INDEX_CATALOG, MARKET_TREE_KNOWLEDGE, type IndexCatalogEntry } from '@/lib/data/index-encyclopedia'
import type { GroupKey } from '@/lib/data/quotes'
import type { IndexRow, IndicesPayload } from '@/hooks/use-indices'
import { formatPct } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/** 与 MarketMonitor 的 IndicesState 结构一致（避免循环 import） */
interface IndicesStateLite {
  data: IndicesPayload | null
  loading: boolean
  refresh: () => Promise<void>
}

/** micro chip 字形（显式 utility 组合，绕开 .micro-label 的 unlayered 颜色覆盖） */
const CHIP_CLS =
  'num inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-1 py-px text-[10px] font-semibold uppercase tracking-[0.14em]'

/** 百科市场键 → 展示标签 + 交易所说明 */
const MARKET_LABEL: Record<string, string> = {
  cn: 'A股', hk: '港股', us: '美股', jp: '日本', kr: '韩国', tw: '台湾', in: '印度', eu: '欧洲',
  sg: '新加坡', vn: '越南', id: '印尼', my: '马来西亚', th: '泰国', au: '澳洲', nz: '新西兰',
  ca: '加拿大', br: '巴西', mx: '墨西哥', cl: '智利', sa: '沙特', il: '以色列', tr: '土耳其', global: '全球',
}

const MARKET_EN: Record<string, string> = {
  cn: 'China A-Share', hk: 'Hong Kong', us: 'United States', jp: 'Japan', kr: 'South Korea', tw: 'Taiwan',
  in: 'India', eu: 'Europe', sg: 'Singapore', vn: 'Vietnam', id: 'Indonesia', my: 'Malaysia', th: 'Thailand',
  au: 'Australia', nz: 'New Zealand', ca: 'Canada', br: 'Brazil', mx: 'Mexico', cl: 'Chile', sa: 'Saudi',
  il: 'Israel', tr: 'Türkiye', global: 'Global',
}

/** 百科市场键 → 实时数据分组（quotes.ts GroupKey） */
const MARKET_TO_GROUP: Record<string, GroupKey> = {
  cn: 'cn', hk: 'hk', us: 'us', jp: 'jp', kr: 'kr', tw: 'tw', eu: 'eu', global: 'global',
  in: 'asia', sg: 'asia', vn: 'asia', id: 'asia', my: 'asia', th: 'asia', au: 'asia', nz: 'asia',
  ca: 'americas', br: 'americas', mx: 'americas', cl: 'americas', sa: 'emea', il: 'emea', tr: 'emea',
}

const CATEGORY_ORDER: IndexCatalogEntry['category'][] = ['宽基', '行业', '主题', '策略', '全球']
const CAT_TONE: Record<IndexCatalogEntry['category'], string> = {
  宽基: 'border-primary/40 bg-primary/10 text-primary',
  行业: 'border-bull/40 bg-bull/10 text-bull',
  主题: 'border-gold/40 bg-gold/10 text-gold',
  策略: 'border-hold/40 bg-hold/10 text-hold',
  全球: 'border-bear/40 bg-bear/10 text-bear',
}
/** 分类主题色（卡片左侧 accent 条用） */
const CAT_BAR: Record<IndexCatalogEntry['category'], string> = {
  宽基: 'bg-primary/70', 行业: 'bg-bull/70', 主题: 'bg-gold/80', 策略: 'bg-hold/70', 全球: 'bg-bear/70',
}

// ---------- 迷你走势缩略图（30 日收盘，与监控墙同构） ----------

function MiniSpark({ values }: { values: number[] }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || Math.abs(max) || 1
  const w = 56
  const h = 22
  const step = values.length > 1 ? w / (values.length - 1) : w
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`)
  const bull = values[values.length - 1] >= values[0]
  const color = bull ? 'var(--bull)' : 'var(--bear)'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block shrink-0" aria-hidden focusable="false">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w - 1.2} cy={pts[pts.length - 1]?.split(',')[1] ?? h / 2} r="1.5" fill={color} />
    </svg>
  )
}

// ---------- 知识详情抽屉 ----------

function KnowledgeDrawer({
  entry,
  liveMap,
  onClose,
  onOpenChart,
  onJump,
}: {
  entry: IndexCatalogEntry
  liveMap: Map<string, IndexRow>
  onClose: () => void
  /** 有实时源：打开实时走势详情弹层 */
  onOpenChart: (row: IndexRow) => void
  /** 跳转到相关指数（替换抽屉内容） */
  onJump: (e: IndexCatalogEntry) => void
}) {
  const live = entry.quoteCode ? liveMap.get(entry.quoteCode) : undefined
  const pct = live?.changePct ?? null
  const up = (pct ?? 0) >= 0
  const related = useMemo(
    () =>
      INDEX_CATALOG.filter(
        (e) => e !== entry && (e.market === entry.market || e.category === entry.category),
      ).slice(0, 8),
    [entry],
  )
  const group = MARKET_TO_GROUP[entry.market]

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-border/70 bg-background/95 shadow-2xl backdrop-blur-md sm:w-[400px]">
      {/* 抽屉头 */}
      <div className="flex items-start gap-2.5 border-b border-border/60 px-4 pb-3 pt-4">
        <span className={cn('mt-0.5 h-9 w-[3px] shrink-0 rounded-full', CAT_BAR[entry.category])} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold leading-tight" title={entry.name}>{entry.name}</h3>
          <p className="micro-label mt-1 truncate text-[9px]">{entry.en}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className={cn(CHIP_CLS, 'border px-1.5 py-0.5', CAT_TONE[entry.category])}>{entry.category}</span>
            <span className={cn(CHIP_CLS, 'border border-border/70 bg-muted/30 text-muted-foreground')}>
              {MARKET_LABEL[entry.market] ?? entry.market}
            </span>
            <span className={cn(CHIP_CLS, 'border border-border/50 bg-muted/20 text-muted-foreground/70')}>{MARKET_EN[entry.market] ?? ''}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose} aria-label="关闭详情">
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>

      <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* 实时板块（有源时） */}
        {live ? (
          <div className="rounded-md border border-border/60 bg-[var(--panel)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="micro-label flex items-center gap-1.5">
                <span aria-hidden className="led text-bull" />
                Live Quote
              </span>
              <span className="num text-[10px] text-muted-foreground/70">{live.code}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="num text-2xl font-semibold leading-none tracking-tight">{live.price?.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) ?? '—'}</p>
              <p className={cn('num text-sm font-semibold', pct == null ? 'text-muted-foreground' : up ? 'text-bull' : 'text-bear')}>
                {pct == null ? '—' : formatPct(pct)}
              </p>
            </div>
            <Button size="sm" className="mt-3 h-8 w-full gap-1.5 text-xs" onClick={() => onOpenChart(live)}>
              <LineChart className="size-3.5" aria-hidden />
              查看实时走势详情
              <CornerDownLeft className="size-3 opacity-60" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 p-3">
            <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              该指数暂无免费实时行情源，仅知识库收录 —— 系统不编造点位。可参考同市场已接入实时源的代表性指数。
            </p>
          </div>
        )}

        {/* 定位 */}
        <section className="mt-4">
          <p className="micro-label mb-1.5">定位 · Positioning</p>
          <p className="text-[12px] leading-relaxed text-foreground/85">{entry.desc}</p>
        </section>

        {/* 层级关系 */}
        {entry.relation && (
          <section className="mt-4">
            <p className="micro-label mb-1.5">层级关系 · Hierarchy</p>
            <p className="num rounded-sm border border-gold/25 bg-gold/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-gold/90">
              ⟡ {entry.relation}
            </p>
          </section>
        )}

        {/* 市场开闭 */}
        <section className="mt-4">
          <p className="micro-label mb-1.5">所属市场 · Market</p>
          <div className="flex items-center gap-2 rounded-sm border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
            <span aria-hidden className={cn('block size-1.5 rounded-full', group && live?.source ? 'bg-bull' : 'bg-muted-foreground/40')} />
            {MARKET_LABEL[entry.market] ?? entry.market} · {MARKET_EN[entry.market] ?? ''}
            {entry.quoteCode && <span className="num ml-auto text-[10px] text-muted-foreground/60">{entry.quoteCode}</span>}
          </div>
        </section>

        {/* 相关指数 */}
        <section className="mt-4">
          <p className="micro-label mb-1.5">相关指数 · Related</p>
          <div className="grid grid-cols-1 gap-1">
            {related.map((e) => {
              const r = e.quoteCode ? liveMap.get(e.quoteCode) : undefined
              const rp = r?.changePct ?? null
              return (
                <button
                  key={`${e.market}-${e.name}`}
                  type="button"
                  onClick={() => onJump(e)}
                  className="group/rel flex cursor-pointer items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border/60 hover:bg-muted/30"
                >
                  <span className={cn('h-3 w-[2px] shrink-0 rounded-full', CAT_BAR[e.category])} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{e.name}</span>
                  {r ? (
                    <span className={cn('num shrink-0 text-[10px] font-semibold', (rp ?? 0) >= 0 ? 'text-bull' : 'text-bear')}>{rp == null ? '—' : formatPct(rp)}</span>
                  ) : (
                    <span className="num shrink-0 text-[9px] text-muted-foreground/50">知识库</span>
                  )}
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/40 transition-transform group-hover/rel:translate-x-0.5" aria-hidden />
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

// ---------- 主组件 ----------

export function IndexEncyclopediaDialog({
  open,
  onOpenChange,
  indices,
  onOpenIndex,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  indices: IndicesStateLite | null
  onOpenIndex: (row: IndexRow) => void
}) {
  const [q, setQ] = useState('')
  const deferredQ = useDeferredValue(q)
  const [market, setMarket] = useState<string | null>(null)
  const [cat, setCat] = useState<IndexCatalogEntry['category'] | null>(null)
  const [onlyLive, setOnlyLive] = useState(false)
  const [drawer, setDrawer] = useState<IndexCatalogEntry | null>(null)
  const [showKnowledge, setShowKnowledge] = useState(false)

  // 市场筛选 chips：按条目出现顺序 + 每市场统计
  const marketStats = useMemo(() => {
    const order: { key: string; total: number; live: number }[] = []
    const idx = new Map<string, number>()
    for (const e of INDEX_CATALOG) {
      let i = idx.get(e.market)
      if (i == null) {
        i = order.length
        idx.set(e.market, i)
        order.push({ key: e.market, total: 0, live: 0 })
      }
      order[i].total++
      if (e.quoteCode) order[i].live++
    }
    return order
  }, [])

  // 实时行情查找表：quoteCode → IndexRow
  const indicesData = indices?.data ?? null
  const liveMap = useMemo(() => {
    const m = new Map<string, IndexRow>()
    if (!indicesData) return m
    for (const rows of Object.values(indicesData.groups)) {
      for (const r of rows ?? []) m.set(r.code, r)
    }
    return m
  }, [indicesData])

  const sparks = indicesData?.sparks ?? null

  const results = useMemo(() => {
    const kw = deferredQ.trim().toLowerCase()
    return INDEX_CATALOG.filter((e) => {
      if (market && e.market !== market) return false
      if (cat && e.category !== cat) return false
      if (onlyLive && !e.quoteCode) return false
      if (!kw) return true
      return (
        e.name.toLowerCase().includes(kw) ||
        e.en.toLowerCase().includes(kw) ||
        e.desc.toLowerCase().includes(kw)
      )
    })
  }, [deferredQ, market, cat, onlyLive])

  const liveCount = INDEX_CATALOG.filter((e) => e.quoteCode).length
  const marketCount = marketStats.length

  /** 卡片点击：有实时源 → 走势详情；纯知识库 → 详情抽屉 */
  const openEntry = (e: IndexCatalogEntry) => {
    const live = e.quoteCode ? liveMap.get(e.quoteCode) : undefined
    if (live) {
      onOpenIndex(live)
      onOpenChange(false)
    } else {
      setDrawer(e)
    }
  }

  const closeAll = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="panel-flat flex h-[calc(100%-2rem)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>指数百科 · 全球股票市场与主要指数大全</DialogTitle>
          <DialogDescription>全球指数知识库与实时行情联动，每个指数均可点开</DialogDescription>
        </DialogHeader>

        {/* ===== 头部：标题 + 统计 + 搜索 ===== */}
        <div className="shrink-0 border-b border-border/70 bg-background/85 px-4 pb-3 pt-4 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-gold/40 bg-gold/10 text-gold">
              <LibraryBig className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="flex items-baseline gap-2 text-base font-bold tracking-tight">
                指数百科
                <span className={cn(CHIP_CLS, 'border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-gold')}>{INDEX_CATALOG.length} indices</span>
                <span className={cn(CHIP_CLS, 'border border-bull/40 bg-bull/10 px-1.5 py-0.5 text-bull')}>{liveCount} live</span>
                <span className={cn(CHIP_CLS, 'hidden border border-border/60 bg-muted/30 px-1.5 py-0.5 text-muted-foreground sm:inline-flex')}>
                  {marketCount} markets
                </span>
              </h2>
              <p className="num mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Global Index Encyclopedia · 《全球股票市场与主要指数大全》内置知识库
              </p>
            </div>
            <div className="relative ml-auto hidden w-64 shrink-0 md:block xl:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索：沪深300 / DAX / MSCI / 红利…"
                className="h-8 pl-8 text-xs"
                aria-label="搜索指数百科"
              />
            </div>
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={closeAll} aria-label="关闭指数百科">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          {/* 移动端搜索（桌面侧边栏布局时不重复展示） */}
          <div className="relative mt-2.5 md:hidden">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索指数…"
              className="h-8 pl-8 text-xs"
              aria-label="搜索指数百科"
            />
          </div>
        </div>

        {/* ===== 主体：左市场导航 + 右目录网格 ===== */}
        <div className="flex min-h-0 flex-1">
          {/* 左侧市场导航（≥md） */}
          <nav
            aria-label="按市场导航"
            className="nice-scroll hidden w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/60 bg-muted/10 p-2 lg:flex xl:w-48"
          >
            <button
              type="button"
              aria-pressed={market === null}
              onClick={() => setMarket(null)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs font-semibold transition-colors',
                market === null ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              <LibraryBig className="size-3.5 shrink-0" aria-hidden />
              全部市场
              <span className="num ml-auto text-[10px] font-medium opacity-70">{INDEX_CATALOG.length}</span>
            </button>
            <div className="my-1 h-px bg-border/50" aria-hidden />
            {marketStats.map(({ key, total, live }) => {
              const group = MARKET_TO_GROUP[key]
              const isLive = (indicesData?.markets?.[group] ?? 'closed') === 'open'
              const active = market === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMarket(active ? null : key)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                    active ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn('block size-1.5 shrink-0 rounded-full', isLive ? 'live-dot bg-bull' : 'bg-muted-foreground/35')}
                    title={isLive ? '开市中' : '休市'}
                  />
                  <span className="truncate">{MARKET_LABEL[key] ?? key}</span>
                  {live > 0 && <span className="num shrink-0 rounded-sm border border-bull/30 bg-bull/10 px-1 text-[9px] leading-3.5 text-bull/90">{live}</span>}
                  <span className="num ml-auto text-[10px] font-medium opacity-60">{total}</span>
                </button>
              )
            })}
            {/* 知识库层级框架入口 */}
            <div className="my-1 h-px bg-border/50" aria-hidden />
            <button
              type="button"
              onClick={() => setShowKnowledge((v) => !v)}
              aria-expanded={showKnowledge}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                showKnowledge ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              <BookMarked className="size-3.5 shrink-0" aria-hidden />
              指数层级框架
              <ChevronRight className={cn('ml-auto size-3 transition-transform', showKnowledge && 'rotate-90')} aria-hidden />
            </button>
          </nav>

          {/* 右侧：筛选行 + 目录网格（min-w-0 防溢出裁切） */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* 筛选行：市场 chips（<lg 时可见）+ 分类 + 实时开关 + 计数 */}
            <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-3 py-2 sm:px-4">
              <div className="nice-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="按市场筛选">
                <button
                  type="button"
                  aria-pressed={market === null}
                  onClick={() => setMarket(null)}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-150 lg:hidden',
                    market === null ? 'border-gold/60 bg-gold/15 text-gold' : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                  )}
                >
                  全部
                </button>
                {marketStats.map(({ key, total }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={market === key}
                    onClick={() => setMarket(market === key ? null : key)}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-150 lg:hidden',
                      market === key ? 'border-gold/60 bg-gold/15 text-gold' : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {MARKET_LABEL[key] ?? key}
                    <span className="num ml-1 text-[9px] opacity-60">{total}</span>
                  </button>
                ))}
                <span aria-hidden className="mx-0.5 hidden h-4 w-px shrink-0 bg-border/60 sm:block" />
                {CATEGORY_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={cat === c}
                    onClick={() => setCat(cat === c ? null : c)}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-150',
                      cat === c ? 'border-gold/60 bg-gold/15 text-gold' : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={onlyLive}
                onClick={() => setOnlyLive((v) => !v)}
                title="仅显示已接入实时行情源的指数"
                className={cn(
                  'flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-150',
                  onlyLive ? 'border-bull/60 bg-bull/15 text-bull' : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                )}
              >
                <span aria-hidden className={cn('block size-1.5 rounded-full', onlyLive ? 'live-dot bg-bull' : 'bg-muted-foreground/50')} />
                实时
              </button>
              <span className="num hidden shrink-0 text-[10px] text-muted-foreground/70 sm:inline">{results.length} 条</span>
            </div>

            {/* 目录网格 */}
            <div className="nice-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
              {results.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                  <BookMarked className="size-7 text-muted-foreground/60" aria-hidden />
                  <p className="text-sm text-muted-foreground">没有匹配的指数 — 试试「沪深300」「MSCI」「DAX」或清空筛选</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {results.map((e) => {
                    const live = e.quoteCode ? liveMap.get(e.quoteCode) : undefined
                    const pct = live?.changePct ?? null
                    const up = (pct ?? 0) >= 0
                    const spark = e.quoteCode ? sparks?.[e.quoteCode] : undefined
                    return (
                      <button
                        key={`${e.market}-${e.name}`}
                        type="button"
                        onClick={() => openEntry(e)}
                        title={live ? `查看 ${e.name} 实时走势详情` : `查看 ${e.name} 百科详情`}
                        className="group relative flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-md border border-border/50 bg-[var(--panel)] p-3 text-left outline-none transition-all duration-150 hover:border-gold/40 hover:bg-[var(--panel-2)] hover:shadow-[0_0_0_1px_var(--gold)]/20 focus-visible:ring-2 focus-visible:ring-gold/60"
                      >
                        {/* 分类主题 accent 条 */}
                        <span aria-hidden className={cn('absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[2.5px] rounded-full opacity-60 transition-opacity group-hover:opacity-100', CAT_BAR[e.category])} />
                        <div className="flex min-w-0 items-start justify-between gap-2 pl-1.5">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold leading-tight" title={e.name}>{e.name}</p>
                            <p className="micro-label mt-0.5 truncate text-[9px]">{e.en}</p>
                          </div>
                          <span className={cn(CHIP_CLS, 'border px-1.5 py-0.5', CAT_TONE[e.category])}>{e.category}</span>
                        </div>
                        <p className="pl-1.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2" title={e.desc}>{e.desc}</p>
                        {e.relation && <p className="num truncate pl-1.5 text-[10px] leading-3 text-gold/80" title={e.relation}>⟡ {e.relation}</p>}
                        <div className="mt-auto flex min-w-0 items-center justify-between gap-2 border-t border-border/40 pl-1.5 pt-1.5">
                          <span className={cn(CHIP_CLS, 'border-border/70 bg-muted/30 text-muted-foreground')}>{MARKET_LABEL[e.market] ?? e.market}</span>
                          {live ? (
                            <span className="flex min-w-0 items-center gap-1.5">
                              {spark && spark.length > 1 && <MiniSpark values={spark} />}
                              <span className="flex flex-col items-end">
                                <span key={live.price ?? 'na'} className="num text-xs font-semibold leading-none">{live.price?.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) ?? '—'}</span>
                                <span className={cn('num mt-0.5 text-[10px] font-semibold leading-none', pct == null ? 'text-muted-foreground' : up ? 'text-bull' : 'text-bear')}>
                                  {pct == null ? '—' : formatPct(pct)}
                                </span>
                              </span>
                            </span>
                          ) : (
                            <span className={cn(CHIP_CLS, 'border-border/50 bg-muted/20 text-muted-foreground/70')} title="暂无免费实时源：仅知识库收录，系统不会编造点位">知识库</span>
                          )}
                          {/* 点击指示：实时→走势 / 知识→百科详情 */}
                          <span aria-hidden className="absolute bottom-2.5 right-2.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70">
                            {live ? <LineChart className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                          </span>
                          <span className="sr-only">{live ? '打开实时走势' : '打开百科详情'}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* 层级框架（可折叠知识区，亦从侧边栏触发） */}
              {(showKnowledge || (market === null && !cat && !deferredQ)) && (
                <div className="mt-3 rounded-md border border-border/60 bg-muted/10 p-4">
                  <button
                    type="button"
                    onClick={() => setShowKnowledge((v) => !v)}
                    aria-expanded={showKnowledge}
                    className="micro-label mb-2 flex w-full cursor-pointer items-center gap-1.5 text-left"
                  >
                    <TrendingUp className="size-3.5 text-primary" aria-hidden />
                    Index Framework · 指数层级框架（注入全部 Agent 的知识库摘要）
                    <ChevronRight className={cn('ml-auto size-3.5 transition-transform', showKnowledge && 'rotate-90')} aria-hidden />
                  </button>
                  {showKnowledge && (
                    <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/75">{MARKET_TREE_KNOWLEDGE}</pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== 知识详情抽屉（每个指数都可点开的「百科详情」） ===== */}
        {drawer && (
          <KnowledgeDrawer
            entry={drawer}
            liveMap={liveMap}
            onClose={() => setDrawer(null)}
            onOpenChart={(row) => {
              setDrawer(null)
              onOpenIndex(row)
              onOpenChange(false)
            }}
            onJump={(e) => setDrawer(e)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
