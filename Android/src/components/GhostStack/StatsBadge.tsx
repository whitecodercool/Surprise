/** GhostStack Stats Badge */
interface StatsBadgeProps {
  label: string
  value: string | number
  color?: string
}

export default function StatsBadge({
  label,
  value,
  color = 'var(--color-accent, #6366f1)'
}: StatsBadgeProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '10px 16px',
        background: 'var(--color-bg-tertiary, #111118)',
        borderRadius: 12,
        minWidth: 80
      }}
    >
      <span style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      <span
        style={{
          fontSize: 10,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}
      >
        {label}
      </span>
    </div>
  )
}
