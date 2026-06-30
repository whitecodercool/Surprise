import { useState, useEffect, useMemo, useRef, useCallback } from 'react'

// ── Constellation Node ──
interface StarNode {
  id: number
  x: number
  y: number
  size: number
  brightness: number
  twinkleDur: number
  twinkleDelay: number
  cluster: number // group id for constellation wiring
}

// ── Shooting Star ──
interface ShootingStar {
  id: number
  startX: number
  startY: number
  angle: number
  length: number
  delay: number
  duration: number
}

// Deterministic seeded random for consistent constellation patterns
function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export default function SplashScreen({ onFinished }: { onFinished: () => void }) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'stars' | 'constellations' | 'out'>('stars')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  // ── Generate constellation starfield ──
  const { nodes, edges, shootingStars } = useMemo(() => {
    const rng = seededRandom(42)
    const count = 140
    const starNodes: StarNode[] = []

    for (let i = 0; i < count; i++) {
      starNodes.push({
        id: i,
        x: rng() * 100,
        y: rng() * 100,
        size: rng() * 2.2 + 0.4,
        brightness: rng() * 0.6 + 0.4,
        twinkleDur: rng() * 4 + 2,
        twinkleDelay: rng() * 5,
        cluster: Math.floor(rng() * 12) // 12 constellation clusters
      })
    }

    // Build constellation edges: connect nearby stars in same cluster
    const constellationEdges: [number, number][] = []
    for (let i = 0; i < starNodes.length; i++) {
      for (let j = i + 1; j < starNodes.length; j++) {
        if (starNodes[i].cluster !== starNodes[j].cluster) continue
        const dx = starNodes[i].x - starNodes[j].x
        const dy = starNodes[i].y - starNodes[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 14) {
          constellationEdges.push([i, j])
        }
      }
    }

    // Shooting stars
    const shots: ShootingStar[] = Array.from({ length: 6 }, (_, i) => ({
      id: i,
      startX: rng() * 80 + 10,
      startY: rng() * 40,
      angle: 25 + rng() * 20,
      length: 80 + rng() * 120,
      delay: rng() * 4 + i * 0.8,
      duration: 0.6 + rng() * 0.4
    }))

    return { nodes: starNodes, edges: constellationEdges, shootingStars: shots }
  }, [])

  // ── Nebula canvas (subtle galaxy cloud) ──
  const drawNebula = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)

    const w = canvas.offsetWidth
    const h = canvas.offsetHeight

    // Draw multiple radial gradient blobs for nebula effect
    const blobs = [
      { x: w * 0.3, y: h * 0.4, r: 220, color: 'rgba(230, 57, 70, 0.04)' },
      { x: w * 0.7, y: h * 0.3, r: 180, color: 'rgba(100, 50, 120, 0.03)' },
      { x: w * 0.5, y: h * 0.6, r: 260, color: 'rgba(230, 57, 70, 0.025)' },
      { x: w * 0.2, y: h * 0.7, r: 150, color: 'rgba(60, 30, 90, 0.03)' },
      { x: w * 0.8, y: h * 0.65, r: 200, color: 'rgba(230, 57, 70, 0.02)' }
    ]

    blobs.forEach((b) => {
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
      grad.addColorStop(0, b.color)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    })
  }, [])

  useEffect(() => {
    drawNebula()
    window.addEventListener('resize', drawNebula)
    return () => window.removeEventListener('resize', drawNebula)
  }, [drawNebula])

  // ── Progress timer ──
  useEffect(() => {
    let current = 0
    const timer = setInterval(() => {
      current += Math.floor(Math.random() * 4) + 3
      if (current >= 100) {
        current = 100
        clearInterval(timer)
      }
      setProgress(current)
    }, 20)
    return () => clearInterval(timer)
  }, [])

  // ── Phase transitions driven by progress ──
  useEffect(() => {
    if (progress >= 20 && phase === 'stars') {
      setPhase('constellations')
    }
    if (progress >= 100 && phase === 'constellations') {
      // Fade out and open browser directly
      const t = setTimeout(() => setPhase('out'), 200)
      return () => clearTimeout(t)
    }
    return undefined
  }, [progress, phase])

  // ── Out phase → finish ──
  useEffect(() => {
    if (phase === 'out') {
      const t = setTimeout(onFinished, 400)
      return () => clearTimeout(t)
    }
    return undefined
  }, [phase, onFinished])

  // ── Star glow animation loop ──
  useEffect(() => {
    let t = 0
    const tick = () => {
      t += 0.016
      // Force re-render for glow pulsing by minimal state-free DOM update
      const els = document.querySelectorAll<HTMLElement>('[data-star-glow]')
      els.forEach((el) => {
        const dur = parseFloat(el.dataset.twinkleDur || '3')
        const delay = parseFloat(el.dataset.twinkleDelay || '0')
        const base = parseFloat(el.dataset.baseBright || '0.5')
        const pulse = Math.sin(((t + delay) / dur) * Math.PI * 2) * 0.4 + 0.6
        el.style.opacity = String(base * pulse)
      })
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  const showConstellations = phase !== 'stars'

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center select-none"
      style={{
        background: '#000000',
        overflow: 'hidden',
        opacity: phase === 'out' ? 0 : 1,
        transition: 'opacity 0.6s ease-out'
      }}
    >
      {/* ── GHOST BROWSER Top Left Branding ── */}
      <div
        className="absolute"
        style={{
          top: 28,
          left: 32,
          zIndex: 10,
          opacity: phase === 'out' ? 0 : 0.7,
          transition: 'opacity 0.5s ease'
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '0.18em',
            fontFamily: "'SF Mono', 'Fira Code', monospace"
          }}
        >
          GHOST BROWSER
        </span>
      </div>
      {/* ── Nebula Canvas ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.8 }}
      />

      {/* ── Starfield Layer ── */}
      <div className="absolute inset-0 pointer-events-none">
        {nodes.map((star) => (
          <div
            key={star.id}
            data-star-glow=""
            data-twinkle-dur={star.twinkleDur}
            data-twinkle-delay={star.twinkleDelay}
            data-base-bright={star.brightness}
            className="absolute rounded-full"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              background: `radial-gradient(circle, rgba(255,255,255,${star.brightness}) 0%, rgba(255,255,255,${star.brightness * 0.3}) 60%, transparent 100%)`,
              boxShadow: star.size > 1.6
                ? `0 0 ${star.size * 3}px rgba(255,255,255,${star.brightness * 0.3})`
                : 'none',
              opacity: star.brightness,
              transition: 'box-shadow 0.5s ease'
            }}
          />
        ))}
      </div>

      {/* ── Constellation Lines ── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          opacity: showConstellations ? 0.35 : 0,
          transition: 'opacity 1.5s ease-in'
        }}
      >
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={`${nodes[a].x}%`}
            y1={`${nodes[a].y}%`}
            x2={`${nodes[b].x}%`}
            y2={`${nodes[b].y}%`}
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="0.5"
            style={{
              strokeDasharray: '200',
              strokeDashoffset: showConstellations ? '0' : '200',
              transition: `stroke-dashoffset 2s ease-out ${i * 0.05}s`
            }}
          />
        ))}
      </svg>

      {/* ── Shooting Stars ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {shootingStars.map((s) => (
          <div
            key={s.id}
            className="absolute"
            style={{
              left: `${s.startX}%`,
              top: `${s.startY}%`,
              width: s.length,
              height: 1,
              background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)`,
              transform: `rotate(${s.angle}deg)`,
              animation: `shooting-star ${s.duration}s ease-out ${s.delay}s infinite`,
              opacity: 0
            }}
          />
        ))}
      </div>

      {/* ── Central Content ── */}
      <div className="relative flex items-center justify-center" style={{ width: 400, height: 400 }}>

        {/* ── Loading HUD ── */}
        <div
          className="absolute flex flex-col items-center justify-center"
          style={{
            opacity: phase === 'out' ? 0 : 1,
            transform: `scale(${phase === 'out' ? 0.8 : 1})`,
            transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none'
          }}
        >
          {/* Outer ring with rotating dashes */}
          <svg width="200" height="200" viewBox="0 0 200 200" fill="none" className="absolute">
            <circle
              cx="100" cy="100" r="90"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="0.5"
            />
            <circle
              cx="100" cy="100" r="90"
              stroke="rgba(230, 57, 70, 0.1)"
              strokeWidth="1"
              strokeDasharray="3 15"
              style={{
                transformOrigin: 'center',
                animation: 'spin-clockwise 20s linear infinite'
              }}
            />
            <circle
              cx="100" cy="100" r="72"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.5"
              strokeDasharray="6 8"
              style={{
                transformOrigin: 'center',
                animation: 'spin-counter-clockwise 30s linear infinite'
              }}
            />
          </svg>

          {/* Progress number */}
          <span
            style={{
              fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
              fontSize: 38,
              fontWeight: 200,
              color: '#ffffff',
              letterSpacing: '0.08em',
              textShadow: '0 0 30px rgba(255,255,255,0.15), 0 0 60px rgba(230,57,70,0.08)',
              lineHeight: 1
            }}
          >
            {String(progress).padStart(3, '0')}
          </span>
          <span
            style={{
              fontSize: 8,
              fontWeight: 500,
              color: 'rgba(230, 57, 70, 0.7)',
              letterSpacing: '0.25em',
              marginTop: 8,
              textTransform: 'uppercase'
            }}
          >
            SECURING
          </span>
        </div>
      </div>

      {/* ── Bottom status text ── */}
      <div
        className="absolute bottom-8 flex flex-col items-center gap-2"
        style={{
          opacity: 0.5,
          transition: 'opacity 0.5s ease'
        }}
      >
        <div
          style={{
            width: 140,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(230,57,70,0.2), transparent)'
          }}
        />
        <span
          style={{
            fontSize: 9,
            letterSpacing: '0.15em',
            color: 'rgba(255,255,255,0.25)',
            fontFamily: "'SF Mono', monospace"
          }}
        >
          GHOST BROWSER v1.1.0
        </span>
      </div>

      {/* ── Inline shooting star keyframe ── */}
      <style>{`
        @keyframes shooting-star {
          0% { opacity: 0; transform: rotate(var(--angle, 30deg)) translateX(-100px); }
          10% { opacity: 1; }
          30% { opacity: 1; }
          100% { opacity: 0; transform: rotate(var(--angle, 30deg)) translateX(400px); }
        }
      `}</style>
    </div>
  )
}
