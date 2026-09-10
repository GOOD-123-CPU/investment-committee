// ============================================================
// 智投委 AI — 客户端共享工具（语义色调 / 格式化 / Agent 元数据）
// 仅可被客户端组件导入（含 lucide 图标引用）
// ============================================================

import {
  ArrowDownRight,
  BarChart3,
  BrainCircuit,
  ClipboardList,
  Crown,
  Database,
  Factory,
  FileText,
  Gavel,
  Globe,
  Microscope,
  Newspaper,
  ShieldAlert,
  Sigma,
  Swords,
  TrendingDown,
  TrendingUp,
  Vote,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { PipelineStatus, VoteType } from '@/lib/types'

// ---------- 跨组件共享 DTO（轻量） ----------

export interface GroupSessionLite {
  id: string
  stockName: string | null
  stockCode: string | null
  status?: PipelineStatus
}

export interface WatchlistRow {
  id: string
  stockCode: string
  stockName: string
  aiScore: number | null
  rating: string | null
  riskLevel: string | null
  summary: string | null
  sessionId: string
  createdAt: string
}

export type OpenSessionFn = (id: string, group: GroupSessionLite[], groupId: string | null) => void

// ---------- 时间 / 数字格式化 ----------

export function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const s = Math.max(0, Math.floor(diff / 1000))
  if (s < 60) return '刚刚'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(t).toLocaleDateString('zh-CN')
}

export function formatPct(value: number, digits = 1, withSign = true): string {
  const v = Number.isFinite(value) ? value : 0
  const sign = withSign && v > 0 ? '+' : ''
  return `${sign}${v.toFixed(digits)}%`
}

export function formatYi(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return v >= 10000 ? `${(v / 10000).toFixed(2)} 万亿` : `${v.toLocaleString('zh-CN')} 亿`
}

export function currencySymbol(currency: string): string {
  return currency === 'HKD' ? 'HK$' : '¥'
}

