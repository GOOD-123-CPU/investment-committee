'use client'

// Home 视图编排：Hero（终端指令中心）→ 全球指数监控墙 → 自选池 → 最近研究 → 核心流程
// useIndices 在此持有全局唯一轮询实例（10s），向下传递给 Hero / MarketMonitor 共享
// 市场数据统一收敛在 Global Market Monitor（顶部跑马灯已按导航极简原则移除）

import { useState } from 'react'
import { useIndices } from '@/hooks/use-indices'
import { Hero } from '@/components/home/hero'
import { MarketMonitor } from '@/components/home/market-monitor'
import { PipelineFlow } from '@/components/home/pipeline-flow'
import { PortfolioDialog } from '@/components/home/portfolio-dialog'
import { RecentSessions } from '@/components/home/recent-sessions'
import { WatchlistSection } from '@/components/home/watchlist-section'
import type { OpenSessionFn } from '@/lib/client-utils'

interface HomeViewProps {
  /** 变化时重新拉取自选池与最近研究（从研究视图返回时 +1） */
  refreshKey: number
  onSubmit: (query: string) => Promise<void> | void
  onOpenSession: OpenSessionFn
}

export function HomeView({ refreshKey, onSubmit, onOpenSession }: HomeViewProps) {
  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const indices = useIndices(10_000)

  return (
    <div className="w-full">
      <Hero onSubmit={onSubmit} onOpenPortfolio={() => setPortfolioOpen(true)} indices={indices} />

      <div className="mx-auto w-full max-w-7xl space-y-14 px-4 pb-16 sm:space-y-16 sm:px-6 sm:pb-20">
        <MarketMonitor indices={indices} onResearch={onSubmit} />
        <WatchlistSection refreshKey={refreshKey} onOpenSession={onOpenSession} onQuickResearch={onSubmit} />
        <RecentSessions refreshKey={refreshKey} onOpenSession={onOpenSession} />
        <PipelineFlow />
      </div>

      <PortfolioDialog open={portfolioOpen} onOpenChange={setPortfolioOpen} />
    </div>
  )
}
