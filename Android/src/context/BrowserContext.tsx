import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode
} from 'react'
import type { BrowserState, BrowserAction, Tab, ClosedTab, SettingsTab, Shortcut } from '../types'

const MAX_RECENTLY_CLOSED = 10

const defaultShortcuts: Shortcut[] = [
  { name: 'Google', url: 'https://www.google.com', icon: 'google', color: '#4285f4' },
  { name: 'YouTube', url: 'https://www.youtube.com', icon: 'youtube', color: '#ff0000' },
  { name: 'GitHub', url: 'https://github.com', icon: 'github', color: '#f0f0f0' },
  { name: 'Reddit', url: 'https://www.reddit.com', icon: 'reddit', color: '#ff4500' },
  { name: 'X', url: 'https://x.com', icon: 'x', color: '#f0f0f0' }
]

const getInitialShortcuts = (): Shortcut[] => {
  if (typeof window === 'undefined') return defaultShortcuts
  try {
    const saved = localStorage.getItem('ghost-shortcuts')
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to parse shortcuts from localStorage', e)
  }
  return defaultShortcuts
}

const getInitialShowSplash = (): boolean => {
  if (typeof window === 'undefined') return true
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('noSplash') !== 'true'
  } catch (e) {
    console.error('Failed to parse noSplash parameter', e)
    return true
  }
}

const getInitialTheme = (): 'system' | 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'system'
  try {
    const saved = localStorage.getItem('ghost-theme')
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved
    }
  } catch (e) {
    console.error('Failed to parse theme from localStorage', e)
  }
  return 'system'
}

const initialState: BrowserState = {
  tabs: [],
  activeTabId: null,
  sidebarCollapsed: false,
  sidebarWidth: 240,
  splitViewMode: 'none',
  splitViewTabId: null,
  commandPaletteOpen: false,
  isLoading: false,
  showSplash: getInitialShowSplash(),
  recentlyClosed: [],
  tabSearchQuery: '',
  tabSearchOpen: false,
  settingsOpen: false,
  settingsTab: 'ghoststack',
  darkRoomOpen: false,
  ghoststackStatus: null,
  uiSettings: {
    theme: getInitialTheme(),
    accentColor: '#e63946',
    compactMode: false,
    transparency: 80
  },
  performanceMetrics: {
    memoryUsageMB: 0,
    startupTimeMs: 0
  },
  shortcuts: getInitialShortcuts()
}

