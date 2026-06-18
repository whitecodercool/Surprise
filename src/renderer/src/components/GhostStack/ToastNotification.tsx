/** GhostStack Toast Notification */
import { useState, useEffect } from 'react'

interface ToastProps {
  message: string
  engine: string
  visible: boolean
  onDismiss: () => void
}

const ENGINE_COLORS: Record<string, string> = {
  ipraw: '#6366f1',
  splitcast: '#eab308',
  temporal: '#a855f7',
  blocked: '#ef4444'
}

export default function ToastNotification({ message, engine, visible, onDismiss }: ToastProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (visible) {
      setShow(true)
      const t = setTimeout(() => {
        setShow(false)
        setTimeout(onDismiss, 300)
      }, 3000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [visible, onDismiss])

  if (!visible && !show) return null

  return (
    <div
      id="ghoststack-toast"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 10000,
        background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${ENGINE_COLORS[engine] || '#333'}`,
        borderRadius: 12,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)`,
        transform: show ? 'translateY(0)' : 'translateY(20px)',
        opacity: show ? 1 : 0,
        transition: 'all 0.3s ease'
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: ENGINE_COLORS[engine] || '#6366f1',
          boxShadow: `0 0 8px ${ENGINE_COLORS[engine] || '#6366f1'}`
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 500, color: '#e0e0e0' }}>{message}</span>
    </div>
  )
}
