import type { EvidenceItem, MacroSnapshot, NewsItem, StockProfile, VoteType } from '@/lib/types'
import { chatJSON, chatText, tryChatJSON, type LLMProvider } from '@/lib/ai/llm'
import type { KlineBar, LiveQuote } from '@/lib/data/quotes'
import type { QuantMetrics } from './quant'
import { SLANG_TERMS_COUNT } from '@/lib/data/slang-dictionary'

/**
 * Agent 定义（提示词 + 结构化输出）
 * 规则：财务数字只来自数据包，LLM 不生成任何数字类事实；无数据 → Data unavailable
 */

export interface DataPack {
  stock: StockProfile | null
  stockName: string
  stockCode: string | null
  market: string | null
  macro: MacroSnapshot
  news: NewsItem[]
  newsSearchStatus: 'ok' | 'empty' | 'failed'
  /** 财务线索（快照库未收录标的的真实检索结果，引用时必须标注来源） */
  financialClues?: NewsItem[]
  /** 市场热词解析上下文（易中天/茅指数等）：由确定性词典生成，注入给全部 Agent 防止误解 */
  hotTermNote?: string
  /** 市场黑话注释（股票黑话大词典命中）：行话白话解释，注入给全部 Agent 保证理解一致 */
  slangNote?: string
  /** 指数知识块（《全球指数大全》命中）：指数定义/层级关系/实时源说明 */
  indexNote?: string
  /** 热门标的快照库身份（limited 模式下的行业/收录标签） */
  universeNote?: string
  question: string
  focus?: string
  quant?: QuantMetrics
  live?: { quote: LiveQuote | null; kline: KlineBar[] } | null
}

export interface AgentOutput {
  score: number | null
  vote: VoteType | null
  confidence: number | null
  summary: string
  highlights: string[]
  concerns: string[]
  evidence: EvidenceItem[]
  details?: Record<string, unknown>
}

const JSON_RULE =
  '只输出一个合法 JSON 对象（UTF-8 中文），不要 markdown 围栏，不要解释文字。'

const AGENT_BASE_RULE = `你是专业基金公司的资深分析师。遵守：
1) 所有数字类事实只能引用【数据包】中给出的数据，禁止编造或凭记忆生成数字。
2) 数据包中没有的数据，写 "Data unavailable"，不得猜测。
3) 结论必须可解释：每个判断都能对应数据包中的证据。
4) 语言精炼、专业，中文输出。${JSON_RULE}`

/** 实时行情块：腾讯行情接口的真实数据，注入给每个 Agent（数据可信度机制） */
function liveBlock(p: DataPack): string {
  const live = p.live
  if (!live) return ''
  const q = live.quote
  if (!q) return ''
  const klineTail = (live.kline ?? []).slice(-10).map((b) => `${b.date} O${b.open} H${b.high} L${b.low} C${b.close}`)
  const ma = p.quant
  return `\n【实时行情（数据源：腾讯财经，采集时间 ${q.time}）】
${JSON.stringify(
    {
      现价: q.price,
      涨跌: `${q.change > 0 ? '+' : ''}${q.change}（${q.changePct > 0 ? '+' : ''}${q.changePct}%）`,
      今开: q.open,
      昨收: q.prevClose,
      最高_最低: `${q.high}/${q.low}`,
      成交量_手: q.volume,
      成交额_万: q.amount,
      换手率: q.turnoverRate !== null ? `${q.turnoverRate}%` : null,
      市盈率TTM: q.peTtm,
      市净率: q.pb,
      总市值_亿: q.marketCap,
      '52周高_低': q.high52w && q.low52w ? `${q.high52w}/${q.low52w}` : null,
      量化引擎_真实K线计算: ma
        ? {
            数据源: ma.dataSource === 'live' ? '真实日K线' : '混合',
            RSI14: ma.rsi14,
            MA20: ma.ma20,
            MA60: ma.ma60,
            近1月涨跌: ma.changes.m1,
            近3月涨跌: ma.changes.m3,
            近6月涨跌: ma.changes.m6,
            近1年涨跌: ma.changes.y1,
            年化波动率: ma.volatilityAnnualPct,
            '52周位置': `${ma.pos52w}/100`,
          }
        : null,
      近10个交易日K线: klineTail,
      可信度说明: '本块数据为行情接口实时采集，可放心引用；与快照库冲突时以本块为准。',
    },
    null,
    1,
  )}`
}

