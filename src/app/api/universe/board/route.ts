import { NextResponse } from 'next/server'
import { boardByRank, boardBySort, type BoardMarket, type BoardSort } from '@/lib/data/universe-board'
import { marketStatus } from '@/lib/data/quotes'

export const dynamic = 'force-dynamic'

const MARKETS: BoardMarket[] = ['ALL', 'SH', 'SZ', 'BJ', 'HK', 'US']
const SORTS: BoardSort[] = ['rank', 'gain', 'loss', 'amount', 'turnover']

/**
 * GET /api/universe/board?market=SZ&sort=rank&offset=0&limit=60
 * 热门标的快照库 · 实时行情板
 * - sort=rank：建库成交额热度序分页（支持 offset 翻页）
 * - sort=gain|loss|amount|turnover：单市场全市场实时扫描榜（服务端 90s 缓存）
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const market = (url.searchParams.get('market') ?? 'ALL') as BoardMarket
    const sort = (url.searchParams.get('sort') ?? 'rank') as BoardSort
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0)
    const limit = Math.min(120, Math.max(10, Number(url.searchParams.get('limit') ?? 60) || 60))
    if (!MARKETS.includes(market) || !SORTS.includes(sort)) {
      return NextResponse.json({ error: '参数不合法' }, { status: 400 })
    }

    if (sort === 'rank') {
      const rows = await boardByRank(market, offset, limit)
      return NextResponse.json({
        rows,
        mode: 'rank',
        markets: marketStatus(),
        ts: Date.now(),
        hasMore: rows.length >= limit,
      })
    }
    const { rows, info } = await boardBySort(market, sort, limit)
    return NextResponse.json({
      rows,
      mode: 'scan',
      scan: info,
      markets: marketStatus(),
      ts: Date.now(),
      hasMore: false,
    })
  } catch (e) {
    console.error('[api/universe/board GET]', e)
    return NextResponse.json({ error: '行情板拉取失败' }, { status: 500 })
  }
}
