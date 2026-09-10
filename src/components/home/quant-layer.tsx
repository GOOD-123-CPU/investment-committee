'use client'

// Terminal Backdrop · L4 动态量化层（纯装饰，aria-hidden / pointer-events-none）
// 让背景真正「活」起来：动态K线发生器 / 实时分时线 / 盘口深度脉动 / 量化数字流 / 市场热力马赛克
// - 动画仅 transform/opacity（K线/分时为低频 setState，节点数 <60，成本可忽略）
// - 仅暗色主题渲染（挂在 .tb-sem 内）；prefers-reduced-motion 下静态化
// - 所有元素保持背景纹理级透明度（3~9%），绝不与前景内容争夺注意力
// - 【水合安全】所有初始数据由固定种子 mulberry32 生成（SSR/CSR 位级一致），
//   价格文案用手写格式化（摆脱 ICU/locale 差异）；Math.random 仅用于挂载后的客户端演化

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

/** 确定性伪随机（mulberry32）：SSR/CSR 位级一致，初始K线/分时/热力马赛克共用 */
function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 确定性数字格式化（zh-CN 风格千分位）：不依赖 ICU，SSR/CSR 输出恒等 */
function fmtNum(v: number, frac = 2): string {
  const s = v.toFixed(frac)
  const dot = s.indexOf('.')
  const int = dot === -1 ? s : s.slice(0, dot)
  const dec = dot === -1 ? '' : s.slice(dot)
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + dec
}

// ---------- 1) 动态K线发生器（左下，替换静态幽灵K线） ----------

interface Candle {
  o: number
  c: number
  h: number
  l: number
}

const CANDLE_MAX = 22
const CANDLE_INTERVAL = 2400

function nextCandle(prevClose: number, rnd: () => number): Candle {
  // 随机游走 + 温和均值回归，避免飘出画面
  const drift = (rnd() - 0.5) * 2.4 + (50 - prevClose) * 0.015
  const o = prevClose
  const c = Math.max(8, Math.min(92, o + drift))
  const h = Math.max(o, c) + rnd() * 3.2
  const l = Math.min(o, c) - rnd() * 3.2
  return { o, c, h, l }
}

/** 生成初始 K 线序列：固定种子 → SSR 与 CSR 逐位一致，杜绝水合错配 */
function seedCandles(): Candle[] {
  const rnd = mulberry32(0x4b4c494e) // 'KLIN' 种子
  const arr: Candle[] = []
  let p = 50
  for (let i = 0; i < CANDLE_MAX; i++) {
    const c = nextCandle(p, rnd)
    arr.push(c)
    p = c.c
  }
  return arr
}

/** 挂载后的客户端演化专用随机源（不再参与水合对比） */
const liveRnd = mulberry32(0x4c495645) // 'LIVE' 种子

