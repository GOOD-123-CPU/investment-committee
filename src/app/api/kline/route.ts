import { NextRequest, NextResponse } from 'next/server'
import { fetchDailyKline, fetchQuote } from '@/lib/data/quotes'

export const dynamic = 'force-dynamic'

/**
 * GET /api/kline?code=600519&days=180
 * 前复权日 K 线 + 实时快照（供前端 lightweight-charts 蜡烛图/均线使用）
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') ?? ''
  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') ?? '180', 10) || 180, 30), 500)
  if (!code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 })
  }
  const [kline, quote] = await Promise.all([fetchDailyKline(code, days), fetchQuote(code)])
  return NextResponse.json(
    { kline, quote: quote ?? null, ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
