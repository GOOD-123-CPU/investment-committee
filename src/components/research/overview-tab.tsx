'use client'

// 总览 Tab — 旗舰布局（12 栏网格）：
// Row A: 日K 线终端图（lightweight-charts v5，数据流勿动）+ AI 决策摘要卡
// Row B: 研究计划 / 实时新闻时间轴 / 量化读数（指标网格 + 一句话解读）
// Row C: DATA PROVENANCE 数据溯源条（实时行情 / 快照 / 新闻来源标记）

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BrainCircuit, Clock, ClipboardList, Database, Newspaper, Radar, Sigma } from 'lucide-react'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, CrosshairMode, ColorType } from 'lightweight-charts'
import type { IChartApi, Time } from 'lightweight-charts'
import type { KlineBar } from '@/lib/data/quotes'
import type { AgentDTO, DecisionDTO, NewsItem, ResearchDetailDTO } from '@/lib/types'
import { detailNum, ratingTone, scoreBarClass } from '@/lib/client-utils'
import { DataUnavailable, EvidenceTrailChips, RadialGauge, fmtDateTime, fmtNum } from '@/components/research/bits'
import { cn } from '@/lib/utils'

// ---------- 日K 线终端图 ----------

const RANGES = [60, 120, 250] as const
type Range = (typeof RANGES)[number]

/** 计算简单移动平均序列 */
function computeMA(closes: number[], windowSize: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]
    if (i >= windowSize) sum -= closes[i - windowSize]
    out.push(i >= windowSize - 1 ? sum / windowSize : null)
  }
  return out
}

