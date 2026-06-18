/** Blocking Settings Screen */
import { useState, useEffect } from 'react'
import StatusCard from '../GhostStack/StatusCard'
import StatsBadge from '../GhostStack/StatsBadge'
import ToggleRow from '../GhostStack/ToggleRow'

export default function BlockingSettings() {
  const [stats, setStats] = useState<any>({
    adsBlocked: 0,
    trackersBlocked: 0,
    bandwidthSavedBytes: 0
  })
  const [settings, setSettings] = useState<any>({
    ads: true,
    trackers: true,
    socialWidgets: true,
    cookieConsent: true,
    cryptoMiners: true,
    malware: true,
    analytics: true
  })
  const [allowlist, setAllowlist] = useState<string[]>([])
  const [newDomain, setNewDomain] = useState('')

  useEffect(() => {
    window.api?.ghoststackGetBlockingStats?.().then(setStats)
    window.api?.ghoststackGetBlockingSettings?.().then(setSettings)
    window.api?.ghoststackGetAllowlist?.().then(setAllowlist)
    const i = setInterval(() => {
      window.api?.ghoststackGetBlockingStats?.().then(setStats)
    }, 3000)
    return () => clearInterval(i)
  }, [])

  const update = (key: string, value: boolean) => {
    const ns = { ...settings, [key]: value }
    setSettings(ns)
    window.api?.ghoststackUpdateBlockingSettings?.(ns)
  }
  const addDomain = () => {
    if (newDomain.trim()) {
      window.api?.ghoststackAddAllowlist?.(newDomain.trim())
      setAllowlist([...allowlist, newDomain.trim()])
      setNewDomain('')
    }
  }
  const removeDomain = (d: string) => {
    window.api?.ghoststackRemoveAllowlist?.(d)
    setAllowlist(allowlist.filter((x) => x !== d))
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Blocking</h2>
      <div className="flex gap-3">
        <StatsBadge label="Ads Blocked" value={stats.adsBlocked} color="#ef4444" />
        <StatsBadge label="Trackers" value={stats.trackersBlocked} color="#eab308" />
        <StatsBadge
          label="Saved"
          value={`${(stats.bandwidthSavedBytes / 1048576).toFixed(1)}MB`}
          color="#4ade80"
        />
      </div>
      <StatusCard id="gs-block-cats" title="Block Categories">
        <ToggleRow
          id="gs-block-ads"
          label="Ads"
          checked={settings.ads}
          onChange={(v) => update('ads', v)}
        />
        <ToggleRow
          id="gs-block-track"
          label="Trackers"
          checked={settings.trackers}
          onChange={(v) => update('trackers', v)}
        />
        <ToggleRow
          id="gs-block-social"
          label="Social widgets"
          checked={settings.socialWidgets}
          onChange={(v) => update('socialWidgets', v)}
        />
        <ToggleRow
          id="gs-block-cookie"
          label="Cookie consent popups"
          checked={settings.cookieConsent}
          onChange={(v) => update('cookieConsent', v)}
        />
        <ToggleRow
          id="gs-block-crypto"
          label="Crypto miners"
          checked={settings.cryptoMiners}
          onChange={(v) => update('cryptoMiners', v)}
        />
        <ToggleRow
          id="gs-block-malware"
          label="Malware domains"
          checked={settings.malware}
          onChange={(v) => update('malware', v)}
        />
        <ToggleRow
          id="gs-block-analytics"
          label="Analytics"
          checked={settings.analytics}
          onChange={(v) => update('analytics', v)}
        />
      </StatusCard>
      <StatusCard id="gs-allowlist" title="Allowlist">
        <div className="flex gap-2 mb-2">
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDomain()}
            placeholder="example.com"
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 6,
              background: '#0a0a0f',
              border: '1px solid #333',
              color: '#e0e0e0',
              fontSize: 12
            }}
          />
          <button
            onClick={addDomain}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: '#1a1a3a',
              border: '1px solid #333',
              color: '#818cf8',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Add
          </button>
        </div>
        {allowlist.map((d) => (
          <div key={d} className="flex items-center justify-between py-1.5 px-2">
            <span style={{ fontSize: 12, color: '#aaa' }}>{d}</span>
            <button
              onClick={() => removeDomain(d)}
              style={{
                fontSize: 11,
                color: '#ef4444',
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Remove
            </button>
          </div>
        ))}
        {allowlist.length === 0 && (
          <span style={{ fontSize: 12, color: '#555' }}>No allowlisted domains</span>
        )}
      </StatusCard>
    </div>
  )
}
