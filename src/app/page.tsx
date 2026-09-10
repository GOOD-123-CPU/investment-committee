'use client'

// 根页面：Home / Research 视图状态机（单页面应用）

import { useCallback, useState } from 'react'
import type { PipelineStatus } from '@/lib/types'
import type { GroupSessionLite } from '@/lib/client-utils'
import { Header } from '@/components/home/header'
import { Footer } from '@/components/home/footer'
import { HomeView } from '@/components/home/home-view'
import { ResearchView } from '@/components/research/research-view'
import { TerminalBackdrop } from '@/components/home/terminal-backdrop'
import { useToast } from '@/hooks/use-toast'

interface StartSessionLite {
  id: string
  stockCode: string | null
  stockName: string | null
  status: PipelineStatus
  intent: string
  groupId: string | null
}

export default function Page() {
  const [view, setView] = useState<'home' | 'research'>('home')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [groupSessions, setGroupSessions] = useState<GroupSessionLite[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  // 从研究视图返回首页时 +1，触发自选池 / 最近研究重新拉取
  const [homeRefreshKey, setHomeRefreshKey] = useState(0)
  const { toast } = useToast()

  const startResearch = useCallback(
    async (query: string) => {
      try {
        const res = await fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })
        const data = (await res
          .json()
          .catch(() => null)) as { sessions?: StartSessionLite[]; groupId?: string | null; error?: string } | null
        if (!res.ok || !data?.sessions?.length) {
          throw new Error(data?.error ?? `发起研究失败 (${res.status})`)
        }
        const sessions = data.sessions
        setGroupSessions(
          sessions.map((s) => ({ id: s.id, stockName: s.stockName, stockCode: s.stockCode, status: s.status })),
        )
        setGroupId(data.groupId ?? sessions[0].groupId ?? null)
        setSessionId(sessions[0].id)
        setView('research')
        window.scrollTo({ top: 0 })
      } catch (e) {
        toast({
          title: '发起研究失败',
          description: e instanceof Error ? e.message : '请稍后重试',
          variant: 'destructive',
        })
      }
    },
    [toast],
  )

  const openSession = useCallback((id: string, group: GroupSessionLite[], gid: string | null) => {
    setSessionId(id)
    setGroupSessions(group.length > 0 ? group : [{ id, stockName: null, stockCode: null }])
    setGroupId(gid)
    setView('research')
    window.scrollTo({ top: 0 })
  }, [])

  const goHome = useCallback(() => {
    setView('home')
    setSessionId(null)
    setGroupSessions([])
    setGroupId(null)
    setHomeRefreshKey((k) => k + 1)
    window.scrollTo({ top: 0 })
  }, [])

  const rerunResearch = useCallback(
    async (query: string) => {
      await startResearch(query)
    },
    [startResearch],
  )

  return (
    <div className="flex min-h-screen flex-col">
      {/* 三层深度背景系统：基础空间层 / 环境光层 / 数据语义层（双视图共用，纯装饰） */}
      <TerminalBackdrop />
      <Header view={view} onLogoClick={view === 'research' ? goHome : undefined} />
      <main className="flex-1">
        {view === 'research' && sessionId ? (
          <ResearchView
            sessionId={sessionId}
            groupSessions={groupSessions}
            groupId={groupId}
            onBack={goHome}
            onSelectSession={setSessionId}
            onRerun={rerunResearch}
          />
        ) : (
          <HomeView refreshKey={homeRefreshKey} onSubmit={startResearch} onOpenSession={openSession} />
        )}
      </main>
      <Footer />
    </div>
  )
}
