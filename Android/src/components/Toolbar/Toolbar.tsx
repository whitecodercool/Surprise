import { useBrowser } from '../../context/BrowserContext'
import AddressBar from './AddressBar'
import NavButton from './NavButton'
import KebabMenu from './KebabMenu'

export default function Toolbar() {
  const { state, goBack, goForward, reload, createNewTab } = useBrowser()
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

  if (!window.api) {
    return (
      <div
        className="flex items-center px-4 toolbar-glass relative z-50 justify-between"
        style={{
          height: 56,
          borderBottom: '1px solid var(--color-border-subtle)'
        }}
      >
        <div className="flex items-center gap-2.5">
          <NavButton onClick={goBack} disabled={!activeTab} title="Back">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 3L5 8l5 5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </NavButton>

          <NavButton onClick={() => createNewTab('ghost://newtab')} title="Home">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 22V12h6v10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </NavButton>
        </div>

        <div className="flex-1 min-w-0 mx-3.5">
          <AddressBar />
        </div>

        <div className="flex items-center gap-4.5">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-mobile-tab-switcher'))}
            className="w-7 h-7 rounded-md border-2 text-[10px] font-bold font-mono flex items-center justify-center transition-colors hover:bg-white/5 active:bg-white/10"
            style={{
              borderColor: 'var(--color-text-secondary, #a0a0a5)',
              color: 'var(--color-text-primary, #ffffff)',
              flexShrink: 0
            }}
            title="Tabs"
          >
            {state.tabs.length}
          </button>

          <KebabMenu />
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-3 px-3 no-drag toolbar-glass transition-all duration-300 relative z-50"
      style={{
        height: 48,
        borderBottom: '1px solid var(--color-border-subtle)'
      }}
    >
      {/* Navigation pill (back, forward, reload grouped) */}
      <div className="nav-pill">
        <NavButton onClick={goBack} disabled={!activeTab?.canGoBack} title="Back (Alt+←)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M8.5 3L4.5 7l4 4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </NavButton>

        <NavButton onClick={goForward} disabled={!activeTab?.canGoForward} title="Forward (Alt+→)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M5.5 3l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </NavButton>

        <NavButton onClick={reload} disabled={!activeTab} title="Reload (Ctrl+R)">
          {activeTab?.isLoading ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M4 4l6 6M10 4l-6 6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2.5 7a4.5 4.5 0 018.1-2.7"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M11.5 7a4.5 4.5 0 01-8.1 2.7"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M10.5 2v2.3h-2.3"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3.5 12v-2.3h2.3"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </NavButton>
      </div>

      {/* Address bar */}
      <AddressBar />

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Bookmark star */}
        <NavButton onClick={() => {}} title="Bookmark this page">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path
              d="M7.5 2l1.7 3.5 3.8.5-2.7 2.7.7 3.8L7.5 10.7 4 12.5l.7-3.8L2 6l3.8-.5z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
        </NavButton>

        {/* Kebab menu */}
        <KebabMenu />
      </div>
    </div>
  )
}