/** 财务线索块：真实检索到的营收/利润/估值线索（来源可查，非编造） */
function clueBlock(p: DataPack): string {
  const clues = p.financialClues ?? []
  if (clues.length === 0) return ''
  return `\n【财务线索（web_search 真实检索结果）】${JSON.stringify(
    clues.map((c) => ({ 线索: c.title, 来源: c.source, 日期: c.date ?? '', 摘要: c.summary ?? '' })),
    null,
    1,
  )}\n（以上为可引用的真实检索线索，引用时标注“新闻来源数据”）`
}

function stockBlock(p: DataPack): string {
  if (!p.stock) {
    return `【公司财务数据】快照库未收录该标的完整财务档案。${
      p.universeNote ? `${p.universeNote}\n` : ''
    }${clueBlock(p)}\n除上述检索线索外，其余财务数字 Data unavailable：仅可依据实时行情、检索线索与行业常识做定性判断，禁止编造快照之外的财务数字；引用线索数字必须注明“新闻来源数据”。`
  }
  const s = p.stock
  // 指数研究模式：无公司财务口径，估值/财务段位替换为指数说明（避免 0 值误导）
  if (s.industry === '指数') {
    return JSON.stringify(
      {
        研究对象类型: '股票指数（非公司，无 PE/营收/利润等公司财务口径）',
        指数概况: s.description,
        展示市场: `${s.market} / ${s.currency}`,
        点位与走势: '以【实时行情】块的指数点位/涨跌/真实K线为准',
        分析要求: '围绕指数点位位置、趋势结构、成分风格、宏观与资金面、历史波动展开；禁止引用公司财务数据；估值/盈利维度写 Data unavailable 或跳过。',
      },
      null,
      1,
    )
  }
  return JSON.stringify(
    {
      公司概况: s.description,
      行业: s.industry,
      市场与币种: `${s.market} / ${s.currency}`,
      现价: s.price,
      当日涨跌: `${s.changePct}%`,
      总市值: `${s.marketCap} 亿(CNY口径)`,
      估值: {
        PE: s.valuation.pe,
        PE_5年分位: s.valuation.pePercentile !== null ? `${s.valuation.pePercentile}%` : '亏损无意义',
        PB: s.valuation.pb,
        股息率: `${s.valuation.dividendYield}%`,
        同业平均PE: s.valuation.peerAvgPe,
      },
      财务_最新年度: {
        营收: `${s.financials.revenue} 亿`,
        营收增速: `${s.financials.revenueGrowth}%`,
        归母净利: `${s.financials.netProfit} 亿`,
        净利增速: `${s.financials.profitGrowth}%`,
        毛利率: `${s.financials.grossMargin}%`,
        净利率: `${s.financials.netMargin}%`,
        ROE: `${s.financials.roe}%`,
        资产负债率: `${s.financials.debtRatio}%`,
        经营现金流: `${s.financials.ocf} 亿`,
      },
      近三年趋势: s.history,
      技术面: {
        近1月: `${s.technicals.change1m}%`,
        近3月: `${s.technicals.change3m}%`,
        近6月: `${s.technicals.change6m}%`,
        近1年: `${s.technicals.change1y}%`,
        '52周高/低': `${s.technicals.high52w}/${s.technicals.low52w}`,
        均线状态: s.technicals.maTrend,
        RSI14: s.technicals.rsi14,
        波动性: s.technicals.volatility,
      },
      行业背景: s.industryContext,
      竞争地位: s.competitive,
      已知风险: s.risks,
      潜在催化: s.catalysts,
      数据来源说明: '公司 2024 年年度报告及 2025Q3 季报演示快照库（近似值）',
    },
    null,
    1,
  )
}

/** 组合数据包文本：基础块 + 实时行情块 */
function packBlock(p: DataPack): string {
  return `${stockBlock(p)}${liveBlock(p)}`
}

