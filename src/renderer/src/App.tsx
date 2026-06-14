import { useCallback, useEffect } from 'react'
import { BrowserProvider, useBrowser } from './context/BrowserContext'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import Sidebar from './components/Sidebar/Sidebar'
import Toolbar from './components/Toolbar/Toolbar'
import TabArea from './components/TabArea/TabArea'
import CommandPalette from './components/CommandPalette/CommandPalette'
import SplashScreen from './components/SplashScreen/SplashScreen'
import SettingsPage from './components/Settings/SettingsPage'
import DarkRoomPanel from './components/DarkRoom/DarkRoomPanel'

function BrowserShell() {
  const { state, dispatch } = useBrowser()
  useKeyboardShortcuts()

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
    console.log('window.api:', (window as any).api);
  }

  return (
    <div className="flex h-full w-full animate-fade-in" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
        {/* Toolbar */}
        <Toolbar />

        {/* Tab Content Area */}
        <TabArea />
      </div>

      {/* Command Palette Overlay */}
      {state.commandPaletteOpen && <CommandPalette />}
      
      {/* Settings Overlay */}
      <SettingsPage />

      {/* Dark Room Panel */}
      {state.darkRoomOpen && (
        <DarkRoomPanel onClose={() => dispatch({ type: 'TOGGLE_DARK_ROOM' })} />
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
