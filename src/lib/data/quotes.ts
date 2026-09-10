/**
 * 实时行情数据层（仅服务端）
 * 数据源：
 *  - 腾讯财经公开行情接口（qt.gtimg.cn / web.ifzq.gtimg.cn）：A股/港股/美股（个股+指数）实时快照与 K 线
 *  - Yahoo Finance chart API：美股补充指数（^ 前缀）+ 日韩台/欧洲/亚太/全球指数与 ETF 代理
 * - fetchQuotes: 实时五档快照（价格/涨跌/成交/估值/52周区间/市值）
 * - fetchDailyKline: 前复权日 K 线（用于量化引擎计算真实技术指标）
 * - fetchIntraday: 当日分时
 * - MARKET_INDICES: 91 个全球指数注册表（A股 27 + 港股 3 + 美股 12 + 日本 3 + 韩国 2 + 台湾 4 + 欧洲 17 + 中东 3 + 亚太/大洋 14 + 全球 6，共 11 大市场）
 * 内存缓存：行情 5s / K线 10min / 分时 60s / sparkline 2h（盘后自动延长）
 */

/** 展示用货币代码（全球指数覆盖多币种） */
export type CurrencyCode =
  | 'CNY' | 'HKD' | 'USD' | 'JPY' | 'KRW' | 'TWD' | 'EUR' | 'GBP' | 'CHF'
  | 'SGD' | 'INR' | 'IDR' | 'MYR' | 'THB'
  | 'AUD' | 'NZD' | 'CAD' | 'BRL' | 'MXN' | 'CLP' | 'SEK' | 'DKK' | 'TRY' | 'ILS' | 'SAR'

export interface LiveQuote {
  symbol: string
  code: string
  name: string
  price: number
  change: number
  changePct: number
  open: number
  prevClose: number
  high: number
  low: number
  volume: number // 手（A股/港股）或 股（美股）
  amount: number // 万元（A股）或 货币原值（美股）
  turnoverRate: number | null
  peTtm: number | null
  pb: number | null
  high52w: number | null
  low52w: number | null
  marketCap: number | null // 亿
  floatCap: number | null // 亿
  currency: CurrencyCode
  time: string // 行情时间戳
  isIndex: boolean
  source: 'tencent' | 'yahoo'
}

export interface KlineBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IntradayPoint {
  time: string // HH:mm
  price: number
  cumVolume: number
}

// ---------- 全球指数注册表 ----------

export type GroupKey = 'cn' | 'hk' | 'us' | 'jp' | 'kr' | 'tw' | 'eu' | 'emea' | 'asia' | 'americas' | 'global'

export interface IndexDef {
  code: string // 内部统一代码（sh000001 / hkHSI / usDJI / ^N225 / 1305.T / URTH）
  name: string
  group: GroupKey
  desc: string // 展示用说明
  shortName?: string // 英文/官方名
  proxyFor?: string // 代理说明（如中证2000 → 国证2000）
  yahoo?: boolean // 走雅虎源（^ 指数与美/日/欧 ETF 代理）
  currency?: CurrencyCode // quote 缺失时的展示币种回退
}