function macroBlock(p: DataPack): string {
  return JSON.stringify({ 宏观快照: p.macro, 快照说明: '公开宏观数据整理的演示快照' }, null, 1)
}

function newsBlock(p: DataPack): string {
  if (p.news.length === 0) {
    return `【实时新闻】${
      p.newsSearchStatus === 'failed' ? '检索失败' : '未检索到结果'
    }。请基于已有定性信息分析，并在 evidence 中注明 Data unavailable。`
  }
  return JSON.stringify(
    {
      实时新闻: p.news.map((n) => ({ 标题: n.title, 来源: n.source, 日期: n.date ?? '', 摘要: n.summary ?? '' })),
      来源说明: '实时网络检索结果（web_search）',
    },
    null,
    1,
  )
}

function questionBlock(p: DataPack): string {
  return `【研究任务】用户问题："${p.question}"${p.focus ? `（重点关注：${p.focus}）` : ''} 研究对象：${p.stockName}${
    p.stockCode ? `(${p.stockCode})` : ''
  }${p.hotTermNote ? `\n【热词解析——必须遵守】${p.hotTermNote}` : ''}${
    p.slangNote
      ? `\n【市场黑话注释——系统内置 ${SLANG_TERMS_COUNT} 条词典自动匹配】${p.slangNote}`
      : ''
  }${p.indexNote ? `\n【指数知识库——《全球指数大全》】${p.indexNote}` : ''}`
}

// ---------- 通用输出解析 ----------

function parseAgentOutput(raw: Record<string, unknown>, fallbackName: string): AgentOutput {
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim()).slice(0, 5) : []
  const voteRaw = typeof raw.vote === 'string' ? raw.vote.toUpperCase() : ''
  const vote: VoteType | null = ['BUY', 'HOLD', 'SELL'].includes(voteRaw) ? (voteRaw as VoteType) : null
  const evRaw = Array.isArray(raw.evidence) ? raw.evidence : []
  const evidence: EvidenceItem[] = []
  for (const e of evRaw) {
    if (typeof e !== 'object' || e === null) continue
    const o = e as Record<string, unknown>
    const claim = String(o.claim ?? o.论点 ?? '').slice(0, 120)
    if (!claim) continue
    const conf = o.confidence
    evidence.push({
      claim,
      value: o.value !== undefined ? String(o.value).slice(0, 60) : undefined,
      source: o.source !== undefined ? String(o.source).slice(0, 80) : undefined,
      confidence: conf === 'High' || conf === 'Medium' || conf === 'Low' ? conf : undefined,
    })
  }
  evidence.splice(4)

  const score = num(raw.score)
  return {
    score: score !== null ? Math.max(0, Math.min(100, score)) : null,
    vote,
    confidence: num(raw.confidence),
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 300) : `${fallbackName}分析完成`,
    highlights: strArr(raw.highlights),
    concerns: strArr(raw.concerns),
    evidence,
    details: typeof raw.details === 'object' && raw.details !== null ? (raw.details as Record<string, unknown>) : undefined,
  }
}

async function runAgent<T extends Record<string, unknown>>(
  system: string,
  user: string,
  fallback: (e: Error) => AgentOutput,
  timeoutMs = 120_000,
  provider: LLMProvider = 'zai',
): Promise<{ output: AgentOutput; raw: T | null; error: Error | null }> {
  try {
    const parsed = await chatJSON<T>(system, user, timeoutMs, provider)
    const out = parseAgentOutput(parsed as Record<string, unknown>, fallback(new Error('parse')).summary)
    return { output: out, raw: parsed, error: null }
  } catch (e) {
    return { output: fallback(e instanceof Error ? e : new Error('agent failed')), raw: null, error: e instanceof Error ? e : new Error('agent failed') }
  }
}

function neutralFallback(summary: string): AgentOutput {
  return { score: null, vote: 'HOLD', confidence: null, summary, highlights: [], concerns: [], evidence: [] }
}

// ---------- 5 个分析 Agent ----------

