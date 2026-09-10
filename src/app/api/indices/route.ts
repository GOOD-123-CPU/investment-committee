import { NextResponse } from 'next/server'
import { fetchQuotes, fetchSparkline, MARKET_INDICES, MARKET_META, marketStatus, type GroupKey, type LiveQuote } from '@/lib/data/quotes'

export const dynamic = 'force-dynamic'

/**
 * GET /api/indices            → 48 个全球指数实时行情（9 大市场分组 + 开闭状态）
 * GET /api/indices?spark=1    → 附加各指数 30 日收盘 sparkline（服务端缓存 2h，渐进加载）
 */
export async function GET(req: Request) {
  const withSpark = new URL(req.url).searchParams.get('spark') === '1'

  const codes = MARKET_INDICES.map((i) => i.code)
  const quotes = await fetchQuotes(codes)

  const groups = {} as Record<GroupKey, IndexRow[]>
  for (const k of Object.keys(MARKET_META) as GroupKey[]) groups[k] = []

  for (const def of MARKET_INDICES) {
    const q: LiveQuote | undefined = quotes[def.code] ?? quotes[def.code.toUpperCase()]
    groups[def.group].push({
      code: def.code,
      name: q?.name?.trim() || def.name,
      shortName: def.shortName ?? '',
      desc: def.desc,
      proxyFor: def.proxyFor ?? null,
      price: q?.price ?? null,
      change: q?.change ?? null,
      changePct: q?.changePct ?? null,
      high: q?.high ?? null,
      low: q?.low ?? null,
      prevClose: q?.prevClose ?? null,
      currency: q?.currency ?? def.currency ?? MARKET_META[def.group].currency,
      time: q?.time ?? null,
      source: q?.source ?? null,
    })
  }

  let sparks: Record<string, number[]> | undefined
  if (withSpark) {
    // in-flight 去重：并发请求共享同一次批量构建，避免重复拉取 95 个上游源
    // 分块限流：每块 10 个并发、块间串行（全并发会被行情源限流导致部分 sparkline 缺失）
    if (!sparkBatchInflight) {
      sparkBatchInflight = (async () => {
        const settled: { code: string; spark: number[] }[] = []
        for (let i = 0; i < MARKET_INDICES.length; i += 10) {
          const part = MARKET_INDICES.slice(i, i + 10)
          settled.push(
            ...(await Promise.all(part.map(async (def) => ({ code: def.code, spark: await fetchSparkline(def.code) })))),
          )
        }
        sparkBatchCache = Object.fromEntries(settled.filter((s) => s.spark.length > 2).map((s) => [s.code, s.spark]))
        sparkBatchInflight = null
      })()
    }
    await sparkBatchInflight
    sparks = sparkBatchCache
  }

  return NextResponse.json(
    {
      groups,
      markets: marketStatus(),
      sparks: sparks ?? null,
      ts: Date.now(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

interface IndexRow {
  code: string
  name: string
  shortName: string
  desc: string
  proxyFor: string | null
  price: number | null
  change: number | null
  changePct: number | null
  high: number | null
  low: number | null
  prevClose: number | null
  currency: string
  time: string | null
  source: 'tencent' | 'yahoo' | null
}

// spark 批量构建共享状态（模块级，dev 热重载会重建但无碍）
let sparkBatchInflight: Promise<void> | null = null
let sparkBatchCache: Record<string, number[]> = {}