function browserReducer(state: BrowserState, action: BrowserAction): BrowserState {
  switch (action.type) {
    case 'SET_TABS':
      return { ...state, tabs: action.payload.tabs, activeTabId: action.payload.activeTabId }

    case 'ADD_TAB':
      return { ...state, tabs: [...state.tabs, action.payload], activeTabId: action.payload.id }

    case 'CLOSE_TAB': {
      const closing = state.tabs.find((t) => t.id === action.payload)
      const filtered = state.tabs.filter((t) => t.id !== action.payload)
      let newActive = state.activeTabId
      if (state.activeTabId === action.payload) {
        const idx = state.tabs.findIndex((t) => t.id === action.payload)
        newActive = filtered.length > 0 ? filtered[Math.min(idx, filtered.length - 1)]?.id : null
      }
      const closed: ClosedTab[] = closing
        ? [
            {
              id: closing.id,
              title: closing.title,
              url: closing.url,
              favicon: closing.favicon,
              closedAt: Date.now()
            },
            ...state.recentlyClosed
          ].slice(0, MAX_RECENTLY_CLOSED)
        : state.recentlyClosed
      return { ...state, tabs: filtered, activeTabId: newActive, recentlyClosed: closed }
    }

    case 'SWITCH_TAB':
      return {
        ...state,
        activeTabId: action.payload,
        tabs: state.tabs.map((t) =>
          t.id === action.payload ? { ...t, lastAccessed: Date.now() } : t
        )
      }
    case 'UPDATE_TAB':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.payload.id ? { ...t, ...action.payload.updates } : t
        )
      }
    case 'REORDER_TABS': {
      const tabs = [...state.tabs]
      const [removed] = tabs.splice(action.payload.fromIndex, 1)
      tabs.splice(action.payload.toIndex, 0, removed)
      return { ...state, tabs }
    }
    case 'PIN_TAB':
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === action.payload ? { ...t, isPinned: true } : t))
      }
    case 'UNPIN_TAB':
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === action.payload ? { ...t, isPinned: false } : t))
      }
    case 'MUTE_TAB':
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === action.payload ? { ...t, isMuted: true } : t))
      }
    case 'UNMUTE_TAB':
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === action.payload ? { ...t, isMuted: false } : t))
      }
    case 'RESTORE_TAB':
      return {
        ...state,
        recentlyClosed: state.recentlyClosed.filter((t) => t.id !== action.payload.id)
      }
    case 'CLEAR_RECENTLY_CLOSED':
      return { ...state, recentlyClosed: [] }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    case 'SET_SIDEBAR_WIDTH':
      return { ...state, sidebarWidth: action.payload }
    case 'SET_SPLIT_VIEW':
      return { ...state, splitViewMode: action.payload.mode, splitViewTabId: action.payload.tabId }
    case 'TOGGLE_COMMAND_PALETTE':
      return { ...state, commandPaletteOpen: !state.commandPaletteOpen }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'HIDE_SPLASH':
      return { ...state, showSplash: false }
    case 'SET_TAB_SEARCH':
      return { ...state, tabSearchQuery: action.payload }
    case 'TOGGLE_TAB_SEARCH':
      return { ...state, tabSearchOpen: !state.tabSearchOpen, tabSearchQuery: '' }
    case 'TOGGLE_SETTINGS':
      return { ...state, settingsOpen: !state.settingsOpen }
    case 'SET_SETTINGS_TAB':
      return { ...state, settingsTab: action.payload }
    case 'TOGGLE_DARK_ROOM':
      return { ...state, darkRoomOpen: !state.darkRoomOpen }
    case 'SET_GHOSTSTACK_STATUS':
      return { ...state, ghoststackStatus: action.payload }
    case 'SET_UI_SETTINGS': {
      const updated = { ...state.uiSettings, ...action.payload }
      if (action.payload.theme) {
        try {
          localStorage.setItem('ghost-theme', action.payload.theme)
        } catch {}
      }
      return { ...state, uiSettings: updated }
    }
    case 'SET_PERFORMANCE_METRICS':
      return { ...state, performanceMetrics: { ...state.performanceMetrics, ...action.payload } }
    case 'ADD_SHORTCUT': {
      if (state.shortcuts.some((s) => s.url === action.payload.url)) {
        return state
      }
      const updated = [...state.shortcuts, action.payload]
      try {
        localStorage.setItem('ghost-shortcuts', JSON.stringify(updated))
      } catch {}
      return { ...state, shortcuts: updated }
    }
    case 'REMOVE_SHORTCUT': {
      const updated = state.shortcuts.filter((s) => s.url !== action.payload)
      try {
        localStorage.setItem('ghost-shortcuts', JSON.stringify(updated))
      } catch {}
      return { ...state, shortcuts: updated }
    }
    case 'SET_SHORTCUTS': {
      try {
        localStorage.setItem('ghost-shortcuts', JSON.stringify(action.payload))
      } catch {}
      return { ...state, shortcuts: action.payload }
    }
    default:
      return state
  }
}

interface BrowserContextType {
  state: BrowserState
  dispatch: React.Dispatch<BrowserAction>
  createNewTab: (url?: string) => void
  closeTab: (id: string) => void
  switchTab: (id: string) => void
  navigateTo: (url: string) => void
  goBack: () => void
  goForward: () => void
  reload: () => void
  pinTab: (id: string) => void
  unpinTab: (id: string) => void
  muteTab: (id: string) => void
  unmuteTab: (id: string) => void
  restoreClosedTab: (ct: ClosedTab) => void
  updateUISettings: (settings: Partial<any>) => void
  openSettings: (tab?: SettingsTab) => void
  addShortcut: (shortcut: Shortcut) => void
  removeShortcut: (url: string) => void
}

const BrowserContext = createContext<BrowserContextType | null>(null)