function LiveCandles() {
  const [candles, setCandles] = useState<Candle[]>(seedCandles)

  useEffect(() => {
    const t = setInterval(() => {
      // 最后一根收盘价 = 游走起点（价格状态完全收敛在 candles state 内，无 render 期 ref 访问）
      setCandles((cur) => [...cur.slice(1), nextCandle(cur[cur.length - 1].c, liveRnd)])
    }, CANDLE_INTERVAL)
    return () => clearInterval(t)
  }, [])

  // 坐标系：200×88，价格 → y（y 越小价越高）
  const W = 200
  const H = 88
  const step = W / CANDLE_MAX
  const y = (v: number) => H - 6 - (v / 100) * (H - 14)
  const ma = useMemo(() => {
    return candles.map((c, i) => {
      const from = Math.max(0, i - 4)
      const seg = candles.slice(from, i + 1)
      const avg = seg.reduce((s, x) => s + (x.o + x.c) / 2, 0) / seg.length
      return `${(i * step + step / 2).toFixed(1)},${y(avg).toFixed(1)}`
    })
  }, [candles, step])
  const last = candles[candles.length - 1]
  const lastUp = last.c >= last.o
  // 幽灵报价（随最后一根K线变动；手写格式化，无 ICU 依赖）
  const ghostPrice = fmtNum(3200 + last.c * 7.31)

  return (
    <div className="absolute left-[2.5%] top-[56%] hidden lg:block">
      <svg width="200" height="88" viewBox={`0 0 ${W} ${H}`} fill="none" aria-hidden focusable="false">
        {/* 均线 */}
        <polyline points={ma.join(' ')} stroke="var(--gold)" strokeOpacity="0.14" strokeWidth="1" fill="none" />
        {/* K线（当前根不透明度更高，模拟「正在生成」） */}
        {candles.map((c, i) => {
          const up = c.c >= c.o
          const color = up ? 'var(--bull)' : 'var(--bear)'
          const cx = i * step + step / 2
          const top = y(Math.max(c.o, c.c))
          const bot = y(Math.min(c.o, c.c))
          const isLast = i === candles.length - 1
          return (
            <g key={i} stroke={color} fill={color} strokeOpacity={isLast ? 0.34 : 0.16} fillOpacity={isLast ? 0.22 : 0.1}>
              <line x1={cx} y1={y(c.h)} x2={cx} y2={y(c.l)} strokeWidth="1" />
              <rect x={cx - 2.6} y={top} width="5.2" height={Math.max(1.2, bot - top)} strokeWidth="0.8" />
            </g>
          )
        })}
        {/* 最新价虚线 */}
        <line x1="0" y1={y(last.c)} x2={W} y2={y(last.c)} stroke={lastUp ? 'var(--bull)' : 'var(--bear)'} strokeOpacity="0.14" strokeWidth="0.6" strokeDasharray="2 4" />
      </svg>
      <p className="num mt-0.5 text-[9px] leading-none tracking-widest text-bull/25">
        {ghostPrice} <span className={lastUp ? 'text-bull/30' : 'text-bear/30'}>{lastUp ? '▲' : '▼'}</span>
      </p>
    </div>
  )
}

// ---------- 2) 实时分时线（右中，雷达下方） ----------

const TAPE_MAX = 48
const TAPE_INTERVAL = 1600

