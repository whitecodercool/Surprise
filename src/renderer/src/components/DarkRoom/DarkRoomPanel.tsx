import { useEffect, useRef, useState, useCallback } from 'react'
// @ts-ignore — tweetnacl is a CJS/UMD bundle, types via @types/tweetnacl if added
import nacl from 'tweetnacl'

// ── Tiny nacl helpers ────────────────────────────────────────────────────────
const enc = new TextEncoder()
const dec = new TextDecoder()
const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const fromB64 = (s: string) => new Uint8Array([...atob(s)].map((c) => c.charCodeAt(0)))

// ── Persistent user identity ──────────────────────────────────────────────────
// Each user gets a curve25519 keypair generated once and saved in localStorage.
// The public key is never sent to the server — it only derives the default handle.
const IDENTITY_KEY = 'dr_identity_v1'

interface Identity {
  pubKey: string // base64
  privKey: string // base64
}

function getOrCreateIdentity(): Identity {
  const stored = localStorage.getItem(IDENTITY_KEY)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {}
  }
  const kp = nacl.box.keyPair()
  const id: Identity = { pubKey: toB64(kp.publicKey), privKey: toB64(kp.secretKey) }
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(id))
  return id
}

function deriveHandle(pubKeyB64: string): string {
  // First 8 chars of the base64 pubkey, lowercased, prefixed with "ghost-"
  return (
    'ghost-' +
    pubKeyB64
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toLowerCase()
  )
}

function encrypt(text: string, key: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const box = nacl.secretbox(enc.encode(text), nonce, key)
  return toB64(
    new Uint8Array(
      JSON.stringify({ c: toB64(box), n: toB64(nonce) })
        .split('')
        .map((c) => c.charCodeAt(0))
    )
  )
}

function decrypt(payload: string, key: Uint8Array): string | null {
  try {
    const raw = dec.decode(fromB64(payload))
    const { c, n } = JSON.parse(raw)
    const opened = nacl.secretbox.open(fromB64(c), fromB64(n), key)
    return opened ? dec.decode(opened) : null
  } catch {
    return null
  }
}

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = 'setup-onion' | 'connecting-tor' | 'lobby' | 'chat'

interface ChatMessage {
  handle: string
  text: string | null
  ts: number
  own: boolean
  isSystem?: boolean
}

