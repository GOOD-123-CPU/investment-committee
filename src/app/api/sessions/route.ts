import { NextResponse } from 'next/server'
import { listSessions } from '@/lib/pipeline/runner'

export const dynamic = 'force-dynamic'

/** GET /api/sessions — 最近研究列表 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limit = Math.min(24, Math.max(1, Number(url.searchParams.get('limit') ?? 12)))
    const sessions = await listSessions(limit)
    return NextResponse.json({ sessions })
  } catch (e) {
    console.error('[api/sessions GET]', e)
    return NextResponse.json({ error: '加载最近研究失败' }, { status: 500 })
  }
}
