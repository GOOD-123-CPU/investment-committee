/**
 * 宇宙行业标签回填：给 A股/港股（行情扫描不带行业）分批补 GLM 行业标签
 * 运行：bun scripts/backfill-industry.ts [--seed]
 */

interface UStock {
  code: string
  name: string
  market: string
  industry: string
}

const UNIVERSE_SEED_PATH = new URL('../db/seed/universe.json', import.meta.url)

async function askGLMIndustries(names: { code: string; name: string; market: string }[]): Promise<Map<string, string>> {
  const list = names.map((s) => `${s.code}|${s.name}|${s.market}`).join('\n')
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const res = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            '你是证券数据分析师。输入是「代码|名称|市场」清单，请为每只股票标注一个简洁的行业标签（2-6 个字，如：白酒/动力电池/半导体/创新药/白酒/城商行/光伏/军工电子/消费电子/汽车零部件）。输出行式清单，每行格式：代码|行业标签。只输出清单，不要解释。',
        },
        { role: 'user', content: list },
      ],
    })
    const text = (res as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? ''
    const out = new Map<string, string>()
    for (const line of text.split(/\n+/)) {
      const m = line.trim().match(/^(\d{5,6}|[A-Z]{1,5})\s*\|\s*(.+)$/)
      if (m) out.set(m[1].trim(), m[2].trim().slice(0, 12))
    }
    return out
  } catch (e) {
    console.log(`  [glm] failed: ${(e as Error).message}`)
    return new Map()
  }
}

async function main() {
  const doSeed = process.argv.includes('--seed')
  const file = Bun.file(UNIVERSE_SEED_PATH)
  const data = (await file.json()) as { generatedAt: string; counts: Record<string, number>; stocks: UStock[] }
  const targets = data.stocks.filter((s) => !s.industry && s.market !== 'US')
  console.log(`[ind] 待标注：${targets.length}（已标注 US ${data.stocks.filter((s) => s.industry).length}）`)

  const BATCH = 80
  let done = 0
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    const map = await askGLMIndustries(batch)
    for (const s of batch) {
      const ind = map.get(s.code)
      if (ind) s.industry = ind
    }
    done += batch.length
    if (done % 400 === 0 || done >= targets.length) console.log(`[ind] ${done}/${targets.length}`)
  }

  const tagged = data.stocks.filter((s) => s.industry).length
  console.log(`[ind] 标注完成：${tagged}/${data.stocks.length}`)
  await Bun.write(UNIVERSE_SEED_PATH, JSON.stringify({ ...data, generatedAt: new Date().toISOString() }))

  if (doSeed) {
    const { PrismaClient } = await import('@prisma/client')
    const db = new PrismaClient()
    try {
      // 逐条更新行业（只更新有标签的）
      for (const s of data.stocks) {
        if (s.industry) {
          await db.stockUniverse.update({ where: { code: s.code }, data: { industry: s.industry } }).catch(() => undefined)
        }
      }
      console.log('[ind] DB 行业更新完成')
    } finally {
      await db.$disconnect()
    }
  }
}

void main()
