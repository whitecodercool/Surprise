import { useState } from 'react'
import { useBrowser } from '../../context/BrowserContext'
import { motion, AnimatePresence } from 'framer-motion'

export default function KebabMenu() {
  const { state, createNewTab, dispatch } = useBrowser()
  const currentTheme = state.uiSettings.theme || 'system'
  const [isOpen, setIsOpen] = useState(false)

  const handleMenuClick = () => {
    if (window.api) {
      window.api.showKebabMenu(currentTheme)
    } else {
      setIsOpen(!isOpen)
    }
  }

  const handleAction = (action: string) => {
    setIsOpen(false)
    if (action === 'new-tab') {
      createNewTab('ghost://newtab')
    } else if (action === 'add-shortcut') {
      window.dispatchEvent(new CustomEvent('trigger-add-shortcut-modal'))
    } else if (action === 'theme-light') {
      dispatch({ type: 'SET_UI_SETTINGS', payload: { theme: 'light' } })
    } else if (action === 'theme-dark') {
      dispatch({ type: 'SET_UI_SETTINGS', payload: { theme: 'dark' } })
    } else if (action === 'theme-system') {
      dispatch({ type: 'SET_UI_SETTINGS', payload: { theme: 'system' } })
    }
  }

  return (
    <div className="relative flex items-center justify-center">
      <button
        onClick={handleMenuClick}
        className="kebab-menu-btn"
        title="Menu"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '1px solid var(--color-border-medium)',
          background: 'var(--color-bg-secondary)',
          color: 'var(--color-text-secondary)',
          flexShrink: 0
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="3.5" r="1.3" fill="currentColor" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
          <circle cx="8" cy="12.5" r="1.3" fill="currentColor" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6, originX: 1, originY: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="absolute right-0 mt-3.5 w-48 rounded-2xl bg-[#0a0a0f]/95 backdrop-blur-xl border border-[#20202b] shadow-2xl py-2 z-50 text-sm font-medium text-gray-200 overflow-hidden flex flex-col gap-0.5"
              style={{ top: '100%', boxShadow: '0 15px 40px rgba(0,0,0,0.7)' }}
            >
              {/* New Tab */}
              <button
                onClick={() => handleAction('new-tab')}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 active:bg-white/10 text-left transition-colors text-gray-200 rounded-lg mx-1.5 w-[calc(100%-12px)]"
              >
                <div className="w-5 h-5 flex items-center justify-center text-red-500">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </div>
                <span className="text-[13px] font-medium tracking-wide">New Tab</span>
              </button>

              {/* Add Shortcut */}
              <button
                onClick={() => handleAction('add-shortcut')}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 active:bg-white/10 text-left transition-colors text-gray-200 rounded-lg mx-1.5 w-[calc(100%-12px)]"
              >
                <div className="w-5 h-5 flex items-center justify-center text-red-500">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <span className="text-[13px] font-medium tracking-wide">Add Shortcut</span>
              </button>

              <div className="h-px bg-[#1a1a24] my-1.5 mx-3" />

              <div className="px-3.5 py-1 text-[9px] text-gray-500 font-bold uppercase tracking-wider font-mono">
                Theme Mode
              </div>

              {/* Theme switcher segmented row */}
              <div className="flex bg-[#121218] border border-[#20202b] rounded-xl p-1 mx-3 mb-1 gap-1">
                {/* Light Theme */}
                <button
                  onClick={() => handleAction('theme-light')}
                  className={`flex-1 py-1.5 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
                    currentTheme === 'light'
                      ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                      : 'text-gray-500 hover:text-gray-300 border border-transparent'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                  </svg>
                  <span className="text-[8.5px] font-mono font-medium">Light</span>
                </button>

                {/* Dark Theme */}
                <button
                  onClick={() => handleAction('theme-dark')}
                  className={`flex-1 py-1.5 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
                    currentTheme === 'dark'
                      ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                      : 'text-gray-500 hover:text-gray-300 border border-transparent'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                  <span className="text-[8.5px] font-mono font-medium">Dark</span>
                </button>

                {/* System Auto Theme */}
                <button
                  onClick={() => handleAction('theme-system')}
                  className={`flex-1 py-1.5 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
                    currentTheme === 'system'
                      ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                      : 'text-gray-500 hover:text-gray-300 border border-transparent'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                  <span className="text-[8.5px] font-mono font-medium">Auto</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
