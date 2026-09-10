import type { DecisionDTO, RiskLevelType, RatingType, ThesisNode, VoteRow, VoteType } from '@/lib/types'

/**
 * 投资评分系统（PRD 第 7/8/9 节）
 * 所有最终数字均由代码计算，CIO LLM 仅撰写叙述。
 */

const DIM_WEIGHTS = {
  fundamental: 0.25,
  valuation: 0.2, // quant.details.valuation
  industry: 0.15,
  macro: 0.1,
  momentum: 0.1, // quant.details.momentum
  sentiment: 0.1,
  risk: 0.1, // risk agent score（风险调整后吸引力）
} as const

const VOTE_WEIGHTS = {
  fundamental: 0.25,
  quant: 0.2,
  industry: 0.15,
  macro: 0.1,
  sentiment: 0.1,
  risk: 0.2,
} as const

export const VOTE_NUM: Record<VoteType, number> = { BUY: 1, HOLD: 0, SELL: -1 }

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function ratingFromScore(score: number): RatingType {
  if (score >= 85) return 'STRONG BUY'
  if (score >= 70) return 'BUY'
  if (score >= 50) return 'HOLD'
  if (score >= 30) return 'SELL'
  return 'STRONG SELL'
}

export interface ScoreInput {
  fundamental: number | null
  valuation: number | null
  industry: number | null
  macro: number | null
  momentum: number | null
  sentiment: number | null
  risk: number | null
  votes: { key: keyof typeof VOTE_WEIGHTS; vote: VoteType | null }[]
  riskPenalty: number
  riskLevel: RiskLevelType
}

export interface ScoreOutput {
  dimensionScores: Record<string, number | null>
  weightedDimensionScore: number
  voteScore: number
  initialScore: number
  riskPenalty: number
  finalScore: number
  rating: RatingType
  voteSummary: VoteRow[]
}

const VOTE_NAMES: Record<string, string> = {
  fundamental: '基本面分析师',
  industry: '行业分析师',
  macro: '宏观策略分析师',
  quant: '量化分析师',
  sentiment: '舆情分析师',
  risk: '首席风险官',
}

export function computeScore(input: ScoreInput): ScoreOutput {
  // 1) 维度加权分
  let dim = 0
  let dimW = 0
  for (const [k, w] of Object.entries(DIM_WEIGHTS)) {
    const v = input[k as keyof ScoreInput] as number | null
    if (typeof v === 'number' && Number.isFinite(v)) {
      dim += w * v
      dimW += w
    }
  }
  const dimScore = dimW > 0 ? dim / dimW : 50 // 缺失维度重归一化

  // 2) 投票分
  let voteSum = 0
  let voteW = 0
  const voteSummary: VoteRow[] = []
  for (const { key, vote } of input.votes) {
    const w = VOTE_WEIGHTS[key]
    if (vote) {
      voteSum += w * VOTE_NUM[vote]
      voteW += w
      voteSummary.push({ agentKey: key, agentName: VOTE_NAMES[key] ?? key, vote, weight: w })
    }
  }
  const voteScore = 50 + 28 * (voteW > 0 ? voteSum / voteW : 0)

  // 3) 合成
  const initial = Math.round(clamp(0.65 * dimScore + 0.35 * voteScore, 0, 100))

  // 4) 风险惩罚（Risk-first）
  const penalty = clamp(Math.round(input.riskPenalty), 0, 15)
  let finalScore = clamp(initial - penalty, 0, 100)

  // Risk Officer 否决/降级权
  let rating = ratingFromScore(finalScore)
  if (input.riskLevel === 'Very High' && (rating === 'BUY' || rating === 'STRONG BUY')) {
    finalScore = Math.min(finalScore, 69)
    rating = 'HOLD'
  } else if (input.riskLevel === 'High' && rating === 'STRONG BUY') {
    finalScore = Math.min(finalScore, 84)
    rating = 'BUY'
  }

  return {
    dimensionScores: {
      fundamental: input.fundamental,
      valuation: input.valuation,
      industry: input.industry,
      macro: input.macro,
      momentum: input.momentum,
      sentiment: input.sentiment,
      risk: input.risk,
    },
    weightedDimensionScore: Math.round(dimScore),
    voteScore: Math.round(voteScore),
    initialScore: initial,
    riskPenalty: penalty,
    finalScore,
    rating,
    voteSummary,
  }
}

/** 仓位建议（PRD 第 9 节）：Confidence × Risk Factor × Rating Base */
export function computePosition(
  rating: RatingType,
  confidence: number,
  riskLevel: RiskLevelType,
): { min: number; max: number } {
  const base: Record<RatingType, [number, number]> = {
    'STRONG BUY': [6, 10],
    BUY: [4, 7],
    HOLD: [1, 3],
    SELL: [0.5, 1.5],
    'STRONG SELL': [0, 0.5],
  }
  const rf: Record<RiskLevelType, number> = { Low: 1, Medium: 0.85, High: 0.6, 'Very High': 0.4 }
  const cf = clamp(confidence, 20, 95) / 100
  const [bmin, bmax] = base[rating]
  const round05 = (x: number) => Math.round(x * 2) / 2
  const min = Math.min(12, Math.max(0, round05(bmin * rf[riskLevel] * cf)))
  const max = Math.min(12, Math.max(min, round05(bmax * rf[riskLevel] * cf)))
  return { min, max }
}

/** 投票一致性 → 置信度调整 */
export function voteUnanimity(votes: VoteType[]): number {
  if (votes.length === 0) return 0.5
  const counts: Record<string, number> = {}
  for (const v of votes) counts[v] = (counts[v] ?? 0) + 1
  const maxShare = Math.max(...Object.values(counts)) / votes.length
  return maxShare
}

export function adjustConfidence(cioConfidence: number, votes: VoteType[]): number {
  const u = voteUnanimity(votes)
  const adj = u >= 0.8 ? 5 : u >= 0.6 ? 2 : u <= 0.4 ? -6 : 0
  return clamp(Math.round(cioConfidence + adj), 20, 96)
}

export interface DecisionBuildInput {
  score: ScoreOutput
  confidence: number
  horizon: string
  keyLogic: string[]
  keyRisks: string[]
  thesis: ThesisNode[]
  riskLevel: RiskLevelType
}

export function buildDecision(input: DecisionBuildInput): Omit<DecisionDTO, 'id' | 'sessionId' | 'createdAt'> {
  const { min, max } = computePosition(input.score.rating, input.confidence, input.riskLevel)
  return {
    initialScore: input.score.initialScore,
    riskPenalty: input.score.riskPenalty,
    finalScore: input.score.finalScore,
    rating: input.score.rating,
    confidence: input.confidence,
    positionMin: min,
    positionMax: max,
    horizon: input.horizon,
    riskLevel: input.riskLevel,
    voteSummary: input.score.voteSummary,
    thesis: input.thesis,
    keyLogic: input.keyLogic,
    keyRisks: input.keyRisks,
    reportMd: null,
  }
}
