/**
 * 热门标的快照库 · 实时行情板（服务端数据层）
 * - 数据底座：StockUniverse 近万只热门标的（A股/港股/美股，行情源验证零幻觉）
 * - 实时价格：行情层 fetchQuotes 运行时拉取（盘中 5s / 盘后 60s 缓存），本层零缓存数字
 * - 两种视图：
 *   1) rank 模式：按建库时成交额热度排序（DB 插入序 = 热度序），分页 + 实时行情合并
 *   2) sort 模式：全市场实时扫描（涨幅/成交额/换手榜），内存缓存 90s（腾讯批量扫描 ~25-57 请求/市场）
 */

import { loadUniverse, type UniverseStock } from '@/lib/data/universe'
import { fetchQuotes, type LiveQuote } from '@/lib/data/quotes'

export type BoardMarket = 'ALL' | 'SH' | 'SZ' | 'BJ' | 'HK' | 'US'
export type BoardSort = 'rank' | 'gain' | 'loss' | 'amount' | 'turnover'

export interface BoardRow {
  code: string
  name: string
  market: UniverseStock['market']
  industry: string | null
  rank: number
  price: number
  change: number
  changePct: number
  amount: number
  turnoverRate: number | null
  peTtm: number | null
  marketCap: number | null
  currency: string
  time: string
}

/** 内部代码 → 腾讯符号（sh600000 / hk00700 / usAAPL；fetchQuotes 内部再走 toTencentSymbol 规范化） */
function symbolOf(s: UniverseStock): string {
  if (s.market === 'HK') return `hk${s.code.padStart(5, '0')}`
  if (s.market === 'US') return `us${s.code}`
  return `${s.market.toLowerCase()}${s.code}`
}

function rowOf(s: UniverseStock, rank: number, q: LiveQuote | undefined): BoardRow {
  return {
    code: s.code,
    name: s.name,
    market: s.market,
    industry: s.industry,
    rank,
    price: q?.price ?? 0,
    change: q?.change ?? 0,
    changePct: q?.changePct ?? 0,
    amount: q?.amount ?? 0,
    turnoverRate: q?.turnoverRate ?? null,
    peTtm: q?.peTtm ?? null,
    marketCap: q?.marketCap ?? null,
    currency: q?.currency ?? (s.market === 'HK' ? 'HKD' : s.market === 'US' ? 'USD' : 'CNY'),
    time: q?.time ?? '',
  }
}

/** 分块串行拉取行情（60/块，块间 120ms，对上游友好） */
async function fetchChunked(stocks: UniverseStock[]): Promise<Map<string, LiveQuote>> {
  const out = new Map<string, LiveQuote>()
  const CHUNK = 60
  for (let i = 0; i < stocks.length; i += CHUNK) {
    const part = stocks.slice(i, i + CHUNK)
    const symbols = part.map(symbolOf)
    try {
      const quotes = await fetchQuotes(symbols)
      for (let j = 0; j < part.length; j++) {
        const q = quotes[symbols[j]]
        if (q && q.price > 0) out.set(symbolOf(part[j]), q)
      }
    } catch {
      // 单块失败：跳过（该块标的本帧无行情）
    }
    if (i + CHUNK < stocks.length) await new Promise((r) => setTimeout(r, 120))
  }
  return out
}

/** rank 视图：市场过滤 + 热度序分页 + 实时行情合并 */
export async function boardByRank(market: BoardMarket, offset: number, limit: number): Promise<BoardRow[]> {
  const all = await loadUniverse()
  const filtered = market === 'ALL' ? all : all.filter((s) => s.market === market)
  const slice = filtered.slice(offset, offset + limit)
  if (slice.length === 0) return []
  const quotes = await fetchChunked(slice)
  return slice.map((s, i) => rowOf(s, offset + i + 1, quotes.get(symbolOf(s))))
}

// ---------- sort 视图：全市场实时扫描（90s 内存缓存） ----------

interface ScanEntry {
  at: number
  rows: BoardRow[]
}
const scanCache = new Map<string, ScanEntry>()
const SCAN_TTL = 90_000
/** 全市场扫描单市场行数上限（涨幅榜取全市场；全量 ALL 太重 → 只允许单市场扫描；3400 覆盖深市全量） */
const SCAN_MAX = 3400
/** 扫描并发互斥：同 key 只允许一个在途扫描 */
const scanInflight = new Map<string, Promise<BoardRow[]>>()

export interface BoardScanInfo {
  cached: boolean
  scannedAt: number
  total: number
}

/** sort 模式：单市场全量实时扫描排序（gain/loss/amount/turnover）；返回 top rows + 缓存信息 */
export async function boardBySort(
  market: BoardMarket,
  sort: Exclude<BoardSort, 'rank'>,
  limit: number,
): Promise<{ rows: BoardRow[]; info: BoardScanInfo }> {
  if (market === 'ALL') throw new Error('排序榜仅支持单市场（SH/SZ/BJ/HK/US）')
  const key = `${market}:${sort}`
  const hit = scanCache.get(key)
  if (hit && Date.now() - hit.at < SCAN_TTL) {
    return { rows: hit.rows.slice(0, limit), info: { cached: true, scannedAt: hit.at, total: hit.rows.length } }
  }
  const inflight = scanInflight.get(key)
  if (inflight) {
    const rows = await inflight
    return { rows: rows.slice(0, limit), info: { cached: false, scannedAt: Date.now(), total: rows.length } }
  }
  const task = (async () => {
    const all = (await loadUniverse()).filter((s) => s.market === market).slice(0, SCAN_MAX)
    const quotes = await fetchChunked(all)
    const rows: BoardRow[] = []
    all.forEach((s, i) => {
      const q = quotes.get(symbolOf(s))
      if (q) rows.push(rowOf(s, i + 1, q))
    })
    const sorted = [...rows].sort((a, b) => {
      if (sort === 'gain') return b.changePct - a.changePct
      if (sort === 'loss') return a.changePct - b.changePct
      if (sort === 'amount') return b.amount - a.amount
      return (b.turnoverRate ?? -1) - (a.turnoverRate ?? -1)
    })
    scanCache.set(key, { at: Date.now(), rows: sorted })
    return sorted
  })().finally(() => scanInflight.delete(key))
  scanInflight.set(key, task)
  const rows = await task
  return { rows: rows.slice(0, limit), info: { cached: false, scannedAt: Date.now(), total: rows.length } }
}
