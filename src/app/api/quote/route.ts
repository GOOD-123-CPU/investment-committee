import { NextRequest, NextResponse } from 'next/server'
import { fetchQuotes, fetchIntraday } from '@/lib/data/quotes'

export const dynamic = 'force-dynamic'

/**
 * GET /api/quote?codes=sh000001,sz399006,600519,00700.HK
 * 实时行情（腾讯财经）。支持指数符号直传（sh/sz/hk 开头）与内部代码自动映射。
 * 附加 ?intraday=600519 可同时返回该标的当日分时。
 */
export async function GET(req: NextRequest) {
  const codesParam = req.nextUrl.searchParams.get('codes') ?? ''
  const intradayCode = req.nextUrl.searchParams.get('intraday')
  const codes = codesParam
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 30)

  if (codes.length === 0 && !intradayCode) {
    return NextResponse.json({ error: 'codes required' }, { status: 400 })
  }

  const quotes = codes.length > 0 ? await fetchQuotes(codes) : {}

  let intraday: Awaited<ReturnType<typeof fetchIntraday>> | null = null
  if (intradayCode) {
    intraday = await fetchIntraday(intradayCode)
  }

  return NextResponse.json(
    { quotes, intraday, ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
