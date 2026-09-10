/**
 * 市场热词 / 组合名 / 俗称词典（确定性解析层）
 *
 * 背景：A股市场存在大量「组合昵称」「个股俗称」「板块黑话」（如 易中天 = 新易盛+中际旭创+天孚通信）。
 * 这些词 LLM 极易误解析（实测「易中天是否值得买」被幻觉成贵州茅台），因此必须在
 * LLM 之前用确定性词典解析，并作为防幻觉校验的锚点来源。
 *
 * 规则：
 *  - terms 为触发词（查询命中任一即触发），按「长词优先」避免误截断
 *  - stocks 为解析结果（code 为通用代码：A股 6 位 / 港股 5 位 / 美股 ticker）
 *  - note 为市场语义解释，会注入给 Research Planner 与全部 Agent（保证全链路理解一致）
 *  - 只收录含义明确、无歧义的热词；泛行业词（如 AI、白酒）走 LLM 代表标的逻辑，不在此表
 */

export interface HotTermStock {
  code: string
  name: string
  market: 'SH' | 'SZ' | 'BJ' | 'HK' | 'US'
}

export interface HotTerm {
  terms: string[]
  stocks: HotTermStock[]
  note: string
}

export const HOT_TERMS: HotTerm[] = [
  {
    terms: ['易中天', '光模块三剑客', 'cpo三剑客', '光模块三大龙头', '中际天'],
    stocks: [
      { code: '300502', name: '新易盛', market: 'SZ' },
      { code: '300308', name: '中际旭创', market: 'SZ' },
      { code: '300394', name: '天孚通信', market: 'SZ' },
    ],
    note: 'A股市场对新易盛(300502)、中际旭创(300308)、天孚通信(300394)三家光模块/CPO龙头的合称，取三家名称首字「易·中·天」组合，是 AI 算力光互连（800G/1.6T 光模块）产业链核心标的，与贵州茅台无关',
  },
  {
    terms: ['茅指数'],
    stocks: [
      { code: '600519', name: '贵州茅台', market: 'SH' },
      { code: '300750', name: '宁德时代', market: 'SZ' },
    ],
    note: '「茅指数」指各行业最具消费/资产属性的核心龙头组合（贵州茅台、宁德时代、美的、恒瑞等约 35 家），名称源自贵州茅台但绝不等于贵州茅台单只股票',
  },
  {
    terms: ['宁组合'],
    stocks: [
      { code: '300750', name: '宁德时代', market: 'SZ' },
      { code: '300124', name: '汇川技术', market: 'SZ' },
    ],
    note: '「宁组合」指以宁德时代为代表的高景气成长赛道龙头组合（新能源/半导体/军工等），核心成员为宁德时代与汇川技术',
  },
  {
    terms: ['中概互联', '中概股'],
    stocks: [
      { code: '00700', name: '腾讯控股', market: 'HK' },
      { code: '09988', name: '阿里巴巴-W', market: 'HK' },
      { code: '03690', name: '美团-W', market: 'HK' },
    ],
    note: '「中概互联」指在海外/香港上市的中国互联网龙头组合（中概互联ETF核心成分），权重前三为腾讯、阿里巴巴、美团',
  },
  {
    terms: ['中特估'],
    stocks: [
      { code: '601088', name: '中国神华', market: 'SH' },
      { code: '601398', name: '工商银行', market: 'SH' },
    ],
    note: '「中特估」指中国特色估值体系下的央国企价值重估主题，代表标的为中国神华、工商银行等低估值高分红央国企',
  },
  {
    terms: ['高股息', '红利资产', '红利组合'],
    stocks: [
      { code: '600900', name: '长江电力', market: 'SH' },
      { code: '601088', name: '中国神华', market: 'SH' },
    ],
    note: '高股息/红利策略代表标的：长江电力（水电现金流稳定分红）与中国神华（煤炭高分红），均为红利指数权重前列',
  },
  {
    terms: ['宁王'],
    stocks: [{ code: '300750', name: '宁德时代', market: 'SZ' }],
    note: '「宁王」是市场对宁德时代(300750)的俗称（动力电池全球龙头）',
  },
  {
    terms: ['酱茅', '股王'],
    stocks: [{ code: '600519', name: '贵州茅台', market: 'SH' }],
    note: '「酱茅/股王」是市场对贵州茅台(600519)的俗称（酱香白酒龙头、A股市值标杆）',
  },
  {
    terms: ['猪茅'],
    stocks: [{ code: '002714', name: '牧原股份', market: 'SZ' }],
    note: '「猪茅」是市场对牧原股份(002714)的俗称（生猪养殖成本最优龙头）',
  },
  {
    terms: ['免税茅', '中免'],
    stocks: [{ code: '601888', name: '中国中免', market: 'SH' }],
    note: '「免税茅/中免」指中国中免(601888)，中国免税零售绝对龙头',
  },
  {
    terms: ['果链一哥', '果链龙头'],
    stocks: [{ code: '002475', name: '立讯精密', market: 'SZ' }],
    note: '「果链一哥」是市场对立讯精密(002475)的俗称（苹果产业链最大代工/组件供应商）',
  },
  {
    terms: ['化工茅', '化茅'],
    stocks: [{ code: '600309', name: '万华化学', market: 'SH' }],
    note: '「化工茅/化茅」是市场对万华化学(600309)的俗称（全球 MDI 绝对龙头）',
  },
  {
    terms: ['光伏茅', '光茅'],
    stocks: [{ code: '601012', name: '隆基绿能', market: 'SH' }],
    note: '「光伏茅/光茅」在当前语境常指隆基绿能(601012)（光伏硅片与组件龙头）',
  },
  {
    terms: ['眼茅'],
    stocks: [{ code: '300015', name: '爱尔眼科', market: 'SZ' }],
    note: '「眼茅」是市场对爱尔眼科(300015)的俗称（眼科医疗服务连锁龙头）',
  },
  {
    terms: ['械茅'],
    stocks: [{ code: '300760', name: '迈瑞医疗', market: 'SZ' }],
    note: '「械茅」是市场对迈瑞医疗(300760)的俗称（医疗器械国产龙头）',
  },
  {
    terms: ['药茅'],
    stocks: [{ code: '600276', name: '恒瑞医药', market: 'SH' }],
    note: '「药茅」通常指恒瑞医药(600276)（创新药龙头，不同阶段指代可能有变化）',
  },
  {
    terms: ['券茅', '牛市旗手', '券商渣男'],
    stocks: [
      { code: '300059', name: '东方财富', market: 'SZ' },
      { code: '600030', name: '中信证券', market: 'SH' },
    ],
    note: '「券茅/牛市旗手」指券商板块龙头：券茅常指东方财富(300059)（互联网券商流量霸主），牛市旗手指券商板块整体（行情风向标），代表标的还有中信证券(600030)',
  },
  {
    terms: ['锂茅'],
    stocks: [{ code: '002460', name: '赣锋锂业', market: 'SZ' }],
    note: '「锂茅」是市场对赣锋锂业(002460)的俗称（锂业龙头，不同阶段也可能指天齐锂业）',
  },
  {
    terms: ['车茅'],
    stocks: [{ code: '002594', name: '比亚迪', market: 'SZ' }],
    note: '「车茅」通常指比亚迪(002594)（新能源汽车龙头）',
  },
  {
    terms: ['机茅'],
    stocks: [{ code: '600031', name: '三一重工', market: 'SH' }],
    note: '「机茅」是市场对三一重工(600031)的俗称（工程机械龙头）',
  },
  {
    terms: ['油茅'],
    stocks: [{ code: '300999', name: '金龙鱼', market: 'SZ' }],
    note: '「油茅」是市场对金龙鱼(300999)的俗称（粮油龙头）',
  },
  {
    terms: ['两桶油'],
    stocks: [
      { code: '601857', name: '中国石油', market: 'SH' },
      { code: '600028', name: '中国石化', market: 'SH' },
    ],
    note: '「两桶油」是中国石油(601857)与中国石化(600028)的合称',
  },
  {
    terms: ['七巨头', 'm7', 'magnificent seven', '美股七雄'],
    stocks: [
      { code: 'NVDA', name: '英伟达', market: 'US' },
      { code: 'AAPL', name: '苹果', market: 'US' },
    ],
    note: '「七巨头/Magnificent Seven/M7」指美股七大科技股：苹果AAPL、微软MSFT、英伟达NVDA、亚马逊AMZN、谷歌GOOGL、Meta META、特斯拉TSLA，是美股大盘上涨的核心引擎',
  },
  {
    terms: ['喝酒吃药'],
    stocks: [
      { code: '600519', name: '贵州茅台', market: 'SH' },
      { code: '600276', name: '恒瑞医药', market: 'SH' },
    ],
    note: '「喝酒吃药」指白酒股与医药股同时走强的行情，代表标的为贵州茅台与恒瑞医药',
  },
  {
    terms: ['煤飞色舞'],
    stocks: [
      { code: '601088', name: '中国神华', market: 'SH' },
      { code: '601899', name: '紫金矿业', market: 'SH' },
    ],
    note: '「煤飞色舞」指煤炭与有色金属板块同步上涨的行情，代表标的为中国神华与紫金矿业',
  },
  {
    terms: ['大金融', '银保地'],
    stocks: [
      { code: '600036', name: '招商银行', market: 'SH' },
      { code: '601318', name: '中国平安', market: 'SH' },
    ],
    note: '「大金融/银保地」指银行、保险、券商（及地产）等金融权重板块，代表标的为招商银行与中国平安',
  },
  {
    terms: ['科特估'],
    stocks: [
      { code: '688981', name: '中芯国际', market: 'SH' },
      { code: '002371', name: '北方华创', market: 'SZ' },
    ],
    note: '「科特估」指科技资产估值重估主题（半导体/AI/信创/自主可控），代表标的中芯国际、北方华创',
  },
]

