/** GhostStack Network HUD — toolbar badge */
import { useState, useRef, useEffect } from 'react'
import NetworkHUDPanel from './NetworkHUDPanel'

const ENGINE_COLORS: Record<string, string> = {
  off: '#4ade80',
  ipraw: '#6366f1',
  splitcast: '#eab308',
  temporal: '#a855f7',
  blocked: '#ef4444'
}

export default function NetworkHUD() {
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState<any>({ activeEngine: 'off', stats: { sitesBypassed: 0 } })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api?.ghoststackGetStatus?.().then(setStatus)
    window.api?.onGhoststackStatusChanged?.((s: any) => setStatus(s))
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    window.api?.setOverlayActive?.(isOpen)
  }, [isOpen])

  const color = ENGINE_COLORS[status?.activeEngine] || '#888'
  const pulsing = status?.isBypassing

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        id="ghoststack-hud-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="nav-btn flex items-center justify-center"
        title={`GhostStack: ${status?.activeEngine?.toUpperCase()}`}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1L14 4.5v7L8 15 2 11.5v-7L8 1z"
              stroke={color}
              strokeWidth="1.3"
              fill="none"
            />
            <circle
              cx="8"
              cy="8"
              r="2.5"
              fill={color}
              fillOpacity="0.3"
              stroke={color}
              strokeWidth="1"
            />
          </svg>
          {pulsing && (
            <div
              style={{
                position: 'absolute',
                width: 20,
                height: 20,
                borderRadius: 10,
                border: `1px solid ${color}`,
                animation: 'ghoststack-pulse 2s infinite',
                opacity: 0.4
              }}
            />
          )}
        </div>
        {status?.stats?.sitesBypassed > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 3,
              right: 3,
              minWidth: 12,
              height: 12,
              borderRadius: 6,
              background: color,
              fontSize: 8,
              fontWeight: 700,
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px'
            }}
          >
            {status.stats.sitesBypassed}
          </span>
        )}
      </button>
      {isOpen && <NetworkHUDPanel status={status} />}
      <style>{`@keyframes ghoststack-pulse{0%{transform:scale(1);opacity:0.4}50%{transform:scale(1.5);opacity:0}100%{transform:scale(1);opacity:0}}`}</style>
    </div>
  )
}
