'use client'

// 股票黑话大词典 · 终端词典浏览器 + 短线黑话翻译器
// 数据源：src/lib/data/slang-dictionary.ts（28 大类全量词条，纯前端检索/翻译，零 API）

import { useDeferredValue, useMemo, useState } from 'react'
import { BookOpenText, Languages, Search, ShieldAlert, Sparkles, X } from 'lucide-react'
import {
  SLANG_CATEGORIES,
  SLANG_TERMS,
  SLANG_TERMS_COUNT,
  searchSlang,
  segmentBySlang,
  type SlangEntry,
} from '@/lib/data/slang-dictionary'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

/** 与全站一致的 micro chip 字形（.micro-label 为 unlayered CSS，颜色覆写需显式 utility 组合） */
const CHIP_CLS =
  'num inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-1 py-px text-[10px] font-semibold uppercase tracking-[0.14em]'

const CAT_NAME: Record<string, string> = Object.fromEntries(SLANG_CATEGORIES.map((c) => [c.id, c.name]))

export function SlangDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<'dict' | 'translator'>('dict')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)

  // 翻译器状态
  const [draft, setDraft] = useState('今天主线分歧，高标核按钮，中军承接还行，下午板块回流，龙头炸板后弱转强回封，明天看一进二和高低切。')
  const deferredDraft = useDeferredValue(draft)
  const segs = useMemo(() => segmentBySlang(deferredDraft), [deferredDraft])
  const hits = useMemo(() => segs.filter((s) => s.hit).map((s) => s.hit!), [segs])

  const results = useMemo(() => searchSlang(q, cat), [q, cat])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="panel-flat max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>股票黑话大词典</DialogTitle>
          <DialogDescription>市场黑话速查与短线黑话翻译器</DialogDescription>
        </DialogHeader>

        {/* 头部（sticky 毛玻璃） */}
        <div className="sticky top-0 z-10 border-b border-border/70 bg-background/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-5 pb-3 pt-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-gold/40 bg-gold/10 text-gold">
              <BookOpenText className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="flex items-baseline gap-2 text-base font-bold tracking-tight">
                股票黑话大词典
                <span className={cn(CHIP_CLS, 'border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-gold')}>
                  {SLANG_TERMS_COUNT} terms
                </span>
              </h2>
              <p className="num mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Market Slang Dictionary · A股 / 港股 / 美股 / 打板圈 / ETF圈
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => onOpenChange(false)}
              aria-label="关闭词典"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          {/* 双 Tab：词典 / 翻译器 */}
          <div role="tablist" aria-label="词典功能切换" className="flex items-center gap-1 px-5">
            {(
              [
                { key: 'dict', label: '词典速查', Icon: BookOpenText },
                { key: 'translator', label: '黑话翻译器', Icon: Languages },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors duration-150',
                  tab === key
                    ? 'border-gold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="nice-scroll max-h-[calc(88vh-7.5rem)] overflow-y-auto">
          {tab === 'dict' ? (
            <div className="p-5 pt-4">
              {/* 搜索 + 分类筛选 */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="搜索黑话或白话解释，如：炸板 / 茅 / 高股息…"
                  className="h-9 pl-9 text-sm"
                  aria-label="搜索黑话词条"
                />
              </div>
              <div className="nice-scroll mt-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="按分类筛选">
                <button
                  type="button"
                  aria-pressed={cat === null}
                  onClick={() => setCat(null)}
                  className={cn(
                    'num shrink-0 rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors duration-150',
                    cat === null ? 'border-gold/60 bg-gold/15 text-gold' : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                  )}
                >
                  全部 {SLANG_TERMS_COUNT}
                </button>
                {SLANG_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={cat === c.id}
                    title={c.desc}
                    onClick={() => setCat(cat === c.id ? null : c.id)}
                    className={cn(
                      'shrink-0 rounded-sm border px-2 py-1 text-xs font-medium transition-colors duration-150',
                      cat === c.id ? 'border-gold/60 bg-gold/15 text-gold' : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {/* 词条列表 */}
              {results.length === 0 ? (
                <div className="flex flex-col items-center gap-2 border border-dashed border-border/70 px-6 py-12 text-center">
                  <Search className="size-6 text-muted-foreground/60" aria-hidden />
                  <p className="text-sm text-muted-foreground">没有匹配的黑话词条 — 换个关键词试试</p>
                </div>
              ) : (
                <div className="mt-4 grid gap-px overflow-hidden rounded-sm border border-border/60 bg-border/50 sm:grid-cols-2">
                  {results.map((t) => (
                    <TermCell key={`${t.cat}-${t.term}`} entry={t} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 p-5 pt-4">
              <div>
                <p className="micro-label mb-2">输入短线黑话 · 原文</p>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  className="resize-none bg-muted/20 text-sm leading-relaxed"
                  placeholder="粘贴一段短线/盘口黑话，例如：今天主线分歧，高标核按钮，中军承接还行…"
                  aria-label="输入需要翻译的黑话文本"
                />
              </div>

              {/* 高亮回显：黑话词金色下划线，hover/title 出释义 */}
              <div>
                <p className="micro-label mb-2">术语识别 · {hits.length} 个黑话命中</p>
                <div className="min-h-[3rem] rounded-sm border border-border/70 bg-muted/10 p-3 text-sm leading-loose">
                  {segs.length === 1 && !segs[0].hit ? (
                    <span className="text-muted-foreground">未识别到内置词典中的黑话 — 可切换到「词典速查」浏览全部词条</span>
                  ) : (
                    segs.map((s, i) =>
                      s.hit ? (
                        <span
                          key={i}
                          className="cursor-help border-b-2 border-gold/70 bg-gold/10 px-0.5 font-medium text-gold"
                          title={`【${CAT_NAME[s.hit.cat] ?? s.hit.cat}】${s.hit.term}：${s.hit.meaning}`}
                        >
                          {s.text}
                        </span>
                      ) : (
                        <span key={i}>{s.text}</span>
                      ),
                    )
                  )}
                </div>
              </div>

              {/* 人话翻译 */}
              {hits.length > 0 && (
                <div>
                  <p className="micro-label mb-2">人话翻译 · 白话解释</p>
                  <div className="grid gap-px overflow-hidden rounded-sm border border-border/60 bg-border/50 sm:grid-cols-2">
                    {hits.map((h) => (
                      <div key={h.term} className="bg-background p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-gold">{h.term}</span>
                          <span className={cn(CHIP_CLS, 'border border-border/70 bg-muted/30 text-muted-foreground')}>
                            {CAT_NAME[h.cat] ?? h.cat}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-foreground/85">{h.meaning}</p>
                        {h.note && <p className="mt-1 text-[10px] text-hold">⚠ {h.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-sm border border-hold/30 bg-hold/5 p-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-hold" aria-hidden />
                <p className="text-xs leading-relaxed text-foreground/80">
                  免责：黑话是市场参与者的概括性说法，<strong>不是交易信号</strong>。像「主力吸筹」「洗盘」「龙头地位」等多为对交易行为的推测性解释，不代表可被严格验证的事实或必然规律。真正值得关注的是价格、成交量、流动性、基本面、估值、预期和风险。
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TermCell({ entry }: { entry: SlangEntry }) {
  return (
    <div className="group bg-background p-3 transition-colors duration-150 hover:bg-muted/40">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-foreground group-hover:text-gold">{entry.term}</span>
        <span className={cn(CHIP_CLS, 'border border-border/70 bg-muted/30 text-muted-foreground')}>
          {CAT_NAME[entry.cat] ?? entry.cat}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-foreground/80">{entry.meaning}</p>
      {entry.note && <p className="mt-1 text-[10px] text-hold">⚠ {entry.note}</p>}
    </div>
  )
}

/** 词条总数徽标（hero 入口按钮内使用） */
export function SlangEntryLabel() {
  return (
    <>
      <Sparkles className="size-3" aria-hidden />
      黑话词典
    </>
  )
}
