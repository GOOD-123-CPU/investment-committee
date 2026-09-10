/**
 * 全球股票市场与主要指数大全（知识库层）
 * 来源：用户上传《全球股票市场与主要指数大全.md》，结构化为三部分：
 *  1) MARKET_TREE — 全球市场 → 交易所/板块 → 指数体系的层级知识（注入 Agent 宏观/行业/规划师提示词）
 *  2) INDEX_CATALOG — 各市场代表性指数条目（附实时代码 quoteCode：凡注册于 MARKET_INDICES 的可实时下钻）
 *  3) matchIndexTopic() — 从用户问题中确定性识别「指数研究意图」（如"沪深300 现在怎么样"→ 指数研究模式）
 *
 * 设计原则：本模块是「知识」，不生成任何数字；实时点位一律由行情层（quotes.ts）在运行时拉取。
 */

// ---------- 1) 指数条目 ----------

export interface IndexCatalogEntry {
  /** 指数中文名 */
  name: string
  /** 英文/官方名 */
  en: string
  /** 市场键（对应 MARKET_TREE region.id） */
  market: string
  /** 分类：宽基 / 行业 / 主题 / 策略 / 全球 */
  category: '宽基' | '行业' | '主题' | '策略' | '全球'
  /** 一句话定位 */
  desc: string
  /** 实时代码（quotes.ts MARKET_INDICES 注册过的代码；无实时源为 null） */
  quoteCode: string | null
  /** 层级说明（如「沪深300 + 中证500 ≈ 中证800」） */
  relation?: string
}

const E = (
  name: string,
  en: string,
  market: string,
  category: IndexCatalogEntry['category'],
  desc: string,
  quoteCode: string | null = null,
  relation?: string,
): IndexCatalogEntry => ({ name, en, market, category, desc, quoteCode, relation })

