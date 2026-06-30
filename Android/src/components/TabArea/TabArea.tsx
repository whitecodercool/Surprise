import { useState, useRef, useEffect } from 'react'
import { useBrowser } from '../../context/BrowserContext'

// ── Pixel-art style minimal shortcut icons ──
function PixelIcon({ name, color }: { name: string; color: string }) {
  const p = 2 // pixel size
  const icons: Record<string, [number, number][]> = {
    google: [
      [3,0],[4,0],[5,0],[6,0],
      [2,1],[1,2],[1,3],[1,4],[1,5],
      [2,6],[3,7],[4,7],[5,7],[6,7],
      [7,6],[7,5],[7,4],
      [5,4],[6,4],
    ],
    youtube: [
      [3,1],[3,2],[3,3],[3,4],[3,5],[3,6],
      [4,2],[4,3],[4,4],[4,5],
      [5,3],[5,4],
      [6,3],[6,4],
      [7,4],
    ],
    github: [
      [3,0],[4,0],[5,0],[6,0],
      [2,1],[7,1],
      [1,2],[3,2],[5,2],[8,2],
      [1,3],[8,3],
      [2,4],[3,4],[4,4],[5,4],[6,4],[7,4],
      [3,5],[6,5],
      [2,6],[3,6],[6,6],[7,6],
    ],
    reddit: [
      [3,0],[4,0],[5,0],[6,0],
      [2,1],[7,1],
      [2,2],[3,2],[5,2],[6,2],[7,2],
      [2,3],[7,3],
      [3,4],[4,4],[5,4],[6,4],
      [2,5],[7,5],
      [3,6],[4,6],[5,6],[6,6],
      [4,-1],[5,-1],
    ],
    x: [
      [1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],
      [7,1],[6,2],[5,3],[3,5],[2,6],[1,7],
    ],
  }

  const pixels = icons[name.toLowerCase()]

  if (!pixels) {
    return (
      <span style={{ color, fontWeight: 700, fontSize: 20, fontFamily: "'SF Mono', monospace" }}>
        {name.charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <svg width={p * 10} height={p * 9} viewBox={`0 0 ${p * 10} ${p * 9}`}>
      {pixels.map(([x, y], i) => (
        <rect
          key={i}
          x={x * p}
          y={(y + 1) * p}
          width={p}
          height={p}
          fill={color}
          rx={0.3}
        />
      ))}
    </svg>
  )
}
const getShortcutColor = (url: string): string => {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    const colors = [
      '#e63946',
      '#4285f4',
      '#ff4500',
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#ec4899'
    ]
    let hash = 0
    for (let i = 0; i < host.length; i++) {
      hash = host.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  } catch {
    return '#f0f0f0'
  }
}

const getShortcutIcon = (title: string, url: string): string => {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    if (host.includes('youtube.com')) return '▶'
    if (host.includes('github.com')) return '⬡'
    if (host.includes('reddit.com')) return '☻'
    if (host.includes('google.com')) return 'G'
    if (host.includes('x.com') || host.includes('twitter.com')) return '𝕏'

    const source = title || host
    return source.charAt(0).toUpperCase()
  } catch {
    return '★'
  }
}

// Futuristic ghost eye SVG
function GhostEye({ isLightTheme }: { isLightTheme: boolean }) {
  return (
    <div
      className="ghost-eye-container"
      style={{
        width: 220,
        height: 200,
        position: 'relative',
        filter: isLightTheme ? 'invert(1) hue-rotate(180deg) contrast(1.15) brightness(1.02)' : 'none',
        mixBlendMode: isLightTheme ? 'multiply' : 'normal',
        opacity: isLightTheme ? 0.85 : 1
      }}
    >
      <svg width="220" height="200" viewBox="0 0 220 200" fill="none">
        {/* Outer mechanical frame - top arc */}
        <path
          d="M30 100 C30 45, 190 45, 190 100"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1.5"
          fill="none"
        />
        {/* Outer mechanical frame - bottom arc */}
        <path
          d="M30 100 C30 155, 190 155, 190 100"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1.5"
          fill="none"
        />

        {/* Inner eye shape - top lid */}
        <path
          d="M50 100 C50 60, 170 60, 170 100"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="2"
          fill="none"
        />
        {/* Inner eye shape - bottom lid */}
        <path
          d="M50 100 C50 140, 170 140, 170 100"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="2"
          fill="none"
        />

        {/* Dark eye fill */}
        <ellipse cx="110" cy="100" rx="55" ry="38" fill="rgba(10,5,5,0.9)" />
        <ellipse
          cx="110"
          cy="100"
          rx="55"
          ry="38"
          stroke="rgba(230,57,70,0.15)"
          strokeWidth="1"
          fill="none"
        />

        {/* Iris rings */}
        <circle cx="110" cy="100" r="30" stroke="rgba(230,57,70,0.2)" strokeWidth="1" fill="none" />
        <circle
          cx="110"
          cy="100"
          r="24"
          stroke="rgba(230,57,70,0.15)"
          strokeWidth="0.5"
          fill="none"
        />
        <circle
          cx="110"
          cy="100"
          r="36"
          stroke="rgba(230,57,70,0.1)"
          strokeWidth="0.5"
          fill="none"
        />

        {/* Pupil - red glow */}
        <circle cx="110" cy="100" r="16" fill="rgba(230,57,70,0.3)" />
        <circle className="ghost-eye-pupil" cx="110" cy="100" r="10" fill="rgba(230,57,70,0.7)" />
        <circle cx="110" cy="100" r="5" fill="rgba(230,57,70,1)" />
        <circle cx="110" cy="100" r="2.5" fill="rgba(180,20,30,1)" />

        {/* Pupil glow effect */}
        <circle
          cx="110"
          cy="100"
          r="14"
          fill="none"
          stroke="rgba(230,57,70,0.4)"
          strokeWidth="0.5"
        />
        <circle cx="110" cy="100" r="20" fill="none" filter="url(#eyeGlow)" />

        {/* Highlight */}
        <circle cx="116" cy="94" r="2" fill="rgba(255,255,255,0.15)" />

        {/* Mechanical detail lines */}
        <line x1="110" y1="42" x2="110" y2="52" stroke="rgba(230,57,70,0.3)" strokeWidth="1" />
        <line x1="110" y1="148" x2="110" y2="158" stroke="rgba(230,57,70,0.15)" strokeWidth="1" />

        {/* Corner details */}
        <path
          d="M35 95 L25 100 L35 105"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M185 95 L195 100 L185 105"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
          fill="none"
        />

        {/* Radial scan lines */}
        <line x1="60" y1="70" x2="68" y2="78" stroke="rgba(230,57,70,0.08)" strokeWidth="0.5" />
        <line x1="160" y1="70" x2="152" y2="78" stroke="rgba(230,57,70,0.08)" strokeWidth="0.5" />
        <line x1="60" y1="130" x2="68" y2="122" stroke="rgba(230,57,70,0.08)" strokeWidth="0.5" />
        <line x1="160" y1="130" x2="152" y2="122" stroke="rgba(230,57,70,0.08)" strokeWidth="0.5" />

        <defs>
          <filter id="eyeGlow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feFlood floodColor="#e63946" floodOpacity="0.4" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  )
}

// Ghost mini icon for footer
function GhostMiniIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="6" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.5" fill="var(--color-accent)" />
    </svg>
  )
}

