'use client'

// 研究视图 — 终端组合：
// 行情指挥条 QuoteStrip → 流水线 Stepper → 对比裁决横幅 → 五 Tab（mono 大写 + 金色下划线）
// 轮询/自动切 Tab/对比切换/重新研究等行为保持不变

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, BookOpenText, RefreshCw, ShieldAlert, SplitSquareHorizontal } from 'lucide-react'
import { useResearchDetail } from '@/hooks/use-research-detail'
import type { GroupSessionLite } from '@/lib/client-utils'
import { statusMeta } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentTab } from '@/components/research/agent-tab'
import { ComparisonBanner } from '@/components/research/comparison-banner'
import { DebateTab } from '@/components/research/debate-tab'
import { DecisionTab } from '@/components/research/decision-tab'
import { OverviewTab } from '@/components/research/overview-tab'
import { QuoteStrip } from '@/components/research/quote-strip'
import { ReportTab } from '@/components/research/report-tab'
import { Stepper } from '@/components/research/stepper'
import { TerminalWait } from '@/components/research/bits'

type TabKey = 'overview' | 'agents' | 'debate' | 'decision' | 'report'

const TAB_DEFS: { key: TabKey; no: string; label: string }[] = [
  { key: 'overview', no: '01', label: '总览' },
  { key: 'agents', no: '02', label: 'Agent 洞察' },
  { key: 'debate', no: '03', label: '投资辩论' },
  { key: 'decision', no: '04', label: '最终决策' },
  { key: 'report', no: '05', label: '研究报告' },
]

function ResearchLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-48 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

interface ResearchViewProps {
  sessionId: string
  groupSessions: GroupSessionLite[]
  groupId: string | null
  onBack: () => void
  onSelectSession: (id: string) => void
  onRerun: (query: string) => Promise<void> | void
}