export const MARKET_INDICES: IndexDef[] = [
  // ---- A 股指数 ----
  { code: 'sh000001', name: '上证指数', group: 'cn', desc: '上海市场整体表现', shortName: 'SSE Composite' },
  { code: 'sz399001', name: '深证成指', group: 'cn', desc: '深圳市场代表指数', shortName: 'SZSE Component' },
  { code: 'sh000300', name: '沪深300', group: 'cn', desc: '沪深两市 300 只核心股票', shortName: 'CSI 300' },
  { code: 'sh000016', name: '上证50', group: 'cn', desc: '上海市场 50 只大型龙头', shortName: 'SSE 50' },
  { code: 'sh000010', name: '上证180', group: 'cn', desc: '上证规模蓝筹 180，上证50 的扩展圈', shortName: 'SSE 180' },
  { code: 'sh000009', name: '上证380', group: 'cn', desc: '上证中盘蓝筹 380', shortName: 'SSE 380' },
  { code: 'sz399106', name: '深证综指', group: 'cn', desc: '深圳市场全部股票', shortName: 'SZSE Composite' },
  { code: 'sz399330', name: '深证100', group: 'cn', desc: '深圳市场 100 只核心', shortName: 'SZSE 100' },
  { code: 'sz399317', name: '国证A指', group: 'cn', desc: '国证规模全市场指数（A股全貌）', shortName: 'CNI A' },
  { code: 'sh000985', name: '中证全指', group: 'cn', desc: '沪深全市场剔除 ST/上市不足一季', shortName: 'CSI All Share' },
  { code: 'sh000905', name: '中证500', group: 'cn', desc: '中盘股代表', shortName: 'CSI 500' },
  { code: 'sh000906', name: '中证800', group: 'cn', desc: '沪深300 + 中证500', shortName: 'CSI 800' },
  { code: 'sh000907', name: '中证700', group: 'cn', desc: '中证500 + 中证200（中小盘）', shortName: 'CSI 700' },
  { code: 'sh000852', name: '中证1000', group: 'cn', desc: '小盘股代表', shortName: 'CSI 1000' },
  { code: 'sh000510', name: '中证A500', group: 'cn', desc: '新一代核心宽基：各行业龙头 500（互联互通/ESG 筛选）', shortName: 'CSI A500' },
  { code: 'sz399303', name: '国证2000', group: 'cn', desc: '小微盘代表（中证2000 无公开实时源，以国证2000 代理）', shortName: 'CNI 2000', proxyFor: '中证2000' },
  { code: 'sz399006', name: '创业板指', group: 'cn', desc: '创业板代表公司', shortName: 'ChiNext' },
  { code: 'sz399673', name: '创业板50', group: 'cn', desc: '创业板核心 50', shortName: 'ChiNext 50' },
  { code: 'sz399102', name: '创业板综', group: 'cn', desc: '创业板全部股票', shortName: 'ChiNext Composite' },
  { code: 'sh000688', name: '科创50', group: 'cn', desc: '科创板核心公司', shortName: 'STAR 50' },
  { code: 'sh000698', name: '科创100', group: 'cn', desc: '科创板 100', shortName: 'STAR 100' },
  { code: 'sh000680', name: '科创综指', group: 'cn', desc: '科创板整体表现', shortName: 'STAR Composite' },
  { code: 'sh000685', name: '科创芯片', group: 'cn', desc: '科创板半导体芯片主题指数', shortName: 'STAR Chip' },
  { code: 'sh000922', name: '中证红利', group: 'cn', desc: '高股息红利策略代表指数', shortName: 'CSI Dividend' },
  { code: 'sh000015', name: '上证红利', group: 'cn', desc: '上证高股息红利指数', shortName: 'SSE Dividend' },
  { code: 'sz399324', name: '深证红利', group: 'cn', desc: '深市高股息红利指数', shortName: 'SZSE Dividend' },
  { code: 'bj899050', name: '北证50', group: 'cn', desc: '北交所代表指数', shortName: 'BSE 50' },
  // ---- 港股指数 ----
  { code: 'hkHSI', name: '恒生指数', group: 'hk', desc: '香港市场旗舰指数', shortName: 'Hang Seng Index' },
  { code: 'hkHSCEI', name: '国企指数', group: 'hk', desc: '恒生中国企业指数', shortName: 'HSCEI' },
  { code: 'hkHSTECH', name: '恒生科技', group: 'hk', desc: '港股科技 30 强', shortName: 'Hang Seng TECH' },
  // ---- 美股指数（usDJI/usIXIC/usINX 腾讯源；^ 前缀雅虎补充源）----
  { code: 'usINX', name: '标普500', group: 'us', desc: '美国 500 龙头核心指数', shortName: 'S&P 500' },
  { code: 'usIXIC', name: '纳斯达克综合', group: 'us', desc: 'Nasdaq 全市场', shortName: 'Nasdaq Composite' },
  { code: 'usDJI', name: '道琼斯工业', group: 'us', desc: '30 只工业蓝筹', shortName: 'Dow Jones' },
  { code: '^NDX', name: '纳斯达克100', group: 'us', desc: '纳指 100 只非金融龙头', shortName: 'Nasdaq 100', yahoo: true },
  { code: '^OEX', name: '标普100', group: 'us', desc: '标普500 中最大 100 只超大盘', shortName: 'S&P 100', yahoo: true },
  { code: '^SP400', name: '标普400中盘', group: 'us', desc: '美国中盘股代表', shortName: 'S&P 400', yahoo: true },
  { code: '^SP600', name: '标普600小盘', group: 'us', desc: '美国小盘股代表', shortName: 'S&P 600', yahoo: true },
  { code: '^RUT', name: '罗素2000', group: 'us', desc: '美国小盘股', shortName: 'Russell 2000', yahoo: true },
  { code: '^RUI', name: '罗素1000', group: 'us', desc: '美国大盘股', shortName: 'Russell 1000', yahoo: true },
  { code: '^RUA', name: '罗素3000', group: 'us', desc: '美股全市场', shortName: 'Russell 3000', yahoo: true },
  { code: '^SOX', name: '费城半导体', group: 'us', desc: '全球半导体景气风向标', shortName: 'PHLX SOX', yahoo: true },
  {
    code: '^VIX', name: 'VIX恐慌指数', group: 'us', desc: '标普500 期权隐含波动率（波动率指数，非股票指数）',
    shortName: 'CBOE VIX', yahoo: true,
  },
  // ---- 日本指数（雅虎源）----
  { code: '^N225', name: '日经225', group: 'jp', desc: '日本股市旗舰指数（日经平均股价）', shortName: 'Nikkei 225', yahoo: true, currency: 'JPY' },
  {
    code: '1305.T', name: '东证指数', group: 'jp', desc: '东证一部全市场市值加权指数（以 TOPIX 联动 ETF 1305.T 代理）',
    shortName: 'TOPIX', proxyFor: 'TOPIX', yahoo: true, currency: 'JPY',
  },
  {
    code: '1364.T', name: 'JPX日经400', group: 'jp', desc: '日本优质 400（以 iShares JPX-Nikkei 400 ETF 1364.T 代理）',
    shortName: 'JPX-Nikkei 400', proxyFor: 'JPX-Nikkei 400', yahoo: true, currency: 'JPY',
  },
  // ---- 韩国指数（雅虎源）----
  { code: '^KS11', name: '韩国KOSPI', group: 'kr', desc: '韩国综合股价指数', shortName: 'KOSPI', yahoo: true, currency: 'KRW' },
  { code: '^KQ11', name: '韩国KOSDAQ', group: 'kr', desc: '韩国创业板指数', shortName: 'KOSDAQ', yahoo: true, currency: 'KRW' },
  // ---- 中国台湾指数（雅虎源）----
  { code: '^TWII', name: '台湾加权指数', group: 'tw', desc: '台湾交易所发行量加权指数', shortName: 'TAIEX', yahoo: true, currency: 'TWD' },
  {
    code: '0050.TW', name: '台湾50', group: 'tw', desc: '台股市值前 50（以元大台湾50 ETF 0050.TW 代理）',
    shortName: 'Taiwan 50', proxyFor: '台湾50指数', yahoo: true, currency: 'TWD',
  },
  {
    code: '0051.TW', name: '台湾中型100', group: 'tw', desc: '台湾中型股 100（以元大中型100 ETF 0051.TW 代理）',
    shortName: 'Taiwan Mid-Cap 100', proxyFor: '台湾中型100指数', yahoo: true, currency: 'TWD',
  },
  {
    code: '0052.TW', name: '台湾科技', group: 'tw', desc: '台湾资讯科技指数（以富邦科技 ETF 0052.TW 代理）',
    shortName: 'Taiwan Tech', proxyFor: '台湾资讯科技指数', yahoo: true, currency: 'TWD',
  },
  // ---- 欧洲指数（雅虎源）----
  { code: '^STOXX50E', name: '欧洲斯托克50', group: 'eu', desc: '欧元区蓝筹龙头指数', shortName: 'Euro Stoxx 50', yahoo: true, currency: 'EUR' },
  { code: '^STOXX', name: '欧洲斯托克600', group: 'eu', desc: '欧洲广泛市场（18 国 600 只）', shortName: 'STOXX 600', yahoo: true, currency: 'EUR' },
  { code: '^GDAXI', name: '德国DAX', group: 'eu', desc: '德国法兰克福 40 龙头', shortName: 'DAX', yahoo: true, currency: 'EUR' },
  { code: '^MDAXI', name: '德国MDAX', group: 'eu', desc: '德国中盘 60', shortName: 'MDAX', yahoo: true, currency: 'EUR' },
  { code: '^TECDAX', name: '德国TecDAX', group: 'eu', desc: '德国科技 30', shortName: 'TecDAX', yahoo: true, currency: 'EUR' },
  { code: '^FCHI', name: '法国CAC 40', group: 'eu', desc: '巴黎证交所 40 龙头', shortName: 'CAC 40', yahoo: true, currency: 'EUR' },
  { code: '^FTSE', name: '英国富时100', group: 'eu', desc: '伦敦证交所 100 龙头', shortName: 'FTSE 100', yahoo: true, currency: 'GBP' },
  { code: '^FTMC', name: '英国富时250', group: 'eu', desc: '英国中盘 250（离岸收入占比高）', shortName: 'FTSE 250', yahoo: true, currency: 'GBP' },
  { code: 'FTSEMIB.MI', name: '意大利富时MIB', group: 'eu', desc: '米兰证交所 40 龙头', shortName: 'FTSE MIB', yahoo: true, currency: 'EUR' },
  { code: '^IBEX', name: '西班牙IBEX 35', group: 'eu', desc: '马德里证交所 35 龙头', shortName: 'IBEX 35', yahoo: true, currency: 'EUR' },
  { code: '^SSMI', name: '瑞士SMI', group: 'eu', desc: '瑞士市场指数 20 龙头', shortName: 'Swiss SMI', yahoo: true, currency: 'CHF' },
  { code: '^AEX', name: '荷兰AEX', group: 'eu', desc: '阿姆斯特丹 25 龙头', shortName: 'AEX', yahoo: true, currency: 'EUR' },
  { code: '^BFX', name: '比利时BEL 20', group: 'eu', desc: '布鲁塞尔 20 龙头', shortName: 'BEL 20', yahoo: true, currency: 'EUR' },
  { code: '^OMX', name: '瑞典OMXS30', group: 'eu', desc: '斯德哥尔摩 30 龙头', shortName: 'OMX Stockholm 30', yahoo: true, currency: 'SEK' },
  { code: '^OMXC25', name: '丹麦OMXC25', group: 'eu', desc: '哥本哈根 25 龙头（诺和诺德权重极高）', shortName: 'OMX Copenhagen 25', yahoo: true, currency: 'DKK' },
  { code: '^OMXH25', name: '芬兰OMXH25', group: 'eu', desc: '赫尔辛基 25 龙头', shortName: 'OMX Helsinki 25', yahoo: true, currency: 'EUR' },
  { code: '^ATX', name: '奥地利ATX', group: 'eu', desc: '维也纳 20 龙头', shortName: 'ATX', yahoo: true, currency: 'EUR' },
  // ---- 中东欧/中东（雅虎源；开闭 LED 以伊斯坦布尔时段为基准）----
  { code: '^XU100', name: '土耳其BIST 100', group: 'emea', desc: '伊斯坦布尔 100 龙头（高通胀高波动市场）', shortName: 'BIST 100', yahoo: true, currency: 'TRY' },
  { code: '^TA125.TA', name: '以色列TA-125', group: 'emea', desc: '特拉维夫 125 龙头', shortName: 'TA-125', yahoo: true, currency: 'ILS' },
  {
    code: '^TASI.SR', name: '沙特TASI', group: 'emea', desc: '沙特 Tadawul 全市场指数（中东最大市场，周日-周四交易）',
    shortName: 'TASI', yahoo: true, currency: 'SAR',
  },
  // ---- 亚太其他市场（雅虎源）----
  { code: '^STI', name: '新加坡海峡时报', group: 'asia', desc: '新加坡 30 龙头', shortName: 'STI', yahoo: true, currency: 'SGD' },
  { code: '^NSEI', name: '印度Nifty 50', group: 'asia', desc: '印度国家交易所 50 龙头', shortName: 'Nifty 50', yahoo: true, currency: 'INR' },
  { code: '^NSMIDCP', name: '印度Nifty Next 50', group: 'asia', desc: '印度下一个 50（未来大盘候选）', shortName: 'Nifty Next 50', yahoo: true, currency: 'INR' },
  { code: '^NSEMDCP50', name: '印度Nifty中盘50', group: 'asia', desc: '印度中盘 50', shortName: 'Nifty Midcap 50', yahoo: true, currency: 'INR' },
  { code: '^NSEBANK', name: '印度Nifty银行', group: 'asia', desc: '印度银行板块 12 龙头', shortName: 'Nifty Bank', yahoo: true, currency: 'INR' },
  { code: '^CNXIT', name: '印度Nifty IT', group: 'asia', desc: '印度 IT 服务板块（外包全球景气风向标）', shortName: 'Nifty IT', yahoo: true, currency: 'INR' },
  { code: '^BSESN', name: '印度Sensex', group: 'asia', desc: '孟买交易所 30 龙头', shortName: 'SENSEX', yahoo: true, currency: 'INR' },
  {
    code: 'VNM', name: '越南VN-Index', group: 'asia', desc: '胡志明证交所全市场指数（以 VanEck 越南 ETF VNM 代理）',
    shortName: 'VN-Index', proxyFor: 'VN-Index', yahoo: true, currency: 'USD',
  },
  { code: '^JKSE', name: '印尼雅加达综合', group: 'asia', desc: '印尼全市场综合指数', shortName: 'JKSE', yahoo: true, currency: 'IDR' },
  { code: '^KLSE', name: '马来西亚KLCI', group: 'asia', desc: '吉隆坡综合指数', shortName: 'KLCI', yahoo: true, currency: 'MYR' },
  { code: '^SET.BK', name: '泰国SET', group: 'asia', desc: '泰国证交所综合指数', shortName: 'SET Index', yahoo: true, currency: 'THB' },
  // ---- 美洲（雅虎源；开闭 LED 以纽约时段为基准）----
  { code: '^GSPTSE', name: '加拿大TSX综指', group: 'americas', desc: '多伦多全市场（能源/金融权重高）', shortName: 'S&P/TSX', yahoo: true, currency: 'CAD' },
  { code: '^BVSP', name: '巴西Ibovespa', group: 'americas', desc: '圣保罗交易所龙头指数（拉美最大市场）', shortName: 'Ibovespa', yahoo: true, currency: 'BRL' },
  { code: '^MXX', name: '墨西哥IPC', group: 'americas', desc: '墨西哥城交易所龙头指数', shortName: 'S&P/BMV IPC', yahoo: true, currency: 'MXN' },
  { code: '^IPSA', name: '智利IPSA', group: 'americas', desc: '圣地亚哥 40 龙头（铜矿权重高）', shortName: 'S&P IPSA', yahoo: true, currency: 'CLP' },
  // ---- 大洋洲（雅虎源，挂在亚太组）----
  { code: '^AXJO', name: '澳洲ASX 200', group: 'asia', desc: '澳大利亚 200 龙头（矿业/银行权重高）', shortName: 'S&P/ASX 200', yahoo: true, currency: 'AUD' },
  { code: '^AORD', name: '澳洲全指', group: 'asia', desc: '澳大利亚全市场', shortName: 'All Ordinaries', yahoo: true, currency: 'AUD' },
  { code: '^NZ50', name: '新西兰NZX 50', group: 'asia', desc: '新西兰 50 龙头', shortName: 'S&P/NZX 50', yahoo: true, currency: 'NZD' },
  // ---- 全球型指数（以美股上市 ETF 代理，雅虎源）----
  {
    code: 'URTH', name: 'MSCI全球指数', group: 'global', desc: 'MSCI 发达市场全世界指数（以 iShares MSCI World ETF URTH 代理）',
    shortName: 'MSCI World', proxyFor: 'MSCI World', yahoo: true, currency: 'USD',
  },
  {
    code: 'ACWI', name: 'MSCI ACWI', group: 'global', desc: 'MSCI 全球全部市场（发达+新兴，以 iShares ACWI ETF 代理）',
    shortName: 'MSCI ACWI', proxyFor: 'MSCI ACWI', yahoo: true, currency: 'USD',
  },
  {
    code: 'EEM', name: 'MSCI新兴市场', group: 'global', desc: 'MSCI 新兴市场指数（以 iShares EEM ETF 代理）',
    shortName: 'MSCI EM', proxyFor: 'MSCI EM', yahoo: true, currency: 'USD',
  },
  {
    code: 'EFA', name: 'MSCI EAFE', group: 'global', desc: 'MSCI 欧/澳/远东发达市场指数（以 iShares EFA ETF 代理）',
    shortName: 'MSCI EAFE', proxyFor: 'MSCI EAFE', yahoo: true, currency: 'USD',
  },
  {
    code: 'FM', name: 'MSCI前沿市场', group: 'global', desc: 'MSCI 前沿市场指数（以 iShares FM ETF 代理）',
    shortName: 'MSCI Frontier', proxyFor: 'MSCI Frontier Markets 100', yahoo: true, currency: 'USD',
  },
  {
    code: 'VT', name: '富时全球指数', group: 'global', desc: 'FTSE 全球全市场指数（以 Vanguard 全世界股票 ETF VT 代理）',
    shortName: 'FTSE All-World', proxyFor: 'FTSE All-World', yahoo: true, currency: 'USD',
  },
]

