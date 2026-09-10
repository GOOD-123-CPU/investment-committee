import { db } from '@/lib/db'
import type { StockProfile } from '@/lib/types'

/**
 * 全球热门标的快照库（近万只 A股/港股/美股热门标的）
 * - 数据来源：scripts/build-universe.ts 全代码空间行情扫描（A/港按成交额热度序，名称为腾讯行情源权威名称）+ 美股 LLM 候选×行情验证
 * - 本模块只提供「身份注册表」（代码/名称/市场/行业）；价格/估值等数字一律由行情层运行时拉取，保证零幻觉
 * - 内存缓存：全量行进程内缓存 10 分钟（SQLite 全表 <15ms，避免高频研究重复查询）
 */

export interface UniverseStock {
  code: string
  name: string
  market: 'SH' | 'SZ' | 'BJ' | 'HK' | 'US'
  industry: string | null
}

let cache: { rows: UniverseStock[]; at: number } | null = null
const CACHE_TTL = 10 * 60_000
let inflight: Promise<UniverseStock[]> | null = null

/** 全量加载（DB + 10min 内存缓存；行情板与检索共用） */
export async function loadUniverse(): Promise<UniverseStock[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.rows
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const rows = await db.stockUniverse.findMany({
        select: { code: true, name: true, market: true, industry: true },
      })
      const mapped = rows.map((r) => ({
        code: r.code,
        name: r.name,
        market: r.market as UniverseStock['market'],
        industry: r.industry,
      }))
      cache = { rows: mapped, at: Date.now() }
      return mapped
    } catch {
      return cache?.rows ?? []
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** 快照库统计（含各市场数量；供状态栏/百科展示真实数字） */
export async function universeStats(): Promise<{ total: number; byMarket: Record<string, number> }> {
  const rows = await loadUniverse()
  const byMarket = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.market] = (acc[r.market] ?? 0) + 1
    return acc
  }, {})
  return { total: rows.length, byMarket }
}

export interface UniverseHit {
  stock: UniverseStock
  pos: number
}

/**
 * 从查询文本中确定性匹配宇宙标的（名称/代码出现位置排序）。
 * 与 runner.directMatchStocks 同构：精选快照库 + 全球热门标的库的两级匹配。
 * 性能：近万行 × 简单 indexOf，毫秒级。
 */
export async function matchUniverseStocks(query: string, limit = 2): Promise<UniverseHit[]> {
  const q = query.toLowerCase()
  if (!q.trim()) return []
  const rows = await loadUniverse()
  const found: UniverseHit[] = []
  for (const stock of rows) {
    const nameLower = stock.name.toLowerCase()
    let pos = -1
    // 名称完整命中（优先）
    if (nameLower.length >= 2 && q.includes(nameLower)) {
      pos = q.indexOf(nameLower)
    } else if (/^\d{6}$/.test(stock.code) && q.includes(stock.code)) {
      // A股 6 位代码命中
      pos = q.indexOf(stock.code)
    } else if (stock.code.length >= 2 && q.includes(stock.code.toLowerCase())) {
      // 港股/美股代码命中
      pos = q.indexOf(stock.code.toLowerCase())
    }
    if (pos !== -1) found.push({ stock, pos })
    if (found.length >= 24) break // 粗剪枝，排序后截断
  }
  return found.sort((a, b) => a.pos - b.pos).slice(0, limit)
}

/** 搜索联想（/api/universe?q=）：前缀/包含匹配，按「前缀 > 市场热度序」排序 */
export async function searchUniverse(q: string, limit = 8): Promise<(UniverseStock & { source: string })[]> {
  const kw = q.trim().toLowerCase()
  if (!kw) return []
  const rows = await loadUniverse()
  const prefix: (UniverseStock & { source: string })[] = []
  const contains: (UniverseStock & { source: string })[] = []
  for (const r of rows) {
    const n = r.name.toLowerCase()
    const c = r.code.toLowerCase()
    const hit = { ...r, source: 'universe' }
    if (n.startsWith(kw) || c.startsWith(kw)) {
      prefix.push(hit)
      if (prefix.length >= limit) break
    } else if (n.includes(kw) || c.includes(kw)) {
      if (contains.length < limit) contains.push(hit)
    }
  }
  return [...prefix, ...contains].slice(0, limit)
}

/**
 * 宇宙标的 → 研究用 StockProfile（limited-profile：无财务快照，行情层注入实时数据，Agent 走检索）。
 * 与纯 limited-data 模式的区别：有权威名称/市场/行业标签，研究体验与快照库标的对齐。
 */
export function universeToProfile(s: UniverseStock): StockProfile {
  const industry = s.industry || '综合'
  return {
    code: s.code,
    name: s.name,
    market: s.market,
    alias: [],
    industry,
    sector: industry,
    description: `${s.name}（${s.code}，${s.market} 市场热门标的，行业：${industry}）。所属「全球热门标的快照库」。`,
    currency: s.market === 'HK' ? 'HKD' : s.market === 'US' ? 'USD' : 'CNY',
    price: 0,
    changePct: 0,
    marketCap: 0,
    valuation: { pe: null, pePercentile: null, pb: 0, dividendYield: 0, peerAvgPe: 0 },
    financials: { revenue: 0, revenueGrowth: 0, netProfit: 0, profitGrowth: 0, grossMargin: 0, netMargin: 0, roe: 0, debtRatio: 0, ocf: 0 },
    history: [],
    technicals: { change1m: 0, change3m: 0, change6m: 0, change1y: 0, high52w: 0, low52w: 0, maTrend: 'above_mid', rsi14: 50, volatility: 'medium' },
    industryContext: { size: 'Data unavailable', growth: 'Data unavailable', stage: '成熟期', concentration: '', outlook: '' },
    competitive: { rank: '', marketShare: '', moat: [], competitors: [] },
    risks: [],
    catalysts: [],
  }
}
