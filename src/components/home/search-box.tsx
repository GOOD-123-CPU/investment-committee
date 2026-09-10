'use client'

// 核心搜索框：本地快照库 searchStocks + 全球热门标的快照库（/api/universe）双层联想
// 键盘导航 + 提交校验（发光聚焦环 + 终端面板外壳）
// 支持外部触发的示例查询：打字机填充动画 → 自动召开投委会（submitExternal）

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Database, Gavel, Loader2, Search } from 'lucide-react'
import { searchStocks } from '@/lib/data/stocks'
import { currencySymbol, formatPct } from '@/lib/client-utils'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** 统一联想行：本地快照库（带实时价）+ 宇宙库（带行业标签） */
interface SuggestRow {
  code: string
  name: string
  market: string
  industry: string
  currency?: string
  price?: number
  changePct?: number
  fromUniverse?: boolean
}

interface SearchBoxProps {
  onSubmit: (query: string) => Promise<void> | void
  autoFocus?: boolean
}

/** 外部（示例提示词）触发接口：填充动画 + 直接发起 */
export interface SearchBoxHandle {
  submitExternal: (query: string) => void
}

function ChangePill({ value }: { value: number }) {
  const up = value >= 0
  return (
    <span
      className={cn(
        'num inline-flex shrink-0 items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-xs font-semibold',
        up ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear',
      )}
    >
      {up ? '▲' : '▼'}
      {formatPct(value)}
    </span>
  )
}

