'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GroupKey } from '@/lib/data/quotes'

/**
 * 全球指数轮询 hook（客户端）
 * - 每 intervalMs 轮询 /api/indices（默认 10s；页面不可见时暂停）
 * - 首次加载后自动追加 ?spark=1 拉取 30 日 sparkline（渐进增强，不阻塞行情显示）
 */

export interface IndexRow {
  code: string
  name: string
  shortName: string
  desc: string
  proxyFor: string | null
  price: number | null
  change: number | null
  changePct: number | null
  high: number | null
  low: number | null
  prevClose: number | null
  currency: string
  time: string | null
  source: 'tencent' | 'yahoo' | null
}

export interface IndicesPayload {
  groups: Record<GroupKey, IndexRow[]>
  markets: Record<GroupKey, 'open' | 'closed'>
  sparks: Record<string, number[]> | null
  ts: number
}

export function useIndices(intervalMs = 10_000) {
  const [data, setData] = useState<IndicesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)
  const sparkDoneRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const withSpark = sparkDoneRef.current ? '' : '?spark=1'
      const res = await fetch(`/api/indices${withSpark}`, { cache: 'no-store' })
      const next = (await res.json()) as IndicesPayload
      if (!mountedRef.current) return
      if (next.sparks) sparkDoneRef.current = true
      // 合并保留已到达的 sparks：常规轮询响应中 sparks=null，不能覆盖已有数据
      setData((prev) => ({ ...next, sparks: next.sparks ?? prev?.sparks ?? null }))
      setLoading(false)
    } catch {
      // 静默：保留上一次数据
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    // 首次拉取延后至微任务，避免 effect 同步 setState（react-hooks/set-state-in-effect）
    const kickoff = setTimeout(() => void refresh(), 0)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, intervalMs)
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      mountedRef.current = false
      clearTimeout(kickoff)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh, intervalMs])

  return { data, loading, refresh }
}