export default function TabArea() {
  const { state, createNewTab, navigateTo, addShortcut, removeShortcut } = useBrowser()
  const hasTabs = state.tabs.length > 0
  const [searchValue, setSearchValue] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const [showAddModal, setShowAddModal] = useState(false)
  const [newShortcutName, setNewShortcutName] = useState('')
  const [newShortcutUrl, setNewShortcutUrl] = useState('')

  const isMobile = !window.api
  const [contextMenu, setContextMenu] = useState<{ href: string; x: number; y: number } | null>(null)

  // Listen for long press messages from the iframe script
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'GHOST_CONTEXT_MENU') {
        setContextMenu({
          href: e.data.href,
          x: e.data.x,
          y: e.data.y
        })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Dismiss context menu on any outside click
  useEffect(() => {
    if (!contextMenu) return
    const dismiss = () => setContextMenu(null)
    window.addEventListener('click', dismiss)
    window.addEventListener('touchstart', dismiss)
    return () => {
      window.removeEventListener('click', dismiss)
      window.removeEventListener('touchstart', dismiss)
    }
  }, [contextMenu])

  useEffect(() => {
    const handleTrigger = () => {
      setShowAddModal(true)
    }
    window.addEventListener('trigger-add-shortcut-modal', handleTrigger)
    return () => {
      window.removeEventListener('trigger-add-shortcut-modal', handleTrigger)
    }
  }, [])

  const handleAddShortcutSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let url = newShortcutUrl.trim()
    if (!url) return

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`
    }

    let name = newShortcutName.trim()
    if (!name) {
      try {
        const host = new URL(url).hostname.replace('www.', '')
        name = host.split('.')[0]
        name = name.charAt(0).toUpperCase() + name.slice(1)
      } catch {
        name = 'Shortcut'
      }
    }

    const icon = getShortcutIcon(name, url)
    const color = getShortcutColor(url)

    addShortcut({ name, url, icon, color })

    setNewShortcutName('')
    setNewShortcutUrl('')
    setShowAddModal(false)
  }

  const handleSearch = (e: React.FormEvent): void => {
    e.preventDefault()
    const query = searchValue.trim()
    if (!query) return

    // If it looks like a URL, navigate directly
    if (/^[^\s]+\.[^\s]+$/.test(query) || query.startsWith('http')) {
      const url = query.startsWith('http') ? query : `https://${query}`
      if (state.activeTabId) {
        navigateTo(url)
      } else {
        createNewTab(url)
      }
    } else {
      // Search
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
      if (state.activeTabId) {
        navigateTo(searchUrl)
      } else {
        createNewTab(searchUrl)
      }
    }
    setSearchValue('')
  }

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const isNewTab =
    !activeTab ||
    activeTab.url === 'ghost://newtab' ||
    activeTab.url === 'about:blank' ||
    activeTab.url === ''

  const isLightTheme = state.uiSettings?.theme === 'light' ||
    (state.uiSettings?.theme === 'system' && window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches)

  if (hasTabs && !isNewTab) {
    if (!window.api) {
      return (
        <div className="flex-1 w-full h-full relative animate-fade-in" style={{ background: '#fff' }}>
          <iframe
            data-tab-id={activeTab.id}
            src={activeTab.url}
            className="w-full h-full border-none bg-white"
            title={activeTab.title || 'Browser View'}
          />
        </div>
      )
    }
    return <div className="flex-1" style={{ background: 'transparent' }} />
  }

  return (
    <div
      className="flex-1 flex items-center justify-center animate-fade-in"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <div className="flex flex-col items-center gap-8" style={{ maxWidth: 560 }}>
        {/* Ghost Eye Logo */}
        <div className="animate-float">
          <GhostEye isLightTheme={isLightTheme} />
        </div>

        {/* Search Bar */}
        {isMobile ? (
          <div
            onClick={() => window.dispatchEvent(new CustomEvent('focus-address-bar'))}
            className="newtab-search cursor-pointer flex items-center gap-3 w-full"
            style={{ marginTop: -8 }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ flexShrink: 0, opacity: 0.4 }}
            >
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path
                d="M10.5 10.5l3 3"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)', flex: 1, userSelect: 'none' }}>
              Search the web
            </span>
          </div>
        ) : (
          <form onSubmit={handleSearch} className="newtab-search" style={{ marginTop: -8 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ flexShrink: 0, opacity: 0.4 }}
            >
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path
                d="M10.5 10.5l3 3"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search the web"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <button type="submit" className="newtab-search-submit" title="Search">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>
        )}

        {/* Shortcuts Section */}
        <div className="flex flex-col items-center gap-4 w-full" style={{ marginTop: 8 }}>
          {/* Section label with decorative lines */}
          <div className="flex items-center gap-3 w-full" style={{ maxWidth: 460 }}>
            <div
              style={{
                flex: 1,
                height: 1,
                background: 'linear-gradient(to right, transparent, var(--color-border-medium))'
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.25em',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase'
              }}
            >
              Shortcuts
            </span>
            <div
              style={{
                flex: 1,
                height: 1,
                background: 'linear-gradient(to left, transparent, var(--color-border-medium))'
              }}
            />
          </div>

          {/* Shortcut cards */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {/* Add Shortcut */}
            <button
              className="shortcut-card"
              onClick={() => setShowAddModal(true)}
              style={{ borderColor: 'var(--color-accent-muted)' }}
            >
              <span className="shortcut-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <rect x="8" y="2" width="2" height="14" fill="var(--color-accent)" rx="0.3" />
                  <rect x="2" y="8" width="14" height="2" fill="var(--color-accent)" rx="0.3" />
                </svg>
              </span>
              <span className="shortcut-label">Add Shortcut</span>
            </button>

            {state.shortcuts.map((link) => (
              <div key={link.url} onClick={() => createNewTab(link.url)} className="shortcut-card">
                <button
                  type="button"
                  className="shortcut-remove-btn"
                  title="Remove shortcut"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeShortcut(link.url)
                  }}
                >
                  ✕
                </button>
                <span className="shortcut-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PixelIcon name={link.icon} color={link.color} />
                </span>
                <span className="shortcut-label">{link.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tagline */}
        <div className="flex items-center gap-4" style={{ marginTop: 12 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.3em',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase'
            }}
          >
            Fast
          </span>
          <span style={{ color: 'var(--color-accent)', fontSize: 8, opacity: 0.6 }}>•</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.3em',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase'
            }}
          >
            Private
          </span>
          <span style={{ color: 'var(--color-accent)', fontSize: 8, opacity: 0.6 }}>•</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.3em',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase'
            }}
          >
            Secure
          </span>
        </div>

        {/* Ghost mini icon at bottom */}
        <div style={{ marginTop: 4, opacity: 0.6 }}>
          <GhostMiniIcon />
        </div>
      </div>

      {/* Add Shortcut Modal */}
      {showAddModal && (
        <div className="shortcut-modal-overlay" onClick={() => setShowAddModal(false)}>
          <form
            className="shortcut-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddShortcutSubmit}
          >
            <h3>Add Shortcut</h3>
            <div className="shortcut-modal-inputs">
              <input
                type="text"
                value={newShortcutName}
                onChange={(e) => setNewShortcutName(e.target.value)}
                placeholder="Name (e.g. Google)"
                spellCheck={false}
                autoFocus
              />
              <input
                type="text"
                value={newShortcutUrl}
                onChange={(e) => setNewShortcutUrl(e.target.value)}
                placeholder="URL (e.g. google.com)"
                spellCheck={false}
                required
              />
            </div>
            <div className="shortcut-modal-actions">
              <button
                type="button"
                className="shortcut-modal-btn cancel"
                onClick={() => {
                  setNewShortcutName('')
                  setNewShortcutUrl('')
                  setShowAddModal(false)
                }}
              >
                Cancel
              </button>
              <button type="submit" className="shortcut-modal-btn confirm">
                Add
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Long Press Context Menu */}
      {contextMenu && (
        <div
          className="absolute z-[9999] rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl p-1.5 flex flex-col min-w-[200px] animate-fade-in animate-slide-up"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 180),
            left: Math.min(contextMenu.x, window.innerWidth - 220),
            background: 'rgba(15, 10, 10, 0.9)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 15px rgba(230, 57, 70, 0.2)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="px-3 py-2 text-[10px] text-white/40 border-b border-white/5 truncate max-w-[200px]"
            title={contextMenu.href}
          >
            {contextMenu.href}
          </div>

          <button
            onClick={() => {
              createNewTab(contextMenu.href)
              setContextMenu(null)
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:text-white hover:bg-white/5 rounded-lg text-left w-full transition-all duration-200"
          >
            <span className="text-white/40">❐</span> Open in new tab
          </button>

          <button
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.href)
              setContextMenu(null)
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:text-white hover:bg-white/5 rounded-lg text-left w-full transition-all duration-200"
          >
            <span className="text-white/40">📋</span> Copy link address
          </button>

          <button
            onClick={() => {
              let name = 'Shortcut'
              try {
                name = new URL(contextMenu.href).hostname.replace('www.', '')
                name = name.split('.')[0]
                name = name.charAt(0).toUpperCase() + name.slice(1)
              } catch {}
              addShortcut({
                name,
                url: contextMenu.href,
                icon: name.charAt(0),
                color: '#e63946'
              })
              setContextMenu(null)
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:text-white hover:bg-white/5 rounded-lg text-left w-full transition-all duration-200"
          >
            <span className="text-white/40">★</span> Add to shortcuts
          </button>
        </div>
      )}
    </div>
  )
}
