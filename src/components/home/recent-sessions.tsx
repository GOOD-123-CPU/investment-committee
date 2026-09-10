'use client'

// 最近研究 · 研究档案：GET /api/sessions?limit=12 · DELETE /api/sessions/[id]
// 终端日志行 × 环形分数仪表 × 实底评级胶囊（↑/−/↓ 色盲友好）× PK 对抗标识 × hover 状态条 × 删除（两段式确认）
// open() 分组打开逻辑 / refreshKey 轮询刷新机制保持不变

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleCheck,
  History,
  Loader2,
  Minus,
  Radar,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { SessionListItem } from '@/lib/types'
import type { GroupSessionLite, OpenSessionFn } from '@/lib/client-utils'
import { ratingTone, relTime, statusMeta } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

// ---------- 分桶 / 筛选常量（纯前端，不发请求） ----------

type Bucket = 'running' | 'completed' | 'failed'
type FilterKey = 'all' | Bucket

function bucketOf(status: SessionListItem['status']): Bucket {
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  return 'running'
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'running', label: '研究中' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '失败' },
]

const FILTER_EMPTY: Record<FilterKey, string> = {
  all: '还没有研究记录 — 在上方输入一个问题，召开第一次投委会',
  running: '暂无进行中的研究 — 投委会当前没有在办案件',
  completed: '还没有已归档的研究 — 完成一次投委会后归档于此',
  failed: '没有失败记录 — 全部研究健康运行',
}

/**
 * micro chip 基类。
 * 注意：.micro-label 是 unlayered CSS，其内置 text-muted-foreground 会压过
 * utilities 层的 text-gold/text-bull 覆写，故此处用显式 utility 组合复刻其字形。
 */
const CHIP_CLS =
  'num inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-1 py-px text-[10px] font-semibold uppercase tracking-[0.14em]'

/** market → 市场 micro chip 文案 */
function marketLabel(market: string | null): string | null {
  if (!market) return null
  const m = market.trim().toUpperCase()
  if (!m) return null
  if (m === 'SH' || m === 'SZ') return 'A股'
  if (m === 'HK') return '港股'
  if (m === 'US') return '美股'
  return m
}

// ---------- 行内子组件 ----------

/** 状态 LED 颜色：完成=绿 / 失败=红 / 运行=琥珀 */
function ledTone(status: SessionListItem['status']): string {
  if (status === 'completed') return 'text-bull'
  if (status === 'failed') return 'text-bear'
  if (status === 'queued') return 'text-muted-foreground'
  return 'text-hold'
}

function StatusLed({ status }: { status: SessionListItem['status'] }) {
  const tone = ledTone(status)
  const running = statusMeta(status).running && status !== 'queued'
  return (
    <span className={cn('flex size-5 shrink-0 items-center justify-center', tone)} aria-hidden>
      {running ? <span className="led" /> : <span className="size-1.5 rounded-full bg-current" />}
    </span>
  )
}

/** 评分列：completed → 环形分数仪表 + 实底评级胶囊；否则 statusMeta 徽章（保留 LED 动效） */

/** 环形分数仪表：圆环按分数着色填充，环内大号等宽数字 */
function ScoreRing({ score, rating }: { score: number; rating?: string | null }) {
  const tone = ratingTone(rating)
  const C = 2 * Math.PI * 15.5
  const pct = Math.min(100, Math.max(0, score))
  return (
    <span
      className={cn('relative flex size-11 shrink-0 items-center justify-center', tone.text)}
      title={`AI Score ${Math.round(score)} / 100 · ${rating ?? '—'}`}
    >
      <svg viewBox="0 0 36 36" className="size-11 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-border/80" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
          className="stroke-current transition-all duration-500 group-hover:brightness-125"
        />
      </svg>
      <span className="num absolute text-sm font-bold leading-none tracking-tight">{Math.round(score)}</span>
    </span>
  )
}

/** 评级 → 图形符号（色盲友好：▲ BUY / − HOLD / ▼ SELL，不仅靠颜色区分） */
function ratingGlyph(rating?: string | null): { Icon: LucideIcon; label: string } {
  if (rating?.includes('BUY')) return { Icon: ArrowUp, label: '看多' }
  if (rating?.includes('SELL')) return { Icon: ArrowDown, label: '看空' }
  return { Icon: Minus, label: '观望' }
}

