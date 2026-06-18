import { useState, useRef, useEffect, useMemo } from 'react'
import { useBrowser } from '../../context/BrowserContext'
import type { CommandAction } from '../../types'

export default function CommandPalette() {
  const {
    state,
    dispatch,
    createNewTab,
    closeTab,
    switchTab,
    navigateTo,
    pinTab,
    unpinTab,
    muteTab,
    unmuteTab,
    restoreClosedTab
  } = useBrowser()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    setQuery('')
    setSelectedIndex(0)
  }, [state.commandPaletteOpen])

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

  const actions = useMemo<CommandAction[]>(() => {
    const base: CommandAction[] = [
      {
        id: 'new-tab',
        label: 'New Tab',
        shortcut: 'Ctrl+T',
        category: 'Actions',
        icon: '⊕',
        action: () => createNewTab()
      },
      {
        id: 'close-tab',
        label: 'Close Current Tab',
        shortcut: 'Ctrl+W',
        category: 'Actions',
        icon: '✕',
        action: () => {
          if (state.activeTabId) closeTab(state.activeTabId)
        }
      },
      {
        id: 'reopen-tab',
        label: 'Reopen Closed Tab',
        shortcut: 'Ctrl+⇧+T',
        category: 'Actions',
        icon: '↩',
        action: () => {
          if (state.recentlyClosed.length > 0) restoreClosedTab(state.recentlyClosed[0])
        }
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        shortcut: 'Ctrl+B',
        category: 'Actions',
        icon: '☰',
        action: () => dispatch({ type: 'TOGGLE_SIDEBAR' })
      },
      {
        id: 'split-view',
        label: 'Toggle Split View',
        shortcut: 'Ctrl+⇧+S',
        category: 'Actions',
        icon: '⊞',
        action: () => {
          const mode = state.splitViewMode === 'none' ? 'vertical' : 'none'
          const sec = state.tabs.find((t) => t.id !== state.activeTabId)
          dispatch({ type: 'SET_SPLIT_VIEW', payload: { mode, tabId: sec?.id || null } })
        }
      }
    ]

    // Tab-specific actions
    if (activeTab) {
      base.push({
        id: 'pin-tab',
        label: activeTab.isPinned ? 'Unpin Current Tab' : 'Pin Current Tab',
        category: 'Tab',
        icon: '📌',
        action: () => (activeTab.isPinned ? unpinTab(activeTab.id) : pinTab(activeTab.id))
      })
      base.push({
        id: 'mute-tab',
        label: activeTab.isMuted ? 'Unmute Current Tab' : 'Mute Current Tab',
        category: 'Tab',
        icon: activeTab.isMuted ? '🔇' : '🔊',
        action: () => (activeTab.isMuted ? unmuteTab(activeTab.id) : muteTab(activeTab.id))
      })
    }

    // Navigate
    base.push(
      {
        id: 'nav-google',
        label: 'Google',
        category: 'Navigate',
        icon: '🔍',
        action: () => navigateTo('https://www.google.com')
      },
      {
        id: 'nav-github',
        label: 'GitHub',
        category: 'Navigate',
        icon: '🐙',
        action: () => navigateTo('https://github.com')
      },
      {
        id: 'nav-youtube',
        label: 'YouTube',
        category: 'Navigate',
        icon: '▶️',
        action: () => navigateTo('https://www.youtube.com')
      }
    )

    // Open tabs
    state.tabs.forEach((tab) => {
      base.push({
        id: `switch-${tab.id}`,
        label: tab.title || 'New Tab',
        category: 'Open Tabs',
        icon: '↗',
        action: () => switchTab(tab.id)
      })
    })

    // Recently closed
    state.recentlyClosed.slice(0, 5).forEach((ct) => {
      base.push({
        id: `restore-${ct.id}`,
        label: ct.title || ct.url,
        category: 'Recently Closed',
        icon: '↩',
        action: () => restoreClosedTab(ct)
      })
    })

    return base
  }, [
    state.tabs,
    state.activeTabId,
    state.splitViewMode,
    state.recentlyClosed,
    activeTab,
    createNewTab,
    closeTab,
    switchTab,
    navigateTo,
    dispatch,
    pinTab,
    unpinTab,
    muteTab,
    unmuteTab,
    restoreClosedTab
  ])

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions
    const q = query.toLowerCase()
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    )
  }, [actions, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filteredActions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredActions[selectedIndex]) {
        filteredActions[selectedIndex].action()
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
      } else if (query.trim()) {
        navigateTo(query.trim())
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
      }
    } else if (e.key === 'Escape') {
      dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Group by category
  const grouped = useMemo(() => {
    const g: Record<string, CommandAction[]> = {}
    filteredActions.forEach((a) => {
      if (!g[a.category]) g[a.category] = []
      g[a.category].push(a)
    })
    return g
  }, [filteredActions])

  let globalIdx = -1

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center cmd-backdrop"
      style={{ paddingTop: 72 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
      }}
    >
      <div
        className="cmd-panel animate-cmd-enter flex flex-col"
        style={{ width: 540, maxHeight: 440 }}
      >
        {/* Search */}
        <div
          className="flex items-center gap-3 px-4"
          style={{ height: 54, borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            style={{ flexShrink: 0, color: 'var(--color-text-muted)' }}
          >
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M10 10l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent border-none"
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: 'var(--color-text-primary)',
              caretColor: 'var(--color-accent)',
              outline: 'none'
            }}
          />
          <span className="kbd flex-shrink-0">ESC</span>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto py-2 px-2" style={{ flex: 1, minHeight: 0 }}>
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="mb-1.5">
              <div className="section-label">{cat}</div>
              {items.map((action) => {
                globalIdx++
                const isSel = globalIdx === selectedIndex
                const idx = globalIdx
                return (
                  <button
                    key={action.id}
                    data-index={idx}
                    className={`cmd-item ${isSel ? 'selected' : ''}`}
                    onClick={() => {
                      action.action()
                      dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 7,
                        background: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border-subtle)',
                        fontSize: 12
                      }}
                    >
                      {action.icon}
                    </span>
                    <span
                      className="flex-1"
                      style={{
                        fontSize: 12,
                        fontWeight: isSel ? 450 : 400,
                        color: isSel ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'
                      }}
                    >
                      {action.label}
                    </span>
                    {action.shortcut && (
                      <span className="kbd" style={{ fontSize: 9 }}>
                        {action.shortcut}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          {filteredActions.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.15 }}>
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M15.5 15.5L21 21"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                No results — press Enter to search &ldquo;{query}&rdquo;
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
