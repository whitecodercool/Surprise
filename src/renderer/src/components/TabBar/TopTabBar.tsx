import { useBrowser } from '../../context/BrowserContext'

// Ghost Browser logo icon — a stylized eye outline
function GhostLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="var(--color-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" fill="var(--color-accent)" />
    </svg>
  )
}

export default function TopTabBar() {
  const { state, createNewTab, closeTab, switchTab } = useBrowser()
  const { tabs, activeTabId } = state

  const isMac =
    typeof window !== 'undefined' &&
    (/Mac/.test(window.navigator.platform) || /Macintosh/.test(window.navigator.userAgent))

  return (
    <div
      className="top-tab-bar flex items-center gap-0"
      style={{
        height: 40,
        paddingLeft: isMac ? 80 : 12,
        paddingRight: isMac ? 8 : 100
      }}
    >
      {/* Ghost Browser Logo + Brand */}
      <div
        className="no-drag flex items-center gap-2 mr-4 cursor-default select-none"
        style={{ flexShrink: 0 }}
      >
        <GhostLogo />
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--color-accent)',
            letterSpacing: '0.02em',
            lineHeight: 1
          }}
        >
          ghost <span style={{ fontWeight: 400, color: 'var(--color-accent)' }}>browser</span>
        </span>
      </div>

      {/* Tab list */}
      <div className="flex items-end gap-[2px] flex-1 overflow-hidden" style={{ minWidth: 0 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const displayTitle = tab.title || 'New Tab'

          return (
            <div
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`top-tab-item ${isActive ? 'active' : ''}`}
              title={displayTitle}
            >
              {/* Red dot / favicon */}
              <div
                className="flex-shrink-0 flex items-center justify-center"
                style={{ width: 14, height: 14 }}
              >
                {tab.isLoading ? (
                  <div
                    className="animate-spin"
                    style={{
                      width: 12,
                      height: 12,
                      border: '1.5px solid var(--color-text-faint)',
                      borderTopColor: 'var(--color-accent)',
                      borderRadius: '50%'
                    }}
                  />
                ) : tab.favicon ? (
                  <img
                    src={tab.favicon}
                    alt=""
                    style={{ width: 14, height: 14, borderRadius: 3 }}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--color-accent)',
                      boxShadow: '0 0 6px var(--color-accent)'
                    }}
                  />
                )}
              </div>

              {/* Title */}
              <span
                className="truncate"
                style={{
                  fontSize: 12,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  flex: 1,
                  minWidth: 0
                }}
              >
                {displayTitle}
              </span>

              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="tab-close-btn"
                title="Close tab"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path
                    d="M2 2l5 5M7 2l-5 5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )
        })}

        {/* New tab button */}
        <button
          onClick={() => createNewTab()}
          className="top-tab-new-btn"
          title="New tab (Ctrl+T)"
          style={{ marginLeft: 4, flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Spacer for drag region */}
      <div className="drag-region flex-1" style={{ minWidth: 60 }} />

      {/* Window controls for non-macOS */}
      {!isMac && (
        <div className="flex items-center gap-1 no-drag" style={{ marginRight: 4 }}>
          <button onClick={() => window.api?.minimizeWindow()} className="win-btn" title="Minimize">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M2 5.5h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>

          <button onClick={() => window.api?.maximizeWindow()} className="win-btn" title="Maximize">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect
                x="2"
                y="2"
                width="7"
                height="7"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
          </button>

          <button onClick={() => window.api?.closeWindow()} className="win-btn close" title="Close">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M3 3l5 5M8 3l-5 5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