/** 实底评级胶囊：主题色底 + 深色文字（红底/黄底/绿底黑字，扫视效率优先） */
function RatingBadge({ rating }: { rating?: string | null }) {
  const { Icon, label } = ratingGlyph(rating)
  const solid = rating?.includes('BUY')
    ? 'bg-bull'
    : rating?.includes('SELL')
      ? 'bg-bear'
      : 'bg-hold'
  return (
    <span
      className={cn(
        'num inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none text-[#0B1220] shadow-sm',
        solid,
      )}
      title={`投委会评级：${rating ?? '—'}（${label}）`}
    >
      <Icon className="size-3" strokeWidth={3} aria-hidden />
      {rating ?? '—'}
    </span>
  )
}

function ScoreCell({ item }: { item: SessionListItem }) {
  if (item.status === 'completed' && item.finalScore != null) {
    return (
      <span className="flex w-[7.25rem] shrink-0 items-center justify-end gap-2.5">
        <ScoreRing score={item.finalScore} rating={item.rating} />
        <span className="flex w-14 flex-col items-start gap-1.5 sm:w-16">
          <RatingBadge rating={item.rating} />
          <span className="num text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
            AI Score
          </span>
        </span>
      </span>
    )
  }
  const meta = statusMeta(item.status)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs font-medium',
        meta.className,
      )}
    >
      {meta.running && item.status !== 'queued' && <span aria-hidden className="led" />}
      {meta.label}
    </span>
  )
}

function RecentSkeleton() {
  return (
    <div className="panel divide-y divide-border/50" role="status" aria-label="加载最近研究中">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
          <Skeleton className="hidden h-2.5 w-6 sm:block" />
          <Skeleton className="size-2 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
          <Skeleton className="h-10 w-16 shrink-0" />
          <Skeleton className="hidden h-3 w-16 shrink-0 sm:block" />
        </div>
      ))}
    </div>
  )
}

// ---------- 单行研究档案 ----------

function SessionRow({
  item,
  idx,
  groupSize,
  groupNames,
  onOpen,
  onDelete,
  deleting,
}: {
  item: SessionListItem
  idx: number
  groupSize: number
  groupNames: string[]
  onOpen: (item: SessionListItem) => void
  onDelete: (item: SessionListItem) => void
  deleting: boolean
}) {
  const tone = ratingTone(item.rating)
  const isCompleted = item.status === 'completed'
  const isRunning = bucketOf(item.status) === 'running'
  const grouped = groupSize > 1
  const market = marketLabel(item.market)
  // 对比对手方：组内除自身外的第一个成员名（PK 对抗标识）
  const rival = groupNames.find((n) => n && n !== item.stockName) ?? null

  // 两段式删除确认：第一次点击进入 confirm（3s 内不点则自动复位），再次点击才真正删除
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])
  const askDelete = () => {
    if (confirming) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      setConfirming(false)
      onDelete(item)
      return
    }
    setConfirming(true)
    confirmTimer.current = setTimeout(() => setConfirming(false), 3000)
  }

  return (
    <div
      className={cn(
        'group relative flex items-center border-b border-border/50 transition-colors duration-150 last:border-b-0 hover:bg-muted/50',
        deleting && 'pointer-events-none opacity-40',
      )}
    >
      {/* completed：评级色标（左侧 3px 竖色条，hover 提亮加发光） */}
      {isCompleted && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 z-10 w-[3px] opacity-60 transition-all duration-150 group-hover:opacity-100',
            tone.bar,
          )}
        />
      )}
      {/* running：顶部 2px shimmer 细进度线（shimmer 自带 position:relative，需绝对定位包装层） */}
      {isRunning && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-0.5">
          <span className="shimmer block h-full w-full bg-primary/15" />
        </span>
      )}

      <button
        type="button"
        onClick={() => onOpen(item)}
        disabled={deleting}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 sm:gap-4 sm:px-5"
        aria-label={`打开研究：${item.query}`}
      >
        {/* 终端日志序号（全局档案编号，筛选下保持稳定） */}
        <span className="num hidden w-6 shrink-0 text-[10px] text-muted-foreground/60 sm:block" aria-hidden>
          #{String(idx + 1).padStart(2, '0')}
        </span>

        <StatusLed status={item.status} />

        {/* 主列：query 主行 + meta 行 */}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            {grouped && (
              <span className="flex shrink-0 items-center gap-1.5">
                {/* PK 对抗标识：空-中-多三段渐变，红金绿 = Bear vs 中性 vs Bull */}
                <span
                  title={`对比研究组 · ${groupSize} 条并行记录${groupNames.length > 0 ? ` · ${groupNames.join(' / ')}` : ''}`}
                  className={cn(
                    CHIP_CLS,
                    'border border-gold/50 bg-gradient-to-r from-bear/30 via-gold/30 to-bull/30 px-1.5 py-0.5 font-black tracking-[0.1em] text-gold',
                  )}
                >
                  PK
                </span>
                {rival && (
                  <span title={`对比对手方：${rival}`} className={cn(CHIP_CLS, 'border-border/70 bg-muted/40 text-foreground/85')}>
                    VS {rival}
                  </span>
                )}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.query}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/75">
            {item.stockName && <span className="max-w-[14rem] truncate">{item.stockName}</span>}
            {item.stockCode && <span className="num shrink-0 text-[11px] text-foreground/60">{item.stockCode}</span>}
            {market && <span className={cn(CHIP_CLS, 'border-border/70 bg-muted/30 text-muted-foreground')}>{market}</span>}
            {item.intent === 'comparison' && (
              <span className={cn(CHIP_CLS, 'border-gold/40 bg-gold/10 text-gold')}>对比</span>
            )}
          </span>
        </span>

        {/* 评分列 / 状态徽章 */}
        <ScoreCell item={item} />

        {/* 时间列 */}
        <span className="num hidden w-20 shrink-0 text-right text-xs text-foreground/70 sm:block">
          {relTime(item.createdAt)}
        </span>

        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-gold"
          aria-hidden
        />
      </button>

      {/* 删除：固定占位不抖动布局，hover 浮现；两段式确认（idle→confirm 红底，再点执行） */}
      <span className="flex w-9 shrink-0 items-center justify-center pr-2 sm:w-10">
        <button
          type="button"
          onClick={askDelete}
          disabled={deleting}
          aria-label={confirming ? `确认删除：${item.query}` : `删除研究记录：${item.query}`}
          title={confirming ? '再次点击确认删除（含全部 Agent 记录与报告）' : '删除该研究记录'}
          className={cn(
            'flex size-7 items-center justify-center rounded-sm border transition-all duration-150',
            confirming
              ? 'border-bear/60 bg-bear/15 text-bear shadow-[0_0_12px_rgba(239,68,68,0.25)]'
              : 'border-transparent bg-transparent text-muted-foreground/45 opacity-0 hover:border-bear/40 hover:bg-bear/10 hover:text-bear focus-visible:opacity-100 group-hover:opacity-100',
          )}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </span>
    </div>
  )
}

