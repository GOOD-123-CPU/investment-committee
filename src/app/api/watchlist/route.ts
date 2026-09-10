import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchQuotes } from '@/lib/data/quotes'

export const dynamic = 'force-dynamic'

/** GET /api/watchlist — 自选池列表（附带实时行情） */
export async function GET() {
  try {
    const items = await db.watchlistItem.findMany({ orderBy: { updatedAt: 'desc' } })
    // 附带实时行情（失败不影响主列表）
    let quotes: Record<string, import('@/lib/data/quotes').LiveQuote> = {}
    try {
      const codes = items.map((i) => i.stockCode).filter(Boolean)
      if (codes.length > 0) quotes = await fetchQuotes(codes)
    } catch {
      quotes = {}
    }
    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        stockCode: i.stockCode,
        stockName: i.stockName,
        aiScore: i.aiScore,
        rating: i.rating,
        riskLevel: i.riskLevel,
        summary: i.summary,
        sessionId: i.sessionId,
        createdAt: i.createdAt.toISOString(),
        quote: quotes[i.stockCode] ?? null,
      })),
    })
  } catch (e) {
    console.error('[api/watchlist GET]', e)
    return NextResponse.json({ error: '加载自选池失败' }, { status: 500 })
  }
}

/** POST /api/watchlist — { sessionId } 将已完成研究的股票加入自选 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { sessionId?: string } | null
    const sessionId = body?.sessionId
    if (!sessionId) return NextResponse.json({ error: '缺少 sessionId' }, { status: 400 })

    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: { decision: true },
    })
    if (!session || !session.decision) {
      return NextResponse.json({ error: '研究尚未完成，无法加入自选' }, { status: 400 })
    }
    const code = session.stockCode
    if (!code) return NextResponse.json({ error: '该研究未关联标准股票代码' }, { status: 400 })

    const item = await db.watchlistItem.upsert({
      where: { stockCode: code },
      create: {
        stockCode: code,
        stockName: session.stockName ?? code,
        aiScore: session.decision.finalScore,
        rating: session.decision.rating,
        riskLevel: session.decision.riskLevel,
        summary: (session.decision.keyLogic ? JSON.parse(session.decision.keyLogic)[0] : null) ?? null,
        sessionId: session.id,
      },
      update: {
        stockName: session.stockName ?? code,
        aiScore: session.decision.finalScore,
        rating: session.decision.rating,
        riskLevel: session.decision.riskLevel,
        summary: (session.decision.keyLogic ? JSON.parse(session.decision.keyLogic)[0] : null) ?? null,
        sessionId: session.id,
      },
    })
    return NextResponse.json({ item: { ...item, createdAt: item.createdAt.toISOString() } })
  } catch (e) {
    console.error('[api/watchlist POST]', e)
    return NextResponse.json({ error: '加入自选失败' }, { status: 500 })
  }
}

/** DELETE /api/watchlist?code=xxx */
export async function DELETE(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')
    if (!code) return NextResponse.json({ error: '缺少 code 参数' }, { status: 400 })
    await db.watchlistItem.deleteMany({ where: { stockCode: code } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/watchlist DELETE]', e)
    return NextResponse.json({ error: '删除自选失败' }, { status: 500 })
  }
}
