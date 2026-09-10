'use client'

// Hero：终端式指令中心 — 网格底 + 等宽微标签排版 + 搜索主角 + 实时系统状态条
// 状态条数据全部真实：监控指数数量 / 三市场开闭来自 useIndices，引擎与 Agent 为产品事实
// 系统状态栏升级：大数字金色渐变发光 / 双引擎在线 LED / 8 段流水线就绪块
// 品牌徽章雷达：六席位标签 + 虚线连线（网络拓扑化）+ 对比度增强

import { useRef, useState } from 'react'
import { BookOpenText, PieChart, Search } from 'lucide-react'
import { SearchBox, type SearchBoxHandle } from '@/components/home/search-box'
import { SlangDialog } from '@/components/home/slang-dialog'
import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/utils'
import { SLANG_TERMS_COUNT } from '@/lib/data/slang-dictionary'
import type { IndicesState, MarketKey } from '@/components/home/market-monitor'

const EXAMPLES: { query: string; portfolio?: boolean }[] = [
  { query: '分析贵州茅台现在是否值得投资' },
  { query: '易中天是否值得买' },
  { query: '猪茅和宁王现在还能上车吗' },
  { query: '沪深300 现在能抄底吗' },
  { query: '腾讯 和 阿里 哪个更值得投资' },
  { query: '我的投资组合诊断', portfolio: true },
]

const MARKETS: { key: MarketKey; label: string }[] = [
  { key: 'cn', label: 'CN' },
  { key: 'hk', label: 'HK' },
  { key: 'us', label: 'US' },
  { key: 'jp', label: 'JP' },
  { key: 'kr', label: 'KR' },
  { key: 'tw', label: 'TW' },
  { key: 'eu', label: 'EU' },
  { key: 'emea', label: 'ME' },
  { key: 'asia', label: 'AP' },
  { key: 'americas', label: 'AM' },
  { key: 'global', label: 'GL' },
]

function StatCell({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[84px] flex-col justify-between gap-2.5 bg-[var(--panel)] p-4">
      <p className="micro-label text-[9px]">{label}</p>
      <div className="flex items-center">{children}</div>
    </div>
  )
}

/** 六席位标签：位于外轨六边形顶点方位（对应 BrandMark 六顶点席位节点） */
const SEATS: { label: string; pos: string }[] = [
  { label: '基本面', pos: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2' },
  { label: '行业景气', pos: 'left-[93.3%] top-[25%] -translate-x-1/2 -translate-y-1/2' },
  { label: '估值量化', pos: 'left-[93.3%] top-[75%] -translate-x-1/2 -translate-y-1/2' },
  { label: '新闻舆情', pos: 'left-1/2 top-full -translate-x-1/2 -translate-y-1/2' },
  { label: '风控审计', pos: 'left-[6.7%] top-[75%] -translate-x-1/2 -translate-y-1/2' },
  { label: '多空辩论', pos: 'left-[6.7%] top-[25%] -translate-x-1/2 -translate-y-1/2' },
]

/** 六席位虚线连线端点（330×330 基准：晶格顶点外缘 → 标签内缘），网络拓扑化 */
const SEAT_LINKS: [number, number, number, number][] = [
  [165, 55, 165, 15], // 顶 · 基本面
  [260.3, 110, 294.9, 90], // 右上 · 行业景气
  [260.3, 220, 294.9, 240], // 右下 · 估值量化
  [165, 275, 165, 315], // 底 · 新闻舆情
  [69.7, 220, 35.1, 240], // 左下 · 风控审计
  [69.7, 110, 35.1, 90], // 左上 · 多空辩论
]

/**
 * 品牌徽章「共识核」大尺寸展示：
 * 金色光环 + 慢旋数据外轨 + 虚线拓扑连线 + 六席位标签环绕 + 底部语义注释（6+3=9 Agent）
 * 纯装饰性重复（Header 已有可访问品牌块），整体 aria-hidden。
 */
function BrandEmblem() {
  return (
    <div className="relative hidden w-[400px] shrink-0 items-center justify-center self-center xl:flex" aria-hidden>
      <div className="relative size-[330px] 2xl:size-[360px]">
        {/* 金色氛围光晕 */}
        <div
          className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--gold)_15%,transparent),transparent_68%)] blur-2xl"
        />
        {/* 慢旋数据外轨：两枚流动光点 = 行情数据持续流入 */}
        <div className="brand-orbit absolute inset-0">
          <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/80" />
          <span className="absolute bottom-0 left-1/2 size-1 -translate-x-1/2 translate-y-1/2 rounded-full bg-bull/60" />
        </div>
        <div className="brand-orbit absolute inset-0 rounded-full border border-dashed border-gold/25" />
        {/* 静态内轨：协作边界 */}
        <div className="absolute inset-[9%] rounded-full border border-border/70" />
        {/* 六席位拓扑连线：晶格顶点 → 席位标签 */}
        <svg viewBox="0 0 330 330" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {SEAT_LINKS.map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--gold)"
              strokeOpacity={0.42}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}
        </svg>
        {/* 共识核主体 */}
        <BrandMark
          variant="duotone"
          animated
          className="absolute inset-0 m-auto size-[72%] [filter:drop-shadow(0_0_18px_color-mix(in_oklab,var(--gold)_28%,transparent))]"
        />
        {/* 六席位标签（对比度增强：foreground 全亮 + 10px + 毛玻璃） */}
        {SEATS.map((s) => (
          <span
            key={s.label}
            className={cn(
              'panel-flat absolute inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 backdrop-blur-sm',
              s.pos,
            )}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-gold shadow-[0_0_6px_color-mix(in_oklab,var(--gold)_70%,transparent)]" />
            <span className="num text-[10px] font-semibold tracking-[0.08em] text-foreground">{s.label}</span>
          </span>
        ))}
        {/* 底部语义注释：徽章叙事的一句话注解 */}
        <div className="absolute -bottom-11 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
          <p className="micro-label text-[9px]">Consensus Core · 共识核</p>
          <p className="num mt-1 text-[9px] font-semibold tracking-[0.18em] text-gold">6 SEATS + 3 SIGNALS = 9 AGENTS</p>
        </div>
      </div>
    </div>
  )
}