export async function fundamentalAgent(p: DataPack) {
  const system = `${AGENT_BASE_RULE}

你的角色：基本面分析师（Fundamental Analyst）。研究公司经营质量：营收与利润增长、毛利率/净利率、ROE、现金流质量、资产负债表健康度、盈利稳定性与趋势。

输出 JSON 字段：
{"score": 0-100 基本面质量分, "vote": "BUY|HOLD|SELL", "confidence": 0-100, "summary": "≤80字核心结论", "highlights": ["3-4条主要优势"], "concerns": ["2-3条主要风险"], "evidence": [{"claim":"论点","value":"数据如 ROE 34.7%","source":"来源","confidence":"High|Medium|Low"}], "details": {"quality":"盈利质量一句话","growth":"成长性一句话"}}`
  const user = `${questionBlock(p)}\n\n${packBlock(p)}\n\n${newsBlock(p)}`
  return runAgent(system, user, () => neutralFallback('基本面分析生成失败，已降级处理'))
}

export async function industryAgent(p: DataPack) {
  const system = `${AGENT_BASE_RULE}

你的角色：行业分析师（Industry Analyst）。研究行业空间与增速、所处生命周期、竞争格局与集中度、公司行业地位与护城河、上下游关系。

输出 JSON 字段：
{"score": 0-100 行业与竞争地位分, "vote": "BUY|HOLD|SELL", "confidence": 0-100, "summary": "≤80字核心结论（含行业景气度判断）", "highlights": ["3-4条"], "concerns": ["2-3条"], "evidence": [{"claim","value","source","confidence"}], "details": {"景气度":"如 中性偏弱","行业地位":"如 行业Top3","核心壁垒":"如 品牌+渠道"}}`
  const user = `${questionBlock(p)}\n\n${packBlock(p)}\n\n${newsBlock(p)}`
  return runAgent(system, user, () => neutralFallback('行业分析生成失败，已降级处理'))
}

export async function macroAgent(p: DataPack) {
  const system = `${AGENT_BASE_RULE}

你的角色：宏观策略分析师（Macro Analyst）。基于宏观快照判断当前环境（Risk On / Neutral / Risk Off），以及宏观因素对该公司的传导路径（利率、流动性、消费、政策、汇率、行业政策）。

输出 JSON 字段：
{"score": 0-100 宏观环境对该股友好度, "vote": "BUY|HOLD|SELL", "confidence": 0-100, "summary": "≤80字核心结论（含环境判断）", "highlights": ["利好因素2-3条"], "concerns": ["利空因素2-3条"], "evidence": [{"claim","value","source","confidence"}], "details": {"环境":"Risk On|Neutral|Risk Off","传导":"一句话传导路径"}}`
  const user = `${questionBlock(p)}\n\n${macroBlock(p)}\n\n${packBlock(p)}\n\n${newsBlock(p)}`
  return runAgent(system, user, () => neutralFallback('宏观分析生成失败，已降级处理'))
}

export async function quantAgent(p: DataPack, q: QuantMetrics) {
  const system = `${AGENT_BASE_RULE}

你的角色：量化分析师（Quant Analyst）。下面给出【代码计算的量化指标】（这些数字是权威的，直接引用，不要修改）：估值吸引力分、动量分、PE/PE分位、PEG、52周位置、RSI、均线状态。你的任务是解读这些指标并给出估值与技术面结论。

输出 JSON 字段：
{"score": 0-100 量化综合分（估值与动量结合）, "vote": "BUY|HOLD|SELL", "confidence": 0-100, "summary": "≤80字（含估值水平与技术趋势判断）", "highlights": ["2-4条"], "concerns": ["2-3条"], "evidence": [{"claim","value","source","confidence"}], "details": {"valuation": <直接引用估值吸引力分>, "momentum": <直接引用动量分>, "估值水平":"偏高|合理|偏低", "技术趋势":"如 中性偏强"}}`
  const user = `${questionBlock(p)}

【代码计算的量化指标（权威数据，直接引用）】
${JSON.stringify({ ...q, 均线状态: q.maTrendLabel, 趋势判定: q.trendVerdict }, null, 1)}

${packBlock(p)}`
  const run = await runAgent<{ details?: Record<string, unknown> }>(
    system,
    user,
    () => neutralFallback('量化分析生成失败，已降级处理'),
  )
  // 权威数值回填：valuation/momentum 强制使用代码计算值
  if (run.output.details) {
    run.output.details.valuation = q.valuation
    run.output.details.momentum = q.momentum
  } else if (run.raw) {
    run.output.details = { ...(run.raw.details ?? {}), valuation: q.valuation, momentum: q.momentum }
  }
  return run
}