/** 市场元信息（开闭市展示用） */
export const MARKET_META: Record<GroupKey, { label: string; en: string; currency: CurrencyCode; tz: string }> = {
  cn: { label: 'A股', en: 'CHINA A-SHARE', currency: 'CNY', tz: 'Asia/Shanghai' },
  hk: { label: '港股', en: 'HONG KONG', currency: 'HKD', tz: 'Asia/Hong_Kong' },
  us: { label: '美股', en: 'US MARKET', currency: 'USD', tz: 'America/New_York' },
  jp: { label: '日本', en: 'JAPAN · TSE', currency: 'JPY', tz: 'Asia/Tokyo' },
  kr: { label: '韩国', en: 'KOREA · KRX', currency: 'KRW', tz: 'Asia/Seoul' },
  tw: { label: '台湾', en: 'TAIWAN · TWSE', currency: 'TWD', tz: 'Asia/Taipei' },
  eu: { label: '欧洲', en: 'EUROPE · XETRA', currency: 'EUR', tz: 'Europe/Berlin' },
  emea: { label: '中东', en: 'EMEA · IST/RID', currency: 'SAR', tz: 'Europe/Istanbul' },
  asia: { label: '亚太', en: 'ASIA-PACIFIC', currency: 'SGD', tz: 'Asia/Singapore' },
  americas: { label: '美洲', en: 'AMERICAS', currency: 'CAD', tz: 'America/New_York' },
  global: { label: '全球', en: 'GLOBAL · MSCI/FTSE', currency: 'USD', tz: 'America/New_York' },
}

