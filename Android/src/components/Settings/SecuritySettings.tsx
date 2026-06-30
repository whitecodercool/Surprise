/** Security Settings Screen */
import { useState } from 'react'
import StatusCard from '../GhostStack/StatusCard'
import ToggleRow from '../GhostStack/ToggleRow'

export default function SecuritySettings() {
  const [httpsOnly, setHttpsOnly] = useState(true)
  const [sslDetection, setSSLDetection] = useState(true)
  const [ctCheck, setCTCheck] = useState(true)
  const [hsts, setHSTS] = useState(true)
  const [perms, setPerms] = useState({
    camera: false,
    microphone: false,
    location: false,
    notifications: false
  })

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Security</h2>
      <StatusCard id="gs-conn-security" title="Connection Security">
        <ToggleRow
          id="gs-https"
          label="HTTPS only mode"
          checked={httpsOnly}
          onChange={setHttpsOnly}
        />
        <ToggleRow
          id="gs-ssl-detect"
          label="SSL interception detection"
          checked={sslDetection}
          onChange={setSSLDetection}
        />
        <ToggleRow
          id="gs-ct"
          label="Certificate Transparency check"
          checked={ctCheck}
          onChange={setCTCheck}
        />
        <ToggleRow id="gs-hsts" label="HSTS enforcement" checked={hsts} onChange={setHSTS} />
      </StatusCard>
      <StatusCard id="gs-cert-info" title="Network Certificate">
        <div className="flex items-center gap-2 mb-2">
          <div style={{ width: 8, height: 8, borderRadius: 4, background: '#4ade80' }} />
          <span style={{ fontSize: 13, color: '#4ade80' }}>Clean — No interception detected</span>
        </div>
        <p style={{ fontSize: 12, color: '#888' }}>Certificate issuer: verified by public CA</p>
      </StatusCard>
      <StatusCard id="gs-permissions" title="Permissions (Blocked by Default)">
        <ToggleRow
          id="gs-perm-cam"
          label="Camera"
          description={perms.camera ? 'Allowed' : 'Blocked'}
          checked={perms.camera}
          onChange={(v) => setPerms({ ...perms, camera: v })}
        />
        <ToggleRow
          id="gs-perm-mic"
          label="Microphone"
          description={perms.microphone ? 'Allowed' : 'Blocked'}
          checked={perms.microphone}
          onChange={(v) => setPerms({ ...perms, microphone: v })}
        />
        <ToggleRow
          id="gs-perm-loc"
          label="Location"
          description={perms.location ? 'Allowed' : 'Blocked'}
          checked={perms.location}
          onChange={(v) => setPerms({ ...perms, location: v })}
        />
        <ToggleRow
          id="gs-perm-notif"
          label="Notifications"
          description={perms.notifications ? 'Allowed' : 'Blocked'}
          checked={perms.notifications}
          onChange={(v) => setPerms({ ...perms, notifications: v })}
        />
      </StatusCard>
    </div>
  )
}