export async function sentimentAgent(p: DataPack) {
  const system = `${AGENT_BASE_RULE}

你的角色：新闻与舆情分析师（News & Sentiment Analyst）。基于【实时新闻】判断近期事件的情绪倾向（正面/中性/负面）、识别关键事件（业绩、政策、产品、风险事件），给出舆情面结论。

输出 JSON 字段：
{"score": 0-100 舆情面得分, "vote": "BUY|HOLD|SELL", "confidence": 0-100, "summary": "≤80字（概括近期新闻主线与情绪）", "highlights": ["正面事件2-3条"], "concerns": ["负面/风险事件2-3条"], "evidence": [{"claim":"事件","value":"情绪:正面","source":"新闻来源域名","confidence":"High|Medium|Low"}], "details": {"正面事件数": <int>, "负面事件数": <int>, "情绪倾向":"正面|中性|负面"}}`
  const user = `${questionBlock(p)}\n\n${newsBlock(p)}\n\n${packBlock(p)}`
  return runAgent(system, user, () => neutralFallback('舆情分析生成失败，已降级处理'))
}

// ---------- 辩论 Agent ----------

export interface DebateTurn {
  content: string
}

/** 辩论/风控/CIO 共用 mimo 深度推理通道（异构多模型：不同 Agent 用不同模型，降低同源偏见） */
const DEBATE_PROVIDER: LLMProvider = 'mimo'

export async function bullOpening(p: DataPack, agentSummaries: string): Promise<DebateTurn> {
  const text = await tryChatJSON<{ content?: string }>(
    `你是投委会中的多头代表（Bull Agent）。基于各分析师的核心观点，提炼"为什么值得投资"的最强论证。150字以内，直接引用分析师给出的数据/论据，语气有力但不夸大。${JSON_RULE}
输出 {"content": "论证内容"}`,
    `研究标的：${p.stockName}${liveBlock(p)}\n\n各分析师观点：\n${agentSummaries}`,
    180_000,
    DEBATE_PROVIDER,
  )
  return { content: text?.content ?? `基于当前分析师观点，${p.stockName}具备配置价值：基本面与行业地位提供支撑，关键在于估值与风险约束下的参与方式。` }
}

export async function bearOpening(p: DataPack, agentSummaries: string): Promise<DebateTurn> {
  const text = await tryChatJSON<{ content?: string }>(
    `你是投委会中的空头代表（Bear Agent）。基于各分析师的核心观点，提炼"为什么不值得投资/最需要警惕什么"的最强论证。150字以内，直接引用分析师给出的数据/论据，尖锐但专业。${JSON_RULE}
输出 {"content": "论证内容"}`,
    `研究标的：${p.stockName}${liveBlock(p)}\n\n各分析师观点：\n${agentSummaries}`,
    180_000,
    DEBATE_PROVIDER,
  )
  return { content: text?.content ?? `${p.stockName}当前存在明确制约：估值与风险因素的负面约束不容忽视，需警惕下修风险。` }
}

export async function bullRebuttal(p: DataPack, bearArg: string): Promise<DebateTurn> {
  const text = await tryChatJSON<{ content?: string }>(
    `你是多头代表（Bull Agent），这是第 2 轮反驳。请针对空头立论进行反驳（130字以内）。用数据说话，指出空头论点中被忽视的积极因素或过度悲观的假设，至少引用 2 个数据包中的具体数字。${JSON_RULE}
输出 {"content": "反驳内容"}`,
    `研究标的：${p.stockName}${liveBlock(p)}\n\n空头立论：${bearArg}`,
    180_000,
    DEBATE_PROVIDER,
  )
  return { content: text?.content ?? '空头担忧已在估值中较充分反映，边际改善的期权价值被低估。' }
}