// ---------- 代码规范化 ----------

/** 雅虎源指数/ETF 代码集（^ 前缀 + 注册表内 yahoo 标记的非 ^ 代码如 1305.T / URTH） */
const YAHOO_INDEX_CODES = new Set(
  MARKET_INDICES.filter((d) => d.yahoo && !d.code.startsWith('^')).map((d) => d.code.toUpperCase()),
)

/** 是否走雅虎数据源（^ 指数 / 日韩台 ETF / 全球 ETF 代理） */
export function isYahooCode(raw: string): boolean {
  const c = raw.trim().toUpperCase()
  if (c.startsWith('^')) return true
  return YAHOO_INDEX_CODES.has(c)
}

/** 腾讯符号大小写敏感（hkHSI ✓ / hkhsi ✗ / HKHSI ✗）：注册表内的符号精确规范化 */
const SYMBOL_CANON = new Map<string, string>()
for (const def of MARKET_INDICES) SYMBOL_CANON.set(def.code.toUpperCase(), def.code)

/** 将内部代码（600519 / 00700.HK / sh000001 / hkHSI / usAAPL / ^RUT）转换为腾讯符号；雅虎符号原样返回 */
export function toTencentSymbol(raw: string): string | null {
  const trimmed = raw.trim()
  const code = trimmed.toUpperCase()
  if (!code) return null
  // 雅虎源符号（^ 前缀与注册表 ETF 代理）不经过腾讯
  if (code.startsWith('^') || YAHOO_INDEX_CODES.has(code)) return null
  // 注册表内符号：精确大小写规范化（hkHSI / usINX / bj899050 ...）
  const canon = SYMBOL_CANON.get(code)
  if (canon && !canon.startsWith('^')) return canon
  // 已是腾讯符号形式：保留原始大小写（腾讯大小写敏感）
  if (/^(sh|sz|hk|bj|us)[A-Za-z\d\.]+$/i.test(trimmed)) return trimmed
  // A 股 6 位数字
  if (/^\d{6}$/.test(code)) {
    if (/^[69]/.test(code)) return `sh${code}`
    if (/^[023]/.test(code)) return `sz${code}`
    if (/^[48]/.test(code)) return `bj${code}` // 北交所
    return null
  }
  // 美股裸 ticker（AAPL / NVDA）：自动加 us 前缀
  if (/^[A-Z]{2,6}$/.test(code)) return `us${code}`
  // 港股：00700.HK / 0700 / 5 位数字
  const hk = code.replace(/\.HK$/, '')
  if (/^\d{1,5}$/.test(hk)) return `hk${hk.padStart(5, '0')}`
  return null
}

