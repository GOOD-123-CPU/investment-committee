'use client'

// 星空量化层 · L5（纯装饰，aria-hidden / pointer-events-none，仅暗色主题渲染于 .tb-sem 内）
// - Canvas 单层绘制：三层视差星点漂移 + 微型K线浮升粒子 + 偶发流星（8~16s 一次，金色拖尾）
// - 「星空 + K线」金融市场氛围：星点白/金/牛/熊四色，K线粒子缓缓上浮象征市场引力
// - 性能：~170 粒子 60fps 成本可忽略；DPR≤2；标签页隐藏时 rAF 自动暂停
// - 尊重 prefers-reduced-motion：只绘制一帧静态星空
// - SSR 安全：随机与绘制全部在 useEffect（客户端挂载后），无水合风险

import { useEffect, useRef } from 'react'

type Tone = (typeof PALETTE)[keyof typeof PALETTE]

interface Star {
  x: number
  y: number
  r: number
  /** 视差层 0/1/2：越远越小越慢越暗 */
  layer: number
  phase: number
  twinkleSpeed: number
  color: Tone
  base: number
}

interface KiteParticle {
  x: number
  y: number
  /** 实体半宽 */
  hw: number
  /** 实体高 */
  body: number
  /** 上影线长 */
  wickUp: number
  /** 下影线长 */
  wickDown: number
  vy: number
  sway: number
  phase: number
  color: Tone
  alpha: number
}

interface Meteor {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
}

/** 星点/K线四色（暗色主题 hex；Canvas 不支持 CSS 变量） */
const PALETTE = {
  white: [255, 255, 255],
  gold: [242, 193, 78],
  bull: [52, 211, 153],
  bear: [248, 113, 113],
} as const

const STAR_COUNT = 150
const KITE_COUNT = 14

