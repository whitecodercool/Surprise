import { useBrowser } from '../../context/BrowserContext'
import AddressBar from './AddressBar'
import NavButton from './NavButton'
import KebabMenu from './KebabMenu'

export default function Toolbar() {
  const { state, dispatch, goBack, goForward, reload } = useBrowser()
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

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
        {/* Dark Room toggle */}
        <NavButton
          onClick={() => dispatch({ type: 'TOGGLE_DARK_ROOM' })}
          title="Dark Room — Anonymous E2E chat via Tor"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 14 14"
            fill="none"
            style={{
              color: state.darkRoomOpen ? 'var(--color-accent)' : undefined
            }}
          >
            <path
              d="M7 1.5L12 4.25v5.5L7 12.5 2 9.75v-5.5L7 1.5Z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            <circle cx="7" cy="6.5" r="1.5" fill="currentColor" opacity="0.7" />
            <path
              d="M4.5 10c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>
        </NavButton>

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
