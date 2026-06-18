import { useState, useEffect } from 'react'
import { useBrowser } from '../../context/BrowserContext'

export default function PerformanceMonitor() {
  const { state } = useBrowser()
  const [open, setOpen] = useState(false)

  const { memoryUsageMB, startupTimeMs } = state.performanceMetrics || {
    memoryUsageMB: 0,
    startupTimeMs: 0
  }
  const suspendedTabs = state.tabs.filter((t) => (t as any).isSuspended).length
  const activeTabsCount = state.tabs.length - suspendedTabs
  useEffect(() => {
    window.api?.setOverlayActive?.(open)
  }, [open])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 h-[26px] rounded-full transition-all border border-transparent hover:border-[var(--color-border-medium)] shadow-sm"
        style={{ background: 'var(--color-bg-tertiary)' }}
        title="Performance Monitor"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: memoryUsageMB > 1500 ? 'var(--color-warning)' : 'var(--color-text-secondary)'
          }}
        >
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
        </svg>
        <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
          {memoryUsageMB}MB
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[190]" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full mt-2 right-0 w-64 rounded-xl shadow-xl z-[200] overflow-hidden animate-slide-up"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-medium)',
              backdropFilter: 'blur(12px)'
            }}
          >
            <div
              className="px-4 py-3 border-b flex items-center gap-2"
              style={{
                borderColor: 'var(--color-border-subtle)',
                background: 'var(--color-bg-tertiary)'
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: 'var(--color-accent)' }}
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
              </svg>
              <h3
                className="text-sm font-semibold tracking-wide"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Performance
              </h3>
            </div>

            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Browser Memory</span>
                  <span className="font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    {memoryUsageMB} MB
                  </span>
                </div>
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--color-bg-tertiary)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${Math.min(100, (memoryUsageMB / 2048) * 100)}%`,
                      background:
                        memoryUsageMB > 1500 ? 'var(--color-warning)' : 'var(--color-accent)'
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div
                  className="flex flex-col p-2 rounded border"
                  style={{
                    borderColor: 'var(--color-border-subtle)',
                    background: 'var(--color-bg-tertiary)'
                  }}
                >
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Active Tabs
                  </span>
                  <span
                    className="text-lg font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {activeTabsCount}
                  </span>
                </div>
                <div
                  className="flex flex-col p-2 rounded border"
                  style={{
                    borderColor: 'var(--color-border-subtle)',
                    background: 'var(--color-bg-tertiary)'
                  }}
                >
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Suspended
                  </span>
                  <span className="text-lg font-semibold" style={{ color: 'var(--color-success)' }}>
                    {suspendedTabs}
                  </span>
                </div>
              </div>

              <div
                className="flex justify-between items-center text-xs p-2 rounded"
                style={{ background: 'var(--color-bg-tertiary)' }}
              >
                <span style={{ color: 'var(--color-text-secondary)' }}>Startup Time</span>
                <span className="font-mono font-medium" style={{ color: 'var(--color-success)' }}>
                  {startupTimeMs < 1000
                    ? `${Math.round(startupTimeMs)}ms`
                    : `${(startupTimeMs / 1000).toFixed(2)}s`}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
