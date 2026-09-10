'use client'

// 全球交易所时钟条：16 大交易所 当地日期（YYYY-MM-DD）+ 当地时间（HH:mm:ss）+ 开/休市 LED
// - 时段按交易所当地交易日计算（含午间休市/周末差异，利雅得为周日至周四交易），法定节假日未计入（诚实标注）
// - 每秒刷新；Intl 格式化器仅创建一次（useMemo），避免每秒重建开销
// - SSR/水合安全：首帧渲染占位符，effect 内再填充真实时间

import { useEffect, useMemo, useState } from 'react'
import { Globe2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExchangeDef {
  abbr: string
  name: string
  tz: string
  /** 交易时段（当地墙上时间，HH:mm），支持午间休市多段 */
  sessions: [string, string][]
  /** 周末定义（默认 Sat/Sun；利雅得为 Fri/Sat） */
  weekend?: string[]
}

export const EXCHANGES: ExchangeDef[] = [
  { abbr: 'SSE', name: '上海', tz: 'Asia/Shanghai', sessions: [['09:30', '11:30'], ['13:00', '15:00']] },
  { abbr: 'SZSE', name: '深圳', tz: 'Asia/Shanghai', sessions: [['09:30', '11:30'], ['13:00', '15:00']] },
  { abbr: 'HKEX', name: '香港', tz: 'Asia/Hong_Kong', sessions: [['09:30', '12:00'], ['13:00', '16:00']] },
  { abbr: 'TSE', name: '东京', tz: 'Asia/Tokyo', sessions: [['09:00', '11:30'], ['12:30', '15:00']] },
  { abbr: 'KRX', name: '首尔', tz: 'Asia/Seoul', sessions: [['09:00', '15:30']] },
  { abbr: 'TWSE', name: '台北', tz: 'Asia/Taipei', sessions: [['09:00', '13:30']] },
  { abbr: 'SGX', name: '新加坡', tz: 'Asia/Singapore', sessions: [['09:00', '12:00'], ['13:00', '17:00']] },
  { abbr: 'NSE', name: '孟买', tz: 'Asia/Kolkata', sessions: [['09:15', '15:30']] },
  { abbr: 'ASX', name: '悉尼', tz: 'Australia/Sydney', sessions: [['10:00', '16:00']] },
  { abbr: 'XETRA', name: '法兰克福', tz: 'Europe/Berlin', sessions: [['09:00', '17:30']] },
  { abbr: 'LSE', name: '伦敦', tz: 'Europe/London', sessions: [['08:00', '16:30']] },
  { abbr: 'TSX', name: '多伦多', tz: 'America/Toronto', sessions: [['09:30', '16:00']] },
  { abbr: 'B3', name: '圣保罗', tz: 'America/Sao_Paulo', sessions: [['10:00', '17:00']] },
  { abbr: 'TADAWUL', name: '利雅得', tz: 'Asia/Riyadh', sessions: [['10:00', '15:00']], weekend: ['Fri', 'Sat'] },
  { abbr: 'NYSE', name: '纽约', tz: 'America/New_York', sessions: [['09:30', '16:00']] },
  { abbr: 'NASDAQ', name: '纳斯达克', tz: 'America/New_York', sessions: [['09:30', '16:00']] },
]

interface ClockState {
  date: string
  time: string
  open: boolean
}

function toMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

/** 全球交易所时钟：每秒刷新；开闭 = 周一至周五 且 处于任一交易时段 */
function useExchangeClocks(): Record<string, ClockState> {
  const [state, setState] = useState<Record<string, ClockState>>({})

  // 格式化器仅创建一次（tz 列表为模块常量）
  const probes = useMemo(
    () =>
      EXCHANGES.map((e) => ({
        date: new Intl.DateTimeFormat('en-CA', { timeZone: e.tz, year: 'numeric', month: '2-digit', day: '2-digit' }),
        time: new Intl.DateTimeFormat('en-GB', {
          timeZone: e.tz,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }),
        hm: new Intl.DateTimeFormat('en-US', {
          timeZone: e.tz,
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }),
      })),
    [],
  )

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const next: Record<string, ClockState> = {}
      EXCHANGES.forEach((e, i) => {
        const p = probes[i]
        const parts = p.hm.formatToParts(now)
        const get = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
        const weekday = get('weekday')
        const minutes = Number(get('hour')) * 60 + Number(get('minute'))
        const weekend = e.weekend ?? ['Sat', 'Sun']
        const open =
          !weekend.includes(weekday) && e.sessions.some(([a, b]) => minutes >= toMin(a) && minutes < toMin(b))
        next[e.abbr] = { date: p.date.format(now), time: p.time.format(now), open }
      })
      setState(next)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [probes])

  return state
}

export function WorldClockBar() {
  const clocks = useExchangeClocks()
  const ready = Object.keys(clocks).length > 0

  return (
    <div className="border-b border-border/60 px-4 py-3 sm:px-5" role="group" aria-label="全球交易所时钟">
      <div className="mb-2 flex items-center gap-2">
        <Globe2 className="size-3.5 text-gold" aria-hidden />
        <span className="micro-label">World Clock · 交易所时钟</span>
        <span className="micro-label ml-auto hidden text-[9px] sm:inline">Local Date &amp; Time · 法定节假日未计入</span>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border/50 bg-border/50 sm:grid-cols-4 xl:grid-cols-8">
        {EXCHANGES.map((e) => {
          const c = clocks[e.abbr]
          return (
            <div
              key={e.abbr}
              className="bg-[var(--panel)] px-3 py-2.5"
              title={`${e.name} · ${e.tz} · 当地日期与时间（开闭状态按时段计算，法定节假日未计入${e.weekend ? '；周末为 ' + e.weekend.join('/') : ''}）`}
            >
              <div className="flex items-center gap-1.5">
                {c?.open ? (
                  <span aria-hidden className="led text-bull" />
                ) : (
                  <span aria-hidden className="block size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                )}
                <span className="num text-[11px] font-bold tracking-wide">{e.abbr}</span>
                <span className="truncate text-[10px] text-muted-foreground">{e.name}</span>
                <span
                  className={cn(
                    'num ml-auto shrink-0 text-[8px] font-bold tracking-[0.12em]',
                    c?.open ? 'text-bull' : 'text-muted-foreground/50',
                  )}
                >
                  {c?.open ? 'OPEN' : ready ? 'CLOSED' : '· · ·'}
                </span>
              </div>
              <p className="num mt-1.5 whitespace-nowrap text-[11px] leading-3">
                {ready ? (
                  <>
                    <span className="text-muted-foreground/70">{c?.date}</span>
                    <span className="ml-1.5 font-semibold text-foreground/90">{c?.time}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground/40">---------- --:--:--</span>
                )}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