function KlineCard({ code }: { code: string }) {
  const [range, setRange] = useState<Range>(120)
  const [data, setData] = useState<{ range: Range; bars: KlineBar[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  // 数据获取：range / code 变化时重新拉取（setState 仅在异步回调中调用）
  useEffect(() => {
    if (!code) return
    let cancelled = false
    fetch(`/api/kline?code=${encodeURIComponent(code)}&days=${range}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ kline?: KlineBar[] }>)
      .then((d) => {
        if (cancelled) return
        const bars = Array.isArray(d.kline) ? d.kline : []
        setData({ range, bars })
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [code, range])

  // range 切换期旧数据视为过期，展示 shimmer
  const bars = data && data.range === range ? data.bars : null
  const phase: 'loading' | 'ok' | 'empty' | 'error' = failed
    ? 'error'
    : bars == null
      ? 'loading'
      : bars.length > 0
        ? 'ok'
        : 'empty'

  // 图表构建：数据变化时重建，卸载/重建时 remove
  useEffect(() => {
    const el = containerRef.current
    if (!el || !bars || bars.length === 0) return

    const dark = document.documentElement.classList.contains('dark')
    const bull = dark ? '#34d399' : '#059669'
    const bear = dark ? '#f87171' : '#dc2626'
    const hold = dark ? '#fbbf24' : '#b45309'
    const risk = dark ? '#fb923c' : '#ea580c'
    const mutedText = dark ? 'rgba(235,240,255,0.55)' : 'rgba(30,41,59,0.6)'
    const hairline = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'
    const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'
    const volUp = dark ? 'rgba(52,211,153,0.45)' : 'rgba(5,150,105,0.4)'
    const volDown = dark ? 'rgba(248,113,113,0.45)' : 'rgba(220,38,38,0.4)'

    const chart = createChart(el, {
      autoSize: false,
      width: el.clientWidth,
      height: el.clientHeight || 340,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: mutedText,
        fontSize: 11,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: hairline, scaleMargins: { top: 0.06, bottom: 0.24 } },
      timeScale: { borderColor: hairline, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'zh-CN' },
    })
    chartRef.current = chart

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: bull,
      downColor: bear,
      wickUpColor: bull,
      wickDownColor: bear,
      borderVisible: false,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })
    candle.setData(
      bars.map((k) => ({ time: k.date as Time, open: k.open, high: k.high, low: k.low, close: k.close })),
    )

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volume.setData(
      bars.map((k) => ({
        time: k.date as Time,
        value: k.volume,
        color: k.close >= k.open ? volUp : volDown,
      })),
    )
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    const closes = bars.map((k) => k.close)
    const ma = (windowSize: number, color: string) => {
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      })
      line.setData(
        computeMA(closes, windowSize)
          .map((v, i) => ({ time: bars[i].date as Time, value: v }))
          .filter((p): p is { time: Time; value: number } => p.value != null),
      )
      return line
    }
    ma(20, hold)
    ma(60, risk)

    chart.timeScale().fitContent()

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      chart.applyOptions({ width: Math.max(80, Math.floor(rect.width)), height: Math.max(160, Math.floor(rect.height)) })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chartRef.current = null
      chart.remove()
    }
  }, [bars])

  const last = bars && bars.length > 0 ? bars[bars.length - 1] : null
  const dayUp = last ? last.close >= last.open : true
  const closes = bars && bars.length > 0 ? bars.map((k) => k.close) : []
  const ma20Last = closes.length >= 20 ? computeMA(closes, 20).at(-1) : null
  const ma60Last = closes.length >= 60 ? computeMA(closes, 60).at(-1) : null

  return (
    <section className="panel flex h-full flex-col p-5" aria-label="日K线">
      {/* 头部：终端标签 + 周期分段切换 + OHLC 读数 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="micro-label">Price · 日K 前复权</span>
          <div className="flex overflow-hidden rounded-md border border-border/70" role="tablist" aria-label="K线周期">
            {RANGES.map((r, i) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={r === range}
                onClick={() => setRange(r)}
                className={cn(
                  'num px-2 py-0.5 text-[10px] transition-colors',
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
        {last && (
          <div className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {(['O', 'H', 'L', 'C'] as const).map((tag) => {
              const v = tag === 'O' ? last.open : tag === 'H' ? last.high : tag === 'L' ? last.low : last.close
              return (
                <span key={tag} className={cn('flex items-center gap-1', dayUp ? 'text-bull' : 'text-bear')}>
                  <span className="text-muted-foreground">{tag}</span>
                  {fmtNum(v)}
                </span>
              )
            })}
            <span className="text-muted-foreground">{last.date}</span>
          </div>
        )}
      </div>

      {/* 图表容器 */}
      <div className="relative min-h-[300px] flex-1 sm:min-h-[340px]">
        <div ref={containerRef} className="absolute inset-0" />
        {phase === 'loading' && (
          <div className="shimmer absolute inset-0 rounded-lg border border-border/50 bg-muted/20" aria-label="K线加载中" />
        )}
        {(phase === 'empty' || phase === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/10 px-6 text-center">
            <Database className="size-5 text-muted-foreground/40" aria-hidden />
            <p className="text-sm font-medium text-foreground/80">
              {phase === 'error' ? '日K数据拉取失败' : '暂无该标的的日K历史数据'}
            </p>
            <p className="num text-[10px] leading-4 text-muted-foreground/70">
              {phase === 'error' ? 'KLINE FETCH ERROR · 可切换周期重试' : 'NO KLINE HISTORY · 数据源未覆盖该标的'}
            </p>
          </div>
        )}
      </div>

      {/* MA 图例 */}
      <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-border/50 pt-2">
        <span className="num flex items-center gap-1.5 text-[11px] text-hold">
          <span className="h-px w-4 bg-hold" aria-hidden />
          MA20 {ma20Last != null ? fmtNum(ma20Last) : '—'}
        </span>
        <span className="num flex items-center gap-1.5 text-[11px] text-risk">
          <span className="h-px w-4 bg-risk" aria-hidden />
          MA60 {ma60Last != null ? fmtNum(ma60Last) : '—'}
        </span>
        <span className="micro-label ml-auto hidden sm:inline">Source: 腾讯财经 · 10min 缓存</span>
      </div>
    </section>
  )
}

// ---------- 主题研究情报面板（未绑定单一可交易标的时替换日K终端图） ----------

function ThematicOverviewCard({
  query,
  stockName,
  focus,
  plan,
  news,
  agents,
}: {
  query: string
  stockName: string | null
  focus: string | null | undefined
  plan: string[]
  news: NewsItem[]
  agents: AgentDTO[]
}) {
  // 情绪分布
  const senti = { positive: 0, negative: 0, neutral: 0 }
  for (const n of news) {
    if (n.sentiment === 'positive') senti.positive += 1
    else if (n.sentiment === 'negative') senti.negative += 1
    else senti.neutral += 1
  }
  const sentiTotal = news.length
  // Agent 观点与投票共识
  const scored = agents.filter((a) => a.score != null)
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length) : null
  const votes = { BUY: 0, HOLD: 0, SELL: 0 }
  for (const a of agents) {
    if (a.vote === 'BUY' || a.vote === 'HOLD' || a.vote === 'SELL') votes[a.vote] += 1
  }
  const voteTotal = votes.BUY + votes.HOLD + votes.SELL
  // 新闻来源分布 TOP3
  const srcCount = new Map<string, number>()
  for (const n of news) {
    let host = n.source
    try {
      if (n.url) host = new URL(n.url).hostname.replace(/^www\./, '')
    } catch {
      /* 保留 source */
    }
    srcCount.set(host, (srcCount.get(host) ?? 0) + 1)
  }
  const topSources = [...srcCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const srcMax = topSources[0]?.[1] ?? 1

  const stats: { label: string; value: string; sub: React.ReactNode; tone?: string }[] = [
    {
      label: 'News Intel · 情报',
      value: String(news.length),
      sub: (
        <span className="num text-[10px]">
          <span className="text-bull">POS {senti.positive}</span>
          <span className="mx-1 text-muted-foreground/50">/</span>
          <span className="text-bear">NEG {senti.negative}</span>
        </span>
      ),
    },
    {
      label: 'Research Plan · 计划',
      value: String(plan.length || '—'),
      sub: <span className="num text-[10px] text-muted-foreground">项研究任务</span>,
    },
    {
      label: 'Agent Views · 观点',
      value: scored.length > 0 ? String(scored.length) : '—',
      sub:
        avgScore != null ? (
          <span className="num text-[10px] text-muted-foreground">
            均分 <span className="font-bold text-foreground/90">{avgScore}</span>
          </span>
        ) : (
          <span className="num text-[10px] text-muted-foreground">分析中</span>
        ),
    },
    {
      label: 'Votes · 投票',
      value: voteTotal > 0 ? String(voteTotal) : '—',
      sub: (
        <span className="num text-[10px]">
          <span className="text-bull">B {votes.BUY}</span>
          <span className="mx-1 text-muted-foreground/50">·</span>
          <span className="text-hold">H {votes.HOLD}</span>
          <span className="mx-1 text-muted-foreground/50">·</span>
          <span className="text-bear">S {votes.SELL}</span>
        </span>
      ),
    },
  ]

  return (
    <section
      className="panel flex h-full min-h-[300px] flex-col p-5"
      aria-label="主题研究情报"
    >
      {/* 头部：模式标识 + 数据源状态 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border/50 pb-2.5">
        <Radar className="size-3.5 text-gold" aria-hidden />
        <span className="micro-label">Theme Research · 主题研究模式</span>
        <span className="num ml-auto rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-gold">
          THEME MODE
        </span>
        <span
          title={news.length > 0 ? 'web_search 实时检索已就绪' : '暂无实时新闻数据'}
          className={cn(
            'num rounded border px-1.5 py-0.5 text-[9px] tracking-[0.14em]',
            news.length > 0
              ? 'border-primary/30 bg-primary/5 text-primary'
              : 'border-dashed border-border/80 text-muted-foreground/60',
          )}
        >
          NEWS {news.length > 0 ? 'LIVE' : 'N/A'}
        </span>
      </div>

      {/* 研究指令回显（终端 prompt 质感） */}
      <div className="rounded-md border border-border/70 bg-[var(--panel-2)] px-3.5 py-3">
        <p className="micro-label mb-1.5 text-[9px]">Research Query · 研究指令</p>
        <p className="num break-words text-[13px] leading-6 text-foreground/95">
          <span className="mr-2 font-bold text-gold">&gt;</span>
          {query}
          <span aria-hidden className="caret-blink ml-1 text-gold">
            ▍
          </span>
        </p>
        {focus && <p className="mt-1.5 truncate text-xs text-muted-foreground" title={focus}>FOCUS · {focus}</p>}
      </div>

      {/* 四格情报统计（发丝网格） */}
      <div className="mt-3 grid flex-1 grid-cols-2 gap-px overflow-hidden rounded-md border border-border/50 bg-border/50 content-stretch sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex min-h-[86px] flex-col justify-between gap-2 bg-[var(--panel)] p-3">
            <p className="micro-label text-[9px]">{s.label}</p>
            <div>
              <p className="num text-2xl font-bold leading-none tracking-tight">{s.value}</p>
              <div className="mt-1.5">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 情绪分布条 + 来源分布 */}
      {sentiTotal > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="micro-label w-24 shrink-0 text-[9px]">Sentiment</span>
            <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-bull/80" style={{ width: `${(senti.positive / sentiTotal) * 100}%` }} />
              <div className="h-full bg-muted-foreground/35" style={{ width: `${(senti.neutral / sentiTotal) * 100}%` }} />
              <div className="h-full bg-bear/80" style={{ width: `${(senti.negative / sentiTotal) * 100}%` }} />
            </div>
            <span className="num shrink-0 text-[10px] text-muted-foreground">
              {sentiTotal} 条
            </span>
          </div>
          {topSources.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="micro-label text-[9px]">Top Sources</span>
              {topSources.map(([host, count]) => (
                <span key={host} className="num flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground" title={`${host} · ${count} 条`}>
                  <span className="max-w-36 truncate">{host}</span>
                  <span className="h-1 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-gold/60" style={{ width: `${(count / srcMax) * 100}%` }} />
                  </span>
                  <span className="font-semibold text-foreground/80">{count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 底注：模式说明（可解释性） */}
      <p className="mt-3 border-t border-border/50 pt-2.5 text-[11px] leading-5 text-muted-foreground">
        <span className="micro-label mr-2 text-[9px]">Theme Mode</span>
        {stockName
          ? `研究对象「${stockName}」暂未绑定可交易标的代码，行情终端切换为研究情报视图。`
          : '本主题研究未绑定单一可交易标的，行情终端切换为研究情报视图。'}
        全部结论可在 Agent 洞察 / 辩论 / 决策页逐条追溯。
      </p>
    </section>
  )
}

// ---------- AI 决策摘要卡 ----------

function DecisionSummaryCard({ decision, onOpen }: { decision: DecisionDTO | null; onOpen?: () => void }) {
  if (!decision) {
    return (
      <section className="panel flex h-full flex-col p-5" aria-label="决策摘要">
        <span className="micro-label">AI Decision · 决策摘要</span>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
          <BrainCircuit className="size-8 live-dot text-primary" aria-hidden />
          <p className="text-sm font-medium">投委会分析进行中</p>
          <div className="w-full space-y-2">
            <div className="shimmer h-2.5 w-full rounded bg-muted" />
            <div className="shimmer mx-auto h-2.5 w-4/5 rounded bg-muted" />
            <div className="shimmer mx-auto h-2.5 w-3/5 rounded bg-muted" />
          </div>
          <p className="num text-[10px] text-muted-foreground/70">PIPELINE RUNNING — 完成后自动更新</p>
        </div>
      </section>
    )
  }

  const d = decision
  const tone = ratingTone(d.rating)
  const confBar = d.confidence >= 70 ? 'bg-bull' : d.confidence >= 45 ? 'bg-hold' : 'bg-bear'

  return (
    <section
      className={cn(
        'panel relative flex h-full flex-col p-5',
        d.rating.includes('BUY') && 'glow-emerald border-bull/30',
        !d.rating.includes('BUY') && !d.rating.includes('SELL') && 'glow-gold border-hold/30',
        d.rating.includes('SELL') && 'border-bear/30',
      )}
      aria-label="决策摘要"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="micro-label">AI Decision · 决策摘要</span>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="micro-label flex items-center gap-1 text-primary transition-colors hover:text-foreground"
          >
            查看完整决策 <ArrowRight className="size-3" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-5">
        <RadialGauge value={d.finalScore} size={110} stroke={9} />
        <div className="min-w-0 space-y-2">
          <p className={cn('num text-5xl font-extrabold leading-none tracking-tight', tone.text)}>{d.finalScore}</p>
          <span className={cn('inline-flex rounded border px-2 py-0.5 text-xs font-bold tracking-wide', tone.badge)}>
            {d.rating}
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-3 border-t border-border/50 pt-4">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="micro-label">Confidence 置信度</span>
            <span className="num text-xs font-bold">{d.confidence}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full', confBar)} style={{ width: `${Math.min(100, d.confidence)}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="micro-label">Position 建议仓位</span>
            <span className="num text-xs font-bold">
              {d.positionMin}–{d.positionMax}%
            </span>
          </div>
          <div className="relative h-1 w-full rounded-full bg-muted" aria-hidden>
            <div
              className="absolute inset-y-0 rounded-full bg-primary/70"
              style={{ left: `${d.positionMin}%`, width: `${Math.max(2, d.positionMax - d.positionMin)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="micro-label">Horizon 周期</span>
          <span className="num flex items-center gap-1 text-xs font-bold">
            <Clock className="size-3 text-muted-foreground" aria-hidden />
            {d.horizon}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="micro-label">Initial → Final</span>
          <span className="num text-xs font-bold text-muted-foreground">
            {d.initialScore} − {d.riskPenalty} → <span className={tone.text}>{d.finalScore}</span>
          </span>
        </div>
      </div>
    </section>
  )
}

// ---------- 研究计划卡 ----------

function PlanCard({ plan }: { plan: string[] | null | undefined }) {
  if (!plan || plan.length === 0) {
    return (
      <section className="panel flex h-full flex-col p-5" aria-label="研究计划">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="size-3.5 text-primary" aria-hidden />
          <span className="micro-label">Research Plan · 研究计划</span>
        </div>
        <DataUnavailable what="PLAN" reason="研究计划尚未生成，Planner 完成拆解后自动呈现。" className="flex-1" />
      </section>
    )
  }
  return (
    <section className="panel flex h-full flex-col p-5" aria-label="研究计划">
      <div className="mb-3 flex items-center gap-2 border-b border-border/50 pb-2.5">
        <ClipboardList className="size-3.5 text-primary" aria-hidden />
        <span className="micro-label">Research Plan · 研究计划</span>
        <span className="num ml-auto text-[10px] text-muted-foreground">{String(plan.length).padStart(2, '0')} 项</span>
      </div>
      <ol className="grid flex-1 content-start gap-x-5 gap-y-2.5 sm:grid-cols-2">
        {plan.slice(0, 8).map((p, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="num mt-px shrink-0 text-[11px] font-bold text-primary">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-[13px] leading-5 text-foreground/90">{p}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ---------- 实时新闻时间轴 ----------

function NewsCard({ news, status }: { news: NewsItem[]; status?: string }) {
  return (
    <section className="panel flex h-full flex-col p-5" aria-label="实时新闻">
      <div className="mb-3 flex items-center gap-2 border-b border-border/50 pb-2.5">
        <Newspaper className="size-3.5 text-hold" aria-hidden />
        <span className="micro-label">Live News · 实时新闻</span>
        <span className="num ml-auto text-[10px] text-muted-foreground">{news.length} 条</span>
      </div>
      {news.length === 0 ? (
        <DataUnavailable
          what="NEWS FEED"
          reason={status === 'failed' ? '实时新闻检索失败，本次研究基于既有数据分析。' : '暂无实时新闻数据。'}
          className="flex-1"
        />
      ) : (
        <div className="relative min-w-0 flex-1">
          {/* 时间轴纵向 hairline 轨道 */}
          <span className="chamber-rail absolute bottom-1 left-[3px] top-1 w-px" aria-hidden />
          <ul className="nice-scroll max-h-64 overflow-y-auto pr-1">
            {news.map((n, i) => {
              const dot =
                n.sentiment === 'positive'
                  ? 'bg-bull'
                  : n.sentiment === 'negative'
                    ? 'bg-bear'
                    : 'bg-muted-foreground/50'
              let host = n.source
              try {
                if (n.url) host = new URL(n.url).hostname.replace(/^www\./, '')
              } catch {
                /* 保留 source */
              }
              const timeText = fmtDateTime(n.date)
              const inner = (
                <>
                  <p className="text-[13px] leading-5 text-foreground/90">{n.title}</p>
                  <p className="num mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground/80">
                    <span className="max-w-40 truncate">{host}</span>
                    {timeText && <span>· {timeText}</span>}
                    {n.sentiment && (
                      <span
                        className={cn(
                          'rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wider',
                          n.sentiment === 'positive' && 'bg-bull/10 text-bull',
                          n.sentiment === 'negative' && 'bg-bear/10 text-bear',
                          n.sentiment === 'neutral' && 'bg-muted text-muted-foreground',
                        )}
                      >
                        {n.sentiment === 'positive' ? 'POS' : n.sentiment === 'negative' ? 'NEG' : 'NEU'}
                      </span>
                    )}
                  </p>
                </>
              )
              return (
                <li key={i} className="relative py-2 pl-5">
                  <span
                    className={cn(
                      'absolute left-0 top-[13px] size-[7px] rounded-full ring-2 ring-background',
                      dot,
                    )}
                    aria-hidden
                  />
                  {n.url ? (
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group block rounded-md border border-transparent p-1 transition-colors hover:border-border hover:bg-accent/40"
                    >
                      <span className="transition-colors group-hover:text-foreground">{inner}</span>
                    </a>
                  ) : (
                    <div className="p-1">{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {news.length > 0 && (
        <p className="micro-label mt-2 border-t border-border/50 pt-2">Sentiment by AI · 情绪标签由 AI 判定</p>
      )}
    </section>
  )
}

// ---------- 量化读数卡 ----------

function detailStr(details: Record<string, unknown> | null, key: string): string | null {
  if (!details) return null
  const v = details[key]
  return typeof v === 'string' && v ? v : null
}

function detailChanges(details: Record<string, unknown> | null): { m1: number | null; y1: number | null } | null {
  if (!details) return null
  const c = details.changes
  if (!c || typeof c !== 'object') return null
  const obj = c as Record<string, unknown>
  const pick = (k: string) => (typeof obj[k] === 'number' && Number.isFinite(obj[k]) ? (obj[k] as number) : null)
  return { m1: pick('m1'), y1: pick('y1') }
}

interface QuantMetric {
  label: string
  value: string
  tone?: string
  note: string
}

function QuantReadoutCard({ agent, price }: { agent: AgentDTO | null | undefined; price: number | null }) {
  if (!agent) {
    return (
      <section className="panel flex h-full flex-col p-5" aria-label="量化指标">
        <div className="mb-3 flex items-center gap-2 border-b border-border/50 pb-2.5">
          <Sigma className="size-3.5 text-primary" aria-hidden />
          <span className="micro-label">Quant Readout · 量化指标</span>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-2.5">
          <p className="num text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            Quant Agent Pending… 指标就绪后自动填充
          </p>
          <div className="shimmer h-2 w-full rounded bg-muted/70" aria-hidden />
          <div className="shimmer h-2 w-2/3 rounded bg-muted/70" aria-hidden />
        </div>
      </section>
    )
  }

  const dt = agent.details
  const valuation = detailNum(dt, 'valuation')
  const momentum = detailNum(dt, 'momentum')
  const rsi14 = detailNum(dt, 'rsi14')
  const pos52w = detailNum(dt, 'pos52w')
  const volAnnual = detailNum(dt, 'volatilityAnnualPct')
  const pe = detailNum(dt, 'pe')
  const peg = detailNum(dt, 'peg')
  const dataSource = detailStr(dt, 'dataSource')
  const changes = detailChanges(dt)
  const maTrend = detailStr(dt, 'maTrendLabel') ?? detailStr(dt, 'trend') ?? detailStr(dt, 'trendVerdict')

  const maRow = (label: string, v: number | null): QuantMetric => {
    if (v == null) return { label, value: '—', note: 'K 线数据不足' }
    if (price == null) return { label, value: fmtNum(v), note: '实时价缺失，无法对比' }
    return price >= v
      ? { label, value: fmtNum(v), tone: 'text-bull', note: `价格站上${label}，短线偏强` }
      : { label, value: fmtNum(v), tone: 'text-bear', note: `价格位于${label}下方，短线偏弱` }
  }

  const metrics: QuantMetric[] = [
    (() => {
      if (rsi14 == null) return { label: 'RSI 14', value: '—', note: '数据不足' }
      if (rsi14 >= 70) return { label: 'RSI 14', value: String(rsi14), tone: 'text-bear', note: '超买区间，注意回调压力' }
      if (rsi14 <= 30) return { label: 'RSI 14', value: String(rsi14), tone: 'text-bull', note: '超卖区间，关注反弹窗口' }
      return { label: 'RSI 14', value: String(rsi14), note: '中性区间，动能平稳' }
    })(),
    maRow('MA20', detailNum(dt, 'ma20')),
    maRow('MA60', detailNum(dt, 'ma60')),
    maRow('MA120', detailNum(dt, 'ma120')),
    (() => {
      if (volAnnual == null) return { label: '年化波动率', value: '—', note: '数据不足' }
      if (volAnnual >= 35) return { label: '年化波动率', value: `${volAnnual}%`, tone: 'text-bear', note: '高波动，严控仓位' }
      if (volAnnual >= 22)
        return { label: '年化波动率', value: `${volAnnual}%`, tone: 'text-hold', note: '波动中等，正常风控' }
      return { label: '年化波动率', value: `${volAnnual}%`, tone: 'text-bull', note: '波动较低，走势平稳' }
    })(),
    (() => {
      const y1 = changes?.y1 ?? null
      if (y1 == null)
        return { label: '区间收益', value: '—', note: pos52w != null ? `52周位置 ${pos52w}%` : '数据不足' }
      return y1 >= 0
        ? { label: '区间收益', value: `+${y1}%`, tone: 'text-bull', note: '近一年动量为正' }
        : { label: '区间收益', value: `${y1}%`, tone: 'text-bear', note: '近一年动量为负' }
    })(),
  ]

  const bars: { label: string; value: number | null }[] = [
    { label: '估值吸引力', value: valuation },
    { label: '动量强度', value: momentum },
  ]

  return (
    <section className="panel flex h-full flex-col p-5" aria-label="量化指标">
      <div className="mb-3 flex items-center gap-2 border-b border-border/50 pb-2.5">
        <Sigma className="size-3.5 text-primary" aria-hidden />
        <span className="micro-label">Quant Readout · 量化指标</span>
        {dataSource && (
          <span className="num ml-auto rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
            {dataSource}
          </span>
        )}
      </div>

      {/* 量化评分条 */}
      <div className="space-y-2.5">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{b.label}</span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              {b.value != null ? (
                <div className={cn('h-full rounded-full', scoreBarClass(b.value))} style={{ width: `${b.value}%` }} />
              ) : (
                <div className="h-full w-full animate-pulse rounded-full bg-muted-foreground/10" />
              )}
            </div>
            <span className={cn('num w-8 shrink-0 text-right text-xs font-bold', b.value == null && 'text-muted-foreground/50')}>
              {b.value != null ? Math.round(b.value) : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* 指标网格：状态色 + 一句话解读 */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/50 pt-3 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0">
            <span className="micro-label">{m.label}</span>
            <p className={cn('num truncate text-[13px] font-semibold', m.tone)}>{m.value}</p>
            <p className="truncate text-[10px] leading-4 text-muted-foreground/70" title={m.note}>
              {m.note}
            </p>
          </div>
        ))}
      </div>

      {maTrend && (
        <p className="mt-3 truncate border-t border-border/50 pt-2.5 text-[11px] leading-5 text-muted-foreground" title={maTrend}>
          <span className="micro-label mr-2">MA Trend</span>
          {maTrend}
          {pe != null && (
            <span className="num ml-2 text-muted-foreground/70">
              · PE {pe}x{peg != null ? ` · PEG ${peg}` : ''}
            </span>
          )}
        </p>
      )}
    </section>
  )
}

// ---------- 主组件 ----------

interface OverviewTabProps {
  detail: ResearchDetailDTO
  onOpenDecision?: () => void
}

export function OverviewTab({ detail, onOpenDecision }: OverviewTabProps) {
  const { session, agents, decision } = detail
  const meta = session.meta
  const quantAgent = agents.find((a) => a.agentKey === 'quant') ?? null
  const news = Array.isArray(meta?.news) ? meta.news : []
  const livePrice = meta?.quote?.price ?? null
  const plan = Array.isArray(meta?.plan) ? (meta?.plan ?? []) : []

  // 数据溯源三源状态
  const hasLive = meta?.quote != null
  const hasNews = meta?.newsSearchStatus === 'ok'

  const sourceChips: { key: string; label: string; on: boolean; hint: string }[] = [
    { key: 'LIVE QUOTE', label: '实时行情', on: hasLive, hint: '腾讯财经实时接口' },
    { key: 'SNAPSHOT', label: '公司快照库', on: !!session.stockCode, hint: '演示快照库（公开年报整理）' },
    { key: 'NEWS', label: '实时新闻', on: hasNews, hint: 'web_search 实时检索' },
  ]

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Row A */}
      <div className="col-span-12 xl:col-span-8">
        {session.stockCode ? (
          <KlineCard code={session.stockCode} />
        ) : (
          <ThematicOverviewCard
            query={session.query}
            stockName={session.stockName}
            focus={meta?.focus}
            plan={plan}
            news={news}
            agents={agents}
          />
        )}
      </div>
      <div className="col-span-12 xl:col-span-4">
        <DecisionSummaryCard decision={decision} onOpen={onOpenDecision} />
      </div>

      {/* Row B */}
      <div className="col-span-12 lg:col-span-4">
        <PlanCard plan={plan.length > 0 ? plan : null} />
      </div>
      <div className="col-span-12 lg:col-span-4">
        <NewsCard news={news} status={meta?.newsSearchStatus} />
      </div>
      <div className="col-span-12 lg:col-span-4">
        <QuantReadoutCard agent={quantAgent} price={livePrice} />
      </div>

      {/* Row C：DATA PROVENANCE 数据溯源 */}
      <div className="col-span-12">
        <section className="panel-flat flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5" aria-label="数据来源说明">
          <div className="flex items-center gap-2.5 sm:w-56 sm:shrink-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Database className="size-4" aria-hidden />
            </span>
            <span className="micro-label leading-tight">
              Data Provenance
              <br />
              数据来源与可信度
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="min-w-0 text-[13px] leading-6 text-muted-foreground">
              {meta?.dataNote ??
                '财务数字仅来自演示快照库与腾讯财经实时行情，LLM 不编造数字；新闻来自实时检索，无数据字段标注 Data unavailable。'}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {sourceChips.map((c) => (
                <span
                  key={c.key}
                  title={c.hint}
                  className={cn(
                    'micro-label flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[9px]',
                    c.on
                      ? 'border-primary/30 bg-primary/5 text-primary'
                      : 'border-dashed border-border/80 bg-muted/30 text-muted-foreground/60',
                  )}
                >
                  <span
                    className={cn('size-1.5 rounded-full', c.on ? 'bg-bull' : 'border border-current bg-transparent')}
                    aria-hidden
                  />
                  {c.key} · {c.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            {session.market && <span className="num text-[10px] text-muted-foreground/70">市场 {session.market}</span>}
            <EvidenceTrailChips />
          </div>
        </section>
      </div>
    </div>
  )
}
