/** Privacy Settings Screen */
import { useState, useEffect } from 'react'
import StatusCard from '../GhostStack/StatusCard'
import ToggleRow from '../GhostStack/ToggleRow'

const LEVELS = ['standard', 'strict', 'maximum', 'custom'] as const

export default function PrivacySettings() {
  const [settings, setSettings] = useState<any>(null)
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    window.api?.ghoststackGetPrivacySettings?.().then(setSettings)
  }, [])

  const update = (key: string, value: any) => {
    const ns = { ...settings, [key]: value, level: 'custom' }
    setSettings(ns)
    window.api?.ghoststackUpdatePrivacySettings?.(ns)
  }

  const setLevel = (level: string) => {
    window.api?.ghoststackSetPrivacyLevel?.(level)
    window.api?.ghoststackGetPrivacySettings?.().then(setSettings)
  }

  const testFP = () => {
    window.api?.ghoststackTestFingerprint?.().then(setTestResult)
  }
  const clearAll = () => {
    window.api?.ghoststackClearAllData?.()
  }

  if (!settings)
    return (
      <div className="p-4" style={{ color: '#888' }}>
        Loading...
      </div>
    )

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Privacy</h2>

      <div className="flex gap-2">
        {LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 8,
              border:
                settings.level === l ? '1px solid var(--color-accent, #6366f1)' : '1px solid #333',
              background: settings.level === l ? 'rgba(99,102,241,0.15)' : '#111',
              color: settings.level === l ? '#818cf8' : '#888',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <StatusCard id="gs-fp-toggles" title="Fingerprint Protection">
        <div className="flex flex-col gap-0.5">
          <ToggleRow
            id="gs-canvas"
            label="Canvas spoofing"
            checked={settings.canvasSpoofing}
            onChange={(v) => update('canvasSpoofing', v)}
          />
          <ToggleRow
            id="gs-webgl"
            label="WebGL spoofing"
            checked={settings.webglSpoofing}
            onChange={(v) => update('webglSpoofing', v)}
          />
          <ToggleRow
            id="gs-audio"
            label="Audio spoofing"
            checked={settings.audioSpoofing}
            onChange={(v) => update('audioSpoofing', v)}
          />
          <ToggleRow
            id="gs-font"
            label="Font spoofing"
            checked={settings.fontSpoofing}
            onChange={(v) => update('fontSpoofing', v)}
          />
          <ToggleRow
            id="gs-screen"
            label="Screen resolution spoofing"
            checked={settings.screenSpoofing}
            onChange={(v) => update('screenSpoofing', v)}
          />
          <ToggleRow
            id="gs-ua"
            label="User agent rotation"
            checked={settings.userAgentRotation}
            onChange={(v) => update('userAgentRotation', v)}
          />
          <ToggleRow
            id="gs-webrtc"
            label="WebRTC IP leak prevention"
            checked={settings.webrtcProtection}
            onChange={(v) => update('webrtcProtection', v)}
          />
          <ToggleRow
            id="gs-battery"
            label="Battery API spoofing"
            checked={settings.batterySpoofing}
            onChange={(v) => update('batterySpoofing', v)}
          />
          <ToggleRow
            id="gs-hw"
            label="Hardware concurrency spoofing"
            checked={settings.hardwareSpoofing}
            onChange={(v) => update('hardwareSpoofing', v)}
          />
          <ToggleRow
            id="gs-tz"
            label="Timezone spoofing"
            checked={settings.timezoneSpoofing}
            onChange={(v) => update('timezoneSpoofing', v)}
          />
        </div>
      </StatusCard>

      <button
        onClick={testFP}
        style={{
          padding: '10px',
          borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        Test My Fingerprint
      </button>

      {testResult && (
        <StatusCard
          id="gs-fp-result"
          title="Fingerprint Test"
          accent={testResult.uniquenessScore < 30 ? '#4ade80' : '#eab308'}
        >
          <p
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: testResult.uniquenessScore < 30 ? '#4ade80' : '#eab308'
            }}
          >
            {testResult.uniquenessScore}%
          </p>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            Uniqueness Score (lower = better)
          </p>
          <p style={{ fontSize: 12, color: '#4ade80' }}>
            Protected: {testResult.protectedAPIs.join(', ')}
          </p>
          {testResult.exposedAPIs.length > 0 && (
            <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
              Exposed: {testResult.exposedAPIs.join(', ')}
            </p>
          )}
        </StatusCard>
      )}

      <StatusCard id="gs-cookie-storage" title="Cookie & Storage">
        <ToggleRow
          id="gs-3pcookies"
          label="Block third-party cookies"
          checked={true}
          onChange={() => {}}
        />
        <ToggleRow
          id="gs-partition"
          label="Storage partitioning"
          checked={true}
          onChange={() => {}}
        />
        <ToggleRow
          id="gs-autoclear"
          label="Auto-clear on close"
          checked={true}
          onChange={() => {}}
        />
        <button
          onClick={clearAll}
          style={{
            marginTop: 8,
            padding: '8px 16px',
            borderRadius: 8,
            background: '#2a1a1a',
            border: '1px solid #4a2a2a',
            color: '#ef4444',
            fontSize: 12,
            cursor: 'pointer',
            width: '100%'
          }}
        >
          Clear All Data Now
        </button>
      </StatusCard>
    </div>
  )
}