export async function bearRebuttal(p: DataPack, bullArg: string): Promise<DebateTurn> {
  const text = await tryChatJSON<{ content?: string }>(
    `你是空头代表（Bear Agent），这是第 2 轮反驳。请针对多头立论进行反驳（130字以内）。指出多头论点的薄弱假设、兑现门槛与下行风险，至少引用 2 个数据包中的具体数字。${JSON_RULE}
输出 {"content": "反驳内容"}`,
    `研究标的：${p.stockName}${liveBlock(p)}\n\n多头立论：${bullArg}`,
    180_000,
    DEBATE_PROVIDER,
  )
  return { content: text?.content ?? '多头叙事的兑现需要多重假设同时成立，赔率与胜率均不占优。' }
}

/** 第 3 轮：交叉质证 — 双方各亮出对方论证链中最薄弱的一环，并用量化数据攻击 */
export async function bullCrossAttack(p: DataPack, bearOpening: string, bearRebuttal: string): Promise<DebateTurn> {
  const text = await tryChatJSON<{ content?: string }>(
    `你是多头代表（Bull Agent），第 3 轮交叉质证。请从空头两轮发言中找出【最薄弱的一个论点】（内部矛盾/数据误读/假设站不住），进行定点攻击（130字以内）。要求：先指出对方的具体说法，再用数据包中的量化数据（估值/动量/RSI/行情）反驳，逻辑必须闭环。${JSON_RULE}
输出 {"content": "质证内容"}`,
    `研究标的：${p.stockName}${liveBlock(p)}\n\n空头第1轮立论：${bearOpening}\n\n空头第2轮反驳：${bearRebuttal}`,
    180_000,
    DEBATE_PROVIDER,
  )
  return { content: text?.content ?? '空头论证对边际变化的敏感度过高，忽视了量化指标显示的赔率改善。' }
}

export async function bearCrossAttack(p: DataPack, bullOpening: string, bullRebuttal: string): Promise<DebateTurn> {
  const text = await tryChatJSON<{ content?: string }>(
    `你是空头代表（Bear Agent），第 3 轮交叉质证。请从多头两轮发言中找出【最薄弱的一个论点】（内部矛盾/数据误读/假设站不住），进行定点攻击（130字以内）。要求：先指出对方的具体说法，再用数据包中的量化数据（估值/波动率/52周位置/技术面）反驳，逻辑必须闭环。${JSON_RULE}
输出 {"content": "质证内容"}`,
    `研究标的：${p.stockName}${liveBlock(p)}\n\n多头第1轮立论：${bullOpening}\n\n多头第2轮反驳：${bullRebuttal}`,
    180_000,
    DEBATE_PROVIDER,
  )
  return { content: text?.content ?? '多头论证依赖乐观假设的叠加，量化指标尚未给出趋势与估值的共振确认。' }
}

/** 第 4 轮：结辩陈词 — 各自总结全场最强论据链，面向投委做最后陈述 */
export async function bullClosingArg(p: DataPack, fullDebate: string): Promise<DebateTurn> {
  const text = await tryChatJSON<{ content?: string }>(
    `你是多头代表（Bull Agent），第 4 轮结辩陈词。请面向投委会做最后陈述（140字以内）：提炼全场辩论中你方站得住的最强论据链（基本面→估值/技术面→催化），正面回应对方最强攻击后收尾，给出明确的"为什么现在值得配置"。${JSON_RULE}
输出 {"content": "结辩陈词"}`,
    `研究标的：${p.stockName}${liveBlock(p)}\n\n【全场辩论纪要】\n${fullDebate}`,
    180_000,
    DEBATE_PROVIDER,
  )
  return { content: text?.content ?? '综合基本面支撑与估值赔率，当前风险收益比值得投委会给予配置机会。' }
}

export async function bearClosingArg(p: DataPack, fullDebate: string): Promise<DebateTurn> {
  const text = await tryChatJSON<{ content?: string }>(
    `你是空头代表（Bear Agent），第 4 轮结辩陈词。请面向投委会做最后陈述（140字以内）：提炼全场辩论中你方站得住的最强论据链（估值/风险/技术面→下行情形），正面回应对方最强攻击后收尾，给出明确的"为什么此刻应该谨慎"。${JSON_RULE}
输出 {"content": "结辩陈词"}`,
    `研究标的：${p.stockName}${liveBlock(p)}\n\n【全场辩论纪要】\n${fullDebate}`,
    180_000,
    DEBATE_PROVIDER,
  )
  return { content: text?.content ?? '在估值约束与下行风险未解除前，纪律比叙事更重要，建议等待更好的介入点。' }
}