export function BrowserProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(browserReducer, initialState)

  // Apply UI Settings to DOM
  useEffect(() => {
    const root = document.documentElement
    const { theme, accentColor, compactMode, transparency } = state.uiSettings
    root.style.setProperty('--color-accent', accentColor)
    root.style.setProperty('--bg-opacity', (transparency / 100).toString())
    if (
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    if (compactMode) root.classList.add('compact-mode')
    else root.classList.remove('compact-mode')
  }, [state.uiSettings])

  // Sidebar removed — always send 0 width so BrowserView fills the full width
  useEffect(() => {
    window.api?.updateSidebarWidth(0)
  }, [state.sidebarCollapsed])

  useEffect(() => {
    const api = window.api
    if (!api) {
      // Mobile fallback: Set up an initial default tab when no Electron is present
      const initialTabId = 'tab-default'
      dispatch({
        type: 'SET_TABS',
        payload: {
          tabs: [
            {
              id: initialTabId,
              url: 'ghost://newtab',
              title: 'New Tab',
              favicon: '',
              isLoading: false,
              canGoBack: false,
              canGoForward: false,
              isSecure: false,
              isPinned: false,
              isMuted: false,
              lastAccessed: Date.now()
            }
          ],
          activeTabId: initialTabId
        }
      })
      return
    }

    // Sidebar removed — send 0 width so BrowserView uses full window width
    api.updateSidebarWidth(0)

    // Sync initial tabs from main process
    api.getTabs().then(({ tabs, activeTabId }: { tabs: Tab[]; activeTabId: string | null }) => {
      if (tabs && tabs.length > 0) {
        dispatch({ type: 'SET_TABS', payload: { tabs, activeTabId } })
      }
    })

    // Theme changes from native menu
    api.onThemeChange?.((theme: 'light' | 'dark' | 'system') => {
      dispatch({ type: 'SET_UI_SETTINGS', payload: { theme } })
    })

    // Tab events
    api.onTabCreated((tab: unknown) => {
      const t = tab as Tab
      dispatch({
        type: 'ADD_TAB',
        payload: { ...t, isPinned: false, isMuted: false, lastAccessed: Date.now() }
      })
    })
    api.onTabUpdated((id: string, updates: unknown) => {
      dispatch({ type: 'UPDATE_TAB', payload: { id, updates: updates as Partial<Tab> } })
    })
    api.onTabClosed((id: string) => {
      dispatch({ type: 'CLOSE_TAB', payload: id })
    })

    // GhostStack status
    api.onGhoststackStatusChanged?.((status: any) => {
      dispatch({ type: 'SET_GHOSTSTACK_STATUS', payload: status })
    })
    api.ghoststackGetStatus?.().then((status: any) => {
      if (status) dispatch({ type: 'SET_GHOSTSTACK_STATUS', payload: status })
    })

    // Performance
    api.getStartupMetrics().then((ms: number) => {
      dispatch({ type: 'SET_PERFORMANCE_METRICS', payload: { startupTimeMs: ms } })
    })
    api.onMemoryMetrics((memory: any) => {
      const memoryUsageMB = Math.round(memory.private / 1024)
      dispatch({ type: 'SET_PERFORMANCE_METRICS', payload: { memoryUsageMB } })
    })
  }, [])

  const createNewTab = useCallback(
    (url?: string) => {
      const api = window.api
      const targetUrl = url || 'ghost://newtab'
      if (api) {
        api.createTab(targetUrl)
        api.updateSidebarWidth(0)
      } else {
        const newId = `tab-${Date.now()}`
        dispatch({
          type: 'ADD_TAB',
          payload: {
            id: newId,
            url: targetUrl,
            title: 'New Tab',
            favicon: '',
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            isSecure: false,
            isPinned: false,
            isMuted: false,
            lastAccessed: Date.now()
          }
        })
      }
    },
    []
  )

  const closeTab = useCallback((id: string) => {
    const api = window.api
    if (api) {
      api.closeTab(id)
    } else {
      dispatch({ type: 'CLOSE_TAB', payload: id })
    }
  }, [])

  const switchTab = useCallback((id: string) => {
    const api = window.api
    if (api) {
      api.switchTab(id)
    }
    dispatch({ type: 'SWITCH_TAB', payload: id })
  }, [])

  const navigateTo = useCallback(
    (url: string) => {
      const api = window.api
      if (api) {
        if (state.activeTabId) {
          api.navigateTo(state.activeTabId, url)
        } else {
          api.createTab(url)
          api.updateSidebarWidth(0)
        }
      } else {
        if (state.activeTabId) {
          let cleanTitle = 'Site'
          try {
            cleanTitle = new URL(url).hostname.replace('www.', '')
          } catch {
            cleanTitle = url
          }
          dispatch({
            type: 'UPDATE_TAB',
            payload: {
              id: state.activeTabId,
              updates: { url, title: cleanTitle, isLoading: false }
            }
          })
        } else {
          const newId = `tab-${Date.now()}`
          let cleanTitle = 'Site'
          try {
            cleanTitle = new URL(url).hostname.replace('www.', '')
          } catch {
            cleanTitle = url
          }
          dispatch({
            type: 'ADD_TAB',
            payload: {
              id: newId,
              url,
              title: cleanTitle,
              favicon: '',
              isLoading: false,
              canGoBack: false,
              canGoForward: false,
              isSecure: false,
              isPinned: false,
              isMuted: false,
              lastAccessed: Date.now()
            }
          })
        }
      }
    },
    [state.activeTabId]
  )

  const goBack = useCallback(() => {
    const api = window.api
    if (api && state.activeTabId) {
      api.goBack(state.activeTabId)
    } else {
      const activeIframe = document.querySelector(
        `iframe[data-tab-id="${state.activeTabId}"]`
      ) as HTMLIFrameElement
      if (activeIframe && activeIframe.contentWindow) {
        try {
          activeIframe.contentWindow.history.back()
        } catch {
          console.warn('Navigation blocked by cross-origin security')
        }
      }
    }
  }, [state.activeTabId])

  const goForward = useCallback(() => {
    const api = window.api
    if (api && state.activeTabId) {
      api.goForward(state.activeTabId)
    } else {
      const activeIframe = document.querySelector(
        `iframe[data-tab-id="${state.activeTabId}"]`
      ) as HTMLIFrameElement
      if (activeIframe && activeIframe.contentWindow) {
        try {
          activeIframe.contentWindow.history.forward()
        } catch {
          console.warn('Navigation blocked by cross-origin security')
        }
      }
    }
  }, [state.activeTabId])

  const reload = useCallback(() => {
    const api = window.api
    if (api && state.activeTabId) {
      api.reload(state.activeTabId)
    } else {
      const activeIframe = document.querySelector(
        `iframe[data-tab-id="${state.activeTabId}"]`
      ) as HTMLIFrameElement
      if (activeIframe) {
        const src = activeIframe.src
        activeIframe.src = ''
        activeIframe.src = src
      }
    }
  }, [state.activeTabId])

  const pinTab = useCallback((id: string) => {
    dispatch({ type: 'PIN_TAB', payload: id })
  }, [])

  const unpinTab = useCallback((id: string) => {
    dispatch({ type: 'UNPIN_TAB', payload: id })
  }, [])

  const muteTab = useCallback((id: string) => {
    const api = window.api
    if (api) api.muteTab(id)
    dispatch({ type: 'MUTE_TAB', payload: id })
  }, [])

  const unmuteTab = useCallback((id: string) => {
    const api = window.api
    if (api) api.unmuteTab(id)
    dispatch({ type: 'UNMUTE_TAB', payload: id })
  }, [])

  const restoreClosedTab = useCallback((ct: ClosedTab) => {
    dispatch({ type: 'RESTORE_TAB', payload: ct })
    const api = window.api
    if (api) {
      api.createTab(ct.url)
    } else {
      const newId = `tab-${Date.now()}`
      dispatch({
        type: 'ADD_TAB',
        payload: {
          id: newId,
          url: ct.url,
          title: ct.title,
          favicon: ct.favicon,
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          isSecure: false,
          isPinned: false,
          isMuted: false,
          lastAccessed: Date.now()
        }
      })
    }
  }, [])
  const updateUISettings = useCallback((settings: Partial<any>) => {
    dispatch({ type: 'SET_UI_SETTINGS', payload: settings })
  }, [])
  const openSettings = useCallback((tab?: SettingsTab) => {
    if (tab) dispatch({ type: 'SET_SETTINGS_TAB', payload: tab })
    dispatch({ type: 'TOGGLE_SETTINGS' })
  }, [])
  const addShortcut = useCallback(
    (shortcut: Shortcut) => {
      dispatch({ type: 'ADD_SHORTCUT', payload: shortcut })
    },
    [dispatch]
  )
  const removeShortcut = useCallback(
    (url: string) => {
      dispatch({ type: 'REMOVE_SHORTCUT', payload: url })
    },
    [dispatch]
  )

  return (
    <BrowserContext.Provider
      value={{
        state,
        dispatch,
        createNewTab,
        closeTab,
        switchTab,
        navigateTo,
        goBack,
        goForward,
        reload,
        pinTab,
        unpinTab,
        muteTab,
        unmuteTab,
        restoreClosedTab,
        updateUISettings,
        openSettings,
        addShortcut,
        removeShortcut
      }}
    >
      {children}
    </BrowserContext.Provider>
  )
}

export function useBrowser(): BrowserContextType {
  const context = useContext(BrowserContext)
  if (!context) throw new Error('useBrowser must be used within a BrowserProvider')
  return context
}
