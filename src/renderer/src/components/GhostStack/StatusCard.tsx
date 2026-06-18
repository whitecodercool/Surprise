/** GhostStack Status Card */
interface StatusCardProps {
  id: string
  title: string
  children: React.ReactNode
  accent?: string
}

export default function StatusCard({ id, title, children, accent }: StatusCardProps) {
  return (
    <div
      id={id}
      style={{
        background: 'var(--color-bg-tertiary, #111118)',
        border: '1px solid var(--color-border-subtle, #222)',
        borderRadius: 14,
        padding: '16px 18px',
        ...(accent ? { borderLeft: `3px solid ${accent}` } : {})
      }}
    >
      <h3
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--color-text-muted)',
          marginBottom: 10
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  )
}