export const INDEX_CATALOG: IndexCatalogEntry[] = [
  // ---- 中国 A 股 ----
  E('上证指数', 'SSE Composite', 'cn', '宽基', '上交所全部股票的综合指数，A 股人气风向标', 'sh000001'),
  E('深证成指', 'SZSE Component', 'cn', '宽基', '深交所 500 只核心股，深市代表指数', 'sz399001'),
  E('沪深300', 'CSI 300', 'cn', '宽基', '沪深两市规模最大流动性最好的 300 只，A 股大盘核心基准', 'sh000300'),
  E('中证A500', 'CSI A500', 'cn', '宽基', '新一代核心宽基：按行业中性选取 500 只龙头，兼顾互联互通与 ESG 筛选', 'sh000510'),
  E('中证A50', 'CSI A50', 'cn', '宽基', '各行业龙头 50 只的超大盘指数（当前无免费实时源，仅知识库收录）'),
  E('富时中国A50', 'FTSE China A50', 'cn', '宽基', 'A 股市值最大 50 只（富时口径），新加坡 A50 期货是全球资金对冲 A 股的主战场'),
  E('上证50', 'SSE 50', 'cn', '宽基', '上交所超大盘 50，金融权重极高', 'sh000016', '上证180 ⊃ 上证50'),
  E('上证180', 'SSE 180', 'cn', '宽基', '上证规模蓝筹 180，上证50 的扩展圈', 'sh000010'),
  E('上证380', 'SSE 380', 'cn', '宽基', '上证中盘蓝筹 380', 'sh000009'),
  E('深证100', 'SZSE 100', 'cn', '宽基', '深市 100 只核心（成长风格浓）', 'sz399330'),
  E('中证500', 'CSI 500', 'cn', '宽基', '剔除沪深300 后的最大 500 只 = A 股中盘代表', 'sh000905', '沪深300 + 中证500 ≈ 中证800'),
  E('中证700', 'CSI 700', 'cn', '宽基', '中证500 + 中证200，中小盘', 'sh000907'),
  E('中证800', 'CSI 800', 'cn', '宽基', '沪深300 + 中证500，大中盘', 'sh000906'),
  E('中证1000', 'CSI 1000', 'cn', '宽基', '剔除中证800 后的最大 1000 只 = 小盘代表', 'sh000852'),
  E('中证2000', 'CSI 2000', 'cn', '宽基', '小微盘代表（无公开实时源，监控墙以国证2000 代理）', 'sz399303'),
  E('中证全指', 'CSI All Share', 'cn', '宽基', '沪深全市场（剔除 ST 与次新），全市场基准', 'sh000985'),
  E('国证A指', 'CNI A-Share', 'cn', '宽基', '国证规模全市场指数', 'sz399317'),
  E('创业板指', 'ChiNext Index', 'cn', '宽基', '创业板 100 只核心，成长/科技浓度高', 'sz399006'),
  E('创业板50', 'ChiNext 50', 'cn', '宽基', '创业板核心 50（宁德时代/东财等权重高）', 'sz399673'),
  E('创业板综', 'ChiNext Composite', 'cn', '宽基', '创业板全部股票', 'sz399102'),
  E('科创50', 'STAR 50', 'cn', '宽基', '科创板核心 50（半导体权重最高）', 'sh000688'),
  E('科创100', 'STAR 100', 'cn', '宽基', '科创板中盘 100', 'sh000698'),
  E('科创200', 'STAR 200', 'cn', '宽基', '科创板小盘 200（无实时源，知识库收录）'),
  E('科创综指', 'STAR Composite', 'cn', '宽基', '科创板整体', 'sh000680'),
  E('北证50', 'BSE 50', 'cn', '宽基', '北交所核心 50（专精特新主阵地）', 'bj899050'),
  E('中证红利', 'CSI Dividend', 'cn', '策略', '100 只高股息红利股，红利策略旗舰', 'sh000922'),
  E('上证红利', 'SSE Dividend', 'cn', '策略', '上交所高股息 50', 'sh000015'),
  E('深证红利', 'SZSE Dividend', 'cn', '策略', '深市高股息 40', 'sz399324'),
  E('红利低波', 'Dividend Low Vol', 'cn', '策略', '高股息 × 低波动双因子'),
  E('中证白酒', 'CSI Liquor', 'cn', '主题', '白酒产业指数（茅台/五粮液/泸州老窖）'),
  E('中证医药', 'CSI Pharma', 'cn', '行业', '医药综合行业指数'),
  E('中证银行', 'CSI Banks', 'cn', '行业', '银行行业指数'),
  E('中证军工', 'CSI Defense', 'cn', '行业', '国防军工行业指数'),
  E('中证芯片', 'CSI Semiconductor', 'cn', '行业', '半导体芯片产业指数'),
  E('科创芯片', 'STAR Chip', 'cn', '主题', '科创板芯片主题（中芯/海光/寒武纪等）', 'sh000685'),
  E('中证新能源', 'CSI New Energy', 'cn', '行业', '光伏/风电/电池等新能源产业'),
  E('中证人工智能', 'CSI AI', 'cn', '主题', 'AI 主题指数（算力/模型/应用）'),
  E('中证机器人', 'CSI Robot', 'cn', '主题', '机器人产业主题指数'),
  E('中证低空经济', 'CSI Low-Altitude', 'cn', '主题', '低空经济主题（eVTOL/通航）'),
  E('中证创新药', 'CSI Innovative Drug', 'cn', '主题', '创新药主题（CXO/Biotech）'),

  // ---- 港股 ----
  E('恒生指数', 'HSI', 'hk', '宽基', '香港市场旗舰指数（蓝筹 80+）', 'hkHSI'),
  E('恒生中国企业指数', 'HSCEI', 'hk', '宽基', '国企指数：内地企业 H 股/红筹', 'hkHSCEI'),
  E('恒生科技指数', 'HSTECH', 'hk', '宽基', '港股科技 30 强（腾讯/阿里/美团/小米）', 'hkHSTECH'),
  E('恒生综合指数', 'HSCI', 'hk', '宽基', '覆盖恒生综合大型/中型/小型股 95% 市值'),
  E('恒生港股通指数', 'HS Southbound', 'hk', '策略', '可经港股通交易的股票池'),
  E('恒生高股息率指数', 'HS High Dividend', 'hk', '策略', '港股高股息策略'),
  E('恒生医疗保健', 'HS Healthcare', 'hk', '行业', '港股医药医疗板块（18A Biotech 集中地）'),
  E('恒生互联网科技', 'HS Internet', 'hk', '行业', '港股互联网科技板块'),

  // ---- 美国 ----
  E('标普500', 'S&P 500', 'us', '宽基', '美国大盘 500 强，全球定价之锚', 'usINX'),
  E('标普100', 'S&P 100', 'us', '宽基', '标普500 中最大 100 只超大盘（OEX 期权市场发达）', '^OEX'),
  E('标普400', 'S&P MidCap 400', 'us', '宽基', '美国中盘 400', '^SP400'),
  E('标普600', 'S&P SmallCap 600', 'us', '宽基', '美国小盘 600', '^SP600'),
  E('纳斯达克综合', 'Nasdaq Composite', 'us', '宽基', '纳斯达克全部上市股票（科技浓度最高）', 'usIXIC'),
  E('纳斯达克100', 'Nasdaq 100', 'us', '宽基', '纳指非金融 100 巨头（七巨头权重高）', '^NDX'),
  E('道琼斯工业', 'DJIA', 'us', '宽基', '30 只工业蓝筹（价格加权，历史最悠久）', 'usDJI'),
  E('罗素1000', 'Russell 1000', 'us', '宽基', '美国大盘 1000', '^RUI'),
  E('罗素2000', 'Russell 2000', 'us', '宽基', '美国小盘 2000（本土经济风向标）', '^RUT'),
  E('罗素3000', 'Russell 3000', 'us', '宽基', '覆盖美国约 98% 市值的全市场指数', '^RUA'),
  E('费城半导体', 'PHLX SOX', 'us', '行业', '全球半导体景气风向标（30 只）', '^SOX'),
  E('VIX', 'CBOE Volatility Index', 'us', '策略', '标普500 期权隐含波动率——恐慌指数（波动率指数而非股票指数）', '^VIX', 'VIX > 30 = 恐慌；< 15 = 自满'),
  E('纽交所FANG+', 'NYSE FANG+', 'us', '主题', '10 只科技/互联网巨头等权指数'),
  E('KBW银行指数', 'KBW Bank Index', 'us', '行业', '美国大型银行板块'),
  E('纳斯达克生物科技', 'NBI', 'us', '行业', '纳斯达克生物科技板块'),

  // ---- 日本 ----
  E('日经225', 'Nikkei 225', 'jp', '宽基', '日本旗舰指数（价格加权，225 只）', '^N225'),
  E('TOPIX', 'TOPIX', 'jp', '宽基', '东证一部全市场市值加权（约 2000 只）', '1305.T'),
  E('JPX-Nikkei 400', 'JPX-Nikkei 400', 'jp', '策略', '日本优质 400（ROE/治理筛选）', '1364.T'),
  E('TOPIX Core30', 'TOPIX Core30', 'jp', '宽基', '日本超大盘 30'),
  E('TOPIX Mid400', 'TOPIX Mid400', 'jp', '宽基', '日本中盘 400'),

  // ---- 韩国 ----
  E('KOSPI', 'KOSPI', 'kr', '宽基', '韩国综合股价指数（三星电子权重极高）', '^KS11'),
  E('KOSPI 200', 'KOSPI 200', 'kr', '宽基', '韩期所衍生品标的 200'),
  E('KOSDAQ', 'KOSDAQ', 'kr', '宽基', '韩国创业板（半导体设备/生物强）', '^KQ11'),
  E('KRX 300', 'KRX 300', 'kr', '宽基', '韩交所全市场 300'),

  // ---- 中国台湾 ----
  E('台湾加权指数', 'TAIEX', 'tw', '宽基', '台交所全市场发行量加权（台积电一家独大）', '^TWII'),
  E('台湾50', 'Taiwan 50', 'tw', '宽基', '台股市值前 50', '0050.TW'),
  E('台湾中型100', 'Taiwan Mid-Cap 100', 'tw', '宽基', '台湾中型股 100', '0051.TW'),
  E('台湾资讯科技', 'Taiwan Technology', 'tw', '行业', '台湾科技板块（全球硬件供应链核心）', '0052.TW'),

  // ---- 印度 ----
  E('NIFTY 50', 'NIFTY 50', 'in', '宽基', '印度国家交易所 50 龙头（外资流入主标的）', '^NSEI'),
  E('NIFTY Next 50', 'NIFTY Next 50', 'in', '宽基', '下一个 50：未来大盘候选池', '^NSMIDCP'),
  E('NIFTY Bank', 'NIFTY Bank', 'in', '行业', '印度银行 12 强（金融占印度指数权重最高）', '^NSEBANK'),
  E('NIFTY IT', 'NIFTY IT', 'in', '行业', '印度 IT 外包板块（全球企业 IT 支出风向标）', '^CNXIT'),
  E('NIFTY Midcap 50', 'NIFTY Midcap 50', 'in', '宽基', '印度中盘 50', '^NSEMDCP50'),
  E('SENSEX', 'BSE SENSEX', 'in', '宽基', '孟买交易所 30 龙头（亚洲最老指数之一）', '^BSESN'),

  // ---- 欧洲 ----
  E('欧洲斯托克50', 'EURO STOXX 50', 'eu', '宽基', '欧元区 50 蓝筹（ASML/思爱普/LVMH 类权重高）', '^STOXX50E'),
  E('欧洲斯托克600', 'STOXX Europe 600', 'eu', '宽基', '欧洲 18 国 600 只广泛市场', '^STOXX'),
  E('德国DAX', 'DAX', 'eu', '宽基', '法兰克福 40 龙头（总回报口径）', '^GDAXI'),
  E('德国MDAX', 'MDAX', 'eu', '宽基', '德国中盘 60', '^MDAXI'),
  E('德国TecDAX', 'TecDAX', 'eu', '行业', '德国科技 30（SAP/英飞凌）', '^TECDAX'),
  E('法国CAC 40', 'CAC 40', 'eu', '宽基', '巴黎 40 龙头（奢侈品三巨头权重高）', '^FCHI'),
  E('英国富时100', 'FTSE 100', 'eu', '宽基', '伦敦 100 龙头（成分股七成收入来自海外）', '^FTSE'),
  E('英国富时250', 'FTSE 250', 'eu', '宽基', '英国中盘 250（更纯粹的英国本土经济）', '^FTMC'),
  E('意大利富时MIB', 'FTSE MIB', 'eu', '宽基', '米兰 40 龙头', 'FTSEMIB.MI'),
  E('西班牙IBEX 35', 'IBEX 35', 'eu', '宽基', '马德里 35 龙头', '^IBEX'),
  E('瑞士SMI', 'Swiss Market Index', 'eu', '宽基', '苏黎世 20 龙头（雀巢/诺华/罗氏）', '^SSMI'),
  E('荷兰AEX', 'AEX', 'eu', '宽基', '阿姆斯特丹 25（ASML 权重极高）', '^AEX'),
  E('比利时BEL 20', 'BEL 20', 'eu', '宽基', '布鲁塞尔 20', '^BFX'),
  E('瑞典OMXS30', 'OMX Stockholm 30', 'eu', '宽基', '斯德哥尔摩 30', '^OMX'),
  E('丹麦OMXC25', 'OMX Copenhagen 25', 'eu', '宽基', '哥本哈根 25（诺和诺德权重过半）', '^OMXC25'),
  E('芬兰OMXH25', 'OMX Helsinki 25', 'eu', '宽基', '赫尔辛基 25（诺基亚）', '^OMXH25'),
  E('奥地利ATX', 'ATX', 'eu', '宽基', '维也纳 20', '^ATX'),

  // ---- 亚太其他 ----
  E('新加坡海峡时报', 'STI', 'sg', '宽基', '新加坡 30 龙头（东南亚门户）', '^STI'),
  E('越南VN-Index', 'VN-Index', 'vn', '宽基', '胡志明证交所全市场（新兴市场黑马）', 'VNM'),
  E('印尼雅加达综指', 'IDX Composite', 'id', '宽基', '印尼全市场（人口红利+大宗）', '^JKSE'),
  E('马来西亚KLCI', 'FTSE Bursa KLCI', 'my', '宽基', '吉隆坡综合指数', '^KLSE'),
  E('泰国SET', 'SET Index', 'th', '宽基', '泰国证交所综合指数', '^SET.BK'),
  E('澳洲ASX 200', 'S&P/ASX 200', 'au', '宽基', '澳大利亚 200（矿业+银行双支柱）', '^AXJO'),
  E('澳洲全指', 'All Ordinaries', 'au', '宽基', '澳大利亚全市场', '^AORD'),
  E('新西兰NZX 50', 'S&P/NZX 50', 'nz', '宽基', '新西兰 50', '^NZ50'),

  // ---- 美洲其他 ----
  E('加拿大多伦多TSX', 'S&P/TSX Composite', 'ca', '宽基', '加拿大全市场（能源金融权重高）', '^GSPTSE'),
  E('巴西Ibovespa', 'Ibovespa', 'br', '宽基', '拉美最大市场圣保罗龙头指数', '^BVSP'),
  E('墨西哥IPC', 'S&P/BMV IPC', 'mx', '宽基', '墨西哥城龙头指数', '^MXX'),
  E('智利IPSA', 'S&P IPSA', 'cl', '宽基', '圣地亚哥 40（全球铜矿晴雨表）', '^IPSA'),

  // ---- 中东 ----
  E('沙特TASI', 'Tadawul All Share', 'sa', '宽基', '中东最大市场（沙特阿美上市地，周日-周四交易）', '^TASI.SR'),
  E('以色列TA-125', 'TA-125', 'il', '宽基', '特拉维夫 125（科技/军工出口强）', '^TA125.TA'),
  E('土耳其BIST 100', 'BIST 100', 'tr', '宽基', '伊斯坦布尔 100（高通胀高波动代表）', '^XU100'),

  // ---- 全球型 ----
  E('MSCI World', 'MSCI World', 'global', '全球', '全球发达市场（约 23 国 1400+ 只），发达市场基准', 'URTH'),
  E('MSCI ACWI', 'MSCI ACWI', 'global', '全球', '全球发达 + 新兴市场（"一个指数看全球"）', 'ACWI'),
  E('MSCI新兴市场', 'MSCI EM', 'global', '全球', '全球新兴市场（中国/印度/台湾/韩国权重最高）', 'EEM'),
  E('MSCI EAFE', 'MSCI EAFE', 'global', '全球', '欧洲+澳洲+远东发达市场（美国除外）', 'EFA'),
  E('MSCI前沿市场', 'MSCI Frontier', 'global', '全球', '前沿市场（越南/尼日利亚/哈萨克等）', 'FM'),
  E('富时全球All-World', 'FTSE All-World', 'global', '全球', 'FTSE 全球全市场（Vanguard VT 跟踪标的）', 'VT'),
  E('标普全球1200', 'S&P Global 1200', 'global', '全球', '全球 1200 龙头（约 70% 市值）'),
]