interface DarkRoomPanelProps {
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DarkRoomPanel({ onClose }: DarkRoomPanelProps) {
  const [phase, setPhase] = useState<Phase>('connecting-tor')
  const [torProgress, setTorProgress] = useState(0)
  const [torStatus, setTorStatus] = useState('Initializing...')
  const [torError, setTorError] = useState('')

  const [onionAddr, setOnionAddr] = useState('')

  // Load (or generate) the user's persistent identity once (lazy init avoids re-running on every render)
  const [handleInput, setHandleInput] = useState(() => deriveHandle(getOrCreateIdentity().pubKey))
  const [inviteInput, setInviteInput] = useState('')
  const [lobbyError, setLobbyError] = useState('')

  const [myHandle, setMyHandle] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [msgText, setMsgText] = useState('')
  const [copyLabel, setCopyLabel] = useState('Copy invite')
  const [joining, setJoining] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const roomKeyRef = useRef<Uint8Array | null>(null)
  const msgEndRef = useRef<HTMLDivElement>(null)
  const proxyPort = useRef<number>(0)
  const myHandleRef = useRef<string>('')

  // ── Boot: load config, start tor+proxy ───────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function boot() {
      const cfg = await window.api.darkroomGetConfig()
      if (cancelled) return

      if (cfg.onionAddr) setOnionAddr(cfg.onionAddr)

      if (!cfg.torFound) {
        setTorError('Tor not found. Try reinstalling Ghost Browser or contact support.')
        setPhase('connecting-tor')
        return
      }

      // If Tor already bootstrapped in background — go straight to lobby
      if (cfg.torStatus === 'ready') {
        const result = await window.api.darkroomStart()
        if (cancelled) return
        if (result.ok) {
          proxyPort.current = result.port ?? 0
          setPhase('lobby')
          return
        }
      }

      setPhase('connecting-tor')
      setTorStatus(cfg.torStatus === 'bootstrapping' ? 'Connecting to Tor...' : 'Starting Tor...')

      // Listen for bootstrap progress pushed from main process
      window.api.onDarkroomTorStatus((data: { status: string; progress: number | null }) => {
        if (data.status === 'bootstrapping' && data.progress !== null) {
          setTorProgress(data.progress)
          setTorStatus(`Bootstrapping Tor... ${data.progress}%`)
        } else if (data.status === 'ready') {
          setTorProgress(100)
          setTorStatus('Tor ready')
        } else if (data.status === 'error') {
          setTorError('Tor failed to connect. Check your internet connection.')
        }
      })

      const result = await window.api.darkroomStart()
      if (cancelled) return

      if (!result.ok) {
        if (result.error === 'TOR_NOT_FOUND') {
          setTorError('Tor not found. Try reinstalling Ghost Browser or contact support.')
        } else if (result.error === 'NO_ONION_ADDR') {
          setPhase('setup-onion')
        } else {
          setTorError(`Tor error: ${result.error}`)
        }
        return
      }

      proxyPort.current = result.port ?? 0
      setPhase('lobby')
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-scroll messages
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Create room ───────────────────────────────────────────────────────────
  const handleCreate = useCallback(() => {
    if (joining) return
    const code = randomRoomCode()
    const key = nacl.randomBytes(32) as Uint8Array
    joinRoom(code, key, handleInput.trim())
  }, [handleInput, joining])

  // ── Join room from invite code ────────────────────────────────────────────
  const handleJoin = useCallback(() => {
    if (joining) return
    const raw = inviteInput.trim()
    if (!raw.includes(':')) {
      setLobbyError('Paste a full invite code (ROOMCODE:key)')
      return
    }
    const [code, ...rest] = raw.split(':')
    let key: Uint8Array
    try {
      key = fromB64(rest.join(':'))
    } catch {
      setLobbyError('Bad invite code')
      return
    }
    if (key.length !== 32) {
      setLobbyError('Invalid key length')
      return
    }
    joinRoom(code.toUpperCase(), key, handleInput.trim())
  }, [inviteInput, handleInput, joining])

  // ── Connect WebSocket through local Tor proxy ─────────────────────────────
  function joinRoom(code: string, key: Uint8Array, handle: string) {
    // Close any existing connection silently before opening a new one
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }

    setJoining(true)
    setLobbyError('')
    roomKeyRef.current = key
    const invite = `${code}:${toB64(key)}`

    const ws = new WebSocket(`ws://127.0.0.1:${proxyPort.current}`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', room: code, handle: handle || '' }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        handleServerMsg(msg, code, key, invite)
      } catch {}
    }

    ws.onclose = () => {
      setJoining(false)
      addSystem('Disconnected from room.')
    }

