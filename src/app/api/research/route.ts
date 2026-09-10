import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { launchResearch, listSessions } from '@/lib/pipeline/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** POST /api/research — 发起研究（单标的或对比模式） */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { query?: string } | null
    const query = body?.query?.trim()
    if (!query) {
      return NextResponse.json({ error: '请输入股票名称、代码或投资问题' }, { status: 400 })
    }
    if (query.length > 200) {
      return NextResponse.json({ error: '输入过长，请精简后重试' }, { status: 400 })
    }

    // 轻量预判：是否为对比类问题（A vs B / A 和 B / A 与 B）
    const vsPatterns = [
      /\bvs\b/i, /\bVS\b/, /对比/, /比较/, /谁更值得/, /哪个更好/, /还是/,
      /(.+)和(.{2,12}?)(现在|目前|谁)/, /(.+)与(.{2,12}?)(现在|目前|谁)/,
    ]
    const isCompare = vsPatterns.some((re) => re.test(query))

    if (!isCompare) {
      const session = await db.researchSession.create({
        data: { query, intent: 'single', status: 'queued', progress: 2, currentStepLabel: '排队中…' },
      })
      launchResearch(session.id)
      return NextResponse.json({
        sessions: [{ id: session.id, stockCode: session.stockCode, stockName: session.stockName, status: session.status, intent: session.intent, groupId: session.groupId }],
        groupId: null,
      })
    }

    // 对比模式：预创建两个 session，共享 groupId；各自 pipeline 的 planner 识别标的，orderIndex 决定各自认领哪一个
    const groupId = `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const s1 = await db.researchSession.create({
      data: { query, intent: 'comparison', groupId, orderIndex: 0, status: 'queued', progress: 2, currentStepLabel: '排队中…' },
    })
    const s2 = await db.researchSession.create({
      data: { query, intent: 'comparison', groupId, orderIndex: 1, status: 'queued', progress: 2, currentStepLabel: '排队中…' },
    })
    launchResearch(s1.id)
    launchResearch(s2.id)
    return NextResponse.json({
      sessions: [s1, s2].map((s) => ({ id: s.id, stockCode: s.stockCode, stockName: s.stockName, status: s.status, intent: s.intent, groupId: s.groupId })),
      groupId,
    })
  } catch (e) {
    console.error('[api/research POST]', e)
    return NextResponse.json({ error: '发起研究失败，请稍后重试' }, { status: 500 })
  }
}

/** GET /api/research — 最近研究列表 */
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 12)))
    const sessions = await listSessions(limit)
    return NextResponse.json({ sessions })
  } catch (e) {
    console.error('[api/research GET]', e)
    return NextResponse.json({ error: '加载研究列表失败' }, { status: 500 })
  }
}
