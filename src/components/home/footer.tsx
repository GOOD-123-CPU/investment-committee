'use client'

// 页脚三区（终端状态栏式）：品牌 + 免责声明 / 多源数据来源 / 双模型标识

import { BrandMark } from '@/components/brand-mark'
import { SLANG_TERMS_COUNT } from '@/lib/data/slang-dictionary'
import { INDEX_CATALOG } from '@/lib/data/index-encyclopedia'

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto w-full border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-6">
        {/* 左：品牌 + 免责声明 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <BrandMark
              variant="duotone"
              className="size-5 [filter:drop-shadow(0_0_5px_color-mix(in_oklab,var(--gold)_30%,transparent))]"
            />
            <span className="text-xs font-bold tracking-tight">智投委 AI</span>
            <span className="micro-label text-[9px]">© {year}</span>
          </div>
          <p className="text-xs font-medium leading-5 text-foreground/85">
            AI 生成内容，仅供研究参考，不构成投资建议
          </p>
        </div>

        {/* 中：数据来源（多源行情 + 实时检索 + 内置知识库） */}
        <p className="micro-label text-[9px] leading-5 md:text-center">
          行情：腾讯财经 · 雅虎财经 · 新闻：实时 Web Search
          <span className="mx-1.5 text-border" aria-hidden>|</span>
          内置知识库：热门标的快照库 5000 只（A股 2000 · 港股 1500 · 美股 1500） · 黑话词典 {SLANG_TERMS_COUNT} 条 · 指数百科{' '}
          {INDEX_CATALOG.length} 条
        </p>

        {/* 右：双模型 */}
        <p className="micro-label text-[9px] leading-5 md:text-right">GLM-4.6 × mimo-v2.5 双模型驱动</p>
      </div>
    </footer>
  )
}