export interface HotTermMatch {
  /** 命中的热词条目 */
  term: HotTerm
  /** 查询中实际命中的触发词 */
  matched: string
  /** 触发词在查询中的位置 */
  pos: number
}

/**
 * 从查询文本中解析市场热词（确定性，不依赖 LLM）。
 * 命中多个热词时按出现位置排序；同一位置长词优先。
 */
export function matchHotTerms(query: string): HotTermMatch[] {
  const q = query.toLowerCase()
  const matches: HotTermMatch[] = []
  for (const term of HOT_TERMS) {
    let best: { matched: string; pos: number } | null = null
    for (const t of term.terms) {
      const idx = q.indexOf(t.toLowerCase())
      if (idx === -1) continue
      if (!best || t.length > best.matched.length || (t.length === best.matched.length && idx < best.pos)) {
        best = { matched: t, pos: idx }
      }
    }
    if (best) matches.push({ term, ...best })
  }
  return matches.sort((a, b) => a.pos - b.pos || b.matched.length - a.matched.length)
}

/** A股/港股/美股代码 → 市场标签（用于 session.market 展示） */
export function marketLabelOf(code: string): 'SH' | 'SZ' | 'BJ' | 'HK' | 'US' {
  const c = code.trim().toUpperCase()
  if (/^\d{6}$/.test(c)) {
    if (/^[69]/.test(c)) return 'SH'
    if (/^[023]/.test(c)) return 'SZ'
    return 'BJ'
  }
  if (/^\d{1,5}(\.HK)?$/.test(c)) return 'HK'
  return 'US'
}
