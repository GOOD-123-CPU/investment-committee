import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tryChatJSON } from '@/lib/ai/llm'
import { findStock } from '@/lib/data/stocks'
import type { HoldingInput, PortfolioResult } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/portfolio — 组合诊断（F09/F10）
 * 集中度/行业暴露/单票集中度由代码计算（权威），LLM 仅给建议与叙述。
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { holdings?: HoldingInput[] } | null
    const holdings = (body?.holdings ?? [])
      .map((h) => ({ name: String(h.name ?? '').trim(), weight: Number(h.weight) }))
      .filter((h) => h.name && Number.isFinite(h.weight) && h.weight > 0)
      .slice(0, 20)

    if (holdings.length === 0) {
      return NextResponse.json({ error: '请至少填写一只有效持仓' }, { status: 400 })
    }

    // ---- 代码计算部分（权威指标） ----
    const total = holdings.reduce((s, h) => s + h.weight, 0)
    const normalized = holdings.map((h) => {
      const stock = findStock(h.name)
      return { name: stock?.name ?? h.name, weight: (h.weight / total) * 100, stock }
    })

    const hhi = Math.round(normalized.reduce((s, h) => s + (h.weight / 100) ** 2, 0) * 10000)
    const concentrationLabel = hhi >= 4500 ? '极度集中' : hhi >= 3000 ? '高度集中' : hhi >= 1800 ? '中等集中' : '较为分散'
    const maxSingle = Math.max(...normalized.map((h) => h.weight))

    const sectorMap = new Map<string, { weight: number; names: string[] }>()
    for (const h of normalized) {
      const sector = h.stock?.sector ?? '其他/未知'
      const cur = sectorMap.get(sector) ?? { weight: 0, names: [] }
      cur.weight += h.weight
      cur.names.push(h.name)
      sectorMap.set(sector, cur)
    }
    const sectorExposure = [...sectorMap.entries()]
      .map(([sector, v]) => ({ sector, weight: Math.round(v.weight * 10) / 10, names: v.names }))
      .sort((x, y) => y.weight - x.weight)
    const topSector = sectorExposure[0]

    const unknownCount = normalized.filter((h) => !h.stock).length
    const cashWeight = normalized.filter((h) => /现金|cash|货基|余额/i.test(h.name)).reduce((s, h) => s + h.weight, 0)

    const metrics: PortfolioResult['metrics'] = [
      {
        name: '单票最大权重',
        value: `${Math.round(maxSingle * 10) / 10}%`,
        level: maxSingle > 35 ? 'bad' : maxSingle > 25 ? 'warn' : 'good',
        note: maxSingle > 25 ? '单一标的暴露偏高，回撤冲击大' : '单票暴露可控',
      },
      {
        name: '第一大行业占比',
        value: topSector ? `${topSector.weight}%` : '—',
        level: (topSector?.weight ?? 0) > 60 ? 'bad' : (topSector?.weight ?? 0) > 40 ? 'warn' : 'good',
        note: topSector ? `主要暴露于${topSector.sector}` : 'Data unavailable',
      },
      {
        name: '现金/防御资产',
        value: `${Math.round(cashWeight)}%`,
        level: cashWeight < 5 ? 'warn' : cashWeight > 40 ? 'warn' : 'good',
        note: cashWeight < 5 ? '缺乏流动性缓冲' : cashWeight > 40 ? '现金拖累明显' : '流动性缓冲合理',
      },
      {
        name: '库内可识别标的',
        value: `${normalized.length - unknownCount}/${normalized.length}`,
        level: unknownCount === 0 ? 'good' : 'warn',
        note: unknownCount > 0 ? '部分标的未收录，风险画像不完整' : '全部可识别',
      },
    ]

    const riskLevel: PortfolioResult['riskLevel'] =
      hhi >= 4500 || maxSingle > 40 ? 'Very High' : hhi >= 3000 || maxSingle > 30 ? 'High' : hhi >= 1800 ? 'Medium' : 'Low'

    // ---- LLM 建议部分 ----
    type LLMAdvice = { suggestions?: { action?: string; name?: string; reason?: string }[]; summary?: string }
    const advice = await tryChatJSON<LLMAdvice>(
      `你是基金公司组合风控官（Portfolio Agent）。基于【代码计算的组合体检结果】给出再平衡建议。
输出 {"suggestions":[{"action":"reduce|increase|hold|watch","name":"标的或操作名","reason":"≤40字"}] (3-5条), "summary":"≤100字组合总体评价"}。只输出合法 JSON，不要修改给定数字。`,
      `组合体检（权威计算结果）：
- 标的与权重：${JSON.stringify(normalized.map((h) => ({ name: h.name, weight: Math.round(h.weight * 10) / 10, sector: h.stock?.sector ?? '未知', industry: h.stock?.industry ?? '未知' })))}
- HHI 集中度：${hhi}（${concentrationLabel}）
- 行业暴露：${JSON.stringify(sectorExposure)}
- 风险等级：${riskLevel}`,
      60_000,
    )

    const actionSet = new Set(['reduce', 'increase', 'hold', 'watch'])
    const suggestions: PortfolioResult['suggestions'] = (advice?.suggestions ?? [])
      .filter((s) => s && typeof s.name === 'string' && actionSet.has(String(s.action)))
      .slice(0, 5)
      .map((s) => ({ action: s.action as 'reduce' | 'increase' | 'hold' | 'watch', name: String(s.name).slice(0, 24), reason: String(s.reason ?? '').slice(0, 60) }))
    if (suggestions.length === 0) {
      suggestions.push(
        ...(topSector && topSector.weight > 40
          ? [{ action: 'reduce' as const, name: topSector.names[0] ?? topSector.sector, reason: `${topSector.sector}行业集中度过高（${topSector.weight}%）` }]
          : []),
        ...(maxSingle > 25 ? [{ action: 'reduce' as const, name: normalized.sort((x, y) => y.weight - x.weight)[0].name, reason: `单票权重 ${Math.round(maxSingle)}%，超出舒适区` }] : []),
        { action: 'watch', name: '组合整体', reason: `HHI ${hhi}（${concentrationLabel}），建议定期复盘` },
      )
    }

    const result: PortfolioResult = {
      riskLevel,
      concentrationHHI: hhi,
      concentrationLabel,
      sectorExposure,
      metrics,
      suggestions,
      summary: advice?.summary ?? `组合 HHI ${hhi}，${concentrationLabel}；第一大行业占比 ${topSector?.weight ?? 0}%，风险等级 ${riskLevel}。`,
    }

    await db.portfolioAnalysis.create({ data: { input: JSON.stringify(holdings), result: JSON.stringify(result) } })
    return NextResponse.json({ result })
  } catch (e) {
    console.error('[api/portfolio POST]', e)
    return NextResponse.json({ error: '组合诊断失败，请稍后重试' }, { status: 500 })
  }
}