export function quoteCurrency(symbol: string): 'CNY' | 'HKD' | 'USD' {
  if (symbol.startsWith('us')) return 'USD'
  if (symbol.startsWith('hk')) return 'HKD'
  return 'CNY'
}

// ---------- 内存缓存 ----------

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const quoteCache = new Map<string, CacheEntry<LiveQuote>>()
const klineCache = new Map<string, CacheEntry<KlineBar[]>>()
const intradayCache = new Map<string, CacheEntry<IntradayPoint[]>>()
const sparkCache = new Map<string, CacheEntry<number[]>>()

function getCache<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = store.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.data
  if (hit) store.delete(key)
  return null
}

function setCache<T>(store: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs })
}

// ---------- 市场交易时段 ----------

interface GroupSessions {
  tz: string
  /** 交易时段（当地墙上时间，分钟），支持午间休市多段；含少量边界容差 */
  sessions: [number, number][]
}

const hm = (h: number, m: number): number => h * 60 + m

/** 十一大市场交易时段（当地时区；边界含少量容差用于缓存 TTL 判定） */
const GROUP_SESSIONS: Record<GroupKey, GroupSessions> = {
  cn: { tz: 'Asia/Shanghai', sessions: [[hm(9, 15), hm(11, 35)], [hm(12, 55), hm(15, 10)]] },
  hk: { tz: 'Asia/Hong_Kong', sessions: [[hm(9, 30), hm(12, 0)], [hm(13, 0), hm(16, 10)]] },
  us: { tz: 'America/New_York', sessions: [[hm(9, 30), hm(16, 0)]] },
  jp: { tz: 'Asia/Tokyo', sessions: [[hm(9, 0), hm(11, 30)], [hm(12, 30), hm(15, 0)]] },
  kr: { tz: 'Asia/Seoul', sessions: [[hm(9, 0), hm(15, 30)]] },
  tw: { tz: 'Asia/Taipei', sessions: [[hm(9, 0), hm(13, 30)]] },
  eu: { tz: 'Europe/Berlin', sessions: [[hm(9, 0), hm(17, 30)]] },
  emea: { tz: 'Europe/Istanbul', sessions: [[hm(10, 0), hm(18, 0)]] },
  asia: { tz: 'Asia/Singapore', sessions: [[hm(9, 0), hm(12, 0)], [hm(13, 0), hm(17, 0)]] },
  americas: { tz: 'America/New_York', sessions: [[hm(9, 30), hm(16, 0)]] },
  global: { tz: 'America/New_York', sessions: [[hm(9, 30), hm(16, 0)]] },
}

/** 当地 weekday + 分钟（Intl 时区转换，自动处理夏令时；格式化器模块级缓存） */
const localProbeCache = new Map<string, Intl.DateTimeFormat>()
function localDayMinutes(tz: string, now: Date = new Date()): { day: number; min: number } {
  let fmt = localProbeCache.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    localProbeCache.set(tz, fmt)
  }
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  const weekday = get('weekday')
  const day = weekday === 'Sun' ? 0 : weekday === 'Mon' ? 1 : weekday === 'Tue' ? 2 : weekday === 'Wed' ? 3 : weekday === 'Thu' ? 4 : weekday === 'Fri' ? 5 : 6
  return { day, min: Number(get('hour')) * 60 + Number(get('minute')) }
}

function isGroupOpen(group: GroupKey): boolean {
  const g = GROUP_SESSIONS[group]
  const { day, min } = localDayMinutes(g.tz)
  if (day === 0 || day === 6) return false
  return g.sessions.some(([a, b]) => min >= a && min <= b)
}

/** A股交易时段（仅用于缓存 TTL 判定） */
export function isCnOpen(): boolean {
  return isGroupOpen('cn')
}

/** 美股交易时段（仅用于缓存 TTL 判定） */
export function isUsOpen(): boolean {
  return isGroupOpen('us')
}

/** 旧接口兼容：任一市场开盘 */
function isMarketHours(): boolean {
  return isCnOpen() || isUsOpen() || isGroupOpen('jp') || isGroupOpen('kr') || isGroupOpen('eu')
}

/** 十一大市场开闭状态（前端展示用；法定节假日未计入） */
export function marketStatus(): Record<GroupKey, 'open' | 'closed'> {
  const keys = Object.keys(MARKET_META) as GroupKey[]
  return Object.fromEntries(keys.map((k) => [k, isGroupOpen(k) ? 'open' : 'closed'])) as Record<
    GroupKey,
    'open' | 'closed'
  >
}

// ---------- 腾讯实时行情解析 ----------

