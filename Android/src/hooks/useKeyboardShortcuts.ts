import { useEffect } from 'react'
import { useBrowser } from '../context/BrowserContext'

export function useKeyboardShortcuts(): void {
  const {
    state,
    dispatch,
    createNewTab,
    closeTab,
    switchTab,
    goBack,
    goForward,
    reload,
    restoreClosedTab
  } = useBrowser()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey

      // Ctrl+T — New tab
      if (ctrl && !shift && e.key === 't') {
        e.preventDefault()
        createNewTab()
        return
      }

      // Ctrl+W — Close tab
      if (ctrl && !shift && e.key === 'w') {
        e.preventDefault()
        if (state.activeTabId) closeTab(state.activeTabId)
        return
      }

      // Ctrl+Shift+T — Reopen last closed tab
      if (ctrl && shift && e.key === 'T') {
        e.preventDefault()
        if (state.recentlyClosed.length > 0) {
          restoreClosedTab(state.recentlyClosed[0])
        }
        return
      }

      // Ctrl+Tab — Next tab
      if (ctrl && !shift && e.key === 'Tab') {
        e.preventDefault()
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (idx >= 0 && state.tabs.length > 1) {
          const nextIdx = (idx + 1) % state.tabs.length
          switchTab(state.tabs[nextIdx].id)
        }
        return
      }

      // Ctrl+Shift+Tab — Previous tab
      if (ctrl && shift && e.key === 'Tab') {
        e.preventDefault()
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (idx >= 0 && state.tabs.length > 1) {
          const prevIdx = (idx - 1 + state.tabs.length) % state.tabs.length
          switchTab(state.tabs[prevIdx].id)
        }
        return
      }

      // Ctrl+K — Command palette
      if (ctrl && !shift && e.key === 'k') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        return
      }

      // Ctrl+L — Focus address bar
      if (ctrl && !shift && e.key === 'l') {
        e.preventDefault()
        const addressInput = document.querySelector(
          'input[placeholder="Search or enter URL…"]'
        ) as HTMLInputElement
        if (addressInput) {
          addressInput.focus()
          addressInput.select()
        }
        return
      }

      // Ctrl+B — Toggle sidebar
      if (ctrl && !shift && e.key === 'b') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_SIDEBAR' })
        return
      }

      // Ctrl+Shift+S — Split view
      if (ctrl && shift && e.key === 'S') {
        e.preventDefault()
        const mode = state.splitViewMode === 'none' ? 'vertical' : 'none'
        const secondaryTab = state.tabs.find((t) => t.id !== state.activeTabId)
        dispatch({
          type: 'SET_SPLIT_VIEW',
          payload: { mode, tabId: secondaryTab?.id || null }
        })
        return
      }

      // Ctrl+F — Tab search (when sidebar focused)
      if (ctrl && !shift && e.key === 'f') {
        // Only intercept if no input is focused
        if (document.activeElement?.tagName !== 'INPUT') {
          e.preventDefault()
          dispatch({ type: 'TOGGLE_TAB_SEARCH' })
          return
        }
      }

      // Alt+Left — Back
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goBack()
        return
      }

      // Alt+Right — Forward
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
        return
      }

      // F5 or Ctrl+R — Reload
      if (e.key === 'F5' || (ctrl && !shift && e.key === 'r')) {
        e.preventDefault()
        reload()
        return
      }

      // Ctrl+1-9 — Switch to tab by index
      if (ctrl && !shift && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (idx < state.tabs.length) {
          switchTab(state.tabs[idx].id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    state,
    dispatch,
    createNewTab,
    closeTab,
    switchTab,
    goBack,
    goForward,
    reload,
    restoreClosedTab
  ])
}