export async function conflictResolution(
  p: DataPack,
  agentA: string,
  voteA: string,
  argA: string,
  agentB: string,
  voteB: string,
  argB: string,
): Promise<DebateTurn[]> {
  const res = await tryChatJSON<{ a?: string; b?: string }>(
    `投委会检测到两位分析师观点严重冲突，请分别以两位分析师的第一人称口吻进行一轮针对性再论证（各110字以内，直接交锋，引用数据）。${JSON_RULE}
输出 {"a": "${agentA}的再论证", "b": "${agentB}的再论证"}`,
    `研究标的：${p.stockName}${liveBlock(p)}\n\n${agentA}（投票${voteA}）：${argA}\n\n${agentB}（投票${voteB}）：${argB}`,
    180_000,
    DEBATE_PROVIDER,
  )
  return [
    { content: res?.a ?? `${agentA}维持原有判断：核心支撑因素未被证伪。` },
    { content: res?.b ?? `${agentB}维持原有判断：风险约束仍然成立。` },
  ]
}

// ---------- Risk Officer ----------

export interface RiskOutput extends AgentOutput {
  riskLevel: RiskLevelOut
  riskPenalty: number
  topRisks: string[]
}

type RiskLevelOut = 'Low' | 'Medium' | 'High' | 'Very High'

export async function riskAgent(p: DataPack, agentSummaries: string, debateSummary: string) {
  const system = `${AGENT_BASE_RULE}

你的角色：首席风险官（Risk Officer / CRO）。你的任务不是证明股票值得买，而是尽可能找出投资逻辑的问题：财务异常、盈利质量、债务、政策、行业、估值、黑天鹅、以及各 Agent 之间的观点冲突。你拥有"风险惩罚分"（0-15 分，用于下调最终评分）与风险定级权。

输出 JSON 字段：
{"score": 0-100 风险调整后吸引力分（越高=风险状况越好）, "vote": "BUY|HOLD|SELL", "confidence": 0-100, "riskLevel": "Low|Medium|High|Very High", "riskPenalty": 0-15, "topRisks": ["Top3风险，按严重程度排序"], "summary": "≤80字风控结论", "highlights": ["风险缓释因素1-2条"], "concerns": ["即 topRisks 的简版2-3条"], "evidence": [{"claim","value","source","confidence"}]}`
  const user = `${questionBlock(p)}

【各分析师观点】
${agentSummaries}

【辩论纪要】
${debateSummary}

${packBlock(p)}`
  const run = await runAgent<{ riskLevel?: string; riskPenalty?: number; topRisks?: string[] }>(
    system,
    user,
    () => ({
      ...neutralFallback('风控审查生成失败，按默认 Medium 风险处理'),
      riskLevel: 'Medium' as RiskLevelOut,
      riskPenalty: 5,
      topRisks: ['风控审查未能完成，存在未识别风险'],
    }),
    180_000,
    DEBATE_PROVIDER,
  )
  const lvlRaw = run.raw?.riskLevel
  const riskLevel: RiskLevelOut = (['Low', 'Medium', 'High', 'Very High'] as const).includes(lvlRaw as RiskLevelOut)
    ? (lvlRaw as RiskLevelOut)
    : 'Medium'
  const penalty = typeof run.raw?.riskPenalty === 'number' ? Math.max(0, Math.min(15, Math.round(run.raw.riskPenalty))) : 5
  const topRisks = Array.isArray(run.raw?.topRisks) ? run.raw!.topRisks.filter((x) => typeof x === 'string').slice(0, 3) : []
  const output: RiskOutput = { ...run.output, riskLevel, riskPenalty: penalty, topRisks: topRisks.length ? topRisks : run.output.concerns.slice(0, 3) }
  return { output, error: run.error }
}

// ---------- CIO ----------

export interface CIOOutput {
  confidence: number
  horizon: string
  keyLogic: string[]
  keyRisks: string[]
  thesis: { title: string; points: string[] }[]
  narrative: string
}