function parseTencentLine(symbol: string, raw: string): LiveQuote | null {
  // v_sh600519="1~贵州茅台~600519~1290.88~..." / v_usAAPL="200~苹果~AAPL.OQ~316.22~..."
  const m = raw.match(/v_[a-z]+[a-zA-Z\d]*="([^"]*)"/)
  if (!m) return null
  const f = m[1].split('~')
  if (f.length < 40) return null
  const num = (s: string | undefined): number => {
    const v = parseFloat(s ?? '')
    return Number.isFinite(v) ? v : 0
  }
  const numOrNull = (s: string | undefined): number | null => {
    const v = parseFloat(s ?? '')
    // 腾讯用 -1.00 表示无数据（如指数无 52 周区间），仅接受正数
    return Number.isFinite(v) && v > 0 ? v : null
  }
  const name = f[1] ?? ''
  const code = f[2] ?? symbol
  const isIndex =
    /^(sh000|sz399|bj899)/.test(symbol) || /^us/.test(symbol) || /hk(HSI|HSCEI|HSTECH|HSC)/i.test(symbol)
  const timeRaw = f[30] ?? ''
  // A股: 20260909161403；美股: 2026-09-08 16:00:02；港股: 2026/09/09 18:31:05
  let time: string
  if (timeRaw.includes('-') || timeRaw.includes('/')) {
    time = timeRaw.replace(/\//g, '-')
  } else if (timeRaw.length >= 14) {
    time = `${timeRaw.slice(0, 4)}-${timeRaw.slice(4, 6)}-${timeRaw.slice(6, 8)} ${timeRaw.slice(8, 10)}:${timeRaw.slice(10, 12)}:${timeRaw.slice(12, 14)}`
  } else {
    time = new Date().toISOString()
  }

  return {
    symbol,
    code,
    name,
    price: num(f[3]),
    change: num(f[31]),
    changePct: num(f[32]),
    open: num(f[5]),
    prevClose: num(f[4]),
    high: num(f[33]),
    low: num(f[34]),
    volume: num(f[36]),
    amount: num(f[37]),
    turnoverRate: numOrNull(f[38]),
    peTtm: numOrNull(f[39]),
    pb: numOrNull(f[46]),
    high52w: numOrNull(f[47]),
    low52w: numOrNull(f[48]),
    marketCap: numOrNull(f[45]),
    floatCap: numOrNull(f[44]),
    currency: quoteCurrency(symbol),
    time,
    isIndex,
    source: 'tencent',
  }
}

/** 腾讯批量实时行情 */
async function fetchTencentQuotes(norms: string[], ttl: number): Promise<Map<string, LiveQuote>> {
  const bySymbol = new Map<string, LiveQuote>()
  if (norms.length === 0) return bySymbol
  try {
    const res = await fetch(`https://qt.gtimg.cn/q=${norms.join(',')}`, {
      headers: { Referer: 'https://gu.qq.com' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    // 响应是 GBK 编码：先取 arrayBuffer 再用 TextDecoder 解码（body 只能读一次）
    const buf = await res.arrayBuffer()
    const decoded = new TextDecoder('gbk').decode(buf)
    const lines = decoded.split(';').filter((l) => l.includes('="'))
    for (const line of lines) {
      const symMatch = line.match(/v_([a-z]+[a-zA-Z\d]*)=/)
      if (!symMatch) continue
      const q = parseTencentLine(symMatch[1], line)
      if (q && q.price > 0) bySymbol.set(symMatch[1], q)
    }
    for (const q of Array.from(bySymbol.values())) setCache(quoteCache, q.symbol, q, ttl)
  } catch {
    // 网络失败静默返回已缓存部分
  }
  return bySymbol
}

// ---------- 雅虎源（^ 指数 + 日韩台/欧洲/亚太/全球 ETF 代理）----------

/** 指数中文名：直接从注册表生成（含 ^ 指数与所有雅虎源代码） */
const YAHOO_NAMES: Record<string, string> = {
  '^GSPC': '标普500',
  '^DJI': '道琼斯工业',
  '^IXIC': '纳斯达克综合',
  ...Object.fromEntries(
    MARKET_INDICES.filter((d) => d.yahoo || d.code.startsWith('^')).map((d) => [d.code.toUpperCase(), d.name]),
  ),
}

/** 雅虎源币种映射（quote 层展示用） */
const YAHOO_CURRENCY: Record<string, CurrencyCode> = Object.fromEntries(
  MARKET_INDICES.filter((d) => d.yahoo && d.currency).map((d) => [d.code.toUpperCase(), d.currency as CurrencyCode]),
)

async function fetchYahooQuote(symbol: string, ttl: number): Promise<LiveQuote | null> {
  const symKey = symbol.toUpperCase()
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIFundManager/1.0)' }, cache: 'no-store', signal: AbortSignal.timeout(8_000) },
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, unknown> }> }
    }
    const meta = json.chart?.result?.[0]?.meta
    if (!meta) return null
    const price = Number(meta.regularMarketPrice ?? 0)
    if (!Number.isFinite(price) || price <= 0) return null
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice ?? price)
    const change = price - prevClose
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0
    const timeSec = Number(meta.regularMarketTime ?? 0)
    const time = timeSec > 0 ? new Date(timeSec * 1000).toISOString() : new Date().toISOString()
    const numOrNull = (v: unknown): number | null => {
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    const q: LiveQuote = {
      symbol,
      code: symbol,
      name: YAHOO_NAMES[symKey] ?? symbol,
      price,
      change: Number(change.toFixed(4)),
      changePct: Number(changePct.toFixed(4)),
      open: numOrNull(meta.regularMarketDayHigh) ? price : price, // chart meta 无 open，用 price 占位
      prevClose,
      high: numOrNull(meta.regularMarketDayHigh) ?? price,
      low: numOrNull(meta.regularMarketDayLow) ?? price,
      volume: Number(meta.regularMarketVolume ?? 0),
      amount: 0,
      turnoverRate: null,
      peTtm: null,
      pb: null,
      high52w: numOrNull(meta.fiftyTwoWeekHigh),
      low52w: numOrNull(meta.fiftyTwoWeekLow),
      marketCap: null,
      floatCap: null,
      currency: YAHOO_CURRENCY[symKey] ?? 'USD',
      time,
      isIndex: true,
      source: 'yahoo',
    }
    setCache(quoteCache, symbol, q, ttl)
    setCache(quoteCache, symKey, q, ttl)
    return q
  } catch {
    return null
  }
}

// ---------- 统一入口 ----------