// ---------- 区块 ----------

interface RecentSessionsProps {
  refreshKey: number
  onOpenSession: OpenSessionFn
}

export function RecentSessions({ refreshKey, onOpenSession }: RecentSessionsProps) {
  const [items, setItems] = useState<SessionListItem[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { toast } = useToast()

  // 删除研究记录：乐观移除 + 失败回滚 + toast 反馈
  const handleDelete = useCallback(
    async (item: SessionListItem) => {
      setDeletingId(item.id)
      const snapshot = items
      setItems((prev) => prev.filter((s) => s.id !== item.id))
      try {
        const res = await fetch(`/api/sessions/${item.id}`, { method: 'DELETE' })
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        if (!res.ok) throw new Error(data?.error ?? `删除失败 (${res.status})`)
        toast({
          title: '研究记录已删除',
          description: `「${item.query.slice(0, 24)}${item.query.length > 24 ? '…' : ''}」及其全部 Agent 分析已归档清除`,
        })
      } catch (e) {
        setItems(snapshot)
        toast({
          title: '删除失败',
          description: e instanceof Error ? e.message : '请稍后重试',
          variant: 'destructive',
        })
      } finally {
        setDeletingId(null)
      }
    },
    [items, toast],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sessions?limit=12', { cache: 'no-store' })
      const data = (await res.json().catch(() => null)) as { sessions?: SessionListItem[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? `加载最近研究失败 (${res.status})`)
      setItems(Array.isArray(data?.sessions) ? data.sessions : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载最近研究失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  // 分组打开逻辑（保持不变：同一 groupId 的兄弟记录整组送入研究视图）
  const open = (item: SessionListItem) => {
    let group: GroupSessionLite[] = [
      { id: item.id, stockName: item.stockName, stockCode: item.stockCode, status: item.status },
    ]
    if (item.groupId) {
      const siblings = items.filter((s) => s.groupId && s.groupId === item.groupId)
      if (siblings.length > 1) {
        group = siblings.map((s) => ({
          id: s.id,
          stockName: s.stockName,
          stockCode: s.stockCode,
          status: s.status,
        }))
      }
    }
    onOpenSession(item.id, group, item.groupId ?? null)
  }

  // 迷你统计：完成 / 进行中 / 平均分（仅 completed 且 finalScore 非空求均值，1 位小数）
  const stats = useMemo(() => {
    let done = 0
    let failed = 0
    let scoreSum = 0
    let scoreN = 0
    for (const s of items) {
      if (s.status === 'completed') {
        done += 1
        if (s.finalScore != null) {
          scoreSum += s.finalScore
          scoreN += 1
        }
      } else if (s.status === 'failed') {
        failed += 1
      }
    }
    return { done, failed, running: items.length - done - failed, avg: scoreN > 0 ? scoreSum / scoreN : null }
  }, [items])
  const avgText = stats.avg == null ? '—' : stats.avg.toFixed(1)

  // 分组标识：同一 groupId 的条数与成员名（仅视觉标记）
  const groupInfo = useMemo(() => {
    const sizes = new Map<string, number>()
    const names = new Map<string, string[]>()
    for (const s of items) {
      if (!s.groupId) continue
      sizes.set(s.groupId, (sizes.get(s.groupId) ?? 0) + 1)
      if (s.stockName) {
        const list = names.get(s.groupId) ?? []
        list.push(s.stockName)
        names.set(s.groupId, list)
      }
    }
    return { sizes, names }
  }, [items])

  // 纯前端筛选；序号取全量列表位置，档案编号在筛选下保持稳定
  const rows = useMemo(
    () => items.map((item, idx) => ({ item, idx })).filter(({ item }) => filter === 'all' || bucketOf(item.status) === filter),
    [items, filter],
  )

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: items.length, running: 0, completed: 0, failed: 0 }
    for (const s of items) c[bucketOf(s.status)] += 1
    return c
  }, [items])

  const showFilters = !error && items.length > 0
  const EmptyIcon =
    filter === 'running' ? Radar : filter === 'completed' ? CircleCheck : filter === 'failed' ? ShieldCheck : History

  return (
    <section id="recent" className="scroll-mt-24">
      {/* 头部：标题 + 数量 chip ｜ 迷你统计条（发丝分隔）+ 刷新 */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="micro-label">Research Log</p>
          <h2 className="mt-1.5 flex items-baseline gap-2.5 text-xl font-bold tracking-tight sm:text-2xl">
            最近研究
            {!loading && items.length > 0 && (
              <span className="num rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {items.length}
              </span>
            )}
          </h2>
        </div>

        <div className="ml-auto flex items-center gap-2.5 sm:gap-3.5">
          <div
            role="group"
            aria-label={`研究统计：完成 ${stats.done} 项，进行中 ${stats.running} 项，平均分 ${avgText}`}
            className="flex items-stretch gap-2 sm:gap-3"
          >
            <div className="flex flex-col justify-center gap-1">
              <span className="micro-label leading-none">完成</span>
              <span className="num text-sm font-semibold leading-none">{stats.done}</span>
            </div>
            <span aria-hidden className="w-px shrink-0 bg-border/80" />
            <div className="flex flex-col justify-center gap-1">
              <span className="micro-label leading-none">进行中</span>
              <span className="num text-sm font-semibold leading-none">{stats.running}</span>
            </div>
            <span aria-hidden className="w-px shrink-0 bg-border/80" />
            <div className="flex flex-col justify-center gap-1">
              <span className="micro-label leading-none">平均分</span>
              <span className={cn('num text-sm font-semibold leading-none', stats.avg == null && 'text-muted-foreground')}>
                {avgText}
              </span>
            </div>
          </div>
          <span aria-hidden className="hidden h-7 w-px bg-border/80 sm:block" />
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => void load()}
            disabled={loading}
            aria-label="刷新最近研究"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden />
          </Button>
        </div>
      </div>

      {/* 筛选分段控件（aria-pressed，纯前端过滤） */}
      {showFilters && (
        <div
          role="group"
          aria-label="按状态筛选研究记录"
          className="mb-3 inline-flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/30 p-1"
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-sm px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                filter === f.key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
              <span className="num ml-1.5 text-[10px] opacity-80">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}

      {loading && items.length === 0 ? (
        <RecentSkeleton />
      ) : error ? (
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
      ) : items.length === 0 ? (
        <div className="panel-flat flex flex-col items-center gap-2 border-dashed px-6 py-12 text-center">
          <History className="size-7 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">
            还没有研究记录 — 在上方输入一个问题，召开第一次投委会
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="panel-flat flex flex-col items-center gap-2 border-dashed px-6 py-12 text-center">
          <EmptyIcon className="size-7 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">{FILTER_EMPTY[filter]}</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          {rows.map(({ item, idx }) => {
            const gid = item.groupId
            return (
              <SessionRow
                key={item.id}
                item={item}
                idx={idx}
                groupSize={gid ? groupInfo.sizes.get(gid) ?? 1 : 1}
                groupNames={gid ? groupInfo.names.get(gid) ?? [] : []}
                onOpen={open}
                onDelete={(it) => void handleDelete(it)}
                deleting={deletingId === item.id}
              />
            )
          })}
        </div>
      )}

      {loading && items.length > 0 && (
        <div className="mt-3 flex justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}
    </section>
  )
}
