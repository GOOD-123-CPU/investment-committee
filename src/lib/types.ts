// ============================================================
// 智投委 AI — 共享类型定义（前后端契约）
// ============================================================

export type VoteType = 'BUY' | 'HOLD' | 'SELL'
export type RatingType = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL'
export type RiskLevelType = 'Low' | 'Medium' | 'High' | 'Very High'

export type PipelineStatus =
  | 'queued'
  | 'planning'
  | 'collecting'
  | 'analyzing'
  | 'debating'
  | 'risk_review'
  | 'voting'
  | 'decision'
  | 'report'
  | 'completed'
  | 'failed'

export const PIPELINE_STEPS: { key: PipelineStatus; label: string; desc: string }[] = [
  { key: 'planning', label: '研究规划', desc: 'Research Planner 拆解研究任务' },
  { key: 'collecting', label: '数据采集', desc: '财务快照 + 实时新闻检索与验证' },
  { key: 'analyzing', label: '并行分析', desc: '基本面/行业/宏观/量化/舆情 5 Agent 并行' },
  { key: 'debating', label: 'Bull vs Bear 辩论', desc: '多空对抗 + 观点冲突检测' },
  { key: 'risk_review', label: '风险审查', desc: 'Risk Officer 独立风控审查' },
  { key: 'voting', label: '投委投票', desc: 'Investment Committee 加权投票' },
  { key: 'decision', label: 'CIO 裁决', desc: '首席投资官综合裁决' },
  { key: 'report', label: '生成报告', desc: '可解释投资研究报告' },
]

export interface EvidenceItem {
  claim: string
  value?: string
  source?: string
  confidence?: 'High' | 'Medium' | 'Low'
}

export interface NewsItem {
  title: string
  source: string
  date?: string
  url?: string
  sentiment?: 'positive' | 'negative' | 'neutral'
  summary?: string
}

export interface PlanMeta {
  intent: 'single' | 'comparison'
  question: string
  focus?: string
  stocks: { code: string; name: string; market: string }[]
  plan: string[]
  dataNote?: string
  news?: NewsItem[]
  newsSearchStatus?: 'ok' | 'empty' | 'failed'
  groupId?: string
  quote?: QuoteSnapshot | null
  /** 市场热词解析（易中天/茅指数等组合昵称 → 具体标的成员） */
  hotTerm?: {
    term: string
    note: string
    members: { code: string; name: string; market: string }[]
  }
  /** 市场黑话注释（股票黑话大词典命中：用户提问中的行话 → 白话解释） */
  slangTerms?: { term: string; meaning: string }[]
}

/** 行情快照（研究完成时点的实时数据存证） */
export interface QuoteSnapshot {
  price: number
  change: number
  changePct: number
  high: number
  low: number
  open: number
  prevClose: number
  volume: number
  amount: number
  turnoverRate: number | null
  peTtm: number | null
  pb: number | null
  marketCap: number | null
  high52w: number | null
  low52w: number | null
  time: string
  currency: string
}

// ---------- Session / Agent / Debate / Decision DTO ----------

export interface SessionDTO {
  id: string
  query: string
  intent: string
  groupId: string | null
  stockCode: string | null
  stockName: string | null
  market: string | null
  status: PipelineStatus
  currentStepLabel: string | null
  progress: number
  error: string | null
  meta: PlanMeta | null
  createdAt: string
  updatedAt: string
}

export interface AgentDTO {
  id: string
  sessionId: string
  agentKey:
    | 'fundamental'
    | 'industry'
    | 'macro'
    | 'quant'
    | 'sentiment'
    | 'risk'
    | 'bull'
    | 'bear'
    | 'conflict'
    | 'cio'
    | 'planner'
  agentName: string
  score: number | null
  vote: VoteType | null
  confidence: number | null
  summary: string | null
  highlights: string[] | null
  concerns: string[] | null
  evidence: EvidenceItem[] | null
  details: Record<string, unknown> | null
  durationMs: number | null
  createdAt: string
}

export interface DebateDTO {
  id: string
  sessionId: string
  round: number
  phase: 'opening' | 'rebuttal' | 'crossexam' | 'closing' | 'conflict' | 'risk'
  speakerKey: string
  speakerName: string
  stance: 'bull' | 'bear' | 'neutral' | 'risk'
  content: string
  createdAt: string
}