/** 批量获取实时行情（腾讯 + 雅虎自动分流；交易时段 5s / 盘后 60s 缓存；雅虎源至少 15s 防限流） */
export async function fetchQuotes(symbols: string[]): Promise<Record<string, LiveQuote>> {
  const result: Record<string, LiveQuote> = {}
  const tencentNeed: string[] = []
  const yahooNeed: string[] = []
  const ttl = isMarketHours() ? 5_000 : 60_000
  const yahooTtl = Math.max(ttl, 15_000)

  for (const sym of symbols) {
    const trimmed = sym.trim()
    if (isYahooCode(trimmed)) {
      const cached = getCache(quoteCache, trimmed.toUpperCase())
      if (cached) result[sym] = cached
      else yahooNeed.push(trimmed)
      continue
    }
    const norm = toTencentSymbol(trimmed)
    if (!norm) continue
    const cached = getCache(quoteCache, norm)
    if (cached) {
      result[sym] = cached
      result[norm] = cached
    } else {
      tencentNeed.push(norm)
    }
  }

  // 雅虎源分块限流：每块 8 个并发，块间串行（首次冷启动 ~60 符号也不会触发上游限流）
  const [tencentMap, yahooSettled] = await Promise.all([
    fetchTencentQuotes(tencentNeed, ttl),
    (async () => {
      const out: { s: string; q: LiveQuote | null }[] = []
      for (let i = 0; i < yahooNeed.length; i += 8) {
        const part = yahooNeed.slice(i, i + 8)
        out.push(...(await Promise.all(part.map(async (s) => ({ s, q: await fetchYahooQuote(s, yahooTtl) })))))
      }
      return out
    })(),
  ])

  for (const norm of tencentNeed) {
    const q = tencentMap.get(norm)
    if (q) {
      result[norm] = q
      result[symbols.find((s) => toTencentSymbol(s) === norm) ?? norm] = q
    }
  }
  for (const { s, q } of yahooSettled) {
    if (q) result[s] = q
  }
  return result
}

export async function fetchQuote(symbol: string): Promise<LiveQuote | null> {
  const r = await fetchQuotes([symbol])
  return r[symbol] ?? null
}

// ---------- 日 K 线 ----------

/** 雅虎 chart 日K（^ 开头的美股指数专用；腾讯源不覆盖） */
interface YahooChartKline {
  chart?: {
    result?: Array<{
      meta?: Record<string, unknown>
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
      }
    }>
  }
}

const YAHOO_RANGE_BY_DAYS: { maxDays: number; range: string }[] = [
  { maxDays: 40, range: '1mo' },
  { maxDays: 95, range: '3mo' },
  { maxDays: 190, range: '6mo' },
  { maxDays: 400, range: '1y' },
  { maxDays: 800, range: '2y' },
]

/** 雅虎日K（^ 指数与全球 ETF 代理）→ KlineBar[]；TTL 与腾讯源一致（盘中 10min / 盘后 60min） */
async function fetchYahooKline(code: string, days: number): Promise<KlineBar[]> {
  const range = YAHOO_RANGE_BY_DAYS.find((r) => days <= r.maxDays)?.range ?? '2y'
  const cacheKey = `yh:${code}:${range}`
  const cached = getCache(klineCache, cacheKey)
  if (cached) return cached
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}?interval=1d&range=${range}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIFundManager/1.0)' }, cache: 'no-store', signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return []
    const json = (await res.json()) as YahooChartKline
    const result = json.chart?.result?.[0]
    const ts = result?.timestamp ?? []
    const q = result?.indicators?.quote?.[0] ?? {}
    const bars: KlineBar[] = []
    for (let i = 0; i < ts.length; i++) {
      const open = q.open?.[i]
      const high = q.high?.[i]
      const low = q.low?.[i]
      const close = q.close?.[i]
      if (close == null || !Number.isFinite(close) || close <= 0) continue
      const d = new Date(ts[i] * 1000)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      bars.push({
        date,
        open: Number(open ?? close),
        close,
        high: Number(high ?? close),
        low: Number(low ?? close),
        volume: Number(q.volume?.[i] ?? 0),
      })
    }
    if (bars.length > 0) setCache(klineCache, cacheKey, bars, isMarketHours() ? 10 * 60_000 : 60 * 60_000)
    return bars
  } catch {
    return []
  }
}

/** 前复权日 K（qfq），days 上限约 800；入参支持内部代码或腾讯符号；美股符号走 usfqkline 专用端点；雅虎源代码（^ 指数 / 全球 ETF 代理）走雅虎 chart
 * 容灾：腾讯 ifzq 域被 WAF 限流/拦截时（返回 HTML 挑战页），自动降级雅虎源（A股 .SS/.SZ、港股 .HK、美股裸 ticker），90s 冷却后重试腾讯 */

/** 腾讯 ifzq 域健康标记：WAF 拦截期间直接走雅虎兑底，避免每次请求都等超时 */
let ifzqBlockedUntil = 0
function markIfzqBlocked(): void {
  ifzqBlockedUntil = Date.now() + 90_000
}
function isIfzqBlocked(): boolean {
  return Date.now() < ifzqBlockedUntil
}

/** 腾讯符号 → 雅虎兑底符号（sh→.SS / sz→.SZ / hk→.HK / us→裸 ticker；北交所无雅虎源） */
function yahooFallbackSymbol(symbol: string): string | null {
  if (/^sh\d{6}$/.test(symbol)) return `${symbol.slice(2)}.SS`
  if (/^sz\d{6}$/.test(symbol)) return `${symbol.slice(2)}.SZ`
  if (/^hk\d{5}$/.test(symbol)) return `${symbol.slice(2).replace(/^0+/, '')}.HK`
  if (/^us[A-Z]{1,5}$/.test(symbol)) return symbol.slice(2)
  return null
}