export function StarField() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let W = 0
    let H = 0
    let stars: Star[] = []
    let kites: KiteParticle[] = []
    const meteor: Meteor = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0 }
    let raf = 0
    let nextMeteorAt = performance.now() + 5000 + Math.random() * 9000

    const rand = (a: number, b: number) => a + Math.random() * (b - a)
    const rgba = (c: Tone, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

    const seed = () => {
      // 星点：三层视差；70% 白、12% 金、10% 牛、8% 熊
      stars = Array.from({ length: STAR_COUNT }, () => {
        const layer = Math.floor(rand(0, 3))
        const roll = Math.random()
        const color = roll < 0.7 ? PALETTE.white : roll < 0.82 ? PALETTE.gold : roll < 0.92 ? PALETTE.bull : PALETTE.bear
        return {
          x: Math.random() * W,
          y: Math.random() * H,
          r: layer === 0 ? rand(0.4, 0.9) : layer === 1 ? rand(0.7, 1.4) : rand(1.1, 2.1),
          layer,
          phase: Math.random() * Math.PI * 2,
          twinkleSpeed: rand(0.4, 1.6),
          color,
          base: layer === 0 ? rand(0.1, 0.22) : layer === 1 ? rand(0.18, 0.34) : rand(0.3, 0.5),
        }
      })
      // 微型K线粒子：bull/bear/gold 三色，缓缓上浮 + 水平摇曳
      kites = Array.from({ length: KITE_COUNT }, () => {
        const roll = Math.random()
        const color = roll < 0.55 ? PALETTE.bull : roll < 0.85 ? PALETTE.bear : PALETTE.gold
        const hw = rand(1.6, 3.2)
        return {
          x: Math.random() * W,
          y: Math.random() * H,
          hw,
          body: rand(3, 8),
          wickUp: rand(1.5, 4),
          wickDown: rand(1.5, 4),
          vy: rand(0.06, 0.22),
          sway: rand(0.1, 0.4),
          phase: Math.random() * Math.PI * 2,
          color,
          alpha: rand(0.1, 0.26),
        }
      })
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      W = Math.max(1, Math.floor(rect.width))
      H = Math.max(1, Math.floor(rect.height))
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (stars.length === 0) seed()
    }

    const drawStar = (s: Star, tw: number) => {
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fillStyle = rgba(s.color, Math.max(0.02, s.base * tw))
      ctx.fill()
    }

    const drawKite = (k: KiteParticle) => {
      // 微倾角（≈6°）让上浮有「引力漂移」感
      ctx.save()
      ctx.translate(k.x, k.y)
      ctx.rotate(0.1 * Math.sin(k.phase))
      ctx.strokeStyle = rgba(k.color, k.alpha * 0.8)
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(0, -k.body / 2 - k.wickUp)
      ctx.lineTo(0, k.body / 2 + k.wickDown)
      ctx.stroke()
      ctx.fillStyle = rgba(k.color, k.alpha)
      ctx.fillRect(-k.hw, -k.body / 2, k.hw * 2, k.body)
      ctx.restore()
    }

    const drawMeteor = (m: Meteor) => {
      if (!m.active) return
      const t = m.life / m.max
      const fade = Math.sin(t * Math.PI)
      const tailX = m.x - m.vx * 26
      const tailY = m.y - m.vy * 26
      const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY)
      grad.addColorStop(0, rgba(PALETTE.gold, 0.5 * fade))
      grad.addColorStop(1, rgba(PALETTE.gold, 0))
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.moveTo(m.x, m.y)
      ctx.lineTo(tailX, tailY)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(m.x, m.y, 1.2, 0, Math.PI * 2)
      ctx.fillStyle = rgba(PALETTE.gold, 0.65 * fade)
      ctx.fill()
    }

    const frame = (now: number) => {
      ctx.clearRect(0, 0, W, H)

      // 星点：视差漂移（层速 0.006/0.014/0.026 px/frame）+ 闪烁
      for (const s of stars) {
        const speed = s.layer === 0 ? 0.006 : s.layer === 1 ? 0.014 : 0.026
        s.y += speed
        if (s.y > H + 2) {
          s.y = -2
          s.x = Math.random() * W
        }
        const tw = 0.55 + 0.45 * Math.sin(now * 0.001 * s.twinkleSpeed + s.phase)
        drawStar(s, tw)
      }

      // K线粒子：上浮 + 摇曳；越界后从底部重生
      for (const k of kites) {
        k.phase += 0.008
        k.y -= k.vy
        k.x += Math.sin(now * 0.0006 + k.phase) * k.sway * 0.3
        if (k.y < -12) {
          k.y = H + 12
          k.x = Math.random() * W
        }
        if (k.x < -12) k.x = W + 12
        if (k.x > W + 12) k.x = -12
        drawKite(k)
      }

      // 流星：8~16s 随机触发，斜向 60~120 帧
      if (!meteor.active && now >= nextMeteorAt) {
        meteor.active = true
        meteor.x = rand(W * 0.3, W * 0.95)
        meteor.y = rand(0, H * 0.35)
        const a = rand(Math.PI * 0.65, Math.PI * 0.85) // 左下方向
        const sp = rand(2.4, 4.2)
        meteor.vx = Math.cos(a) * sp
        meteor.vy = -Math.sin(a) * sp
        meteor.max = rand(60, 110)
        meteor.life = 0
      }
      if (meteor.active) {
        meteor.life++
        meteor.x += meteor.vx
        meteor.y += meteor.vy
        drawMeteor(meteor)
        if (meteor.life >= meteor.max || meteor.x < -40 || meteor.y > H + 40) {
          meteor.active = false
          nextMeteorAt = now + 8000 + Math.random() * 8000
        }
      }

      raf = requestAnimationFrame(frame)
    }

    resize()
    const ro = new ResizeObserver(() => resize())
    ro.observe(canvas)

    if (reduced) {
      // 静态一帧：星点 + K线粒子（无动画）
      for (const s of stars) drawStar(s, 0.8)
      for (const k of kites) drawKite(k)
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />
}
