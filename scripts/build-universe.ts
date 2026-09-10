/**
 * 全球热门标的快照库构建脚本（一次性工具，可重跑）
 *
 * A股/港股：全代码空间扫描腾讯行情接口（权威名称 + 实时成交额/市值），按「成交额」降序取热门标的
 * 美股：LLM 多角度生成候选 ticker（标普500/纳指100/行业龙头/热门中概/散户热点…），腾讯行情逐一验证，按市值排序
 * 北交所：LLM 候选 + 验证（并入 A股池参与热度排序）
 *
 * 产出：db/seed/universe.json（零幻觉：名称全部来自行情源）
 * 运行：bun scripts/build-universe.ts [--cn-only|--us-only] [--seed]
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const MIMO = {
  baseUrl: process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1',
  apiKey: process.env.MIMO_API_KEY || '',
  model: process.env.MIMO_MODEL || 'mimo-v2.5',
}

const UNIVERSE_SEED_PATH = new URL('../db/seed/universe.json', import.meta.url)

/** 快照库规模目标（--expand：5000 = A股 2000 / 港股 1500 / 美股 1500；--expand10k：10000+ = A股 5200 / 港股 2700 / 美股 2500） */
const TOP_CN = 2000
const TOP_HK = 1500
const TOP_US = 1500

interface RawQuote {
  code: string
  name: string
  amount: number // 成交额（当日累计）
  mcap: number // 总市值
  price: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------- GLM 文本生成（结构化清单用，比 JSON 稳健得多） ----------

/** 用 z-ai-web-dev-sdk（GLM-4.6）生成竖线分隔清单：每行 TICKER|中文名|行业 */
async function askGLMLines(prompt: string, maxLines = 200): Promise<{ c: string; n: string; i: string }[]> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const res = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            '你是证券数据分析师，输出严格的行式清单，每行格式：TICKER|中文名|行业。只输出清单本身，不要表头，不要序号，不要 markdown，不要解释。',
        },
        { role: 'user', content: `${prompt}\n要求：输出不超过 ${maxLines} 行；ticker 必须真实存在（1-5 个字母）；宁缺毋滥。` },
      ],
    })
    const text = (res as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? ''
    const out: { c: string; n: string; i: string }[] = []
    for (const line of text.split(/\n+/)) {
      const m = line.trim().match(/^([A-Z][A-Z.\-]{0,6})\s*\|\s*([^|]+)\s*(?:\|\s*([^|]*))?$/)
      if (m) out.push({ c: m[1].trim().toUpperCase(), n: m[2].trim(), i: (m[3] ?? '').trim().slice(0, 12) })
    }
    return out
  } catch (e) {
    console.log(`  [glm] failed: ${(e as Error).message}`)
    return []
  }
}

// ---------- 腾讯批量验证（返回有效 quote 的完整字段） ----------

/** 批量查询腾讯行情；返回 Map<原始code, RawQuote>；带 WAF 挑战页检测与单次重试 */
async function tencentBatch(codes: string[], retried = false): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>()
  if (codes.length === 0) return out
  try {
    const res = await fetch(`https://qt.gtimg.cn/q=${codes.join(',')}`, {
      headers: { 'User-Agent': UA, Referer: 'https://gu.qq.com' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
    const buf = await res.arrayBuffer()
    const txt = new TextDecoder('gbk').decode(buf)
    // WAF 挑战页（HTML）检测：重试一次，冷却后仍失败则放弃本批
    if (/<!DOCTYPE|<html/i.test(txt.slice(0, 120))) {
      if (!retried) {
        await sleep(2500)
        return tencentBatch(codes, true)
      }
      console.log(`  [waf] challenge page, chunk dropped (${codes.length} codes)`)
      return out
    }
    for (const line of txt.split(';')) {
      const m = line.match(/v_(\S+)="([^"]*)"/)
      if (!m) continue
      const f = m[2].split('~')
      if (f.length < 46) continue
      const price = parseFloat(f[3])
      if (!Number.isFinite(price) || price <= 0) continue
      // 原始传入符号（如 sh600519 / hk00700 / usAAPL）作为 key
      const orig = codes.find((c) => m[1].toLowerCase() === c.toLowerCase()) ?? m[1]
      out.set(orig, {
        code: orig,
        name: (f[1] ?? '').trim(),
        amount: parseFloat(f[37]) || 0,
        mcap: parseFloat(f[45]) || 0,
        price,
      })
    }
  } catch {
    // 网络抖动：本批失败静默
  }
  return out
}

/** 分块并发扫描一批符号（chunk 70×并发 4：5000 只扩容下对腾讯 WAF 更友好） */
async function sweep(symbols: string[], chunkSize = 70, concurrency = 4): Promise<RawQuote[]> {
  const chunks: string[][] = []
  for (let i = 0; i < symbols.length; i += chunkSize) chunks.push(symbols.slice(i, i + chunkSize))
  const results: RawQuote[] = []
  let done = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (chunks.length > 0) {
      const chunk = chunks.shift()
      if (!chunk) break
      const m = await tencentBatch(chunk)
      results.push(...m.values())
      done++
      if (done % 20 === 0) console.log(`  [sweep] ${done}/${chunks.length + done} chunks, ${results.length} valid`)
      await sleep(100)
    }
  })
  await Promise.all(workers)
  return results
}

