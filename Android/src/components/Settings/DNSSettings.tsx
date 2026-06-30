/** DNS Settings Screen */
import { useState, useEffect } from 'react'
import StatusCard from '../GhostStack/StatusCard'
import ToggleRow from '../GhostStack/ToggleRow'

export default function DNSSettings() {
  const [settings, setSettings] = useState<any>({
    primaryProvider: 'cloudflare',
    dnssecValidation: true,
    customUrl: null
  })
  const [leakResult, setLeakResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    window.api?.ghoststackGetDNSSettings?.().then(setSettings)
  }, [])

  const update = (key: string, val: any) => {
    const ns = { ...settings, [key]: val }
    setSettings(ns)
    window.api?.ghoststackUpdateDNSSettings?.(ns)
  }
  const flush = () => {
    window.api?.ghoststackFlushDNSCache?.()
  }
  const leakTest = async () => {
    setTesting(true)
    const r = await window.api?.ghoststackDNSLeakTest?.()
    setLeakResult(r)
    setTesting(false)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>DNS</h2>
      <StatusCard id="gs-dns-chain" title="Resolution Priority">
        {[
          '1. Session Cache',
          '2. Cloudflare DoH',
          '3. Google DoH',
          '4. NextDNS DoH',
          '5. TemporalDNS'
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, width: 18 }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 13, color: '#ccc' }}>{step.replace(/^\d+\.\s/, '')}</span>
          </div>
        ))}
      </StatusCard>
      <StatusCard id="gs-dns-provider" title="Provider Selection">
        {[
          { id: 'cloudflare', label: 'Cloudflare 1.1.1.1', rec: true },
          { id: 'google', label: 'Google 8.8.8.8' },
          { id: 'nextdns', label: 'NextDNS' }
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => update('primaryProvider', p.id)}
            className="flex items-center gap-2 w-full py-2 px-3 rounded-lg"
            style={{
              background:
                settings.primaryProvider === p.id ? 'rgba(99,102,241,0.1)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                border: `2px solid ${settings.primaryProvider === p.id ? '#6366f1' : '#444'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {settings.primaryProvider === p.id && (
                <div style={{ width: 6, height: 6, borderRadius: 3, background: '#6366f1' }} />
              )}
            </div>
            <span style={{ fontSize: 13, color: '#ccc' }}>{p.label}</span>
            {p.rec && (
              <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 'auto' }}>
                Recommended
              </span>
            )}
          </button>
        ))}
      </StatusCard>
      <StatusCard id="gs-dns-tools" title="Tools">
        <ToggleRow
          id="gs-dnssec"
          label="DNSSEC validation"
          checked={settings.dnssecValidation}
          onChange={(v) => update('dnssecValidation', v)}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={leakTest}
            disabled={testing}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 8,
              background: '#1a1a3a',
              border: '1px solid #333',
              color: '#818cf8',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            {testing ? 'Testing...' : 'DNS Leak Test'}
          </button>
          <button
            onClick={flush}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 8,
              background: '#1a1a2e',
              border: '1px solid #333',
              color: '#aaa',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Flush Cache
          </button>
        </div>
        {leakResult && (
          <div
            className="mt-2 p-2 rounded-lg"
            style={{
              background: leakResult.leakDetected ? '#2a1a1a' : '#1a2a1a',
              fontSize: 12,
              color: leakResult.leakDetected ? '#ef4444' : '#4ade80'
            }}
          >
            {leakResult.details}
          </div>
        )}
      </StatusCard>
    </div>
  )
}