// ---------- 2) 市场知识（层级框架，注入 Agent） ----------

/** 全球市场层级知识（《大全》核心框架浓缩，注入宏观/行业 Agent 与规划师） */
export const MARKET_TREE_KNOWLEDGE = `全球股票市场层级框架：国家/地区 → 股票市场 → 交易所 → 板块 → 宽基指数 → 行业指数 → 主题指数 → 策略/因子指数 → ETF/基金 → 具体投资产品。
关键关系（必须掌握，禁止混淆）：
- 沪深300 + 中证500 ≈ 中证800；中证800 ⊂ 中证1000 ⊂ 中证全指；中证A50/上证50 = 超大盘，中证2000 = 小微盘
- 纳斯达克综合指数 ≠ 纳斯达克100（前者是全市场，后者是非金融 100 巨头）；标普500/400/600 分别对应美式大/中/小盘；Russell 1000 大盘 / 2000 小盘 / 3000 全市场
- 恒生指数 ≠ 恒生中国企业指数（HSCEI 国企）≠ 恒生科技（HSTECH）；港股 ≠ H股（H 股只是港股的一种）
- 日经225（价格加权）≠ TOPIX（市值加权）；台湾加权指数中台积电权重极高；KOSPI 中三星权重极高
- MSCI World = 全球发达市场；MSCI Emerging Markets = 新兴市场；MSCI ACWI = 两者合集；MSCI EAFE = 发达市场除美国；MSCI Frontier Markets = 前沿市场
- 指数分类方法论：综合/超大盘/大盘/中盘/小盘/微盘/行业/主题/成长/价值/红利/低波/质量/动量/等权/多因子/ESG/全球/发达/新兴/前沿
- VIX 不是股票指数，是标普500 期权隐含波动率指数；"道指"通常指道琼斯工业平均指数 DJIA`