export function ResearchView({
  sessionId,
  groupSessions,
  groupId,
  onBack,
  onSelectSession,
  onRerun,
}: ResearchViewProps) {
  const { detail, error, loading, retry } = useResearchDetail(sessionId)
  const [tab, setTab] = useState<TabKey>('overview')
  const prevStatusRef = useRef<string | null>(null)
  const [rerunning, setRerunning] = useState(false)

  // 切换 session 时重置状态记忆
  useEffect(() => {
    prevStatusRef.current = null
    setTab('overview')
  }, [sessionId])

  // 初次加载决定默认 Tab；状态变为 completed 时切换到最终决策
  useEffect(() => {
    if (!detail) return
    const st = detail.session.status
    const prev = prevStatusRef.current
    prevStatusRef.current = st
    if (prev === null) {
      setTab(st === 'completed' ? 'decision' : 'overview')
      return
    }
    if (st === 'completed' && prev !== 'completed') setTab('decision')
  }, [detail])

  const session = detail?.session ?? null
  const metaQuote = detail?.session.meta?.quote ?? null
  const isRunning = session ? statusMeta(session.status).running : true
  const showComparison = !!groupId && groupSessions.length > 1

  const handleRerun = async () => {
    if (!session?.query) return
    setRerunning(true)
    try {
      await onRerun(session.query)
    } finally {
      setRerunning(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      {/* 子头部：终端返回 + 对比切换 + 重新研究 */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-border/60 bg-background/85 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            onClick={onBack}
            aria-label="返回首页"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            <span className="micro-label">Return</span>
            <span className="text-xs text-muted-foreground">首页</span>
          </Button>

          <span className="micro-label hidden items-center gap-2 sm:flex">
            <span className="size-1.5 rounded-full bg-gold" aria-hidden />
            AI Investment Committee
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* 重新研究 */}
            {session?.query && !isRunning && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-8 gap-1.5 border-border/70 bg-transparent px-2.5 text-xs"
                onClick={() => void handleRerun()}
                disabled={rerunning}
                aria-label="重新研究"
              >
                <RefreshCw className={cn('size-3.5', rerunning && 'animate-spin')} aria-hidden />
                重新研究
              </Button>
            )}

            {/* 对比模式切换 */}
            {showComparison && (
              <div
                className="nice-scroll flex items-center gap-1 overflow-x-auto rounded-lg border border-border/70 p-1"
                role="tablist"
                aria-label="对比模式切换"
              >
                <span className="micro-label mr-1 hidden shrink-0 px-1 md:inline">对比模式</span>
                {groupSessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={s.id === sessionId}
                    onClick={() => {
                      if (s.id !== sessionId) {
                        onSelectSession(s.id)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }
                    }}
                    className={cn(
                      'min-h-7 shrink-0 rounded-md px-2.5 text-xs font-medium transition-colors',
                      s.id === sessionId
                        ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {s.stockName ?? '标的'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4">
        {/* 热词解析横幅：易中天/茅指数等组合昵称 → 确定性解析结果（全链路可解释） */}
        {session?.meta?.hotTerm && (
          <div
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-gold/30 bg-gold/[0.06] px-3.5 py-2.5"
            role="note"
            aria-label="热词解析"
          >
            <SplitSquareHorizontal className="size-3.5 shrink-0 text-gold" aria-hidden />
            <span className="rounded-sm border border-gold/50 bg-gold/15 px-1.5 py-0.5 text-xs font-bold text-gold">
              {session.meta.hotTerm.term}
            </span>
            <span className="text-xs text-muted-foreground" aria-hidden>=</span>
            <span className="flex flex-wrap items-center gap-1.5">
              {session.meta.hotTerm.members.map((m) => (
                <span
                  key={m.code}
                  className="num rounded-sm border border-border/80 bg-muted/30 px-1.5 py-0.5 text-[11px] font-medium text-foreground/85"
                >
                  {m.name}
                  <span className="ml-1 text-[9px] text-muted-foreground">{m.code}</span>
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1 basis-full text-[11px] leading-4 text-muted-foreground sm:basis-auto lg:basis-full">
              {session.meta.hotTerm.note}
            </span>
          </div>
        )}

        {/* 黑话注释横幅：股票黑话大词典命中（Agent 分析时已自动对照理解） */}
        {session?.meta?.slangTerms && session.meta.slangTerms.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-border/70 bg-muted/20 px-3.5 py-2.5"
            role="note"
            aria-label="市场黑话注释"
          >
            <BookOpenText className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="text-xs font-semibold text-foreground/85">黑话注释</span>
            {session.meta.slangTerms.map((s) => (
              <span
                key={s.term}
                title={s.meaning}
                className="group/slang inline-flex max-w-full items-baseline gap-1.5 rounded-sm border border-border/70 bg-background/60 px-1.5 py-0.5 text-[11px]"
              >
                <span className="font-semibold text-primary">{s.term}</span>
                <span className="hidden max-w-[22rem] truncate text-muted-foreground group-hover/slang:inline-flex sm:inline-flex sm:max-w-[16rem]">
                  {s.meaning}
                </span>
              </span>
            ))}
            <span className="min-w-0 flex-1 basis-full text-[11px] leading-4 text-muted-foreground lg:basis-auto">
              已注入全部 Agent 提示词：黑话仅为市场描述语言，不作为事实依据
            </span>
          </div>
        )}

        {/* 行情指挥条 */}
        {session ? (
          <motion.div key={session.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <QuoteStrip
              stockName={session.stockName}
              stockCode={session.stockCode}
              market={session.market}
              snapshot={metaQuote}
            />
          </motion.div>
        ) : (
          <Skeleton className="h-28 w-full rounded-xl" />
        )}

        {/* 流水线 Stepper */}
        {session ? (
          <motion.div key={`stepper-${session.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
            <Stepper
              status={session.status}
              progress={session.progress}
              currentStepLabel={session.currentStepLabel}
            />
          </motion.div>
        ) : (
          !loading && <Skeleton className="h-20 w-full rounded-xl" />
        )}

        {/* 失败态 */}
        {session?.status === 'failed' && (
          <Alert variant="destructive" className="border-bear/40">
            <ShieldAlert className="size-4" aria-hidden />
            <AlertTitle>研究流程失败</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{session.error ?? '发生未知错误，请重新发起研究。'}</span>
              <Button
                size="sm"
                variant="outline"
                className="min-h-9 gap-1.5"
                onClick={() => void handleRerun()}
                disabled={rerunning}
              >
                <RefreshCw className={cn('size-3.5', rerunning && 'animate-spin')} aria-hidden />
                重新发起
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* 加载错误 */}
        {!session && !loading && error && (
          <Alert variant="destructive" className="border-bear/40">
            <ShieldAlert className="size-4" aria-hidden />
            <AlertTitle>加载研究失败</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{error}</span>
              <Button size="sm" variant="outline" className="min-h-9" onClick={retry}>
                重试
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* 加载中 */}
        {!session && loading && <ResearchLoadingSkeleton />}

        {/* 对比裁决横幅 */}
        {showComparison && groupId && <ComparisonBanner groupId={groupId} />}

        {/* Tabs */}
        {session && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <div className="nice-scroll -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <TabsList className="h-11 w-full min-w-max justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 sm:w-auto">
                {TAB_DEFS.map((t) => (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className={cn(
                      'gap-2 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3.5 py-2 text-muted-foreground',
                      'data-[state=active]:border-gold data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                      'dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground',
                      'hover:text-foreground',
                    )}
                  >
                    <span className={cn('num text-[9px] font-bold', 'text-muted-foreground/70')}>{t.no}</span>
                    <span className="whitespace-nowrap text-[13px] font-medium">{t.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="pt-4">
              <TabsContent value="overview">
                <OverviewTab
                  detail={{ session, agents: detail?.agents ?? [], debates: detail?.debates ?? [], decision: detail?.decision ?? null }}
                  onOpenDecision={() => setTab('decision')}
                />
              </TabsContent>
              <TabsContent value="agents">
                <AgentTab
                  agents={detail?.agents ?? []}
                  debates={detail?.debates ?? []}
                  analyzing={statusMeta(session.status).running && session.status !== 'queued'}
                />
              </TabsContent>
              <TabsContent value="debate">
                <DebateTab
                  debates={detail?.debates ?? []}
                  debating={session.status === 'debating' || session.status === 'risk_review'}
                />
              </TabsContent>
              <TabsContent value="decision">
                {detail?.decision ? (
                  <DecisionTab decision={detail.decision} sessionId={sessionId} stockName={session.stockName} />
                ) : (
                  <section className="panel mx-auto flex max-w-md flex-col gap-4 p-6" aria-label="等待投委会决议">
                    <TerminalWait label="CIO FINAL DECISION · 表决进行中" model="mimo-v2.5" tone="gold" />
                    <div className="space-y-2" aria-hidden>
                      <div className="shimmer h-2 w-full rounded bg-muted/70" />
                      <div className="shimmer h-2 w-3/4 rounded bg-muted/70" />
                    </div>
                    <p className="text-sm text-muted-foreground">投委会尚未表决 — 决议生成后将在此呈现</p>
                  </section>
                )}
              </TabsContent>
              <TabsContent value="report">
                <ReportTab
                  reportMd={detail?.decision?.reportMd ?? null}
                  stockName={session.stockName}
                  generatedAt={detail?.decision?.createdAt ?? null}
                />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </div>
  )
}
