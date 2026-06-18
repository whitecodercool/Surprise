import { useBrowser } from '../../context/BrowserContext'
import GhostStackSettings from './GhostStackSettings'
import PrivacySettings from './PrivacySettings'
import BlockingSettings from './BlockingSettings'
import DNSSettings from './DNSSettings'
import SecuritySettings from './SecuritySettings'

export default function SettingsPage() {
  const { state, dispatch } = useBrowser()

  if (!state.settingsOpen) return null

  const tabs = [
    { id: 'ghoststack', label: 'GhostStack' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'blocking', label: 'Blocking' },
    { id: 'dns', label: 'DNS' },
    { id: 'security', label: 'Security' }
  ]

  const activeTab = state.settingsTab || 'ghoststack'

  return (
    <div
      className="absolute inset-0 z-[200] flex items-center justify-center p-8 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
    >
      <div
        className="flex w-full max-w-4xl h-[85vh] rounded-2xl overflow-hidden"
        style={{
          background: '#060608',
          border: '1px solid rgba(230,57,70,0.1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(230,57,70,0.05)'
        }}
      >
        {/* Settings Sidebar */}
        <div
          className="w-64 flex flex-col"
          style={{ background: '#0a0a0e', borderRight: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="p-5 flex items-center gap-3 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: 'var(--color-accent)',
                boxShadow: '0 0 10px var(--color-accent)'
              }}
            />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Settings</h2>
          </div>

          <div className="flex flex-col gap-1 p-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => dispatch({ type: 'SET_SETTINGS_TAB', payload: t.id as any })}
                className="text-left px-4 py-3 rounded-xl transition-all"
                style={{
                  background: activeTab === t.id ? 'rgba(230,57,70,0.1)' : 'transparent',
                  color: activeTab === t.id ? 'var(--color-accent)' : '#888',
                  fontWeight: activeTab === t.id ? 600 : 500,
                  fontSize: 14
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex-1 flex flex-col h-full relative overflow-hidden">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ color: '#888' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 relative custom-scrollbar">
            {activeTab === 'ghoststack' && <GhostStackSettings />}
            {activeTab === 'privacy' && <PrivacySettings />}
            {activeTab === 'blocking' && <BlockingSettings />}
            {activeTab === 'dns' && <DNSSettings />}
            {activeTab === 'security' && <SecuritySettings />}
          </div>
        </div>
      </div>
    </div>
  )
}
