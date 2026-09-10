import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mapAgent, mapDebate, mapDecision, mapSession } from '@/lib/pipeline/runner'
import type { ResearchDetailDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/research/[id] — 研究详情（session + agents + debates + decision） */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await db.researchSession.findUnique({
      where: { id },
      include: {
        agents: { orderBy: { createdAt: 'asc' } },
        debates: { orderBy: { createdAt: 'asc' } },
        decision: true,
      },
    })
    if (!session) {
      return NextResponse.json({ error: '研究不存在或已被删除' }, { status: 404 })
    }
    const detail: ResearchDetailDTO = {
      session: mapSession(session),
      agents: session.agents.map(mapAgent),
      debates: session.debates.map(mapDebate),
      decision: mapDecision(session.decision),
    }
    return NextResponse.json(detail)
  } catch (e) {
    console.error('[api/research/[id] GET]', e)
    return NextResponse.json({ error: '加载研究详情失败' }, { status: 500 })
  }
}