    ws.onerror = () => {
      setJoining(false)
      setLobbyError('WebSocket error — is the proxy running?')
    }
  }

  function handleServerMsg(msg: any, code: string, key: Uint8Array, invite: string) {
    switch (msg.type) {
      case 'joined':
        setJoining(false)
        setMyHandle(msg.handle)
        myHandleRef.current = msg.handle
        setRoomCode(code)
        setInviteCode(invite)
        setParticipants(msg.participants || [])
        setPhase('chat')
        addSystem(`You joined as ${msg.handle}`)
        break

      case 'message': {
        if (msg.handle === myHandleRef.current) break // already added locally on send
        const text = decrypt(msg.payload, key)
        setMessages((prev) => [
          ...prev,
          {
            handle: msg.handle,
            text,
            ts: msg.ts,
            own: false
          }
        ])
        break
      }

      case 'system':
        addSystem(msg.msg)
        if (typeof msg.users === 'number') {
          // user count update — server doesn't send full list on join/leave,
          // just reflect the delta in the count
        }
        break

      case 'error':
        addSystem(`[Server] ${msg.msg}`)
        break
    }
  }

  function addSystem(text: string) {
    setMessages((prev) => [
      ...prev,
      { handle: '', text, ts: Date.now(), own: false, isSystem: true }
    ])
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const text = msgText.trim()
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (!roomKeyRef.current) return

    const payload = encrypt(text, roomKeyRef.current)
    wsRef.current.send(JSON.stringify({ type: 'message', payload }))

    setMessages((prev) => [
      ...prev,
      {
        handle: myHandle,
        text,
        ts: Date.now(),
        own: true
      }
    ])
    setMsgText('')
  }, [msgText, myHandle])

  // ── Panic / leave ─────────────────────────────────────────────────────────
  const panic = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    roomKeyRef.current = null
    setMessages([])
    setParticipants([])
    setRoomCode('')
    setInviteCode('')
    setMyHandle('')
    setMsgText('')
    setPhase('lobby')
  }, [])

  // ── Copy invite ───────────────────────────────────────────────────────────
  const copyInvite = useCallback(() => {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy invite'), 2000)
    })
  }, [inviteCode])

  // ── Keepalive ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 25_000)
    return () => clearInterval(id)
  }, [])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={S.overlay}>
      <div style={S.panel}>
        {/* Header */}
        <div style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={S.headerIcon}>⬡</span>
            <span style={S.headerTitle}>GHOST DARK ROOM</span>
            <span style={S.headerBadge}>E2E ENCRYPTED · EPHEMERAL</span>
          </div>
          <button onClick={onClose} style={S.closeBtn} title="Close">
            ✕
          </button>
        </div>

        {/* ── Phase: setup onion addr ── */}
        {phase === 'setup-onion' && (
          <div style={S.centered}>
            <div style={S.setupBox}>
              <div style={S.setupTitle}>SERVER UNAVAILABLE</div>
              <div style={S.setupDesc}>
                Dark Room server configuration is missing.
                <br />
                Please reinstall Ghost Browser to restore it.
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: connecting to Tor ── */}
        {phase === 'connecting-tor' && (
          <div style={S.centered}>
            <div style={S.setupBox}>
              <div style={{ marginBottom: 16 }}>
                <div style={S.torIcon}>⬡</div>
              </div>
              {torError ? (
                <>
                  <div
                    style={{ color: 'var(--color-error, #ff4466)', marginBottom: 12, fontSize: 13 }}
                  >
                    {torError}
                  </div>
                </>
              ) : (
                <>
                  <div style={S.setupTitle}>{torStatus}</div>
                  <div style={S.progressTrack}>
                    <div style={{ ...S.progressFill, width: `${torProgress}%` }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
                    Connecting to Tor network anonymously...
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Phase: lobby (create / join) ── */}
        {phase === 'lobby' && (
          <div style={S.centered}>
            <div style={{ ...S.setupBox, width: 360 }}>
              <div style={S.setupTitle}>ENTER DARK ROOM</div>
              <div style={S.field}>
                <label style={S.label}>
                  YOUR HANDLE{' '}
                  <span style={{ color: 'var(--color-accent)', fontSize: 9 }}>
                    · derived from your key
                  </span>
                </label>
                <input
                  style={S.input}
                  placeholder="ghost-XXXX"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  maxLength={20}
                  spellCheck={false}
                />
              </div>

              <button
                style={{
                  ...S.btnPrimary,
                  opacity: joining ? 0.5 : 1,
                  cursor: joining ? 'not-allowed' : 'pointer'
                }}
                onClick={handleCreate}
                disabled={joining}
              >
                {joining ? 'Connecting...' : 'Create new room'}
              </button>

              <div style={S.dividerLine}>— or join existing —</div>

              <div style={S.field}>
                <label style={S.label}>Invite code</label>
                <input
                  style={S.input}
                  placeholder="ABCD1234:base64key..."
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !joining && handleJoin()}
                  spellCheck={false}
                />
              </div>
              <button
                style={{
                  ...S.btnSecondary,
                  opacity: joining ? 0.5 : 1,
                  cursor: joining ? 'not-allowed' : 'pointer'
                }}
                onClick={handleJoin}
                disabled={joining}
              >
                {joining ? 'Connecting...' : 'Join room'}
              </button>

              {lobbyError && <div style={S.errorMsg}>{lobbyError}</div>}

              <div
                style={{
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: '1px solid var(--color-border-subtle)',
                  fontSize: 11,
                  color: 'var(--color-text-muted)'
                }}
              >
                Connected via Tor · Server: {onionAddr.slice(0, 16)}…
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: chat ── */}
        {phase === 'chat' && (
          <div style={S.chatLayout}>
            {/* Sidebar */}
            <div style={S.chatSidebar}>
              <div style={S.sideSection}>
                <div style={S.sideLabel}>YOUR HANDLE</div>
                <div style={S.sideValue}>{myHandle}</div>
              </div>

              <div style={S.sideSection}>
                <div style={S.sideLabel}>ROOM</div>
                <div style={{ ...S.sideValue, letterSpacing: 2, fontSize: 13 }}>{roomCode}</div>
              </div>

              <div style={S.sideSection}>
                <div style={S.sideLabel}>INVITE CODE</div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--color-text-muted)',
                    wordBreak: 'break-all',
                    marginBottom: 6,
                    lineHeight: 1.5,
                    maxHeight: 50,
                    overflow: 'hidden'
                  }}
                >
                  {inviteCode}
                </div>
                <button style={S.btnSmall} onClick={copyInvite}>
                  {copyLabel}
                </button>
              </div>

              <div style={S.sideSection}>
                <div style={S.sideLabel}>PARTICIPANTS ({participants.length})</div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    maxHeight: 120,
                    overflowY: 'auto'
                  }}
                >
                  {participants.map((h) => (
                    <div
                      key={h}
                      style={{
                        fontSize: 12,
                        color:
                          h === myHandle ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        padding: '2px 0'
                      }}
                    >
                      {h === myHandle ? '▶ ' : '  '}
                      {h}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  Via Tor · E2E encrypted
                </div>
                <button style={S.btnDanger} onClick={panic}>
                  Leave room
                </button>
              </div>
            </div>

            {/* Messages */}
            <div style={S.chatMain}>
              <div style={S.messageList}>
                {messages.map((m, i) => (
                  <div key={i} style={m.isSystem ? S.sysMsg : m.own ? S.ownMsg : S.otherMsg}>
                    {!m.isSystem && (
                      <div style={S.msgHeader}>
                        <span
                          style={{
                            color: m.own ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                            fontSize: 11
                          }}
                        >
                          {m.handle}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                          {fmtTime(m.ts)}
                        </span>
                      </div>
                    )}
                    <div style={m.isSystem ? {} : S.msgBody}>
                      {m.text === null ? (
                        <span
                          style={{
                            color: 'var(--color-error, #ff4466)',
                            fontStyle: 'italic',
                            fontSize: 12
                          }}
                        >
                          [decryption failed]
                        </span>
                      ) : (
                        esc(m.text)
                      )}
                    </div>
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>

              <div style={S.inputRow}>
                <input
                  style={S.msgInput}
                  placeholder="Message (encrypted before sending)..."
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  maxLength={2000}
                  spellCheck={false}
                />
                <button style={S.sendBtn} onClick={sendMessage}>
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 500,
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    pointerEvents: 'none'
  },
  panel: {
    width: 680,
    height: '100%',
    background: 'var(--color-bg-secondary, #1a1a1f)',
    borderLeft: '1px solid var(--color-border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'all',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.5)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-primary, #141414)',
    flexShrink: 0
  },
  headerIcon: {
    fontSize: 16,
    color: 'var(--color-accent)'
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 2,
    color: 'var(--color-text-primary)',
    fontFamily: 'monospace'
  },
  headerBadge: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    letterSpacing: 1,
    fontFamily: 'monospace'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    padding: '4px 8px',
    borderRadius: 6
  },
  centered: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  setupBox: {
    width: 340,
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  setupTitle: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    color: 'var(--color-text-primary)',
    fontFamily: 'monospace',
    marginBottom: 4
  },
  setupDesc: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    lineHeight: 1.6
  },
  torIcon: {
    fontSize: 32,
    color: 'var(--color-accent)',
    textAlign: 'center',
    animation: 'spin 4s linear infinite'
  },
  progressTrack: {
    height: 4,
    background: 'var(--color-border-subtle)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8
  },
  progressFill: {
    height: '100%',
    background: 'var(--color-accent)',
    borderRadius: 2,
    transition: 'width 0.4s ease'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5
  },
  label: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    letterSpacing: 1,
    fontFamily: 'monospace'
  },
  input: {
    background: 'var(--color-bg-primary, #141414)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 6,
    color: 'var(--color-text-primary)',
    padding: '8px 10px',
    fontSize: 13,
    fontFamily: 'monospace',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  },
  btnPrimary: {
    background: 'var(--color-accent)',
    border: 'none',
    borderRadius: 6,
    color: '#000',
    padding: '9px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%'
  },
  btnSecondary: {
    background: 'transparent',
    border: '1px solid var(--color-border-medium, #333)',
    borderRadius: 6,
    color: 'var(--color-text-primary)',
    padding: '9px 14px',
    fontSize: 13,
    cursor: 'pointer',
    width: '100%'
  },
  btnSmall: {
    background: 'transparent',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 5,
    color: 'var(--color-text-muted)',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'monospace'
  },
  btnDanger: {
    background: 'transparent',
    border: '1px solid var(--color-error, #ff4466)',
    borderRadius: 6,
    color: 'var(--color-error, #ff4466)',
    padding: '8px 14px',
    fontSize: 12,
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'monospace',
    letterSpacing: 1
  },
  dividerLine: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    textAlign: 'center',
    margin: '4px 0'
  },
  errorMsg: {
    fontSize: 12,
    color: 'var(--color-error, #ff4466)',
    padding: '6px 10px',
    border: '1px solid var(--color-error, #ff4466)',
    borderRadius: 5,
    background: 'rgba(255,68,102,0.06)'
  },

  // Chat layout
  chatLayout: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  chatSidebar: {
    width: 180,
    borderRight: '1px solid var(--color-border-subtle)',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0
  },
  sideSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottom: '1px solid var(--color-border-subtle)'
  },
  sideLabel: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    letterSpacing: 1,
    fontFamily: 'monospace',
    marginBottom: 5
  },
  sideValue: {
    fontSize: 12,
    color: 'var(--color-accent)',
    fontFamily: 'monospace',
    wordBreak: 'break-all'
  },
  chatMain: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  sysMsg: {
    textAlign: 'center',
    fontSize: 11,
    color: 'var(--color-text-muted)',
    fontFamily: 'monospace',
    padding: '3px 0'
  },
  ownMsg: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    padding: '8px 12px',
    background: 'var(--color-accent-subtle, rgba(100,200,255,0.08))',
    borderRadius: '12px 12px 2px 12px',
    border: '1px solid var(--color-accent-muted, rgba(100,200,255,0.2))'
  },
  otherMsg: {
    alignSelf: 'flex-start',
    maxWidth: '78%',
    padding: '8px 12px',
    background: 'var(--color-bg-tertiary, #1e1e24)',
    borderRadius: '12px 12px 12px 2px',
    border: '1px solid var(--color-border-subtle)'
  },
  msgHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4
  },
  msgBody: {
    fontSize: 13,
    color: 'var(--color-text-primary)',
    lineHeight: 1.5,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap'
  },
  inputRow: {
    display: 'flex',
    borderTop: '1px solid var(--color-border-subtle)',
    flexShrink: 0
  },
  msgInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: '13px 16px',
    fontSize: 13,
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit'
  },
  sendBtn: {
    background: 'var(--color-accent)',
    border: 'none',
    color: '#000',
    padding: '13px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0
  }
}
