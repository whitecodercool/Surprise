import { useState, useEffect } from 'react'

export default function SplashScreen({ onFinished }: { onFinished: () => void }) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 500)
    const t2 = setTimeout(() => setPhase('out'), 2000)
    const t3 = setTimeout(onFinished, 2400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onFinished])

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center ${
        phase === 'out' ? 'animate-splash-out' : 'animate-splash-in'
      }`}
      style={{ background: '#000000' }}
    >
      <div className="flex flex-col items-center gap-7">
        {/* Ghost Logo */}
        <div className="animate-logo-breathe">
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 22,
              background: 'linear-gradient(145deg, #1a1a1e 0%, #0a0a0c 100%)',
              border: '1px solid rgba(230,57,70,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow:
                '0 12px 40px rgba(0,0,0,0.4), 0 0 30px rgba(230,57,70,0.1), inset 0 1px 0 rgba(255,255,255,0.04)'
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path
                d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                stroke="#e63946"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="3.2" fill="#e63946" />
            </svg>
          </div>
        </div>

        {/* Brand */}
        <div className="flex flex-col items-center gap-1.5">
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#e63946',
              letterSpacing: '0.15em'
            }}
          >
            GHOST
          </h1>
          <span
            style={{
              fontSize: 11,
              color: '#52525b',
              letterSpacing: '0.2em',
              fontWeight: 400
            }}
          >
            BROWSER
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: 120,
            height: 2,
            borderRadius: 1,
            background: 'rgba(255,255,255,0.04)',
            overflow: 'hidden',
            marginTop: 4
          }}
        >
          <div
            className="animate-loading-progress"
            style={{
              height: '100%',
              borderRadius: 1,
              background: 'linear-gradient(90deg, rgba(230,57,70,0.3), #e63946)'
            }}
          />
        </div>
      </div>
    </div>
  )
}
