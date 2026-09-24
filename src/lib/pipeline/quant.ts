import type { StockProfile } from '@/lib/types'
import type { KlineBar, LiveQuote } from '@/lib/data/quotes'

/**
 * 量化计算引擎（纯代码计算，LLM 仅负责解读）
 * 保证估值/动量等关键评分可复现、可审计（对应 PRD Hallucination Guard）
 *
 * v2: 优先使用腾讯实时行情 + 真实日 K 计算（行情驱动），快照数据仅作回退
 */

export interface QuantMetrics {
  pe: number | null
  pePercentile: number | null
  pb: number
  dividendYield: number
  peg: number | null
  peVsPeerPct: number | null // 相对同业溢价/折价 %
  pos52w: number // 0-100 52周位置
  momentum: number // 0-100 动量分
  valuation: number // 0-100 估值吸引力分（越高越便宜）
  volatility: string
  volatilityAnnualPct: number | null // 年化波动率 %
  rsi14: number
  maTrendLabel: string
  trendVerdict: string
  dataSource: 'live' | 'snapshot' | 'mixed'
  changes: { m1: number | null; m3: number | null; m6: number | null; y1: number | null }
  ma20: number | null
  ma60: number | null
  ma120: number | null
}

export interface LiveMarketInput {
  quote: LiveQuote | null
  kline: KlineBar[]
}

function closesOf(kline: KlineBar[]): number[] {
  return kline.map((b) => b.close)
}

/** 简单移动平均 */
function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null
  const slice = closes.slice(-n)
  const sum = slice.reduce((a, b) => a + b, 0)
  return sum / n
}

/** RSI(14) Wilder 平滑 */
function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gain += diff
    else loss -= diff
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/** 区间收益率 %：n 个交易日前至今 */
function returnOver(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null
  const base = closes[closes.length - 1 - n]
  if (!base || base <= 0) return null
  return +(((closes[closes.length - 1] - base) / base) * 100).toFixed(2)
}

/** 年化波动率 %（近 60 日对数收益标准差） */
function annualVolatility(closes: number[]): number | null {
  if (closes.length < 30) return null
  const window = closes.slice(-61)
  const rets: number[] = []
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1] > 0) rets.push(Math.log(window[i] / window[i - 1]))
  }
  if (rets.length < 20) return null
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)
  return +(Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1)
}

function volLabel(vol: number | null): string {
  if (vol === null) return 'unknown'
  if (vol >= 45) return 'high'
  if (vol >= 25) return 'medium'
  return 'low'
}