// ---------- MiMo LLM 候选生成 ----------

async function askMimoJSON(prompt: string, maxTokens = 8000): Promise<unknown[]> {
  if (!MIMO.apiKey) {
    throw new Error('MIMO_API_KEY is required to generate MiMo candidates')
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${MIMO.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MIMO.apiKey}` },
        body: JSON.stringify({
          model: MIMO.model,
          max_tokens: maxTokens,
          temperature: 0.3,
          messages: [
            { role: 'system', content: '你是一家基金公司的数据分析师，熟悉全球证券市场。只输出合法 JSON 数组，不要 markdown 围栏，不要解释。' },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as { choices?: { message?: { content?: string; reasoning_content?: string } }[] }
      const msg = j.choices?.[0]?.message
      const content = `${msg?.content ?? ''}\n${msg?.reasoning_content ?? ''}`
      const start = content.indexOf('[')
      const end = content.lastIndexOf(']')
      if (start === -1 || end <= start) throw new Error('no JSON array found')
      const arr = JSON.parse(content.slice(start, end + 1))
      if (Array.isArray(arr)) return arr
      throw new Error('not array')
    } catch (e) {
      console.log(`  [mimo] attempt ${attempt + 1} failed: ${(e as Error).message}`)
      await sleep(2000 * (attempt + 1))
    }
  }
  return []
}

// ---------- 市场 SwEEP 范围 ----------

function cnSymbols(): string[] {
  const out: string[] = []
  const push = (from: number, to: number, pre: 'sh' | 'sz' | 'bj') => {
    for (let c = from; c <= to; c++) out.push(`${pre}${String(c).padStart(6, '0')}`)
  }
  push(600000, 605999, 'sh') // 沪主板
  push(688000, 689499, 'sh') // 科创板
  push(1, 3999, 'sz') // 深主板（000001-003999）
  push(300000, 302999, 'sz') // 创业板
  // 北交所全代码空间扫描（约 280 家上市，代码分散在 43/83/87/92 段）
  push(430000, 430999, 'bj')
  push(830000, 839999, 'bj')
  push(870000, 873999, 'bj')
  push(920000, 920999, 'bj')
  return out
}

function hkSymbols(): string[] {
  const out: string[] = []
  for (let c = 1; c <= 9999; c++) out.push(`hk${String(c).padStart(5, '0')}`)
  return out
}

/** 港股过滤：剔除 ETF/牛熊证/涡轮/REIT 命名特征（保留真正的股票） */
function isLikelyHkStock(name: string): boolean {
  if (!name) return false
  if (/ETF|@|[-–]RP|REIT/i.test(name)) return false
  // 港股涡轮/牛熊证中文名特征（腾讯源）：含「购/沽/牛/熊/证/A/B/C/D/E」后缀组合
  if (/(购|沽|牛|熊).{0,3}[A-E]$/.test(name)) return false
  if (/^[A-Z0-9]{2,6}\d{4,5}[A-Z]$/.test(name)) return false // 衍生权证代码式名称
  return true
}

// ---------- 美股 LLM 候选 ----------

const US_ANGLES: string[] = [
  '列出标普500 指数成分股中市值最大的 100 家公司的美股代码',
  '列出标普500 指数成分股中市值排名第 101 到第 250 的美股代码（跳过前面已列的大公司）',
  '列出纳斯达克100 指数成分股的完整美股代码（约 100 家）',
  '列出美股半导体行业上市公司（英伟达/AMD/英特尔/美光/高通/应用材料/拉姆研究/迈威尔/微芯/安森美/莱迪思及更多中小半导体公司）的美股代码，尽可能多',
  '列出美股金融行业上市公司（摩根大通/美国银行/富国银行/高盛/摩根士丹利/花旗/贝莱德/嘉信理财/维萨/万事达及更多区域性银行/保险/资管公司）的美股代码，尽可能多',
  '列出美股医疗健康行业上市公司（联合健康/强生/礼来/辉瑞/默沙东/艾伯维/百时美施贵宝/再生元/福泰制药/吉利德/安进/直觉外科及更多生物科技/医疗器械公司）的美股代码，尽可能多',
  '列出美股能源/工业/材料/公用事业行业知名上市公司（埃克森美孚/雪佛龙/康菲/西方石油/斯伦贝谢/卡特彼勒/迪尔/波音/洛克希德马丁/雷神/霍尼韦尔/通用电气/3M及更多）的美股代码，尽可能多',
  '列出美股消费行业知名上市公司（沃尔玛/开市客/家得宝/塔吉特/耐克/星巴克/麦当劳/可口可乐/百事/宝洁/亿滋及更多餐饮零售服装公司）的美股代码，尽可能多',
  '列出在美上市中概股与知名中资公司（阿里巴巴/拼多多/京东/百度/网易/蔚来/理想/小鹏/贝壳/哔哩哔哩/爱奇艺/唯品会/满帮/富途及更多）的美股代码，尽可能多',
  '列出美股互联网/软件/云计算知名公司（谷歌/微软/Meta/苹果/奈飞/Salesforce/甲骨文/Adobe/Snowflake/Palantir/Uber/Lyft/Shopify/Spotify/Robinhood及更多）的美股代码，尽可能多',
  '列出美股游戏/娱乐/媒体/流媒体公司（迪士尼/动视?/EA/Take-Two/Roblox/Unity/Warner Bros/派拉蒙/ Roku /Pinterest/Snap及更多）的美股代码，尽可能多',
  '列出美股电信/交通/航空/酒店/地产知名公司（Verizon/AT&T/T-Mobile/达美航空/联合航空/美国航空/皇家加勒比/万豪/希尔顿/Prologis/美国塔及更多）的美股代码，尽可能多',
  '列出知名美股 ADR（台积电TSM/阿斯麦ASML/诺和诺德NVO/雀巢NSRGY/丰田TM/索尼SONY/壳牌SHEL/英国石油BP/必和必拓BHP/淡水河谷VALE及更多）的美股代码，尽可能多',
  '列出美股散户/社交媒体热门股票（游戏驿站/AMC娱乐/法拉利/Rivian/Lucid/Coinbase/PayPal/Robinhood/特斯拉及更多 meme 与高关注股票）的美股代码，尽可能多',
  '列出美股 REIT 与房地产投资信托知名公司（American Tower/Prologis/Equinix/Simon Property/Public Storage/O/Welltower及更多）的美股代码，尽可能多',
  '列出标普500 中市值排名第 251 到第 500 的知名美股代码（工业/金融/医疗/消费等各行业中型蓝筹），尽可能多',
  '列出美股网络安全/IT服务知名公司（CrowdStrike/Palo Alto/Fortinet/Zscaler/SentinelOne/Gen Digital及更多）的美股代码，尽可能多',
  '列出美股支付/金融科技知名公司（PayPal/Block/Adyen ADR/Wise ADR/Affirm/SoFi/Upstart及更多）的美股代码，尽可能多',
  '列出美股保险行业知名公司（Progressive/Travelers/Allstate/Chubb/Aon/Marsh&McLennan/Aflac及更多）的美股代码，尽可能多',
  '列出美股餐饮/零售/服装知名公司（Chipotle/Yum Brands/Ross Stores/Abercrombie/Urban Outfitters/Deckers及更多）的美股代码，尽可能多',
  '列出美股航空/邮轮/酒店度假知名公司（西南航空/联合航空/美国航空/皇家加勒比/挪威邮轮/希尔顿及更多）的美股代码，尽可能多',
  '列出美股铁路/公路运输/物流知名公司（联合太平洋/CSX/诺福克南方/J.B. Hunt/Old Dominion/XPO/CH Robinson及更多）的美股代码，尽可能多',
  '列出美股特殊化学品/材料/涂料知名公司（林德/空气化工/宣伟/艺康/陶氏及更多）的美股代码，尽可能多',
  '列出美股军工/国防知名公司（洛克希德马丁/雷神/诺斯罗普格鲁曼/通用动力/L3Harris/亨廷顿英戈尔斯及更多）的美股代码，尽可能多',
  '列出美股油服/采矿/钢铁/铝业知名公司（斯伦贝谢/哈里伯顿/贝克休斯/纽柯/美国钢铁/美铝/世纪铝业及更多）的美股代码，尽可能多',
  '列出美股烟草/家居/个人护理知名公司（奥驰亚/菲利普莫里斯/高露洁/金伯利/克林克/Coty/e.l.f.美妆及更多）的美股代码，尽可能多',
  '列出美股检测认证/人力资源/办公服务知名公司（扫帚?/ADP/Paychex/Robert Half/求贤?/Equifax/标普全球/穆迪及更多）的美股代码，尽可能多',
  '列出美股博彩/休闲知名公司（拉斯维加斯金沙/美高梅/凯撒/DraftKings/宾州娱乐/嘉年华邮轮及更多）的美股代码，尽可能多',
  '列出美股垂直软件/行业数字化知名公司（Towerbroook?/Tyler Technologies/Guidewire/ Bentley?/Procore/Descartes及更多）的美股代码，尽可能多',
  '列出美股医疗诊断/基因/生命科学服务知名公司（Illumina/Natera/Veeva/Repligen/Revvity/Waters及更多）的美股代码，尽可能多',
  '列出美股电力设备/新能源基建知名公司（Eaton/Quanta Services/EMCOR/First Solar/Enphase/SolarEdge/GE Vernova及更多）的美股代码，尽可能多',
  '列出标普400 中盘指数中市值最大的 60 家公司美股代码（中型蓝筹，避开标普500 已有名企），尽可能多',
]

/** --expand10k 专用的美股补充角度（瞄准未被覆盖的细分行业/小盘，冲击 2500 只） */
const US_10K_ANGLES: string[] = [
  '列出美股半导体材料/EDA/芯片设计细分公司（新思科技/镜戎科技/Ansys/西门子 EDA 之外的 Cadence/Synopsys/FormFactor/Amkor/Entegris/Onto/ASML ADR 及更多 EDA/封测/硅材料公司）的美股代码，尽可能多',
  '列出美股数据中心/通信基建/塔类 REIT 与网络设备公司（Equinix/Digital Realty/American Tower/Crown Castle/Arista/Extreme Networks/Calix 及更多）的美股代码，尽可能多',
  '列出美股医疗分销/医疗信息化/保险服务公司（McKesson/Cencora/Cardinal Health/Veeva/GoodRx/Oscar Health/Clover Health 及更多）的美股代码，尽可能多',
  '列出美股汽车零部件/电动车产业链公司（Aptiv/BorgWarner/Lear/Magna ADR/Autin?/ Gentex/Gentherm/Allison 及更多）的美股代码，尽可能多',
  '列出美股航天/无人机/军工电子公司（Heico/TransDigm/Booz Allen/Leidos/Kratos/AeroVironment/Axion?/Rocket Lab/AST SpaceMobile 及更多）的美股代码，尽可能多',
  '列出美股食品饮料细分公司（荷美尔/康尼格拉/金宝汤/通用磨坊/Lamb Weston/US Foods/Performance Food/Molson Coors/Brown-Forman 及更多）的美股代码，尽可能多',
  '列出美股建材/家装/工程机械零售与制造商（Builders FirstSource/Ferguson/Beacon/Watsco/Pool/Tractor Supply/Floor & Decor 及更多）的美股代码，尽可能多',
  '列出美股服装鞋类/珠宝/奢侈品公司（Ralph Lauren/Tapestry/Capri/Skechers/Crocs/On Holding/Signet 及更多）的美股代码，尽可能多',
  '列出美股广告营销/传媒/信息服务公司（Omnicom/IPG/Nielsen?/Kantar?/Thomson Reuters ADR/RELX ADR/Wolters Kluwer ADR 及更多）的美股代码，尽可能多',
  '列出美股专业服务/人力资源/咨询公司（ADP/Paychex/Robert Half/Equifax/TransUnion/Verisk/Cra?/FTI Consulting 及更多）的美股代码，尽可能多',
  '列出美股电池/储能/锂矿/氢能公司（Albemarle/SQM ADR/Plug Power/Bloom Energy/FuelCell/Enphase 之外的 Ballard?/Fluence/Eos Energy 及更多）的美股代码，尽可能多',
  '列出美股农业/农化/种子/农机公司（Corteva/ADM/Bunge/Mosaic/CF Industries/Deere 之外的 AGCO/Lindsay/Scotts 及更多）的美股代码，尽可能多',
  '列出美股主题公园/健身/休闲公司（Six Flags/Cedar Fair?/United Parks/Lifetime/Planet Fitness/Xponential 及更多）的美股代码，尽可能多',
  '列出美股工业分销/租赁/环保服务公司（Fastenal/Grainger/W.W. Grainger 之外的 United Rentals/Ashtead ADR/Republic Services/Waste Connections/Veralto 及更多）的美股代码，尽可能多',
  '列出美股知名中盘科技/金融科技公司（Twilio/Confluent/Elastic/Datadog/Zscaler 之外的 MongoDB/HubSpot/Procore/Navan?/Klaviyo 及更多）的美股代码，尽可能多',
  '列出美股知名 biotech 中型公司（Alnylam/BioMarin/Incyte/Neurocrine 之外的 Immunogen?/Mirati?/Karuna?/Arcutis/Krystal/Apellis 及更多）的美股代码，尽可能多',
  '列出美股区域性强馆/物业 REIT//self-storage 知名公司（AvalonBay/MAA/Essentials?/Mid-America/Camden/Extra Space/Neptune? 及更多）的美股代码，尽可能多',
  '列出美股知名能源中盘/煤炭/铀公司（Constellation Energy/CEG/Pioneer?/Cameco ADR/Centrus/EQT/Antero 及更多）的美股代码，尽可能多',
  '列出美股消费金融/资产管理中型公司（Blackstone/KKR/Apollo/Ares/T. Rowe/Franklin/Invesco/Janus?/AllianceBernstein 及更多）的美股代码，尽可能多',
  '列出美股知名小盘成长股（Axon?/Dexcom?/Sprout Social/Alight?/Five9/Asana/Smartsheet?/Domo 及更多市值 20-100 亿美元小盘科技）的美股代码，尽可能多',
]

async function buildUsCandidates(extraAngles: string[] = []): Promise<Map<string, { n: string; i: string }>> {
  const pool = new Map<string, { n: string; i: string }>()
  const queue = extraAngles.length > 0 ? extraAngles : [...US_ANGLES]
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length > 0) {
      const angle = queue.shift()
      if (!angle) break
      console.log(`  [us] GLM angle: ${angle.slice(0, 26)}…`)
      const lines = await askGLMLines(angle, 150)
      let added = 0
      for (const it of lines) {
        if (!pool.has(it.c)) added++
        pool.set(it.c, { n: it.n, i: it.i })
      }
      console.log(`  [us] +${added} (pool=${pool.size})`)
      await sleep(400)
    }
  })
  await Promise.all(workers)
  console.log(`  [us] LLM 候选去重后：${pool.size}`)
  return pool
}

/** 扩容模式专用的美股补充角度（瞄准中盘/小盘/细分行业，冲击 1500 只） */
const US_EXTRA_ANGLES: string[] = [
  '列出美股医疗设备与器械知名公司（雅培/美敦力/爱德华兹/史赛克/波士顿科学/直觉外科/瑞思迈/德康/Hologic/Insulet 及更多）的美股代码，尽可能多',
  '列出美股生物科技行业中大型公司（Incyte/Exelixis/Neurocrine/Alnylam/Sarepta/Ionis/BioMarin/United Therapeutics/Regeneron 之外的更多 Biotech）的美股代码，尽可能多',
  '列出美股区域性银行与 specialty finance 公司（PNC/Truist/ Citizens/ M&T/KeyCorp/Huntington/Comerica/Zions/Western Alliance 及更多）的美股代码，尽可能多',
  '列出美股公用事业与电力公司（NextEra/Duke Energy/Southern Company/AEP/Exelon/Constellation/Vistra/PG&E/Edison/WEC 及更多）的美股代码，尽可能多',
  '列出标普600 小盘指数中知名度较高的公司美股代码，尽可能多',
  '列出罗素2000 中流动性较好的知名美国小盘股美股代码，尽可能多',
  '列出美股近年来 IPO 或直接上市的成长型公司（Arm/Reddit/Instacart/Klaviyo/CAVA/Sweetgreen/DLocal/Grab/Varonis?/Rubrik/Amentum 及更多）的美股代码，尽可能多',
  '列出美股半导体设备/电子制造/光模块/连接器等硬件供应链公司（Ametek/TE Connectivity/Corning/Jabil/Flex/ChipMOS?/MPS/Onto/Entegris/Coherent 及更多）的美股代码，尽可能多',
]

// ---------- 主流程 ----------

async function main() {
  const args = process.argv.slice(2)
  const cnOnly = args.includes('--cn-only')
  const usOnly = args.includes('--us-only')
  const doSeed = args.includes('--seed')

  // ===== --expand / --expand10k：扩容模式（保留旧行业标签） =====
  //   --expand    → 5000：A股 2000 / 港股 1500 / 美股 1500
  //   --expand10k → 10000+：A股 5200 / 港股 2700 / 美股 2500（A+港 保底 7900，总量稳过万）
  if (args.includes('--expand') || args.includes('--expand10k')) {
    const is10k = args.includes('--expand10k')
    const TARGET_CN = is10k ? 5200 : TOP_CN
    const TARGET_HK = is10k ? 2700 : TOP_HK
    const TARGET_US = is10k ? 2500 : TOP_US
    const US_ROUNDS = is10k ? 6 : 3
    const usAngles = is10k ? [...US_EXTRA_ANGLES, ...US_10K_ANGLES] : US_EXTRA_ANGLES
    console.log(
      `[expand${is10k ? '10k' : ''}] 目标：A股 ${TARGET_CN} / 港股 ${TARGET_HK} / 美股 ${TARGET_US}`,
    )
    type Row = { code: string; name: string; market: string; industry: string | null }
    // 1) 以 DB 为基线（含已回填的行业标签）
    const { PrismaClient } = await import('@prisma/client')
    const db = new PrismaClient()
    let base: Row[] = []
    try {
      base = await db.stockUniverse.findMany({
        select: { code: true, name: true, market: true, industry: true },
      })
    } finally {
      await db.$disconnect()
    }
    console.log(`[expand${is10k ? '10k' : ''}] 基线 ${base.length} 只（行业标签 ${base.filter((s) => s.industry).length} 条）`)
    const industryOf = new Map(base.map((s) => [`${s.market}:${s.code}`, s.industry]))
    const result: Row[] = []

    // 2) A股：全代码空间重扫 × 成交额 TopN
    console.log(`[expand${is10k ? '10k' : ''}/cn] 重扫 A 股代码空间…`)
    const cn = await sweep(cnSymbols())
    const cnPool = cn
      .map((q) => ({
        code: q.code.replace(/^(sh|sz|bj)/, ''),
        name: q.name,
        market: q.code.startsWith('sh') ? 'SH' : q.code.startsWith('sz') ? 'SZ' : 'BJ',
        industry: '',
        amount: q.amount,
      }))
      .filter((s) => !/退/.test(s.name))
    cnPool.sort((a, b) => b.amount - a.amount)
    const cnTop = cnPool.slice(0, TARGET_CN)
    for (const { amount: _a, ...rest } of cnTop) {
      result.push({ ...rest, industry: industryOf.get(`${rest.market}:${rest.code}`) ?? '' })
    }
    console.log(`[expand${is10k ? '10k' : ''}/cn] Top ${cnTop.length}`)

    // 3) 港股：全代码空间重扫 × 成交额 TopN
    console.log(`[expand${is10k ? '10k' : ''}/hk] 重扫港股代码空间…`)
    const hk = await sweep(hkSymbols())
    const hkPool = hk
      .filter((q) => isLikelyHkStock(q.name))
      .map((q) => ({
        code: q.code.replace(/^hk/, '').padStart(5, '0'),
        name: q.name,
        market: 'HK',
        industry: '',
        amount: q.amount,
      }))
      .filter((s) => !/退|REIT/i.test(s.name))
    hkPool.sort((a, b) => b.amount - a.amount)
    const hkTop = hkPool.slice(0, TARGET_HK)
    for (const { amount: _a, ...rest } of hkTop) {
      result.push({ ...rest, industry: industryOf.get(`HK:${rest.code}`) ?? '' })
    }
    console.log(`[expand${is10k ? '10k' : ''}/hk] Top ${hkTop.length}`)

    // 4) 美股：保留现有 + 新角度多轮补足到目标
    const usOld = base.filter((s) => s.market === 'US')
    const usTop: Row[] = [...usOld]
    const have = new Set(usTop.map((s) => s.code))
    for (let round = 0; round < US_ROUNDS && usTop.length < TARGET_US; round++) {
      console.log(`[expand${is10k ? '10k' : ''}/us] 第 ${round + 1} 轮候选（现有 ${usTop.length}）…`)
      const cands = await buildUsCandidates(usAngles)
      const symbols = [...cands.keys()].filter((t) => !have.has(t)).map((t) => `us${t}`)
      console.log(`[expand${is10k ? '10k' : ''}/us] 验证 ${symbols.length} 个新 ticker…`)
      const valid = await sweep(symbols, 60, 4)
      const add = valid
        .map((q) => ({
          code: q.code.replace(/^us/, ''),
          name: q.name.replace(/\s*\.(N|O|OQ)$/i, '').trim(),
          market: 'US',
          industry: cands.get(q.code.replace(/^us/, ''))?.i ?? '',
          mcap: q.mcap,
        }))
        .filter((s) => /^[A-Z]{1,5}$/.test(s.code))
        .sort((a, b) => b.mcap - a.mcap)
      for (const s of add) {
        if (usTop.length >= TARGET_US) break
        if (!have.has(s.code)) {
          usTop.push({ code: s.code, name: s.name, market: s.market, industry: s.industry })
          have.add(s.code)
        }
      }
      console.log(`[expand${is10k ? '10k' : ''}/us] 累计 ${usTop.length}`)
    }
    result.push(...usTop)

    // 5) 输出 + 入库
    const counts = result.reduce<Record<string, number>>((acc, s) => {
      acc[s.market] = (acc[s.market] ?? 0) + 1
      return acc
    }, {})
    console.log(`[expand${is10k ? '10k' : ''}] 市场分布：`, counts, `总计 ${result.length}`)
    await Bun.write(UNIVERSE_SEED_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), counts, stocks: result }))
    const { PrismaClient: PC } = await import('@prisma/client')
    const db2 = new PC()
    try {
      await db2.stockUniverse.deleteMany({})
      for (let i = 0; i < result.length; i += 400) {
        await db2.stockUniverse.createMany({ data: result.slice(i, i + 400) })
      }
      console.log(`[seed] StockUniverse 入库完成：${await db2.stockUniverse.count()}`)
    } finally {
      await db2.$disconnect()
    }
    return
  }

  // --topup-us：加载现有 universe.json，追加美股候选（第二轮细分行业角度），重写后入库
  if (args.includes('--topup-us')) {
    const existing = JSON.parse(await Bun.file(UNIVERSE_SEED_PATH).text()) as {
      stocks: { code: string; name: string; market: string; industry: string }[]
    }
    const us = existing.stocks.filter((s) => s.market === 'US')
    const have = new Set(us.map((s) => s.code))
    console.log(`[topup] 现有美股 ${us.length}，目标 1000，需补 ${Math.max(0, TOP_US - us.length)}`)
    for (let round = 0; round < 3 && us.length < TOP_US; round++) {
      const cands = await buildUsCandidates()
      const symbols = [...cands.keys()].filter((t) => !have.has(t)).map((t) => `us${t}`)
      console.log(`[topup] 第 ${round + 1} 轮新候选 ${symbols.length}，验证中…`)
      const valid = await sweep(symbols, 60, 4)
      const add = valid
        .map((q) => ({
          code: q.code.replace(/^us/, ''),
          name: q.name.replace(/\s*\.(N|O|OQ)$/i, '').trim(),
          market: 'US',
          industry: cands.get(q.code.replace(/^us/, ''))?.i ?? '',
          mcap: q.mcap,
        }))
        .filter((s) => /^[A-Z]{1,5}$/.test(s.code))
        .sort((a, b) => b.mcap - a.mcap)
      for (const s of add) {
        if (us.length >= TOP_US) break
        if (!have.has(s.code)) {
          us.push({ code: s.code, name: s.name, market: s.market, industry: s.industry })
          have.add(s.code)
        }
      }
      console.log(`[topup] 累计美股 ${us.length}`)
    }
    const merged = us
    const stocks = [...existing.stocks.filter((s) => s.market !== 'US'), ...merged]
    const counts = stocks.reduce<Record<string, number>>((acc, s) => {
      acc[s.market] = (acc[s.market] ?? 0) + 1
      return acc
    }, {})
    console.log('[topup] 新市场分布：', counts)
    await Bun.write(UNIVERSE_SEED_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), counts, stocks }))
    if (doSeed) {
      const { PrismaClient } = await import('@prisma/client')
      const db = new PrismaClient()
      try {
        await db.stockUniverse.deleteMany({})
        for (let i = 0; i < stocks.length; i += 400) {
          await db.stockUniverse.createMany({ data: stocks.slice(i, i + 400) })
        }
        console.log(`[seed] StockUniverse 入库完成：${await db.stockUniverse.count()}`)
      } finally {
        await db.$disconnect()
      }
    }
    return
  }

  const universe: { code: string; name: string; market: string; industry: string }[] = []

  // ===== A股（全代码空间扫描 × 成交额热度，含北交所）=====
  if (!usOnly) {
    console.log('[cn] 扫描 A 股代码空间（含北交所）…')
    const cn = await sweep(cnSymbols())
    console.log(`[cn] 有效 A 股（含北交所）：${cn.length}`)
    const cnPool = cn
      .map((q) => ({
        code: q.code.replace(/^(sh|sz|bj)/, ''),
        name: q.name,
        market: q.code.startsWith('sh') ? 'SH' : q.code.startsWith('sz') ? 'SZ' : 'BJ',
        industry: '',
        amount: q.amount,
      }))
      .filter((s) => !/退/.test(s.name)) // 剔除退市整理股
    cnPool.sort((a, b) => b.amount - a.amount)
    const cnTop = cnPool.slice(0, TOP_CN)
    console.log(`[cn] 热门 Top ${cnTop.length}（成交额门槛：${cnTop[cnTop.length - 1]?.amount ?? 0}）`)
    universe.push(...cnTop.map(({ amount: _a, ...rest }) => rest))
  }

  // ===== 港股（全代码空间扫描 × 成交额热度）=====
  if (!usOnly) {
    console.log('[hk] 扫描港股代码空间…')
    const hk = await sweep(hkSymbols())
    console.log(`[hk] 有效港股符号：${hk.length}`)
    const hkPool = hk
      .filter((q) => isLikelyHkStock(q.name))
      .map((q) => ({
        code: q.code.replace(/^hk/, '').padStart(5, '0'),
        name: q.name,
        market: 'HK',
        industry: '',
        amount: q.amount,
      }))
      .filter((s) => !/退|REIT/i.test(s.name))
    hkPool.sort((a, b) => b.amount - a.amount)
    const hkTop = hkPool.slice(0, TOP_HK)
    console.log(`[hk] 热门 Top ${hkTop.length}（成交额门槛：${hkTop[hkTop.length - 1]?.amount ?? 0}）`)
    universe.push(...hkTop.map(({ amount: _a, ...rest }) => rest))
  }

  // ===== 美股（LLM 候选 × 腾讯验证 × 市值排序；不足 1000 时自动第二轮细分行业补充）=====
  if (!cnOnly) {
    let usTop: { code: string; name: string; market: string; industry: string }[] = []
    for (let round = 0; round < 2 && usTop.length < TOP_US; round++) {
      console.log(`[us] LLM 生成候选（第 ${round + 1} 轮）…`)
      const cands = await buildUsCandidates()
      const have = new Set(usTop.map((s) => s.code))
      const symbols = [...cands.keys()].filter((t) => !have.has(t)).map((t) => `us${t}`)
      console.log(`[us] 验证 ${symbols.length} 个 ticker…`)
      const valid = await sweep(symbols, 60, 4)
      console.log(`[us] 腾讯源有效：${valid.length}`)
      const usPool = valid
        .map((q) => ({
          code: q.code.replace(/^us/, ''),
          name: q.name.replace(/\s*\.(N|O|OQ)$/i, '').trim(),
          market: 'US',
          industry: cands.get(q.code.replace(/^us/, ''))?.i ?? '',
          mcap: q.mcap,
        }))
        .filter((s) => /^[A-Z]{1,5}$/.test(s.code))
        .sort((a, b) => b.mcap - a.mcap)
      for (const s of usPool) {
        if (usTop.length >= TOP_US) break
        if (!have.has(s.code)) {
          usTop.push({ code: s.code, name: s.name, market: s.market, industry: s.industry })
          have.add(s.code)
        }
      }
      console.log(`[us] 累计 ${usTop.length}`)
    }
    universe.push(...usTop)
  }

  // ===== 汇总输出 =====
  const counts = universe.reduce<Record<string, number>>((acc, s) => {
    acc[s.market] = (acc[s.market] ?? 0) + 1
    return acc
  }, {})
  console.log('[done] 市场分布：', counts, `总计 ${universe.length}`)
  const payload = { generatedAt: new Date().toISOString(), counts, stocks: universe }
  await Bun.write(UNIVERSE_SEED_PATH, JSON.stringify(payload))
  console.log('[done] 已写入 db/seed/universe.json')

  // ===== 可选：直接入库 =====
  if (doSeed) {
    const { PrismaClient } = await import('@prisma/client')
    const db = new PrismaClient()
    try {
      await db.stockUniverse.deleteMany({})
      for (let i = 0; i < universe.length; i += 400) {
        await db.stockUniverse.createMany({ data: universe.slice(i, i + 400) })
      }
      const total = await db.stockUniverse.count()
      console.log(`[seed] StockUniverse 入库完成：${total}`)
    } finally {
      await db.$disconnect()
    }
  }
}

void main()