interface HeroProps {
  onSubmit: (query: string) => Promise<void> | void
  onOpenPortfolio: () => void
  indices: IndicesState
}

export function Hero({ onSubmit, onOpenPortfolio, indices }: HeroProps) {
  const { data } = indices
  const totalIndices = data ? Object.values(data.groups).reduce((n, rows) => n + (rows?.length ?? 0), 0) : null
  const searchRef = useRef<SearchBoxHandle>(null)
  const openMarkets = MARKETS.filter((m) => data?.markets?.[m.key] === 'open').length
  const [slangOpen, setSlangOpen] = useState(false)

  return (
    <section className="relative overflow-hidden border-b border-border/60">
      {/* 网格背景由全局 TerminalBackdrop 提供（避免双网格莫尔条纹） */}

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20">
        <div className="xl:flex xl:items-center xl:gap-10">
          <div className="min-w-0 flex-1">
        {/* 终端状态行：系统在线 + 双引擎 + 九大市场实时开闭 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="panel-flat inline-flex items-center gap-2 rounded-md px-2.5 py-1.5">
            <span aria-hidden className="led text-bull" />
            <span className="micro-label text-[9px] sm:text-[10px]">System Online</span>
          </span>
          <span className="panel-flat inline-flex items-center rounded-md px-2.5 py-1.5">
            <span className="micro-label text-[9px] sm:text-[10px]">GLM-4.6 × mimo-v2.5</span>
          </span>
          <span
            className="panel-flat inline-flex items-center gap-2.5 rounded-md px-2.5 py-1.5"
            aria-label="三市场开闭状态"
          >
            {MARKETS.map((m) => {
              const status = data?.markets?.[m.key]
              const open = status === 'open'
              return (
                <span
                  key={m.key}
                  className="inline-flex items-center gap-1.5"
                  title={`${m.label} ${open ? '开市' : status === 'closed' ? '休市' : '状态获取中'}`}
                >
                  <span
                    aria-hidden
                    className={cn('block size-1.5 rounded-full', open ? 'live-dot bg-bull' : 'bg-muted-foreground/40')}
                  />
                  <span className={cn('micro-label text-[9px]', open && 'text-foreground/80')}>{m.label}</span>
                </span>
              )
            })}
          </span>
        </div>

        {/* 主标题：微标签 + 大标题 + 等宽金色副标 */}
        <div className="mt-8 max-w-3xl">
          <p className="micro-label text-[10px] sm:text-[11px]">AIC · Multi-Agent Investment Committee</p>
          <h1 className="mt-3 text-[2rem] font-bold leading-[1.12] tracking-tight sm:text-5xl sm:leading-[1.08] lg:text-[3.4rem]">
            多智能体投资研究终端
          </h1>
          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden className="h-px w-10 bg-gold/80" />
            <p className="num text-[13px] font-semibold uppercase tracking-[0.18em] text-gold">AI Fund Manager</p>
          </div>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
            9 类专业 Agent 组成投资委员会：研究规划 → 数据采集 → 多空辩论 → 风控审查 → 投票裁决。
            每个结论可解释，每条证据可追溯。
          </p>
        </div>

        {/* 搜索主角 */}
        <div className="mt-8 max-w-2xl">
          <SearchBox ref={searchRef} onSubmit={onSubmit} />
        </div>

        {/* 示例查询：点击 → 输入框自动填充动画 → 直接召开投委会；末位黑话词典入口 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.query}
              type="button"
              onClick={() => (ex.portfolio ? onOpenPortfolio() : searchRef.current?.submitExternal(ex.query))}
              className="panel-flat inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:border-primary/50 hover:text-foreground"
            >
              {ex.portfolio ? (
                <PieChart className="size-3.5 text-gold" aria-hidden />
              ) : (
                <Search className="size-3.5" aria-hidden />
              )}
              {ex.query}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSlangOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-dashed border-gold/50 bg-gold/5 px-3 py-1.5 text-xs text-gold transition-colors duration-150 hover:border-gold hover:bg-gold/15"
            title={`系统内置 ${SLANG_TERMS_COUNT} 条市场黑话，Agent 分析时自动对照理解`}
          >
            <BookOpenText className="size-3.5" aria-hidden />
            黑话词典 · {SLANG_TERMS_COUNT}
          </button>
        </div>

        {/* 实时系统状态条（gap-px 发丝网格；数据真实） */}
        <div className="panel mt-10 max-w-4xl overflow-hidden" aria-label="终端实时状态">
          <div className="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-4">
            <StatCell
              label={
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="led text-bull" />
                  Monitored Indices · 监控指数
                </span>
              }
            >
              {/* 核心指标：金色渐变大数字 + 发光 */}
              <span className="num bg-gradient-to-b from-gold via-gold to-gold/50 bg-clip-text text-3xl font-bold leading-none tracking-tight text-transparent [filter:drop-shadow(0_0_12px_color-mix(in_oklab,var(--gold)_40%,transparent))] sm:text-4xl">
                {totalIndices ?? '—'}
              </span>
              <span className="num ml-auto self-end text-[9px] font-semibold uppercase tracking-[0.14em] text-gold/70">
                Live
              </span>
            </StatCell>
            <StatCell label="Markets · 市场状态">
              <span className="flex w-full flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {MARKETS.map((m) => {
                    const open = data?.markets?.[m.key] === 'open'
                    return (
                      <span key={m.key} className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn(
                            'block size-1.5 rounded-full',
                            open ? 'live-dot bg-bull' : 'bg-muted-foreground/40',
                          )}
                        />
                        <span className="num text-sm font-semibold">{m.label}</span>
                      </span>
                    )
                  })}
                </span>
                <span className="num text-[10px] font-medium text-muted-foreground">
                  {data ? `${openMarkets}/${MARKETS.length} 开市` : '状态获取中'}
                </span>
              </span>
            </StatCell>
            <StatCell label="Models · 双引擎">
              <span className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="led text-bull" />
                  <span className="num text-sm font-semibold leading-5">GLM-4.6</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="led text-bull" />
                  <span className="num text-sm font-semibold leading-5">mimo-v2.5</span>
                </span>
              </span>
            </StatCell>
            <StatCell label="Agents · 投委会">
              <span className="flex w-full flex-col gap-2">
                <span className="num text-sm font-semibold leading-5">
                  9 类 Agent <span className="font-normal text-muted-foreground">·</span> 8 阶段流水线
                </span>
                {/* 8 段就绪块：全亮 = 流水线完整；末段金色 = CIO 裁决输出 */}
                <span className="flex items-center gap-1" aria-hidden>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span
                      key={i}
                      className={cn('h-1.5 w-3.5 rounded-[2px]', i < 7 ? 'bg-primary/75' : 'bg-gold')}
                    />
                  ))}
                </span>
              </span>
            </StatCell>
          </div>
        </div>
          </div>

          {/* 品牌徽章「共识核」（≥xl 屏展示） */}
          <BrandEmblem />
        </div>
      </div>

      {/* 股票黑话大词典弹层（词典速查 + 短线黑话翻译器） */}
      <SlangDialog open={slangOpen} onOpenChange={setSlangOpen} />
    </section>
  )
}