function LiveTape() {
  // 固定种子初始序列 → SSR 与 CSR 逐位一致，杜绝水合错配
  const [vals, setVals] = useState<number[]>(() => {
    const rnd = mulberry32(0x54415045) // 'TAPE' 种子
    const arr: number[] = []
    let p = 50
    for (let i = 0; i < TAPE_MAX; i++) {
      p = Math.max(10, Math.min(90, p + (rnd() - 0.5) * 3 + (50 - p) * 0.01))
      arr.push(p)
    }
    return arr
  })

  useEffect(() => {
    const t = setInterval(() => {
      setVals((cur) => {
        const last = cur[cur.length - 1]
        const next = Math.max(10, Math.min(90, last + (liveRnd() - 0.5) * 3 + (50 - last) * 0.01))
        return [...cur.slice(1), next]
      })
    }, TAPE_INTERVAL)
    return () => clearInterval(t)
  }, [])

  const W = 170
  const H = 56
  const step = W / (TAPE_MAX - 1)
  const y = (v: number) => H - 4 - (v / 100) * (H - 8)
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`)
  const last = vals[vals.length - 1]
  const up = last >= vals[0]
  const color = up ? 'var(--bull)' : 'var(--bear)'

  return (
    <svg className="absolute right-[4.5%] top-[57%] hidden xl:block" width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" aria-hidden focusable="false">
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={color} fillOpacity="0.05" stroke="none" />
      <polyline points={pts.join(' ')} stroke={color} strokeOpacity="0.2" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
      <circle cx={W - 1} cy={y(last)} r="1.8" fill={color} fillOpacity="0.4" className="tb-tape-dot" />
    </svg>
  )
}

// ---------- 3) 盘口深度脉动（左中） ----------

const DEPTH = [
  { w: 62, d: '0s' },
  { w: 84, d: '-1.3s' },
  { w: 47, d: '-2.6s' },
  { w: 71, d: '-0.7s' },
  { w: 55, d: '-1.9s' },
]

function DepthBars() {
  return (
    <div className="absolute left-[5%] top-[33%] hidden w-36 flex-col gap-[5px] md:flex" aria-hidden>
      <p className="num mb-0.5 text-[8px] leading-none tracking-[0.2em] text-muted-foreground/25">ORDER BOOK DEPTH</p>
      {DEPTH.map((b, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="flex h-[5px] flex-1 justify-end overflow-hidden rounded-sm bg-bear/8">
            <div className="tb-depth-l h-full rounded-sm bg-bear/25" style={{ width: `${b.w}%`, animationDelay: b.d }} />
          </div>
          <div className="h-[5px] flex-1 overflow-hidden rounded-sm bg-bull/8">
            <div className="tb-depth-r h-full rounded-sm bg-bull/25" style={{ width: `${b.w}%`, animationDelay: b.d }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- 4) 量化数字流（垂直滚动的成交/报价串，左右各一列） ----------

const RAIN_LEFT = [
  '300502 414.89 +2.4%',
  'BID 414.72 × 1200',
  'ASK 415.05 × 800',
  'VOL 3.42M',
  'MACD 1.28 ↑',
  '300308 895.26 -1.5%',
  'RSI 62.4',
  'KDJ J 78.1',
  'TURN 4.34%',
  '002714 42.34 +0.8%',
  'MA20 408.15',
  'ATR 9.82',
]
const RAIN_RIGHT = [
  'NVDA 924.18 +1.2%',
  'BID 924.05 × 300',
  'VWAP 918.44',
  'EPS 6.42',
  'ROE 114.2%',
  'HK00700 1685.0 +0.6%',
  'MOM +1.8σ',
  'BETA 0.94',
  'SH000300 3933.79 -0.5%',
  'MAX DD -12.4%',
  'SHARPE 1.86',
  'ALPHA 3.1',
]

function RainColumn({ items, className, dur }: { items: string[]; className: string; dur: string }) {
  const doubled = useMemo(() => [...items, ...items], [items])
  return (
    <div className={cn('tb-rain hidden h-[38%] w-40 overflow-hidden opacity-100 md:block', className)} aria-hidden>
      <div className="tb-rain-track flex flex-col gap-2.5" style={{ animationDuration: dur }}>
        {doubled.map((t, i) => (
          <span key={i} className="num whitespace-nowrap text-[9.5px] leading-none tracking-wider text-foreground/[0.055]">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------- 5) 市场热力马赛克（右下） ----------

const HEAT_COLS = 11
const HEAT_ROWS = 4

function HeatMosaic() {
  const cells = useMemo(() => {
    const rnd = mulberry32(20260910)
    return Array.from({ length: HEAT_COLS * HEAT_ROWS }, () => {
      const r = rnd()
      const tone = r > 0.82 ? 'var(--bull)' : r > 0.66 ? 'var(--bear)' : r > 0.58 ? 'var(--gold)' : '#fff'
      return { tone, delay: `${(-rnd() * 8).toFixed(2)}s`, dur: `${(5 + rnd() * 6).toFixed(2)}s`, base: 0.03 + rnd() * 0.05 }
    })
  }, [])

  return (
    <div
      className="absolute bottom-[9%] right-[24%] hidden gap-[3px] xl:grid"
      style={{ gridTemplateColumns: `repeat(${HEAT_COLS}, 9px)` }}
      aria-hidden
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className="tb-heat size-[9px] rounded-[1px]"
          style={{ background: c.tone, animationDelay: c.delay, animationDuration: c.dur, opacity: c.base }}
        />
      ))}
    </div>
  )
}

// ---------- 导出：整体 L4 层 ----------

export function QuantLayer() {
  return (
    <>
      <LiveCandles />
      <LiveTape />
      <DepthBars />
      <RainColumn items={RAIN_LEFT} className="absolute left-[30%] top-[16%]" dur="46s" />
      <RainColumn items={RAIN_RIGHT} className="absolute right-[27%] top-[26%]" dur="58s" />
      <HeatMosaic />
    </>
  )
}
