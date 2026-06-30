/** GhostStack Network HUD Panel — expanded overlay */

interface Props {
  status: any
}

const ENGINE_COLORS: Record<string, string> = {
  off: '#4ade80',
  ipraw: '#6366f1',
  splitcast: '#eab308',
  temporal: '#a855f7',
  blocked: '#ef4444'
}
const ENGINE_LABELS: Record<string, string> = {
  off: 'Direct',
  ipraw: 'IPRaw',
  splitcast: 'SplitCast',
  temporal: 'TemporalDNS',
  blocked: 'Blocked'
}

export default function NetworkHUDPanel({ status }: Props) {
  const engine = status?.activeEngine || 'off'
  const color = ENGINE_COLORS[engine]
  const env = status?.networkEnv

  return (
    <div
      className="absolute right-0 animate-fade-in z-[100]"
      style={{
        top: '100%',
        width: 260,
        marginTop: 4,
        background: 'rgba(10,10,15,0.97)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        padding: 0,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: `linear-gradient(135deg, ${color}11, transparent)`
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: color,
              boxShadow: `0 0 8px ${color}`
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
            GhostStack {ENGINE_LABELS[engine]}
          </span>
        </div>
        <span style={{ fontSize: 11, color: '#888' }}>
          {status?.activeMethod || 'Direct connection'}
        </span>
      </div>

      {/* Network Info */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex justify-between py-0.5">
          <span style={{ fontSize: 11, color: '#666' }}>Network</span>
          <span style={{ fontSize: 11, color: '#ccc' }}>{env?.networkType || 'Unknown'}</span>
        </div>
        {env?.firewallType && (
          <div className="flex justify-between py-0.5">
            <span style={{ fontSize: 11, color: '#666' }}>Firewall</span>
            <span style={{ fontSize: 11, color: '#eab308' }}>{env.firewallType}</span>
          </div>
        )}
        <div className="flex justify-between py-0.5">
          <span style={{ fontSize: 11, color: '#666' }}>DNS</span>
          <span style={{ fontSize: 11, color: env?.dnsFiltered ? '#ef4444' : '#4ade80' }}>
            {env?.dnsFiltered ? 'Filtered' : 'Encrypted'}
          </span>
        </div>
        <div className="flex justify-between py-0.5">
          <span style={{ fontSize: 11, color: '#666' }}>SSL</span>
          <span style={{ fontSize: 11, color: env?.sslIntercepted ? '#ef4444' : '#4ade80' }}>
            {env?.sslIntercepted ? 'Intercepted' : 'Clean'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '10px 16px' }}>
        <div className="flex gap-3 justify-center">
          <div className="text-center">
            <div style={{ fontSize: 16, fontWeight: 700, color }}>
              {status?.stats?.sitesBypassed || 0}
            </div>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase' }}>Bypassed</div>
          </div>
          <div className="text-center">
            <div style={{ fontSize: 16, fontWeight: 700, color: '#818cf8' }}>
              {status?.stats?.iprawCount || 0}
            </div>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase' }}>IPRaw</div>
          </div>
          <div className="text-center">
            <div style={{ fontSize: 16, fontWeight: 700, color: '#eab308' }}>
              {status?.stats?.splitcastCount || 0}
            </div>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase' }}>Split</div>
          </div>
          <div className="text-center">
            <div style={{ fontSize: 16, fontWeight: 700, color: '#4ade80' }}>
              {status?.stats?.averageBypassTimeMs || 0}ms
            </div>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase' }}>Avg</div>
          </div>
        </div>
      </div>
    </div>
  )
}
