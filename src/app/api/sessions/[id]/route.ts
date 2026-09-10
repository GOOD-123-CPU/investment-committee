import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/sessions/[id] — 删除一条研究记录
 * AgentAnalysis / DebateMessage / FinalDecision 通过 Prisma onDelete: Cascade 级联清理；
 * 若删除后对比组剩余成员 < 2，同步清理 ComparisonResult（避免残留孤儿裁决）。
 * 进行中会话删除后：内存 pipeline 后续写入因记录不存在而中断（异常已被捕获，不会导致进程崩溃）。
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await db.researchSession.findUnique({
      where: { id },
      select: { id: true, groupId: true },
    })
    if (!session) {
      return NextResponse.json({ error: '研究记录不存在或已删除' }, { status: 404 })
    }

    await db.researchSession.delete({ where: { id } })

    // 对比组清理：剩余成员不足 2 时删除该组的对比裁决
    let groupCleaned = false
    if (session.groupId) {
      const remain = await db.researchSession.count({ where: { groupId: session.groupId } })
      if (remain < 2) {
        await db.comparisonResult.deleteMany({ where: { groupId: session.groupId } })
        groupCleaned = true
      }
    }

    return NextResponse.json({ ok: true, deletedId: id, groupCleaned })
  } catch (e) {
    console.error('[api/sessions DELETE]', e)
    return NextResponse.json({ error: '删除研究记录失败' }, { status: 500 })
  }
}