export function computeQuantMetrics(
  s: StockProfile,
  live?: LiveMarketInput | null,
): QuantMetrics {
  const t = s.technicals
  const v = s.valuation

  // ---------- 真实行情优先 ----------
  const closes = live?.kline?.length ? closesOf(live.kline) : []
  const lastClose = closes.length ? closes[closes.length - 1] : null
  const quote = live?.quote ?? null

  // 52 周位置：优先真实 K 线高低点
  let high52 = t.high52w
  let low52 = t.low52w
  if (closes.length >= 120) {
    const window = closes.slice(-250)
    high52 = Math.max(...window)
    low52 = Math.min(...window)
  } else if (quote?.high52w && quote?.low52w) {
    high52 = quote.high52w
    low52 = quote.low52w
  }
  const refPrice = quote?.price || s.price || lastClose || 0
  const rawPos52w = high52 > low52 && refPrice > 0
    ? Math.round(((refPrice - low52) / (high52 - low52)) * 100)
    : 50
  // Quote and K-line windows can come from slightly different timestamps.
  // Keep the semantic "52-week position" contract bounded even if the latest
  // quote prints above/below the sampled window extrema.
  const pos52w = Math.max(0, Math.min(100, rawPos52w))

  // 区间收益：真实 K 线优先，快照回退
  const m1 = returnOver(closes, 21) ?? t.change1m
  const m3 = returnOver(closes, 63) ?? t.change3m
  const m6 = returnOver(closes, 126) ?? t.change6m
  const y1 = returnOver(closes, Math.min(250, closes.length - 1)) ?? t.change1y

  const ret = 0.15 * m1 + 0.2 * m3 + 0.25 * m6 + 0.4 * y1
  const retScore = Math.max(0, Math.min(100, 50 + ret * 1.2))

  // 均线结构：真实计算
  const ma20 = sma(closes, 20)
  const ma60 = sma(closes, 60)
  const ma120 = sma(closes, 120)
  const base = lastClose ?? refPrice
  let maScore: number
  let maTrendLabel: string
  if (ma20 !== null && ma60 !== null) {
    if (base > ma20 && base > ma60 && (ma120 === null || base > ma120)) {
      maScore = 80
      maTrendLabel = '站上 MA20/60/120 全部均线，多头排列'
    } else if (base > ma20 && base > ma60) {
      maScore = 70
      maTrendLabel = '站上 MA20/60，长期均线附近'
    } else if (base > ma20) {
      maScore = 55
      maTrendLabel = '位于中期均线上方、长期均线下方'
    } else if (base > ma60) {
      maScore = 40
      maTrendLabel = '跌破 MA20，仍处 MA60 上方'
    } else {
      maScore = 22
      maTrendLabel = '跌破主要均线，趋势偏弱'
    }
  } else {
    maScore = t.maTrend === 'above_all' ? 80 : t.maTrend === 'above_mid' ? 55 : 25
    maTrendLabel =
      t.maTrend === 'above_all'
        ? '站上 MA20/60/200 全部均线（快照）'
        : t.maTrend === 'above_mid'
          ? '位于中期均线上方、长期均线附近（快照）'
          : '跌破主要均线，趋势偏弱（快照）'
  }

  const rsiVal = rsi(closes) ?? t.rsi14
  const rsiScore = Math.max(0, Math.min(100, rsiVal))
  const momentum = Math.round(0.5 * retScore + 0.3 * maScore + 0.2 * rsiScore)

  const volAnnual = annualVolatility(closes)
  const volatility = volLabel(volAnnual)

  // ---------- 估值：实时 PE-TTM / PB 优先 ----------
  const peLive = quote?.peTtm ?? null
  const pe = peLive ?? v.pe
  const pbLive = quote?.pb ?? null
  const pb = pbLive ?? v.pb

  let valuation = 50
  if (s.industry === '指数') {
    valuation = 50 // 指数无 PE/PB 口径 → 估值维度中性（不因缺失数据而惩罚）
  } else if (v.pePercentile !== null && peLive === null) {
    valuation = 100 - v.pePercentile // 快照分位（实时价 PE 无历史分位时用快照分位）
  } else if (pe !== null) {
    // 用 PE 绝对水平粗评 + 快照分位混合
    const absScore = pe <= 12 ? 85 : pe <= 20 ? 70 : pe <= 30 ? 55 : pe <= 45 ? 38 : pe <= 70 ? 25 : 12
    valuation = v.pePercentile !== null ? 0.5 * absScore + 0.5 * (100 - v.pePercentile) : absScore
  } else {
    valuation = 25 // 亏损无 PE
  }
  if (pe !== null && v.peerAvgPe > 0) {
    const rel = (pe - v.peerAvgPe) / v.peerAvgPe
    const relScore = Math.max(0, Math.min(100, 55 - rel * 60))
    valuation = 0.7 * valuation + 0.3 * relScore
  }
  valuation += Math.min(15, v.dividendYield * 3)
  if (pb > 8) valuation -= 8
  const valuationFinal = Math.max(2, Math.min(98, Math.round(valuation)))

  const profitGrowth = s.financials.profitGrowth
  const peg = pe !== null && profitGrowth > 0 ? +(pe / profitGrowth).toFixed(2) : null
  const peVsPeerPct =
    pe !== null && v.peerAvgPe > 0 ? +(((pe - v.peerAvgPe) / v.peerAvgPe) * 100).toFixed(1) : null

  const trendVerdict =
    momentum >= 70 ? '强势' : momentum >= 55 ? '中性偏强' : momentum >= 40 ? '中性' : momentum >= 25 ? '中性偏弱' : '弱势'

  const dataSource: QuantMetrics['dataSource'] =
    closes.length >= 60 ? (quote ? 'live' : 'mixed') : quote ? 'mixed' : 'snapshot'

  return {
    pe,
    pePercentile: v.pePercentile,
    pb,
    dividendYield: v.dividendYield,
    peg,
    peVsPeerPct,
    pos52w,
    momentum,
    valuation: valuationFinal,
    volatility,
    volatilityAnnualPct: volAnnual,
    rsi14: Math.round(rsiVal),
    maTrendLabel,
    trendVerdict,
    dataSource,
    changes: { m1, m3, m6, y1 },
    ma20: ma20 !== null ? +ma20.toFixed(2) : null,
    ma60: ma60 !== null ? +ma60.toFixed(2) : null,
    ma120: ma120 !== null ? +ma120.toFixed(2) : null,
  }
}