export interface ThesisNode {
  title: string
  points: string[]
}

export interface VoteRow {
  agentKey: string
  agentName: string
  vote: VoteType
  weight: number
}

export interface DecisionDTO {
  id: string
  sessionId: string
  initialScore: number
  riskPenalty: number
  finalScore: number
  rating: RatingType
  confidence: number
  positionMin: number
  positionMax: number
  horizon: string
  riskLevel: RiskLevelType
  voteSummary: VoteRow[] | null
  thesis: ThesisNode[] | null
  keyLogic: string[] | null
  keyRisks: string[] | null
  reportMd: string | null
  createdAt: string
}

export interface ResearchDetailDTO {
  session: SessionDTO
  agents: AgentDTO[]
  debates: DebateDTO[]
  decision: DecisionDTO | null
}

export interface SessionListItem {
  id: string
  query: string
  stockCode: string | null
  stockName: string | null
  market: string | null
  status: PipelineStatus
  intent: string
  groupId: string | null
  finalScore: number | null
  rating: string | null
  riskLevel: string | null
  createdAt: string
}

// ---------- 对比模式 ----------

export interface StockVerdictRow {
  stockName: string
  stockCode: string
  finalScore: number
  rating: string
  confidence: number
  strongest: string
  weakest: string
}

export interface ComparisonVerdict {
  winner: string
  summary: string
  dimensions: { name: string; better: string; reason: string }[]
  allocationSuggestion: string
  rows: StockVerdictRow[]
}

// ---------- 组合诊断 ----------

export interface HoldingInput {
  name: string
  weight: number
}

export interface PortfolioResult {
  riskLevel: RiskLevelType
  concentrationHHI: number
  concentrationLabel: string
  sectorExposure: { sector: string; weight: number; names: string[] }[]
  metrics: { name: string; value: string; level: 'good' | 'warn' | 'bad'; note: string }[]
  suggestions: { action: 'reduce' | 'increase' | 'hold' | 'watch'; name: string; reason: string }[]
  summary: string
}

// ---------- 股票数据（演示快照库） ----------

export interface StockProfile {
  code: string
  name: string
  /** 主体市场：SH/SZ/HK/US 为主；指数研究模式可扩展为 JP/EU/KR/TW 等全球市场标签 */
  market: 'SH' | 'SZ' | 'HK' | 'US' | (string & {})
  alias: string[]
  industry: string
  sector: string
  description: string
  currency: 'CNY' | 'HKD' | 'USD' | (string & {})
  price: number
  changePct: number
  marketCap: number // 亿（CNY口径）
  valuation: {
    pe: number | null
    pePercentile: number | null // 近5年分位 0-100
    pb: number
    dividendYield: number
    peerAvgPe: number
  }
  financials: {
    revenue: number // 亿元
    revenueGrowth: number // %
    netProfit: number // 亿元
    profitGrowth: number // %
    grossMargin: number // %
    netMargin: number // %
    roe: number // %
    debtRatio: number // %
    ocf: number // 经营现金流 亿元
  }
  history: {
    year: string
    revenue: number
    profit: number
    roe: number
  }[]
  technicals: {
    change1m: number
    change3m: number
    change6m: number
    change1y: number
    high52w: number
    low52w: number
    maTrend: 'above_all' | 'above_mid' | 'below_all'
    rsi14: number
    volatility: 'low' | 'medium' | 'high'
  }
  industryContext: {
    size: string
    growth: string
    stage: '导入期' | '成长期' | '成熟期' | '衰退期'
    concentration: string
    outlook: string
  }
  competitive: {
    rank: string
    marketShare: string
    moat: string[]
    competitors: { name: string; code: string }[]
  }
  risks: string[]
  catalysts: string[]
}

export interface MacroSnapshot {
  asOf: string
  gdpGrowth: string
  cpi: string
  ppi: string
  pmi: string
  lpr1y: string
  lpr5y: string
  socialFinancing: string
  retailSales: string
  exports: string
  policyTone: string
  marketEnv: string
  liquidity: string
  keyThemes: string[]
}
