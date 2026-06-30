import { useState, type ReactNode } from 'react'

interface SidebarSectionProps {
  title: string
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
  defaultCollapsed?: boolean
  count?: number
}

export default function SidebarSection({
  title,
  icon,
  action,
  children,
  defaultCollapsed = false,
  count
}: SidebarSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className="mb-0.5">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1">
        <button
          className="no-drag flex items-center gap-2 btn-ghost rounded-md px-1.5 py-1"
          onClick={() => setCollapsed(!collapsed)}
          style={{ border: 'none' }}
        >
          <span style={{ color: 'var(--color-text-muted)', opacity: 0.6, display: 'flex' }}>
            {icon}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.02em'
            }}
          >
            {title}
          </span>
          {count !== undefined && count > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                background: 'var(--color-bg-hover)',
                padding: '1px 5px',
                borderRadius: 8,
                lineHeight: '14px',
                minWidth: 16,
                textAlign: 'center'
              }}
            >
              {count}
            </span>
          )}
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            style={{
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)',
              opacity: 0.4
            }}
          >
            <path
              d="M2 3l2 2 2-2"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {action && !collapsed && <div className="no-drag animate-fade-in">{action}</div>}
      </div>

      {/* Content */}
      {!collapsed && <div className="animate-fade-in px-1.5">{children}</div>}
    </div>
  )
}
