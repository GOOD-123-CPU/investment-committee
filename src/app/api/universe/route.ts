import { NextResponse } from 'next/server'
import { searchUniverse, universeStats } from '@/lib/data/universe'

export const dynamic = 'force-dynamic'

/**
 * GET /api/universe?q=金龙鱼&limit=8 — 全球热门标的快照库检索（搜索联想）
 * GET /api/universe?stats=1       — 快照库统计（总数 + 各市场数量）
 * 数据：db/seed/universe.json → StockUniverse 表（A股/港股/美股近万只热门标的，行情源验证）
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    if (url.searchParams.get('stats') === '1') {
      const stats = await universeStats()
      return NextResponse.json(stats)
    }
    const q = (url.searchParams.get('q') ?? '').slice(0, 24)
    const limit = Math.min(12, Math.max(1, Number(url.searchParams.get('limit') ?? 8)))
    if (!q.trim()) return NextResponse.json({ hits: [] })
    const hits = await searchUniverse(q, limit)
    return NextResponse.json({ hits })
  } catch (e) {
    console.error('[api/universe GET]', e)
    return NextResponse.json({ hits: [], error: '检索失败' }, { status: 500 })
  }
}
