import { useMemo, useRef, useState } from 'react'
import { useBrowser } from '../../context/BrowserContext'
import WorkspaceIcon from './WorkspaceIcon'
import SidebarSection from './SidebarSection'
import SidebarTab from './SidebarTab'

// Dark Room icon — hexagon with ghost silhouette
function DarkRoomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5L12 4.25v5.5L7 12.5 2 9.75v-5.5L7 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <circle cx="7" cy="6.5" r="1.5" fill="currentColor" opacity="0.7"/>
      <path d="M4.5 10c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

export default function Sidebar() {
  const {
    state,
    dispatch,
    createNewTab,
    closeTab,
    switchTab,
    pinTab,
    unpinTab,
    muteTab,
    unmuteTab,
    restoreClosedTab
  } = useBrowser()

  const { tabs, activeTabId, sidebarCollapsed, recentlyClosed, tabSearchQuery, tabSearchOpen, darkRoomOpen } = state
  const searchRef = useRef<HTMLInputElement>(null)
  const [, setDragIdx] = useState<number | null>(null)

  // Split tabs into pinned and unpinned
  const pinnedTabs = useMemo(() => tabs.filter((t) => t.isPinned), [tabs])
  const unpinnedTabs = useMemo(() => tabs.filter((t) => !t.isPinned), [tabs])

  // Filter tabs by search query
  const filteredTabs = useMemo(() => {
    if (!tabSearchQuery.trim()) return unpinnedTabs
    const q = tabSearchQuery.toLowerCase()
    return unpinnedTabs.filter(
      (t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)
    )
  }, [unpinnedTabs, tabSearchQuery])

  const filteredPinned = useMemo(() => {
    if (!tabSearchQuery.trim()) return pinnedTabs
    const q = tabSearchQuery.toLowerCase()
    return pinnedTabs.filter(
      (t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)
    )
  }, [pinnedTabs, tabSearchQuery])

  const handleDragStart = (e: React.DragEvent, index: number): void => {
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.effectAllowed = 'move'
    setDragIdx(index)
  }

  const handleDrop = (e: React.DragEvent, toIndex: number): void => {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      dispatch({ type: 'REORDER_TABS', payload: { fromIndex, toIndex } })
    }
    setDragIdx(null)
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  /* ── Collapsed sidebar ── */
  if (sidebarCollapsed) {
    return (
      <div
        className="flex flex-col items-center gap-1 sidebar-glass animate-fade-in"
        style={{
          width: 52,
          height: '100%',
          borderRight: '1px solid var(--color-border-subtle)',
          paddingTop: 14,
          paddingBottom: 10
        }}
      >
        <div className="drag-region" style={{ height: 4, width: '100%' }} />
        <WorkspaceIcon collapsed />
        <div className="divider" style={{ width: 24, margin: '8px 0' }} />
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className="nav-btn"
          style={{ width: 32, height: 32 }}
          title="Expand sidebar (Ctrl+B)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5.5 3.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Pinned tab icons */}
        {pinnedTabs.length > 0 && (
          <>
            <div className="divider" style={{ width: 24, margin: '4px 0' }} />
            {pinnedTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className="nav-btn"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: t.id === activeTabId ? '1px solid var(--color-border-medium)' : '1px solid transparent',
                  background: t.id === activeTabId ? 'var(--color-bg-active)' : 'transparent'
                }}
                title={t.title}
              >
                {t.favicon ? (
                  <img src={t.favicon} alt="" style={{ width: 14, height: 14, borderRadius: 3 }} />
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {t.title.charAt(0).toUpperCase()}
                  </span>
                )}
              </button>
            ))}
          </>
        )}

        <button
          onClick={() => createNewTab()}
          className="nav-btn"
          style={{ width: 32, height: 32, marginTop: 'auto' }}
          title="New tab (Ctrl+T)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    )
  }

  /* ── Expanded sidebar ── */
  return (
    <div
      className="flex flex-col sidebar-glass animate-slide-left"
      style={{
        width: 248,
        height: '100%',
        borderRight: '1px solid var(--color-border-subtle)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div className="drag-region" style={{ height: 14 }} />
      <div className="flex items-center justify-between px-3.5 pb-3">
        <WorkspaceIcon />
        <div className="no-drag flex items-center gap-0.5">
          {/* Tab search toggle */}
          <button
            onClick={() => {
              dispatch({ type: 'TOGGLE_TAB_SEARCH' })
              setTimeout(() => searchRef.current?.focus(), 50)
            }}
            className="nav-btn"
            style={{ width: 28, height: 28 }}
            title="Search tabs (Ctrl+F)"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8.5 8.5l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className="nav-btn"
            style={{ width: 28, height: 28 }}
            title="Collapse sidebar (Ctrl+B)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="2.5" width="10" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5.5 2.5v9" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab search bar */}
      {tabSearchOpen && (
        <div className="px-2.5 pb-2 animate-slide-up">
          <div className="tab-search-input flex items-center gap-2 px-2.5" style={{ height: 30 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
              <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.1" />
              <path d="M7.5 7.5l2 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={tabSearchQuery}
              onChange={(e) => dispatch({ type: 'SET_TAB_SEARCH', payload: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') dispatch({ type: 'TOGGLE_TAB_SEARCH' })
              }}
              placeholder="Filter tabs…"
              className="flex-1 bg-transparent border-none"
              style={{
                fontSize: 11,
                color: 'var(--color-text-primary)',
                caretColor: 'var(--color-accent)',
                outline: 'none'
              }}
              spellCheck={false}
            />
            {tabSearchQuery && (
              <button
                onClick={() => dispatch({ type: 'SET_TAB_SEARCH', payload: '' })}
                className="tab-action-btn"
                style={{ width: 16, height: 16 }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-2" style={{ minHeight: 0 }}>
        {/* Pinned Tabs */}
        {filteredPinned.length > 0 && (
          <SidebarSection
            title="Pinned"
            count={filteredPinned.length}
            icon={
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M7.5 1.5l4 4-2.5 2.5-1-1-3 3-2-2 3-3-1-1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
            }
          >
            <div className="flex flex-col gap-[2px]">
              {filteredPinned.map((tab, index) => (
                <SidebarTab
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  index={tabs.indexOf(tab)}
                  onSelect={() => switchTab(tab.id)}
                  onClose={() => closeTab(tab.id)}
                  onPin={() => unpinTab(tab.id)}
                  onMute={() => (tab.isMuted ? unmuteTab(tab.id) : muteTab(tab.id))}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragOver={handleDragOver}
                />
              ))}
            </div>
          </SidebarSection>
        )}

        {filteredPinned.length > 0 && filteredTabs.length > 0 && (
          <div className="divider mx-3 my-1" />
        )}

        {/* Regular Tabs */}
        <SidebarSection
          title="Tabs"
          count={filteredTabs.length}
          icon={
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="1.5" y="2.5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
              <path d="M1.5 5h10" stroke="currentColor" strokeWidth="1.1" />
              <circle cx="3.8" cy="3.7" r="0.6" fill="currentColor" />
              <circle cx="5.5" cy="3.7" r="0.6" fill="currentColor" />
            </svg>
          }
          action={
            <button
              onClick={() => createNewTab()}
              className="no-drag nav-btn"
              style={{ width: 24, height: 24, borderRadius: 6 }}
              title="New tab (Ctrl+T)"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          }
        >
          {filteredTabs.length === 0 && tabs.length === 0 ? (
            <div
              className="flex flex-col items-center gap-2 py-6 rounded-xl"
              style={{ background: 'var(--color-bg-tertiary)', border: '1px dashed var(--color-border-subtle)' }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ opacity: 0.25 }}>
                <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
                <path d="M3 7.5h14" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>No open tabs</span>
              <button
                onClick={() => createNewTab()}
                className="btn-ghost rounded-lg px-3 py-1.5"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--color-accent)',
                  background: 'var(--color-accent-subtle)',
                  border: '1px solid var(--color-accent-muted)'
                }}
              >
                Open a tab
              </button>
            </div>
          ) : filteredTabs.length === 0 && tabSearchQuery ? (
            <div className="text-center py-4" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              No tabs match "{tabSearchQuery}"
            </div>
          ) : (
            <div className="flex flex-col gap-[2px]">
              {filteredTabs.map((tab) => {
                const globalIdx = tabs.indexOf(tab)
                return (
                  <SidebarTab
                    key={tab.id}
                    tab={tab}
                    isActive={tab.id === activeTabId}
                    index={globalIdx}
                    onSelect={() => switchTab(tab.id)}
                    onClose={() => closeTab(tab.id)}
                    onPin={() => pinTab(tab.id)}
                    onMute={() => (tab.isMuted ? unmuteTab(tab.id) : muteTab(tab.id))}
                    onDragStart={(e) => handleDragStart(e, globalIdx)}
                    onDrop={(e) => handleDrop(e, globalIdx)}
                    onDragOver={handleDragOver}
                  />
                )
              })}
            </div>
          )}
        </SidebarSection>

        {/* Recently Closed */}
        {recentlyClosed.length > 0 && (
          <>
            <div className="divider mx-3 my-1" />
            <SidebarSection
              title="Recently Closed"
              count={recentlyClosed.length}
              defaultCollapsed
              icon={
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.1" />
                  <path d="M6.5 4v3l2 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              action={
                <button
                  onClick={() => dispatch({ type: 'CLEAR_RECENTLY_CLOSED' })}
                  className="no-drag nav-btn"
                  style={{ width: 24, height: 24, borderRadius: 6 }}
                  title="Clear all"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              }
            >
              <div className="flex flex-col gap-[2px]">
                {recentlyClosed.map((ct) => (
                  <button
                    key={ct.id + ct.closedAt}
                    onClick={() => restoreClosedTab(ct)}
                    className="no-drag closed-tab-item flex items-center gap-2 px-2.5 py-[6px] rounded-[9px]"
                  >
                    {ct.favicon ? (
                      <img src={ct.favicon} alt="" style={{ width: 13, height: 13, borderRadius: 3, opacity: 0.5 }} />
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ opacity: 0.25 }}>
                        <rect x="1" y="1" width="11" height="11" rx="3" stroke="currentColor" strokeWidth="1" />
                      </svg>
                    )}
                    <span
                      className="flex-1 truncate"
                      style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 400, textAlign: 'left' }}
                    >
                      {ct.title || ct.url}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
                      <path d="M2.5 6h4.5M5 4l2 2-2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M7 3.5a4 4 0 11-4 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                    </svg>
                  </button>
                ))}
              </div>
            </SidebarSection>
          </>
        )}

        <div className="divider mx-3 my-1" />

        {/* Bookmarks */}
        <SidebarSection
          title="Bookmarks"
          defaultCollapsed
          icon={
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M3.5 1.5h6a1 1 0 011 1v9l-4-2.5L2.5 11.5v-9a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
          }
        >
          <div className="flex items-center gap-2 py-3 px-3 rounded-lg" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.3 }}>
              <path d="M4 2h6a1 1 0 011 1v9l-4-2.5L3 12V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            No bookmarks yet
          </div>
        </SidebarSection>

        {/* Downloads */}
        <SidebarSection
          title="Downloads"
          defaultCollapsed
          icon={
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 2v6.5M4 6.5l2.5 2.5L9 6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.5 10.5h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          }
        >
          <div className="flex items-center gap-2 py-3 px-3 rounded-lg" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.3 }}>
              <path d="M7 2v7M4.5 6.5L7 9l2.5-2.5M3 11h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            No downloads
          </div>
        </SidebarSection>
      </div>

      {/* Bottom bar */}
      <div className="px-2.5 py-2" style={{ borderTop: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_DARK_ROOM' })}
          className="no-drag sidebar-tab flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[9px] cursor-pointer"
          style={darkRoomOpen ? { background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' } : {}}
          title="Dark Room — Anonymous E2E chat via Tor"
        >
          <DarkRoomIcon />
          <span style={{ fontSize: 12, color: darkRoomOpen ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: 400 }}>Dark Room</span>
          {darkRoomOpen && <span className="ml-auto" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-block' }} />}
        </button>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
          className="no-drag sidebar-tab flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[9px] cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.5 }}>
            <circle cx="7" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.1" />
            <path d="M7 1.5v1.3M7 11.2v1.3M1.5 7h1.3M11.2 7h1.3M3.1 3.1l.92.92M9.98 9.98l.92.92M3.1 10.9l.92-.92M9.98 4.02l.92-.92" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 400 }}>Settings</span>
          <span className="ml-auto kbd">⌘,</span>
        </button>
      </div>
    </div>
  )
}
