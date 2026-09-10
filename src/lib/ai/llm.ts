import ZAI from 'z-ai-web-dev-sdk'

/**
 * LLM 封装（仅服务端使用）— 异构双模型架构
 *
 * - GLM (z-ai-web-dev-sdk)：高速通道，承担数据分析型角色（planner / analysts / report）
 * - mimo-v2.5 (api.xiaomimimo.com, OpenAI 兼容)：深度推理通道，承担博弈型角色（Bull/Bear 辩论 / Risk Officer / CIO）
 *   · mimo 为 reasoning 模型：输出含 reasoning_content，需更大 max_tokens 并在 content 为空时降级提取
 * - 每个通道独立限流队列；失败时自动 failover 到另一通道
 */

export type LLMProvider = 'zai' | 'mimo'

export const MIMO_CONFIG = {
  baseUrl: process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1',
  apiKey: process.env.MIMO_API_KEY || '',
  model: process.env.MIMO_MODEL || 'mimo-v2.5',
} as const

export const MODEL_LABEL: Record<LLMProvider, string> = {
  zai: 'GLM-4.6',
  mimo: 'mimo-v2.5',
}

type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>

let zaiCached: ZAIInstance | null = null

async function getZAI(): Promise<ZAIInstance> {
  if (!zaiCached) {
    // 防挂起：SDK create() 无内建超时（网络/限流异常时会永久挂起，曾导致整条 pipeline 卡死），
    // 这里强制 15s 超时；失败不缓存，由上层 failover 链处理
    zaiCached = (await Promise.race([
      ZAI.create(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ZAI_CREATE_TIMEOUT')), 15_000)),
    ])) as ZAIInstance
  }
  return zaiCached
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------- 双通道独立限流队列 ----------

interface QueueState {
  activeCount: number
  lastStartAt: number
  waiters: (() => void)[]
  maxConcurrent: number
  minIntervalMs: number
}

const queues: Record<LLMProvider, QueueState> = {
  zai: { activeCount: 0, lastStartAt: 0, waiters: [], maxConcurrent: 2, minIntervalMs: 900 },
  // mimo 实测 3 并发无压力（36s/3 calls），深度推理单次 20-40s
  mimo: { activeCount: 0, lastStartAt: 0, waiters: [], maxConcurrent: 3, minIntervalMs: 300 },
}

async function acquire(provider: LLMProvider): Promise<void> {
  const q = queues[provider]
  if (q.activeCount < q.maxConcurrent) {
    q.activeCount++
    return
  }
  await new Promise<void>((resolve) => q.waiters.push(resolve))
  q.activeCount++
}

function release(provider: LLMProvider): void {
  const q = queues[provider]
  q.activeCount--
  const next = q.waiters.shift()
  if (next) next()
}

async function pace(provider: LLMProvider): Promise<void> {
  const q = queues[provider]
  const now = Date.now()
  const gap = q.lastStartAt + q.minIntervalMs - now
  if (gap > 0) await sleep(gap)
  q.lastStartAt = Date.now()
}

function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return (
    msg.includes('429') ||
    msg.toLowerCase().includes('too many requests') ||
    msg.toLowerCase().includes('rate limit')
  )
}

function isProviderFatal(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return (
    msg.includes('LLM_TIMEOUT') ||
    msg.includes('EMPTY_LLM_RESPONSE') ||
    msg.includes('MIMO_HTTP_') ||
    msg.includes('fetch failed') ||
    msg.includes('JSON_PARSE_FAILED')
  )
}

/** 从模型输出中提取 JSON（容忍 ```json 围栏 / 前后缀文字） */
export function extractJSON<T>(raw: string): T {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  try {
    return JSON.parse(text) as T
  } catch {
    /* continue */
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T
    } catch {
      /* continue */
    }
  }
  throw new Error('JSON_PARSE_FAILED: ' + text.slice(0, 120))
}

// ---------- mimo 通道（OpenAI 兼容 HTTP） ----------

interface MimoMessage {
  role: string
  content: string | null
  reasoning_content?: string | null
}