// ---------- 3) 查询识别 ----------

/** 从 INDEX_CATALOG 构建名称索引（长词优先；纯数字碎片与过短拉丁词剔除，防止「300」误命中） */
const CATALOG_INDEX: { entry: IndexCatalogEntry; keys: string[] }[] = INDEX_CATALOG.map((entry) => {
  const keys = [entry.name, entry.en, ...entry.name.split(/[\s/·]/), ...entry.en.split(/[\s/·/-]/)]
    .map((k) => k.trim().toLowerCase())
    .filter((k) => {
      if (k.length < 2) return false
      const hasCjk = /[\u4e00-\u9fa5]/.test(k)
      const isNumeric = /^\d+$/.test(k)
      if (isNumeric) return k.length >= 4 // 纯数字需 ≥4 位（3000/1000 可，300/50 不可）
      return hasCjk || k.length >= 3
    })
  return { entry, keys: [...new Set(keys)] }
}).sort((a, b) => Math.max(...b.keys.map((k) => k.length)) - Math.max(...a.keys.map((k) => k.length)))

export interface IndexTopicMatch {
  entry: IndexCatalogEntry
  /** 命中的名称 */
  matched: string
  /** 在查询中的位置 */
  pos: number
}

/**
 * 从用户问题中识别指数研究意图（确定性，长词优先）。
 * 例："沪深300 现在怎么样" → 沪深300（sh000300 可实时拉取）；
 *    "MSCI新兴市场指数走势" → MSCI EM（EEM ETF 代理）。
 */