export async function cioAgent(
  p: DataPack,
  ctx: {
    dimensionScores: Record<string, number | null>
    initialScore: number
    riskPenalty: number
    finalScore: number
    rating: string
    positionMin: number
    positionMax: number
    voteSummary: string
    riskLevel: string
    topRisks: string[]
    conflictNote: string
  },
): Promise<CIOOutput | null> {
  const system = `你是基金公司首席投资官（CIO）。投委会已完成全部研究与投票，评分系统计算出最终结果（数字是权威的，不得修改）。你的任务：综合各方观点撰写最终投资决议的叙述部分。

输出 JSON 字段：
{"confidence": 30-95 置信度（参考投票一致性与证据强度，Risk Officer 风险越高置信度应越低）, "horizon": "投资周期如 12-24个月", "keyLogic": ["核心投资逻辑3-4条，每条≤40字"], "keyRisks": ["主要风险2-3条，每条≤40字"], "thesis": [{"title":"Growth|Competitive Advantage|Valuation|Macro|Risk 之一","points":["支撑要点2-3条"]}] 共5项, "narrative": "≤100字给投资人的决议陈述"}
${JSON_RULE}`
  const user = `研究标的：${p.stockName}${p.stockCode ? `(${p.stockCode})` : ''}
用户问题：${p.question}

【评分系统计算结果（权威）】
${JSON.stringify(ctx.dimensionScores)}
初始分 ${ctx.initialScore} → 风险惩罚 -${ctx.riskPenalty} → 最终分 ${ctx.finalScore} / 评级 ${ctx.rating} / 建议仓位 ${ctx.positionMin}-${ctx.positionMax}% / 风险等级 ${ctx.riskLevel}

【投委投票】
${ctx.voteSummary}

【Risk Officer Top 风险】
${ctx.topRisks.join('；')}
${ctx.conflictNote ? `\n【观点冲突提示】\n${ctx.conflictNote}` : ''}

【实时行情参考】
${liveBlock(p) || 'Data unavailable'}

【公司概况】
${p.stock ? p.stock.description : ''}
（详见评分输入）`
  return tryChatJSON<CIOOutput>(system, user, 180_000, DEBATE_PROVIDER)
}

// ---------- 报告 ----------

export async function reportAgent(
  p: DataPack,
  ctx: {
    finalScore: number
    rating: string
    confidence: number
    position: string
    horizon: string
    riskLevel: string
    keyLogic: string[]
    keyRisks: string[]
    agentSections: string
    voteSummary: string
  },
): Promise<string | null> {
  const system = `你是基金公司首席投资官，撰写一份可解释的《投资研究报告》（Markdown）。要求：
- 使用以下章节结构（一/二/三...编号二级标题）：执行摘要、公司概况、基本面分析、行业与竞争格局、宏观环境、估值与技术面、新闻与舆情、多空辩论纪要、风险分析、投资委员会决议、证据与数据来源附录
- 所有数字必须来自提供的数据，禁止编造；无数据处标注 Data unavailable
- 辩论纪要用要点形式呈现多空交锋；风险分析按严重程度排序
- 决议章节明确给出：评级、最终评分、置信度、建议仓位、投资周期、核心逻辑、主要风险
- 语言专业精炼，总长 1200-1800 字
直接输出 Markdown 正文（不要代码围栏）。`
  const user = `研究标的：${p.stockName}${p.stockCode ? `(${p.stockCode})` : ''} | 用户问题：${p.question}

【最终决议（权威数字）】
评级 ${ctx.rating} | 最终评分 ${ctx.finalScore}/100 | 置信度 ${ctx.confidence}% | 建议仓位 ${ctx.position} | 投资周期 ${ctx.horizon} | 风险等级 ${ctx.riskLevel}
核心逻辑：${ctx.keyLogic.join('；')}
主要风险：${ctx.keyRisks.join('；')}

【投委投票】
${ctx.voteSummary}

【各 Agent 分析摘要】
${ctx.agentSections}

【数据包】
${packBlock(p)}

${macroBlock(p)}

${newsBlock(p)}`
  return chatText(system, user, 120_000, 'zai').catch(() => null)
}
