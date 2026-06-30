/** GhostStack Settings — Main settings screen */
import { useState, useEffect } from 'react'
import StatusCard from '../GhostStack/StatusCard'
import StatsBadge from '../GhostStack/StatsBadge'
import ToggleRow from '../GhostStack/ToggleRow'
import { DiagnosticsLogList } from '../GhostStack/DiagnosticsLogList'

export default function GhostStackSettings() {
  const [status, setStatus] = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)

  useEffect(() => {
    window.api?.ghoststackGetStatus?.().then(setStatus)
    window.api?.ghoststackGetSettings?.().then(setSettings)
    window.api?.onGhoststackStatusChanged?.((s: any) => setStatus(s))
  }, [])

  const update = (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    window.api?.ghoststackUpdateSettings?.(newSettings)
  }

  const rescan = () => {
    window.api
      ?.ghoststackRescanNetwork?.()
      .then(() => window.api?.ghoststackGetStatus?.().then(setStatus))
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3 mb-2">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>GhostStack</h2>
        <span
          style={{
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 6,
            background:
              status?.activeEngine === 'off'
                ? '#1a3a1a'
                : status?.activeEngine === 'blocked'
                  ? '#3a1a1a'
                  : '#1a1a3a',
            color:
              status?.activeEngine === 'off'
                ? '#4ade80'
                : status?.activeEngine === 'blocked'
                  ? '#ef4444'
                  : '#818cf8',
            fontWeight: 600
          }}
        >
          {status?.activeEngine?.toUpperCase() || 'LOADING'}
        </span>
      </div>

      <StatusCard
        id="gs-network-status"
        title="Network Status"
        accent={status?.networkEnv?.firewallType ? '#eab308' : '#4ade80'}
      >
        <div className="flex flex-col gap-2">
          <div className="flex justify-between">
            <span style={{ fontSize: 13, color: '#aaa' }}>Network</span>
            <span style={{ fontSize: 13, color: '#fff' }}>
              {status?.networkEnv?.networkType === 'heavily_restricted'
                ? 'Restricted'
                : status?.networkEnv?.networkType === 'filtered'
                  ? 'Filtered'
                  : 'Open'}
              {status?.networkEnv?.firewallType ? ` — ${status.networkEnv.firewallType}` : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ fontSize: 13, color: '#aaa' }}>Engine</span>
            <span style={{ fontSize: 13, color: '#fff' }}>{status?.activeMethod || 'Direct'}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ fontSize: 13, color: '#aaa' }}>Latency</span>
            <span style={{ fontSize: 13, color: '#fff' }}>
              {status?.networkEnv?.latencyMs >= 0 ? `${status.networkEnv.latencyMs}ms` : 'N/A'}
            </span>
          </div>
          <button
            onClick={rescan}
            style={{
              marginTop: 8,
              padding: '8px 16px',
              borderRadius: 8,
              background: '#1a1a2e',
              border: '1px solid #333',
              color: '#aaa',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Re-scan Network
          </button>
        </div>
      </StatusCard>

      {settings && (
        <StatusCard id="gs-engine-toggles" title="Engines">
          <div className="flex flex-col gap-1">
            <ToggleRow
              id="gs-ipraw"
              label="IPRaw Engine"
              description="ECH + QUIC direct bypass"
              checked={settings.iprawEnabled}
              onChange={(v) => update('iprawEnabled', v)}
            />
            {settings.iprawEnabled && (
              <>
                <div className="ml-4">
                  <ToggleRow
                    id="gs-quic"
                    label="Prefer QUIC"
                    checked={settings.preferQuic}
                    onChange={(v) => update('preferQuic', v)}
                  />
                </div>
                <div className="ml-4">
                  <ToggleRow
                    id="gs-ech"
                    label="ECH"
                    checked={settings.echEnabled}
                    onChange={(v) => update('echEnabled', v)}
                  />
                </div>
                <div className="ml-4">
                  <ToggleRow
                    id="gs-shape"
                    label="Traffic Shaping"
                    checked={settings.trafficShapingEnabled}
                    onChange={(v) => update('trafficShapingEnabled', v)}
                  />
                </div>
              </>
            )}
            <ToggleRow
              id="gs-splitcast"
              label="SplitCast Engine"
              description="TCP segmentation bypass"
              checked={settings.splitcastEnabled}
              onChange={(v) => update('splitcastEnabled', v)}
            />
            <ToggleRow
              id="gs-temporal"
              label="TemporalDNS"
              description="Last resort — slow but unblockable"
              checked={settings.temporalEnabled}
              onChange={(v) => update('temporalEnabled', v)}
            />
          </div>
        </StatusCard>
      )}

      {status?.stats && (
        <StatusCard id="gs-session-stats" title="Session Stats">
          <div className="flex gap-3 flex-wrap">
            <StatsBadge label="Bypassed" value={status.stats.sitesBypassed} />
            <StatsBadge label="IPRaw" value={status.stats.iprawCount} color="#6366f1" />
            <StatsBadge label="SplitCast" value={status.stats.splitcastCount} color="#eab308" />
            <StatsBadge
              label="Avg Time"
              value={`${status.stats.averageBypassTimeMs}ms`}
              color="#4ade80"
            />
          </div>
        </StatusCard>
      )}

      <StatusCard id="gs-force-mode" title="Manual Override">
        <select
          value={settings?.forceMode || 'auto'}
          onChange={(e) => update('forceMode', e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            background: '#0a0a0f',
            border: '1px solid #333',
            color: '#e0e0e0',
            fontSize: 13
          }}
        >
          <option value="auto">Auto (Recommended)</option>
          <option value="ipraw">IPRaw Only</option>
          <option value="splitcast">SplitCast Only</option>
          <option value="tunnel">Worker Tunnel Only</option>
          <option value="direct">Direct (No Bypass)</option>
        </select>
      </StatusCard>

      <DiagnosticsLogList />
    </div>
  )
}
