'use client'

// 研究报告 Tab — 文档阅读器美学：元信息头 + Markdown 渲染 + 复制 / 下载 / 打印工具栏
// 元信息头随 .print-report 一起打印（研究对象 / 生成时间 / 报告引擎 / 数据源）

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Check, Copy, Download, FileText, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { TerminalWait, fmtDateTime } from '@/components/research/bits'
import { cn } from '@/lib/utils'

interface ReportTabProps {
  reportMd: string | null
  stockName: string | null
  generatedAt?: string | null
}

function MetaCell({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="micro-label">{label}</span>
      <p className={cn('mt-1 truncate text-[13px] font-semibold text-foreground/90', mono && 'num')} title={value}>
        {value}
      </p>
    </div>
  )
}

export function ReportTab({ reportMd, stockName, generatedAt }: ReportTabProps) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const copyReport = async () => {
    if (!reportMd) return
    try {
      await navigator.clipboard.writeText(reportMd)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      toast({ title: '已复制 Markdown 到剪贴板' })
    } catch {
      toast({ title: '复制失败', description: '浏览器拒绝了剪贴板访问', variant: 'destructive' })
    }
  }

  const downloadReport = () => {
    if (!reportMd) return
    const blob = new Blob([reportMd], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${stockName ?? 'research'}-投研报告.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast({ title: '报告已下载', description: `${stockName ?? 'research'}-投研报告.md` })
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="no-print panel-flat flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <p className="micro-label flex items-center gap-2">
          <FileText className="size-3.5 text-primary" aria-hidden />
          Research Report · 可解释投研报告
        </p>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="min-h-8 gap-1.5 border-border/70 bg-transparent text-xs"
            onClick={() => void copyReport()}
            disabled={!reportMd}
            aria-label="复制 Markdown"
          >
            {copied ? <Check className="size-3.5 text-bull" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            复制 Markdown
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-8 gap-1.5 border-border/70 bg-transparent text-xs"
            onClick={downloadReport}
            disabled={!reportMd}
            aria-label="下载 .md 文件"
          >
            <Download className="size-3.5" aria-hidden />
            下载 .md
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-8 gap-1.5 border-border/70 bg-transparent text-xs"
            onClick={() => window.print()}
            disabled={!reportMd}
            aria-label="打印或导出 PDF"
          >
            <Printer className="size-3.5" aria-hidden />
            打印 PDF
          </Button>
        </div>
      </div>

      {/* 文档正文 */}
      <div className="panel print-report mx-auto max-w-4xl px-6 py-8 sm:px-10 sm:py-10">
        {reportMd ? (
          <>
            {/* 报告元信息头 */}
            <div className="mb-7 grid gap-x-6 gap-y-3 border-b border-border/60 pb-5 sm:grid-cols-2 lg:grid-cols-4">
              <MetaCell label="Subject · 研究对象" value={stockName ?? '—'} mono={false} />
              <MetaCell label="Generated · 生成时间" value={fmtDateTime(generatedAt) ?? '—'} />
              <MetaCell label="Model · 报告引擎" value="GLM-4.6" />
              <MetaCell label="Sources · 数据源" value="快照库 · 腾讯财经 · 实时检索" mono={false} />
            </div>
            <div className="report-md">
              <ReactMarkdown>{reportMd}</ReactMarkdown>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <TerminalWait label="REPORT GENERATING · 报告生成中" model="GLM-4.6" />
            <div className="space-y-3" aria-hidden>
              <div className="shimmer h-6 w-1/2 rounded bg-muted/70" />
              <div className="shimmer h-3.5 w-full rounded bg-muted/50" />
              <div className="shimmer h-3.5 w-11/12 rounded bg-muted/50" />
              <div className="shimmer h-3.5 w-full rounded bg-muted/50" />
              <div className="shimmer h-3.5 w-3/4 rounded bg-muted/50" />
            </div>
            <p className="num flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground/70">
              WRITING
              <span className="caret-blink inline-block h-3 w-[7px] bg-primary/70" aria-hidden />
            </p>
          </div>
        )}
      </div>

      <p className="micro-label no-print text-center">
        Evidence-based AI — 报告中关键数字来源：公司快照库 / 腾讯财经实时行情 / 实时新闻检索
      </p>
    </div>
  )
}