async function callMimo(
  system: string,
  user: string,
  timeoutMs: number,
  maxTokens = 6000,
): Promise<string> {
  if (!MIMO_CONFIG.apiKey) {
    throw new Error('MIMO_API_KEY is required for the mimo provider')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${MIMO_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MIMO_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: MIMO_CONFIG.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.6,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`MIMO_HTTP_${res.status}`)
    }
    const data = (await res.json()) as {
      choices?: { message?: MimoMessage; finish_reason?: string }[]
    }
    const msg = data.choices?.[0]?.message
    let content = (msg?.content ?? '').trim()
    // reasoning 模型：content 为空但推理内容存在 → 尝试从推理末段提取结论
    if (!content && msg?.reasoning_content) {
      const reasoning = msg.reasoning_content
      const jsonMatch = reasoning.match(/\{[\s\S]*\}/)
      if (jsonMatch) content = jsonMatch[0]
      else {
        // 取推理最后一段非空文本（通常是最终结论）
        const parts = reasoning.split(/\n+/).filter((p) => p.trim().length > 0)
        content = parts.slice(-3).join('\n').trim()
      }
    }
    if (!content) throw new Error('EMPTY_LLM_RESPONSE')
    return content
  } finally {
    clearTimeout(timer)
  }
}

// ---------- zai 通道 ----------

async function callZai(system: string, user: string, timeoutMs: number): Promise<string> {
  const zai = await getZAI()
  const completion = (await Promise.race([
    zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: system },
        { role: 'user', content: user },
      ],
      thinking: { type: 'disabled' },
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM_TIMEOUT')), timeoutMs)),
  ])) as Awaited<ReturnType<ZAIInstance['chat']['completions']['create']>>

  const content = completion.choices[0]?.message?.content
  if (!content || content.trim().length === 0) throw new Error('EMPTY_LLM_RESPONSE')
  return content
}

// ---------- 统一调用入口（含 failover） ----------

async function callWithProvider(
  provider: LLMProvider,
  system: string,
  user: string,
  timeoutMs: number,
  maxTokens: number,
): Promise<string> {
  await acquire(provider)
  try {
    await pace(provider)
    if (provider === 'mimo') {
      return await callMimo(system, user, timeoutMs, maxTokens)
    }
    return await callZai(system, user, timeoutMs)
  } finally {
    release(provider)
  }
}

async function callLLM(
  system: string,
  user: string,
  timeoutMs: number,
  primary: LLMProvider,
  maxTokens: number,
): Promise<string> {
  const fallback: LLMProvider = primary === 'mimo' ? 'zai' : 'mimo'
  const attempts: { provider: LLMProvider; maxTokens: number }[] = [
    { provider: primary, maxTokens },
    { provider: primary, maxTokens }, // 同通道重试一次
    { provider: fallback, maxTokens }, // failover
    { provider: fallback, maxTokens },
  ]
  let lastErr: unknown = null
  for (let i = 0; i < attempts.length; i++) {
    const { provider, maxTokens: mt } = attempts[i]
    try {
      return await callWithProvider(provider, system, user, timeoutMs, mt)
    } catch (e) {
      lastErr = e
      // AbortError 来自 mimo 超时
      const err = e instanceof Error && e.name === 'AbortError' ? new Error('LLM_TIMEOUT') : e
      const wait = isRateLimitError(err) ? 5000 : 1500
      if (i < attempts.length - 1) await sleep(wait)
      if (!isProviderFatal(err) && i === 1) continue
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('LLM_FAILED')
}

// ---------- 对外 API ----------

/** 纯文本输出（限流感知退避 + 双通道 failover） */
export async function chatText(
  system: string,
  user: string,
  timeoutMs = 120_000,
  provider: LLMProvider = 'zai',
): Promise<string> {
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await callLLM(system, user, timeoutMs, provider, attempt === 1 ? 6000 : 8000)
    } catch (e) {
      lastErr = e
      const wait = isRateLimitError(e) ? 6000 * attempt : 1500 * attempt
      if (attempt < 2) await sleep(wait)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('LLM_FAILED')
}

/** JSON 输出，失败时附加纠错提示重试 */
export async function chatJSON<T>(
  system: string,
  user: string,
  timeoutMs = 120_000,
  provider: LLMProvider = 'zai',
): Promise<T> {
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callLLM(system, user, timeoutMs, provider, 6000)
      return extractJSON<T>(raw)
    } catch (e) {
      lastErr = e
      const wait = isRateLimitError(e) ? 6000 * attempt : 1500 * attempt
      if (attempt < 3) {
        if (!isRateLimitError(e)) {
          user = `${user}\n\n（注意：上一次输出未能解析为合法 JSON。请只输出一个合法 JSON 对象，不要包含任何解释文字或 markdown 围栏。）`
        }
        await sleep(wait)
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('LLM_JSON_FAILED')
}

/** 优雅降级：失败返回 null 而非抛错 */
export async function tryChatJSON<T>(
  system: string,
  user: string,
  timeoutMs = 120_000,
  provider: LLMProvider = 'zai',
): Promise<T | null> {
  try {
    return await chatJSON<T>(system, user, timeoutMs, provider)
  } catch {
    return null
  }
}