export async function fetchDailyKline(rawCode: string, days = 260): Promise<KlineBar[]> {
  const code = rawCode.trim().toUpperCase()
  if (isYahooCode(code)) return fetchYahooKline(code, days)
  const symbol = toTencentSymbol(rawCode)
  if (!symbol) return []
  const cacheKey = symbol
  const cached = getCache(klineCache, cacheKey)
  if (cached) return cached

  const parseBars = (arr: unknown): KlineBar[] => {
    if (!Array.isArray(arr)) return []
    return (arr as string[][])
      .map((row) => ({
        date: row[0] ?? '',
        open: parseFloat(row[1] ?? '0'),
        close: parseFloat(row[2] ?? '0'),
        high: parseFloat(row[3] ?? '0'),
        low: parseFloat(row[4] ?? '0'),
        volume: parseFloat(row[5] ?? '0'),
      }))
      .filter((b) => b.close > 0 && Number.isFinite(b.close))
  }

  // ---- 腾讯主源（双域名轮换：web.ifzq.gtimg.cn ⇄ proxy.finance.qq.com 镜像；WAF 间歇拦截时互为备份）----
  if (!isIfzqBlocked()) {
    const hosts = ['https://web.ifzq.gtimg.cn', 'https://proxy.finance.qq.com']
    const endpoint = symbol.startsWith('us') ? 'usfqkline' : 'fqkline'
    for (const host of hosts) {
      try {
        const res = await fetch(
          `${host}/ifzqgtimg/appstock/app/${endpoint}/get?param=${symbol},day,,,${Math.min(days, 800)},qfq`,
          { cache: 'no-store', signal: AbortSignal.timeout(12_000) },
        )
        const json = (await res.json()) as {
          code?: number
          data?: Record<string, Record<string, unknown>>
        }
        const node = json.data?.[symbol]
        const bars = parseBars(node?.qfqday ?? node?.day ?? [])
        if (bars.length > 0) {
          setCache(klineCache, cacheKey, bars, isMarketHours() ? 10 * 60_000 : 60 * 60_000)
          return bars
        }
        if (json.code === 0) break // 上游正常应答但确无数据（如停牌）：不再尝试其他域名
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // WAF 拦截特征：返回 HTML 挑战页导致 JSON 解析失败 → 尝试镜像域名 / 标记冷却并降级雅虎
        if (msg.includes('<') || msg.includes('DOCTYPE') || msg.includes('Unexpected token')) markIfzqBlocked()
        console.warn(`[kline] ${symbol} ${host} 失败：${msg.slice(0, 60)}`)
      }
    }
  }

  // ---- 雅虎兑底（A 股 .SS/.SZ、港股 .HK、美股 ticker）----
  const fb = yahooFallbackSymbol(symbol)
  if (fb) {
    const bars = await fetchYahooKline(fb, days)
    if (bars.length > 0) {
      // 雅虎兑底结果共用同一缓存键（短 TTL：主源恢复后优先回腾讯）
      setCache(klineCache, cacheKey, bars, 5 * 60_000)
      return bars
    }
  }
  return []
}

// ---------- 指数 sparkline（30 日收盘序列）----------

interface YahooChartHistory {
  chart?: {
    result?: Array<{
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>
      }
    }>
  }
}

/** 获取指数 30 日收盘 sparkline（腾讯日K 或 雅虎 1mo）；TTL 6h + 过期旧值先返回后台重建（SWR），避免冷启动阻塞 */
export async function fetchSparkline(code: string, opts?: { background?: boolean }): Promise<number[]> {
  const fresh = getCache(sparkCache, code)
  if (fresh) return fresh
  // SWR：过期旧值立即返回，后台异步重建（仅非后台调用时触发）
  const staleEntry = sparkCache.get(code)
  if (staleEntry) {
    if (!opts?.background) void fetchSparkline(code, { background: true })
    return staleEntry.data
  }
  let closes: number[] = []
  if (isYahooCode(code)) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}?interval=1d&range=1mo`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIFundManager/1.0)' }, cache: 'no-store', signal: AbortSignal.timeout(8_000) },
      )
      if (res.ok) {
        const json = (await res.json()) as YahooChartHistory
        const closesRaw: unknown = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
        if (Array.isArray(closesRaw)) {
          closes = (closesRaw as unknown[])
            .map((c) => Number(c))
            .filter((c) => Number.isFinite(c) && c > 0)
        }
      }
    } catch {
      /* 静默 */
    }
  } else {
    // sparkline 复用 fetchDailyKline（含雅虎兑底容灾）
    const norm = toTencentSymbol(code) ?? code
    const bars = await fetchDailyKline(norm, 30)
    closes = bars.map((b) => b.close)
  }
  if (closes.length > 2) setCache(sparkCache, code, closes, 6 * 60 * 60_000)
  return closes
}

// ---------- 分时 ----------

/** 雅虎 5 分钟分时（^ 美股指数与全球 ETF 代理专用）：timestamp → 交易所当地 HH:mm，cumVolume 累计 */
async function fetchYahooIntraday(code: string): Promise<IntradayPoint[]> {
  const cacheKey = `yhmin:${code}`
  const cached = getCache(intradayCache, cacheKey)
  if (cached) return cached
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}?interval=5m&range=1d&includePrePost=false`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIFundManager/1.0)' }, cache: 'no-store', signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return []
    const json = (await res.json()) as YahooChartKline
    const result = json.chart?.result?.[0]
    const ts = result?.timestamp ?? []
    const closes = result?.indicators?.quote?.[0]?.close ?? []
    const vols = result?.indicators?.quote?.[0]?.volume ?? []
    const meta = result?.meta as Record<string, unknown> | undefined
    const tzName = typeof meta?.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : 'America/New_York'
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tzName, hour: '2-digit', minute: '2-digit', hour12: false })
    const points: IntradayPoint[] = []
    let cum = 0
    for (let i = 0; i < ts.length; i++) {
      const price = Number(closes[i])
      if (!Number.isFinite(price) || price <= 0) continue
      const v = Number(vols[i])
      if (Number.isFinite(v) && v > 0) cum += v
      points.push({ time: fmt.format(new Date(ts[i] * 1000)), price, cumVolume: cum })
    }
    if (points.length > 0) setCache(intradayCache, cacheKey, points, 60_000)
    return points
  } catch {
    return []
  }
}

export async function fetchIntraday(rawCode: string): Promise<IntradayPoint[]> {
  const code = rawCode.trim().toUpperCase()
  if (isYahooCode(code)) return fetchYahooIntraday(code)
  const symbol = toTencentSymbol(rawCode)
  if (!symbol) return []
  const cached = getCache(intradayCache, symbol)
  if (cached) return cached
  try {
    const res = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${symbol}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const json = (await res.json()) as { data?: Record<string, { data?: { data?: string[] } }> }
    const rows = json.data?.[symbol]?.data?.data ?? []
    const points: IntradayPoint[] = rows
      .map((r) => {
        const parts = r.trim().split(/\s+/)
        const t = parts[0] ?? ''
        return {
          time: `${t.slice(0, 2)}:${t.slice(2, 4)}`,
          price: parseFloat(parts[1] ?? '0'),
          cumVolume: parseFloat(parts[3] ?? '0'),
        }
      })
      .filter((p) => p.price > 0)
    if (points.length > 0) setCache(intradayCache, symbol, points, 60_000)
    return points
  } catch {
    return []
  }
}