export const SearchBox = forwardRef<SearchBoxHandle, SearchBoxProps>(function SearchBox(
  { onSubmit, autoFocus },
  ref,
) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [submitting, setSubmitting] = useState(false)
  const [autoTyping, setAutoTyping] = useState(false)
  const [uniRows, setUniRows] = useState<SuggestRow[]>([])
  const typingRef = useRef(false)
  const { toast } = useToast()

  // 全球热门标的快照库联想：250ms 防抖，仅服务端内存缓存，无感延迟
  useEffect(() => {
    const q = value.trim()
    if (q.length < 2 || typingRef.current) {
      setUniRows([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/universe?q=${encodeURIComponent(q)}&limit=6`, { cache: 'no-store' })
        const data = (await res.json().catch(() => null)) as { hits?: { code: string; name: string; market: string; industry: string | null }[] } | null
        if (!cancelled && res.ok && data?.hits) {
          setUniRows(
            data.hits.map((h) => ({
              code: h.code,
              name: h.name,
              market: h.market,
              industry: h.industry ?? '热门标的',
              fromUniverse: true,
            })),
          )
        }
      } catch {
        // 联想失败静默：本地快照库联想仍然可用
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [value])

  // 双层合并：本地精选（含实时价）在前，宇宙库热门标的在后（按代码去重）
  const suggestions = useMemo<SuggestRow[]>(() => {
    const q = value.trim()
    if (!q) return []
    const local = searchStocks(q, 6).map((h) => ({
      code: h.code,
      name: h.name,
      market: h.market,
      industry: h.industry,
      currency: h.currency,
      price: h.price,
      changePct: h.changePct,
      fromUniverse: false,
    }))
    const localCodes = new Set(local.map((h) => h.code))
    const remote = uniRows.filter((h) => !localCodes.has(h.code))
    return [...local, ...remote].slice(0, 10)
  }, [value, uniRows])

  const showList = open && suggestions.length > 0

  const fire = async (q: string) => {
    const query = q.trim()
    if (!query) {
      toast({
        title: '请输入研究问题',
        description: '例如：分析贵州茅台现在是否值得投资',
        variant: 'destructive',
      })
      return
    }
    setOpen(false)
    setActiveIdx(-1)
    try {
      setSubmitting(true)
      await onSubmit(query)
    } catch (e) {
      toast({
        title: '发起研究失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  /** 仅填充查询（点击联想行） */
  const fillFromHit = (hit: SuggestRow) => {
    const q = `分析 ${hit.name}(${hit.code}) 是否值得投资`
    setValue(q)
    setOpen(false)
    setActiveIdx(-1)
    return q
  }

  /** 填充并直接发起研究（键盘 Enter 选中） */
  const choose = (hit: SuggestRow) => {
    void fire(fillFromHit(hit))
  }

  /** 外部示例触发：打字机填充动画 → 短暂停顿 → 直接发起（让用户感知系统正在规划） */
  const submitExternal = useCallback(
    (query: string) => {
      const q = query.trim()
      if (!q || typingRef.current || submitting) return
      typingRef.current = true
      setAutoTyping(true)
      setOpen(false)
      setActiveIdx(-1)
      setValue('')
      let i = 0
      const timer = window.setInterval(() => {
        i += 1
        setValue(q.slice(0, i))
        if (i >= q.length) {
          window.clearInterval(timer)
          typingRef.current = false
          // 填充完成后的呼吸停顿：明确「已接收，正在规划」
          window.setTimeout(() => {
            setAutoTyping(false)
            void fire(q)
          }, 320)
        }
      }, 24)
    },
    [fire, submitting],
  )

  useImperativeHandle(ref, () => ({ submitExternal }), [submitExternal])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setOpen(true)
        setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1))
      }
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (showList && activeIdx >= 0 && suggestions[activeIdx]) {
        choose(suggestions[activeIdx])
      } else {
        void fire(value)
      }
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
    }
  }

  return (
    <div
      className="relative w-full"
      role="combobox"
      aria-expanded={showList}
      aria-haspopup="listbox"
      aria-controls="stock-autocomplete"
    >
      <div
        className={cn(
          'panel flex flex-col gap-2 p-2 transition-all duration-200 focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_22%,transparent)] sm:flex-row sm:items-center sm:p-1.5 sm:pl-4',
          autoTyping && 'border-gold/60 shadow-[0_0_0_3px_color-mix(in_oklab,var(--gold)_18%,transparent)]',
        )}
      >
        <Search className="pointer-events-none size-4.5 shrink-0 text-muted-foreground sm:hidden" aria-hidden />
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
            setActiveIdx(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // 稍作延迟，避免与下拉点击竞争
            window.setTimeout(() => setOpen(false), 150)
          }}
          onKeyDown={handleKeyDown}
          placeholder="输入股票名称 / 代码，或直接提出研究问题…"
          aria-label="研究问题输入框"
          aria-controls="stock-autocomplete"
          autoComplete="off"
          readOnly={autoTyping}
          autoFocus={autoFocus}
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 focus-visible:shadow-none sm:h-12 sm:pl-0"
        />
        <Button
          type="button"
          disabled={submitting}
          onClick={() => void fire(value)}
          className={cn(
            'h-11 w-full shrink-0 justify-center gap-2 rounded-lg px-4 text-sm font-semibold sm:h-12 sm:w-auto sm:px-6',
            !submitting && 'glow-emerald',
          )}
          aria-label="召开投委会"
        >
          {submitting ? <Loader2 className="size-4.5 animate-spin" aria-hidden /> : <Gavel className="size-4.5" aria-hidden />}
          <span className="hidden sm:inline">{submitting ? '投委会集结中…' : '召开投委会'}</span>
          <span className="sm:hidden">{submitting ? '投委会集结中…' : '召开投委会'}</span>
        </Button>
      </div>

      {showList && (
        <ul
          id="stock-autocomplete"
          role="listbox"
          aria-label="股票联想列表"
          className="panel nice-scroll absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto p-1.5"
        >
          {suggestions.map((hit, i) => (
            <li key={`${hit.code}-${hit.fromUniverse ? 'u' : 'l'}`} role="option" aria-selected={i === activeIdx}>
              <button
                type="button"
                // mousedown 先于 input blur 触发
                onMouseDown={(e) => {
                  e.preventDefault()
                  fillFromHit(hit)
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  'flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors',
                  i === activeIdx ? 'border-border/60 bg-muted/60' : 'hover:bg-muted/40',
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-semibold">{hit.name}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">{hit.code}</span>
                    <span className="micro-label shrink-0 rounded-sm border border-border/70 px-1 py-px text-[9px]">
                      {hit.market}
                    </span>
                    {hit.fromUniverse && (
                      <span
                        title="已收录于全球热门标的快照库"
                        className="num inline-flex shrink-0 items-center gap-0.5 rounded-sm border border-gold/40 bg-gold/10 px-1 py-px text-[9px] font-semibold text-gold"
                      >
                        <Database className="size-2.5" aria-hidden />
                        HOT
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{hit.industry}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {hit.price != null ? (
                    <>
                      <span className="num text-sm">
                        {currencySymbol(hit.currency ?? 'CNY')}
                        {hit.price}
                      </span>
                      <ChangePill value={hit.changePct ?? 0} />
                    </>
                  ) : (
                    <span className="num text-[10px] text-muted-foreground/70">行情研究时拉取</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
