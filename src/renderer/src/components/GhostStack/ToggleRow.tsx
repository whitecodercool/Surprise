/** GhostStack Toggle Row — reusable settings toggle */
import { useCallback } from 'react'

interface ToggleRowProps {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export default function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled
}: ToggleRowProps) {
  const toggle = useCallback(() => {
    if (!disabled) onChange(!checked)
  }, [checked, disabled, onChange])

  return (
    <div
      id={id}
      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <div className="flex flex-col gap-0.5">
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {label}
        </span>
        {description && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{description}</span>
        )}
      </div>
      <button
        onClick={toggle}
        disabled={disabled}
        className="relative flex-shrink-0"
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: checked ? 'var(--color-accent, #6366f1)' : '#333',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s'
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: '#fff',
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
          }}
        />
      </button>
    </div>
  )
}
