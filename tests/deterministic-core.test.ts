import { describe, expect, test } from 'bun:test'
import { adjustConfidence, computePosition, computeScore, ratingFromScore, voteUnanimity } from '../src/lib/pipeline/scoring'
import { computeQuantMetrics } from '../src/lib/pipeline/quant'
import type { StockProfile } from '../src/lib/types'
import type { KlineBar, LiveQuote } from '../src/lib/data/quotes'

const baseStock: StockProfile = {
  code: 'TEST',
  name: 'Test Co',
  market: 'US',
  alias: [],
  industry: 'Software',
  sector: 'Technology',
  description: 'deterministic test fixture',
  currency: 'USD',
  price: 100,
  changePct: 0,
  marketCap: 1000,
  valuation: {
    pe: 20,
    pePercentile: 40,
    pb: 3,
    dividendYield: 1,
    peerAvgPe: 25,
  },
  financials: {
    revenue: 100,
    revenueGrowth: 10,
    netProfit: 20,
    profitGrowth: 15,
    grossMargin: 50,
    netMargin: 20,
    roe: 18,
    debtRatio: 25,
    ocf: 25,
  },
  history: [],
  technicals: {
    change1m: 2,
    change3m: 5,
    change6m: 8,
    change1y: 12,
    high52w: 120,
    low52w: 80,
    maTrend: 'above_mid',
    rsi14: 55,
    volatility: 'medium',
  },
  industryContext: {
    size: 'large',
    growth: 'moderate',
    stage: '成熟期',
    concentration: 'medium',
    outlook: 'stable',
  },
  competitive: {
    rank: 'top tier',
    marketShare: '10%',
    moat: ['brand'],
    competitors: [],
  },
  risks: [],
  catalysts: [],
}

function risingKline(count = 130): KlineBar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = 80 + i * 0.25
    return {
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + i,
    }
  })
}

const liveQuote: LiveQuote = {
  symbol: 'usTEST',
  code: 'TEST',
  name: 'Test Co',
  price: 115,
  change: 1,
  changePct: 0.88,
  open: 114,
  prevClose: 114,
  high: 116,
  low: 113,
  volume: 100000,
  amount: 1000000,
  turnoverRate: 1.2,
  peTtm: 18,
  pb: 2.5,
  high52w: 118,
  low52w: 75,
  marketCap: 1100,
  floatCap: 900,
  currency: 'USD',
  time: '2026-09-24 10:00:00',
  isIndex: false,
  source: 'tencent',
}

describe('deterministic scoring core', () => {
  test('rating thresholds are stable at boundaries', () => {
    expect(ratingFromScore(85)).toBe('STRONG BUY')
    expect(ratingFromScore(84)).toBe('BUY')
    expect(ratingFromScore(70)).toBe('BUY')
    expect(ratingFromScore(50)).toBe('HOLD')
    expect(ratingFromScore(30)).toBe('SELL')
    expect(ratingFromScore(29)).toBe('STRONG SELL')
  })

  test('missing dimensions are renormalized instead of treated as zero', () => {
    const score = computeScore({
      fundamental: 80,
      valuation: null,
      industry: null,
      macro: null,
      momentum: null,
      sentiment: null,
      risk: null,
      votes: [],
      riskPenalty: 0,
      riskLevel: 'Low',
    })
    expect(score.weightedDimensionScore).toBe(80)
  })

  test('very-high risk veto prevents a buy rating', () => {
    const score = computeScore({
      fundamental: 100,
      valuation: 100,
      industry: 100,
      macro: 100,
      momentum: 100,
      sentiment: 100,
      risk: 100,
      votes: [
        { key: 'fundamental', vote: 'BUY' },
        { key: 'quant', vote: 'BUY' },
        { key: 'industry', vote: 'BUY' },
        { key: 'macro', vote: 'BUY' },
        { key: 'sentiment', vote: 'BUY' },
        { key: 'risk', vote: 'BUY' },
      ],
      riskPenalty: 0,
      riskLevel: 'Very High',
    })
    expect(score.finalScore).toBe(69)
    expect(score.rating).toBe('HOLD')
  })

  test('risk penalty is clamped to the documented 0..15 range', () => {
    const score = computeScore({
      fundamental: 70,
      valuation: 70,
      industry: 70,
      macro: 70,
      momentum: 70,
      sentiment: 70,
      risk: 70,
      votes: [],
      riskPenalty: 999,
      riskLevel: 'Low',
    })
    expect(score.riskPenalty).toBe(15)
  })

  test('position sizing remains bounded and respects risk factor', () => {
    const lowRisk = computePosition('BUY', 90, 'Low')
    const veryHighRisk = computePosition('BUY', 90, 'Very High')
    expect(lowRisk.max).toBeLessThanOrEqual(12)
    expect(veryHighRisk.max).toBeLessThan(lowRisk.max)
    expect(veryHighRisk.min).toBeGreaterThanOrEqual(0)
  })

  test('vote unanimity drives bounded confidence adjustment', () => {
    expect(voteUnanimity(['BUY', 'BUY', 'BUY'])).toBe(1)
    expect(adjustConfidence(93, ['BUY', 'BUY', 'BUY'])).toBe(96)
    expect(adjustConfidence(10, ['BUY', 'HOLD', 'SELL'])).toBe(20)
  })
})

describe('deterministic quant layer', () => {
  test('snapshot-only calculation is finite and bounded', () => {
    const q = computeQuantMetrics(baseStock)
    expect(q.dataSource).toBe('snapshot')
    expect(q.valuation).toBeGreaterThanOrEqual(2)
    expect(q.valuation).toBeLessThanOrEqual(98)
    expect(q.momentum).toBeGreaterThanOrEqual(0)
    expect(q.momentum).toBeLessThanOrEqual(100)
    expect(q.pe).toBe(20)
    expect(q.pb).toBe(3)
  })

  test('live quote owns PE/PB truth over snapshot values', () => {
    const q = computeQuantMetrics(baseStock, { quote: liveQuote, kline: risingKline() })
    expect(q.pe).toBe(18)
    expect(q.pb).toBe(2.5)
    expect(q.dataSource).toBe('live')
    expect(q.ma20).not.toBeNull()
    expect(q.ma60).not.toBeNull()
    expect(q.ma120).not.toBeNull()
  })

  test('long rising series produces finite technical metrics', () => {
    const q = computeQuantMetrics(baseStock, { quote: liveQuote, kline: risingKline() })
    expect(Number.isFinite(q.rsi14)).toBe(true)
    expect(q.rsi14).toBeGreaterThanOrEqual(0)
    expect(q.rsi14).toBeLessThanOrEqual(100)
    expect(q.volatilityAnnualPct).not.toBeNull()
    expect(q.pos52w).toBeGreaterThanOrEqual(0)
    expect(q.pos52w).toBeLessThanOrEqual(100)
  })
})
