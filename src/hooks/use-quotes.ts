'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveQuote } from '@/lib/data/quotes'

/**
 * 实时行情轮询 hook（客户端）
 * - 每 intervalMs 轮询 /api/quote，默认 15s；页面不可见时暂停
 * - 返回 quoteMap + 每次变更的 symbol 集合与闪烁方向（用于闪烁动画）
 */

export interface QuoteUpdate {
  quotes: Record<string, LiveQuote>
  changed: Set<string>
  ts: number
}

export function useQuotes(codes: string[], intervalMs = 15_000) {
  const key = codes.filter(Boolean).sort().join(',')
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({})
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [flash, setFlash] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const prevRef = useRef<Record<string, number>>({})
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    if (!key) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/quote?codes=${encodeURIComponent(key)}`, { cache: 'no-store' })
      const data = (await res.json()) as { quotes?: Record<string, LiveQuote>; ts?: number }
      if (!mountedRef.current) return
      const next = data.quotes ?? {}
      const changedSet = new Set<string>()
      const flashMap: Record<string, string> = {}
      for (const [code, q] of Object.entries(next)) {
        const prev = prevRef.current[code]
        if (prev !== undefined && prev !== q.price) {
          changedSet.add(code)
          flashMap[code] = q.price > prev ? 'flash-up' : 'flash-down'
        }
        prevRef.current[code] = q.price
      }
      setQuotes(next)
      setChanged(changedSet)
      setFlash(flashMap)
      if (Object.keys(next).length > 0) setLoading(false)
    } catch {
      // 静默：保留上一次数据
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [key])

  useEffect(() => {
    mountedRef.current = true
    void refresh()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void refresh()
      }, intervalMs)
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    start()
    return () => {
      mountedRef.current = false
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh, intervalMs])

  return { quotes, changed, flash, loading, refresh }
}

/** 价格闪烁类名：返回 'flash-up' | 'flash-down' | ''，由调用方用 key 重触发 */
export function flashClass(prev: number | undefined, next: number): string {
  if (prev === undefined || prev === next) return ''
  return next > prev ? 'flash-up' : 'flash-down'
}
