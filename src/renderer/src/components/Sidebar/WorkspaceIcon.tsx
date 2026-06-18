export default function WorkspaceIcon({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="no-drag flex items-center gap-3 cursor-default select-none">
      <div
        style={{
          width: collapsed ? 32 : 30,
          height: collapsed ? 32 : 30,
          borderRadius: 9,
          background: 'linear-gradient(145deg, #1a1a1e 0%, #0a0a0c 100%)',
          border: '1px solid rgba(230,57,70,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow:
            '0 2px 6px rgba(0,0,0,0.25), 0 0 12px rgba(230,57,70,0.08), inset 0 1px 0 rgba(255,255,255,0.04)'
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
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
      {!collapsed && (
        <div className="flex flex-col">
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-accent)',
              letterSpacing: '0.01em',
              lineHeight: 1.2
            }}
          >
            Ghost
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 400,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.02em',
              lineHeight: 1.2
            }}
          >
            Personal
          </span>
        </div>
      )}
    </div>
  )
}
