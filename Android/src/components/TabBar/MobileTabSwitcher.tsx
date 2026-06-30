import { useBrowser } from '../../context/BrowserContext'
import { motion, AnimatePresence } from 'framer-motion'

interface MobileTabSwitcherProps {
  onClose: () => void
}

export default function MobileTabSwitcher({ onClose }: MobileTabSwitcherProps) {
  const { state, createNewTab, closeTab, switchTab } = useBrowser()
  const { tabs, activeTabId } = state

  const handleTabClick = (id: string) => {
    switchTab(id)
    onClose()
  }

  const handleNewTab = () => {
    createNewTab('ghost://newtab')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#08080c]/95 backdrop-blur-md p-4 animate-fade-in text-gray-200"
      style={{ boxSizing: 'border-box' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between py-2 border-b border-[#222] mb-4">
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--color-accent)', fontSize: 20 }}>⬡</span>
          <h2 className="text-base font-bold tracking-wider font-mono text-white">
            TABS ({tabs.length})
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Add tab button */}
          <button
            onClick={handleNewTab}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#161622] border border-[#333] active:bg-[#252538] transition-colors"
            title="New Tab"
          >
            <span className="text-xl font-bold" style={{ color: 'var(--color-accent)' }}>+</span>
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#161622] border border-[#333] active:bg-[#252538] transition-colors"
            title="Close Switcher"
          >
            <span className="text-base">✕</span>
          </button>
        </div>
      </div>

      {/* Grid of tab cards */}
      <div className="flex-1 overflow-y-auto pb-8">
        {tabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 italic">
            No tabs open. Tap + to open a new tab.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <AnimatePresence initial={false}>
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId
                const title = tab.title || 'New Tab'
                const displayUrl = tab.url.startsWith('ghost://')
                  ? tab.url
                  : new URL(tab.url).hostname.replace('www.', '')

                return (
                  <motion.div
                    key={tab.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => handleTabClick(tab.id)}
                    className={`relative rounded-xl p-3 border flex flex-col justify-between h-32 cursor-pointer transition-all ${
                      isActive
                        ? 'border-red-500 bg-[#e63946]/5 shadow-[0_0_15px_rgba(230,57,70,0.15)]'
                        : 'border-[#2d2d3d] bg-[#101018]'
                    }`}
                  >
                    {/* Top Row: Icon & Close */}
                    <div className="flex items-start justify-between w-full">
                      <div
                        className="w-7 h-7 rounded-lg bg-[#1a1a24] flex items-center justify-center border border-[#333] text-xs font-bold"
                        style={{ color: isActive ? 'var(--color-accent)' : '#fff' }}
                      >
                        {tab.favicon ? (
                          <img
                            src={tab.favicon}
                            alt=""
                            className="w-4 h-4 rounded-sm"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          '★'
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          closeTab(tab.id)
                        }}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#252535] bg-[#161622] border border-[#2d2d3a] text-gray-400 active:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Bottom Row: Title & URL */}
                    <div className="flex flex-col mt-2 overflow-hidden w-full">
                      <span className="text-xs font-semibold text-white truncate max-w-full">
                        {title}
                      </span>
                      <span className="text-[10px] text-gray-500 truncate mt-0.5">
                        {displayUrl}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
