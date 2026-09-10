'use client'

// 轮询研究详情：status 未到 completed/failed 时每 2s 拉取一次。
// 连续失败 5 次后停止，由用户手动重试。

import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuoteSnapshot, ResearchDetailDTO } from '@/lib/types'

const POLL_INTERVAL_MS = 2000
const MAX_CONSECUTIVE_ERRORS = 5

export function useResearchDetail(sessionId: string) {
  const [detail, setDetail] = useState<ResearchDetailDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const errCountRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchOnce = useCallback(async (): Promise<ResearchDetailDTO | null> => {
    try {
      const res = await fetch(`/api/research/${sessionId}`, { cache: 'no-store' })
      const body = (await res.json().catch(() => null)) as (ResearchDetailDTO & { error?: string }) | null
      if (!res.ok || !body?.session) {
        throw new Error(body?.error ?? `加载研究失败 (${res.status})`)
      }
      errCountRef.current = 0
      setError(null)
      setDetail(body)
      return body
    } catch (e) {
      errCountRef.current += 1
      if (errCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setError(e instanceof Error ? e.message : '加载研究失败')
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    setDetail(null)
    setError(null)
    setLoading(true)
    errCountRef.current = 0

    const loop = async () => {
      const data = await fetchOnce()
      if (cancelled) return
      const done = !!data && (data.session.status === 'completed' || data.session.status === 'failed')
      if (!done && errCountRef.current < MAX_CONSECUTIVE_ERRORS) {
        timerRef.current = setTimeout(loop, POLL_INTERVAL_MS)
      }
    }
    void loop()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [sessionId, fetchOnce])

  const retry = useCallback(() => {
    errCountRef.current = 0
    setError(null)
    setLoading(true)
    void fetchOnce()
  }, [fetchOnce])

  /** 行情存证快照（研究时点，PlanMeta.quote） */
  const metaQuote: QuoteSnapshot | null = detail?.session.meta?.quote ?? null

  return { detail, error, loading, retry, refetch: fetchOnce, metaQuote }
}
