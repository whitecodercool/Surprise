import { useState, useRef, useEffect, useMemo } from 'react'
import { useBrowser } from '../../context/BrowserContext'

export default function AddressBar() {
  const { state, navigateTo } = useBrowser()
  const [isFocused, setIsFocused] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const displayUrl = activeTab?.url || ''
  const isSecure = activeTab?.isSecure || false

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isFocused) {
      setInputValue(displayUrl)
    }
  }, [displayUrl, isFocused])

  // Auto-focus input when a new tab is opened or switched to
  useEffect(() => {
    if (activeTab && (activeTab.url === 'ghost://newtab' || activeTab.url === 'about:blank' || !activeTab.url)) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [state.activeTabId, activeTab?.url])

  const handleFocus = (): void => {
    setIsFocused(true)
    setDropdownOpen(true)
    setInputValue(displayUrl)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleBlur = (): void => {
    setIsFocused(false)
    setInputValue(displayUrl)
    // Don't close dropdown immediately so clicks on it can register
    setTimeout(() => {
      if (!containerRef.current?.matches(':focus-within')) {
        setDropdownOpen(false)
      }
    }, 150)
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (inputValue.trim()) {
      navigateTo(inputValue.trim())
      inputRef.current?.blur()
      setDropdownOpen(false)
    }
  }

  const handleSuggestionClick = (url: string): void => {
    navigateTo(url)
    inputRef.current?.blur()
    setDropdownOpen(false)
  }

  const handleCopyUrl = (): void => {
    if (displayUrl) {
      navigator.clipboard.writeText(displayUrl)
    }
  }

  const getShortUrl = (): string => {
    if (isFocused) return inputValue
    if (!displayUrl || displayUrl.startsWith('about:') || displayUrl.startsWith('ghost:')) return ''
    try {
      const url = new URL(displayUrl)
      const host = url.hostname.replace(/^www\./, '')
      const path = url.pathname !== '/' ? url.pathname : ''
      const search = url.search || ''
      return host + path + search
    } catch {
      return displayUrl
    }
  }

  // Generate suggestions based on input
  const suggestions = useMemo(() => {
    if (!inputValue) {
      // Empty input: show top sites or recently closed as a proxy for history
      return state.recentlyClosed
        .slice(0, 4)
        .map((ct) => ({
          type: 'history',
          title: ct.title || ct.url,
          url: ct.url,
          icon: '🕒'
        }))
        .concat([
          { type: 'bookmark', title: 'Google', url: 'https://google.com', icon: '⭐' },
          { type: 'bookmark', title: 'GitHub', url: 'https://github.com', icon: '⭐' }
        ])
    }

    const q = inputValue.toLowerCase()

    // Always provide a search suggestion
    const items = [
      {
        type: 'search',
        title: `Search for "${inputValue}"`,
        url: `https://google.com/search?q=${encodeURIComponent(inputValue)}`,
        icon: '🔍'
      }
    ]

    // If it looks like a URL, add a navigate suggestion
    if (/^[^\s]+\.[^\s]+$/.test(inputValue)) {
      items.push({
        type: 'navigate',
        title: `Go to ${inputValue}`,
        url: `https://${inputValue}`,
        icon: '🌐'
      })
    }

    // Filter recently closed as history
    state.recentlyClosed.forEach((ct) => {
      if ((ct.title && ct.title.toLowerCase().includes(q)) || ct.url.toLowerCase().includes(q)) {
        items.push({ type: 'history', title: ct.title || ct.url, url: ct.url, icon: '🕒' })
      }
    })

    return items.slice(0, 6)
  }, [inputValue, state.recentlyClosed])

  // Mock progress state (since we don't have real progress events from webContents yet)
  // Just use isLoading to show a fake progress bar that reaches 80% then 100%
  const progressWidth = activeTab?.isLoading ? '80%' : '0%'
  const progressOpacity = activeTab?.isLoading ? 1 : 0

  return (
    <div className="address-bar-container" ref={containerRef}>
      <form
        onSubmit={handleSubmit}
        className={`address-bar flex items-center gap-2.5 px-4 ${isFocused ? 'focused' : ''}`}
        style={{ height: 40 }}
      >
        {/* Loading Progress Bar at bottom */}
        <div
          className="address-bar-progress"
          style={{ width: progressWidth, opacity: progressOpacity }}
        />

        {/* Shield Icon */}
        {!isFocused && activeTab && (
          <button
            type="button"
            className="flex-shrink-0 flex items-center justify-center nav-btn"
            style={{ width: 20, height: 20, marginLeft: -4 }}
            onClick={(e) => {
              e.preventDefault()
              setPrivacyOpen(!privacyOpen)
            }}
            title="Privacy Protections"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              style={{
                color:
                  state.ghoststackStatus && state.ghoststackStatus.activeEngine !== 'off'
                    ? 'var(--color-accent)'
                    : 'var(--color-text-muted)'
              }}
            >
              <path
                d="M6.5 1.5l-5 2v4c0 3 5 5 5 5s5-2 5-5v-4l-5-2z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        {/* Security / Favicon indicator */}
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 16 }}>
          {activeTab?.isLoading && !isFocused ? (
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
          ) : activeTab?.favicon && !isFocused ? (
            <img
              src={activeTab.favicon}
              alt=""
              style={{ width: 14, height: 14, borderRadius: 3 }}
            />
          ) : isSecure ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <path
                d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <rect
                x="2.5"
                y="5.5"
                width="7"
                height="4.5"
                rx="1.2"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          ) : (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.1" />
              <path d="M6 3.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
            </svg>
          )}
        </div>

        {/* URL Input */}
        <input
          ref={inputRef}
          type="text"
          value={isFocused ? inputValue : getShortUrl()}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit(e as any)
            }
          }}
          placeholder="Search or type web address"
          className="flex-1 bg-transparent border-none"
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: isFocused ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            caretColor: 'var(--color-accent)',
            outline: 'none',
            letterSpacing: '0.01em'
          }}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />

        {/* Action Buttons (Reader Mode, Copy URL, QR) */}
        {!isFocused && activeTab && (
          <div className="flex items-center gap-0.5 ml-auto">
            <button
              type="button"
              className="address-action-btn"
              title="Reader Mode"
              onClick={(e) => e.preventDefault()}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2.5 3.5h9M2.5 7h9M2.5 10.5h6"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="address-action-btn"
              title="Copy Link"
              onClick={(e) => {
                e.preventDefault()
                handleCopyUrl()
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect
                  x="3.5"
                  y="3.5"
                  width="7"
                  height="7"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.1"
                />
                <path
                  d="M3.5 9.5h-1a1 1 0 01-1-1v-5a1 1 0 011-1h5a1 1 0 011 1v1"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="address-action-btn"
              title="Share via QR"
              onClick={(e) => e.preventDefault()}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect
                  x="2"
                  y="2"
                  width="3.5"
                  height="3.5"
                  rx="0.5"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <rect
                  x="7.5"
                  y="2"
                  width="3.5"
                  height="3.5"
                  rx="0.5"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <rect
                  x="2"
                  y="7.5"
                  width="3.5"
                  height="3.5"
                  rx="0.5"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <path
                  d="M8 8h1M8 10.5h2.5M10.5 8v1.5"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Shortcut hint when empty */}
        {!isFocused && !activeTab && <span className="kbd flex-shrink-0">⌘L</span>}
      </form>

      {/* Suggestions Dropdown */}
      <div className={`address-bar-dropdown flex flex-col py-1 ${dropdownOpen ? 'open' : ''}`}>
        {suggestions.length > 0 ? (
          suggestions.map((suggestion, i) => (
            <div
              key={i}
              className="dropdown-item"
              onMouseDown={(e) => {
                e.preventDefault() // prevent blur
                handleSuggestionClick(suggestion.url)
              }}
            >
              <div className="dropdown-icon">{suggestion.icon}</div>
              <div className="flex flex-col flex-1 overflow-hidden">
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--color-text-primary)',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden'
                  }}
                >
                  {suggestion.title}
                </span>
                {suggestion.type !== 'search' && suggestion.type !== 'navigate' && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-muted)',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden'
                    }}
                  >
                    {suggestion.url}
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
            No suggestions
          </div>
        )}
      </div>
    </div>
  )
}