/** 从 agent.details 中安全提取数字字段 */
export function detailNum(details: Record<string, unknown> | null, key: string): number | null {
  if (!details) return null
  const v = details[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// ---------- 语义色调（bull=emerald / bear=rose / hold=amber / risk=orange） ----------

export interface Tone {
  text: string
  badge: string
  bar: string
}

export function ratingTone(rating?: string | null): Tone {
  if (rating === 'STRONG BUY' || rating === 'BUY')
    return { text: 'text-bull', badge: 'border-bull/30 bg-bull/10 text-bull', bar: 'bg-bull' }
  if (rating === 'SELL' || rating === 'STRONG SELL')
    return { text: 'text-bear', badge: 'border-bear/30 bg-bear/10 text-bear', bar: 'bg-bear' }
  return { text: 'text-hold', badge: 'border-hold/30 bg-hold/10 text-hold', bar: 'bg-hold' }
}

export function voteTone(vote: VoteType): Tone {
  switch (vote) {
    case 'BUY':
      return { text: 'text-bull', badge: 'border-bull/30 bg-bull/10 text-bull', bar: 'bg-bull' }
    case 'SELL':
      return { text: 'text-bear', badge: 'border-bear/30 bg-bear/10 text-bear', bar: 'bg-bear' }
    default:
      return { text: 'text-hold', badge: 'border-hold/30 bg-hold/10 text-hold', bar: 'bg-hold' }
  }
}

export function riskTone(level?: string | null): Tone {
  switch (level) {
    case 'Low':
      return { text: 'text-bull', badge: 'border-bull/30 bg-bull/10 text-bull', bar: 'bg-bull' }
    case 'High':
      return { text: 'text-risk', badge: 'border-risk/30 bg-risk/10 text-risk', bar: 'bg-risk' }
    case 'Very High':
      return { text: 'text-bear', badge: 'border-bear/30 bg-bear/10 text-bear', bar: 'bg-bear' }
    default:
      return { text: 'text-hold', badge: 'border-hold/30 bg-hold/10 text-hold', bar: 'bg-hold' }
  }
}

export function confidenceTone(level?: string | null): string {
  switch (level) {
    case 'High':
      return 'border-bull/30 bg-bull/10 text-bull'
    case 'Medium':
      return 'border-hold/30 bg-hold/10 text-hold'
    case 'Low':
      return 'border-border bg-muted text-muted-foreground'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

/** 评分条颜色（0-100） */
export function scoreBarClass(v: number): string {
  if (v >= 70) return 'bg-bull'
  if (v >= 50) return 'bg-hold'
  if (v >= 30) return 'bg-risk'
  return 'bg-bear'
}

/** recharts 需要真实 CSS 颜色值 */
export function ratingVar(rating?: string | null): string {
  if (rating === 'STRONG BUY' || rating === 'BUY') return 'var(--bull)'
  if (rating === 'SELL' || rating === 'STRONG SELL') return 'var(--bear)'
  return 'var(--hold)'
}

export function ratingGradient(rating?: string | null): string {
  if (rating?.includes('BUY')) return 'from-bull to-gold'
  if (rating?.includes('SELL')) return 'from-bear to-risk'
  return 'from-hold to-gold'
}

// ---------- Pipeline 状态元数据 ----------

export function statusMeta(status: PipelineStatus): { label: string; running: boolean; className: string } {
  const runningCls = 'border-primary/30 bg-primary/10 text-primary'
  switch (status) {
    case 'completed':
      return { label: '已完成', running: false, className: 'border-bull/30 bg-bull/10 text-bull' }
    case 'failed':
      return { label: '失败', running: false, className: 'border-bear/30 bg-bear/10 text-bear' }
    case 'queued':
      return { label: '排队中', running: true, className: 'border-border bg-muted text-muted-foreground' }
    case 'planning':
      return { label: '研究规划中', running: true, className: runningCls }
    case 'collecting':
      return { label: '数据采集中', running: true, className: runningCls }
    case 'analyzing':
      return { label: 'Agent 分析中', running: true, className: runningCls }
    case 'debating':
      return { label: '多空辩论中', running: true, className: runningCls }
    case 'risk_review':
      return { label: '风控审查中', running: true, className: runningCls }
    case 'voting':
      return { label: '投委投票中', running: true, className: runningCls }
    case 'decision':
      return { label: 'CIO 裁决中', running: true, className: runningCls }
    case 'report':
      return { label: '撰写报告中', running: true, className: runningCls }
    default:
      return { label: status, running: false, className: 'border-border bg-muted text-muted-foreground' }
  }
}

// ---------- Agent / Pipeline 图标元数据 ----------

export const AGENT_META: Record<string, { label: string; icon: LucideIcon; accent: string }> = {
  fundamental: { label: '基本面分析师', icon: BarChart3, accent: 'bg-bull/10 text-bull' },
  industry: { label: '行业分析师', icon: Factory, accent: 'bg-gold/10 text-gold' },
  macro: { label: '宏观策略师', icon: Globe, accent: 'bg-risk/10 text-risk' },
  quant: { label: '量化分析师', icon: Sigma, accent: 'bg-primary/10 text-primary' },
  sentiment: { label: '舆情分析师', icon: Newspaper, accent: 'bg-hold/10 text-hold' },
  risk: { label: '首席风控官', icon: ShieldAlert, accent: 'bg-risk/10 text-risk' },
  bull: { label: '多方辩护人', icon: TrendingUp, accent: 'bg-bull/10 text-bull' },
  bear: { label: '空方辩护人', icon: TrendingDown, accent: 'bg-bear/10 text-bear' },
  conflict: { label: '冲突调解员', icon: Zap, accent: 'bg-hold/10 text-hold' },
  cio: { label: '首席投资官', icon: Crown, accent: 'bg-gold/10 text-gold' },
  planner: { label: '研究规划师', icon: ClipboardList, accent: 'bg-primary/10 text-primary' },
}

export const STEP_ICONS: Partial<Record<PipelineStatus, LucideIcon>> = {
  planning: ClipboardList,
  collecting: Database,
  analyzing: Microscope,
  debating: Swords,
  risk_review: ShieldAlert,
  voting: Vote,
  decision: Gavel,
  report: FileText,
}

export const AGENT_KEYS_MAIN = ['fundamental', 'industry', 'macro', 'quant', 'sentiment', 'risk'] as const

/** 七维评分权重标签（与后端约定一致） */
export const DIMENSION_WEIGHTS: { key: string; label: string; weight: number }[] = [
  { key: 'fundamental', label: '基本面', weight: 25 },
  { key: 'valuation', label: '估值', weight: 20 },
  { key: 'industry', label: '行业景气', weight: 15 },
  { key: 'macro', label: '宏观环境', weight: 10 },
  { key: 'momentum', label: '动量', weight: 10 },
  { key: 'sentiment', label: '舆情', weight: 10 },
  { key: 'risk', label: '风控', weight: 10 },
]

export const BRAIN_ICON = BrainCircuit