export function matchIndexTopic(query: string): IndexTopicMatch | null {
  const q = query.toLowerCase()
  let best: (IndexTopicMatch & { klen: number }) | null = null
  for (const { entry, keys } of CATALOG_INDEX) {
    for (const k of keys) {
      const idx = q.indexOf(k)
      if (idx === -1) continue
      // 与「命中的 key 长度」比较（不是名称长度），长词优先、同长取更靠前
      if (!best || k.length > best.klen || (k.length === best.klen && idx < best.pos)) {
        best = { entry, matched: entry.name, pos: idx, klen: k.length }
      }
      break
    }
  }
  return best
}

/**
 * 指数知识块 → Agent 提示词（当查询命中指数或涉及宏观市场语境时注入）。
 * 仅注入命中的指数条目 + 层级框架，不注入全目录（控制 token）。
 */
export function indexKnowledgeBlock(query: string): string | null {
  const hit = matchIndexTopic(query)
  if (!hit) return null
  const { entry } = hit
  const live = entry.quoteCode
    ? `该指数已接入实时行情（内部代码 ${entry.quoteCode}），系统会自动注入实时点位与K线数据。`
    : '该指数暂无免费实时源，分析时请基于市场常识与检索到的新闻，不要编造点位数字。'
  return `用户提问涉及股票指数「${entry.name}（${entry.en}）」。知识库释义：${entry.desc}。${entry.relation ? `指数关系：${entry.relation}。` : ''}${live}\n${MARKET_TREE_KNOWLEDGE}`
}
