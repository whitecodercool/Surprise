import { useCallback, useEffect, useState } from 'react'
import { registerPlugin } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { BrowserProvider, useBrowser } from './context/BrowserContext'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import TopTabBar from './components/TabBar/TopTabBar'
import Toolbar from './components/Toolbar/Toolbar'
import TabArea from './components/TabArea/TabArea'
import CommandPalette from './components/CommandPalette/CommandPalette'
import SplashScreen from './components/SplashScreen/SplashScreen'
import SettingsPage from './components/Settings/SettingsPage'
import DarkRoomPanel from './components/DarkRoom/DarkRoomPanel'
import MobileTabSwitcher from './components/TabBar/MobileTabSwitcher'

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

const getCleanName = (title: string, url: string): string => {
  if (title && title.length < 25 && !title.includes('://')) {
    return title.split(' - ')[0].split(' | ')[0].trim()
  }
  try {
    const host = new URL(url).hostname.replace('www.', '')
    const parts = host.split('.')
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  } catch {
    return 'Site'
  }
}

function BrowserShell() {
  const { state, dispatch, createNewTab, goBack, navigateTo, closeTab } = useBrowser()
  useKeyboardShortcuts()
  const [isMobileTabSwitcherOpen, setIsMobileTabSwitcherOpen] = useState(false)

  // Handle Android back button
  useEffect(() => {
    if (window.api) return // Only for Android/Capacitor

    const handleBackButton = async () => {
      // 1. If mobile tab switcher is open, close it
      if (isMobileTabSwitcherOpen) {
        setIsMobileTabSwitcherOpen(false)
        return
      }
      // 2. If command palette or settings is open, close them
      if (state.commandPaletteOpen) {
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        return
      }
      if (state.settingsOpen) {
        dispatch({ type: 'TOGGLE_SETTINGS' })
        return
      }
      if (state.darkRoomOpen) {
        dispatch({ type: 'TOGGLE_DARK_ROOM' })
        return
      }

      // 3. Otherwise, check if active tab can go back
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (activeTab) {
        const isNewTab =
          activeTab.url === 'ghost://newtab' ||
          activeTab.url === 'about:blank' ||
          activeTab.url === ''

        if (!isNewTab) {
          const activeIframe = document.querySelector(
            `iframe[data-tab-id="${state.activeTabId}"]`
          ) as HTMLIFrameElement
          if (activeIframe && activeIframe.contentWindow) {
            try {
              goBack()
              return
            } catch (e) {
              console.warn(e)
            }
          }
          navigateTo('ghost://newtab')
          return
        }
      }

      // 4. If on the New Tab page and there are multiple tabs, close the active tab
      if (state.tabs.length > 1) {
        if (state.activeTabId) {
          closeTab(state.activeTabId)
        }
        return
      }

      // 5. Otherwise, exit the app
      CapApp.exitApp()
    }

    const listenerPromise = CapApp.addListener('backButton', handleBackButton)
    return () => {
      listenerPromise.then((l) => l.remove())
    }
  }, [
    isMobileTabSwitcherOpen,
    state.commandPaletteOpen,
    state.settingsOpen,
    state.darkRoomOpen,
    state.tabs,
    state.activeTabId,
    goBack,
    navigateTo,
    closeTab,
    dispatch
  ])

  // Start Xframe bypass on mount (Android only)
  useEffect(() => {
    try {
      const Xframe = registerPlugin<any>('Xframe')
      Xframe.start()
        .then(() => console.log('Xframe bypass started'))
        .catch((err: any) => console.error('Failed to start Xframe bypass:', err))
    } catch (e) {
      console.warn('Xframe plugin is not available on this platform:', e)
    }
  }, [])

  useEffect(() => {
    const handleToggle = () => {
      setIsMobileTabSwitcherOpen((prev) => !prev)
    }
    window.addEventListener('toggle-mobile-tab-switcher', handleToggle)
    return () => {
      window.removeEventListener('toggle-mobile-tab-switcher', handleToggle)
    }
  }, [])

  useEffect(() => {
    window.api?.onMenuAction((action: string) => {
      if (action === 'new-tab') {
        createNewTab()
      } else if (action === 'commands') {
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
      } else if (action === 'settings') {
        dispatch({ type: 'TOGGLE_SETTINGS' })
      } else if (action === 'add-shortcut') {
        const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
        if (
          activeTab &&
          activeTab.url &&
          !activeTab.url.startsWith('ghost://') &&
          !activeTab.url.startsWith('about:')
        ) {
          const url = activeTab.url
          const name = getCleanName(activeTab.title, url)
          const icon = getShortcutIcon(activeTab.title, url)
          const color = getShortcutColor(url)
          dispatch({
            type: 'ADD_SHORTCUT',
            payload: { name, url, icon, color }
          })
        } else {
          window.dispatchEvent(new CustomEvent('trigger-add-shortcut-modal'))
        }
      }
    })
  }, [createNewTab, dispatch, state.tabs, state.activeTabId])

  const handleSplashFinished = useCallback(() => {
    dispatch({ type: 'HIDE_SPLASH' })
  }, [dispatch])

  useEffect(() => {
    if (!state.uiSettings) return
    const root = document.documentElement

    // Theme
    if (state.uiSettings.theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // Accent Color
    if (state.uiSettings.accentColor) {
      root.style.setProperty('--color-accent', state.uiSettings.accentColor)
    }

    // Layout
    if (state.uiSettings.compactMode) {
      document.body.classList.add('compact')
    } else {
      document.body.classList.remove('compact')
    }

    // Transparency
    const alpha = (state.uiSettings.transparency ?? 80) / 100
    root.style.setProperty('--glass-alpha', alpha.toString())
  }, [state.uiSettings])

  useEffect(() => {
    const isOverlayOpen = state.commandPaletteOpen || state.settingsOpen
    window.api?.setOverlayActive?.(isOverlayOpen)
  }, [state.commandPaletteOpen, state.settingsOpen])

  if (state.showSplash) {
    return <SplashScreen onFinished={handleSplashFinished} />
  }

  // DEBUG
  if (typeof window !== 'undefined') {
    console.log('window.api:', (window as any).api)
  }

  return (
    <div
      className="flex flex-col h-full w-full animate-fade-in"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Top Tab Bar */}
      <TopTabBar />

      {/* Toolbar */}
      <Toolbar />

      {/* Tab Content Area */}
      <TabArea />

      {/* Command Palette Overlay */}
      {state.commandPaletteOpen && <CommandPalette />}

      {/* Settings Overlay */}
      {state.settingsOpen && <SettingsPage />}

      {/* Dark Room Panel */}
      {state.darkRoomOpen && (
        <DarkRoomPanel onClose={() => dispatch({ type: 'TOGGLE_DARK_ROOM' })} />
      )}

      {/* Mobile Tab Switcher */}
      {isMobileTabSwitcherOpen && (
        <MobileTabSwitcher onClose={() => setIsMobileTabSwitcherOpen(false)} />
      )}
    </div>
  )
}

export default function App() {
  return (
    <BrowserProvider>
      <BrowserShell />
    </BrowserProvider>
  )
}
