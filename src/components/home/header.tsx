'use client'

// 终端命令栏式 Header：品牌锁定块 + 北京时钟 + 主题切换；research 视图显示返回按钮

import { useEffect, useState } from 'react'
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'

const emptySubscribe = () => () => {}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // 水合完成前不渲染具体图标，避免 SSR/CSR 不一致
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
  const isDark = mounted && theme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {mounted ? isDark ? <Sun className="size-4" /> : <Moon className="size-4" /> : <span className="size-4" />}
    </Button>
  )
}

/** 北京时间时钟（每秒刷新，YYYY-MM-DD HH:MM:SS） */
function useBeijingClock(): { date: string; time: string } | null {
  const [now, setNow] = useState<{ date: string; time: string } | null>(null)
  useEffect(() => {
    const df = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const tf = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const tick = () => {
      const d = new Date()
      setNow({ date: df.format(d), time: tf.format(d) })
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function Clock() {
  const now = useBeijingClock()
  return (
    <div
      className="panel-flat hidden h-9 items-center gap-2 rounded-md px-2.5 sm:flex"
      aria-label="北京时间"
      title="北京时间 · Asia/Shanghai"
    >
      <span aria-hidden className="led text-bull" />
      {now ? (
        <>
          <span className="num text-[11px] text-muted-foreground">{now.date}</span>
          <span className="num text-xs font-medium text-foreground/90">{now.time}</span>
        </>
      ) : (
        <span className="num text-xs text-muted-foreground">----&#8209;&#8209;-&#8209;&#8209; --:--:--</span>
      )}
      <span className="micro-label text-[9px]">GMT+8</span>
    </div>
  )
}

export function Header({ view, onLogoClick }: { view: 'home' | 'research'; onLogoClick?: () => void }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:px-6">
        {view === 'research' && onLogoClick && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground"
            onClick={onLogoClick}
            aria-label="返回首页"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="text-xs">返回</span>
          </Button>
        )}

        <button
          type="button"
          onClick={onLogoClick}
          className="group flex min-h-11 items-center gap-2.5 rounded-lg outline-offset-4"
          aria-label="智投委 AI 首页"
        >
          <BrandMark
            variant="duotone"
            className="size-8 shrink-0 transition-transform duration-300 group-hover:scale-105 [filter:drop-shadow(0_0_7px_color-mix(in_oklab,var(--gold)_35%,transparent))]"
          />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[15px] font-bold tracking-tight">智投委 AI</span>
            <span className="micro-label text-[9px]">AI Investment Committee</span>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Clock />
          <span aria-hidden className="hidden h-5 w-px bg-border/60 sm:block" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
