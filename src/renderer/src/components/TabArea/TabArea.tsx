import { useState, useRef, useEffect } from 'react'
import { useBrowser } from '../../context/BrowserContext'
import cyberEyeImg from '../../assets/cyber_eye.jpg'

// ── Pixel-art style minimal shortcut icons ──
function PixelIcon({ name, color }: { name: string; color: string }) {
  const p = 2 // pixel size
  const icons: Record<string, [number, number][]> = {
    google: [
      // "G" shape in pixel grid
      [3,0],[4,0],[5,0],[6,0],
      [2,1],[1,2],[1,3],[1,4],[1,5],
      [2,6],[3,7],[4,7],[5,7],[6,7],
      [7,6],[7,5],[7,4],
      [5,4],[6,4],
    ],
    youtube: [
      // Play triangle
      [3,1],[3,2],[3,3],[3,4],[3,5],[3,6],
      [4,2],[4,3],[4,4],[4,5],
      [5,3],[5,4],
      [6,3],[6,4],
      [7,4],
    ],
    github: [
      // Octocat face simplified
      [3,0],[4,0],[5,0],[6,0],
      [2,1],[7,1],
      [1,2],[3,2],[5,2],[8,2],
      [1,3],[8,3],
      [2,4],[3,4],[4,4],[5,4],[6,4],[7,4],
      [3,5],[6,5],
      [2,6],[3,6],[6,6],[7,6],
    ],
    reddit: [
      // Snoo face
      [3,0],[4,0],[5,0],[6,0],
      [2,1],[7,1],
      [2,2],[3,2],[5,2],[6,2],[7,2],
      [2,3],[7,3],
      [3,4],[4,4],[5,4],[6,4],
      [2,5],[7,5],
      [3,6],[4,6],[5,6],[6,6],
      [4,-1],[5,-1], // antenna
    ],
    x: [
      // X / cross
      [1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],
      [7,1],[6,2],[5,3],[3,5],[2,6],[1,7],
    ],
  }

  const pixels = icons[name.toLowerCase()]

  if (!pixels) {
    // Fallback: render first letter
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

// GHOST PROJECTS logo for landing page
function GhostProjectsLogo() {
  return (
    <svg width="26" height="16" viewBox="0 0 28 18" fill="none">
      <path
        d="M1 9s5-7 13-7 13 7 13 7-5 7-13 7S1 9 1 9z"
        stroke="var(--color-text-primary)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="9" r="4.2" fill="var(--color-text-primary)" />
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
  const [ghostId, setGhostId] = useState('')

  useEffect(() => {
    window.api?.getGhostId().then((id) => setGhostId(id)).catch(console.error)
  }, [])

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

    // Blur the input to release focus
    searchRef.current?.blur()

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
    return <div className="flex-1" style={{ background: 'transparent' }} />
  }

  return (
    <div
      className="flex-1 flex items-center justify-center animate-fade-in relative"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Top Left Logo (GHOST PROJECTS) */}
      <div className="absolute top-6 left-8 flex items-center gap-2.5 select-none opacity-80 hover:opacity-100 transition-opacity duration-200">
        <GhostProjectsLogo />
        <div className="flex flex-col">
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: 'var(--color-text-primary)',
              letterSpacing: '0.12em',
              lineHeight: 1
            }}
          >
            GHOST
          </span>
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.08em',
              lineHeight: 1,
              marginTop: 1
            }}
          >
            PROJECTS
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-8" style={{ maxWidth: 560 }}>
        {/* Ghost Eye Logo */}
        <div
          style={{
            width: 440,
            height: 275,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* Cybernetic Eye Image */}
          <img
            src={cyberEyeImg}
            alt="Ghost Cyber Eye"
            style={{
              width: '100%',
              height: 'auto',
              mixBlendMode: isLightTheme ? 'multiply' : 'screen', // Blends black/white background perfectly
              filter: isLightTheme ? 'invert(1) hue-rotate(180deg) contrast(1.15) brightness(1.02)' : 'none',
              userSelect: 'none',
              opacity: isLightTheme ? 0.65 : 0.35 // Crisp visibility in light theme, subtle watermark in dark theme
            }}
          />
        </div>

        {/* Search Bar */}
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
                  {/* Pixel-art plus */}
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
      {/* Bottom Left Ghost ID Box */}
      <div
        className="absolute bottom-6 left-8 select-none flex items-center gap-2 px-3 py-1.5 rounded-md"
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: 'var(--color-accent)',
            letterSpacing: '0.08em'
          }}
        >
          GHOST ID:
        </span>
        <span
          style={{
            fontFamily: "'SF Mono', monospace",
            fontSize: 10.5,
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.04em'
          }}
        >
          {ghostId || 'GENERATING...'}
        </span>
      </div>

      {/* Bottom Right Version Tag */}
      <div
        className="absolute bottom-6 right-8 select-none"
        style={{
          fontSize: 10.5,
          fontWeight: 500,
          color: 'var(--color-text-muted)',
          letterSpacing: '0.06em',
          opacity: 0.4
        }}
      >
        Ghost Browser v1.1.0
      </div>
    </div>
  )
}
