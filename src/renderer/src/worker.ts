/**
 * GhostSwarm WebRTC Background Worker
 * Runs in a hidden Electron Renderer window to access native WebRTC APIs.
 */

const { ipcRenderer } = require('electron')

console.log('[SwarmWorker Console] worker.ts loaded!')
ipcRenderer.send('swarm:ready')

const SIGNALING_URL = 'https://rough-feather-7494.goyalashish367.workers.dev' // Replace with actual worker URL
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

let peerConnection: RTCPeerConnection | null = null
let dataChannel: RTCDataChannel | null = null
let isRelay = false
let localId = Math.random().toString(36).substring(2, 15)
let connectedPeerId: string | null = null

async function initRelay() {
  isRelay = true
  console.log('[GhostSwarm Worker] Starting as Relay')
  
  // Register with signaling server (and keep re-registering before KV TTL expires)
  async function registerRelay() {
    try {
      const res = await fetch(`${SIGNALING_URL}/register`, {
        method: 'POST',
        body: JSON.stringify({ id: localId })
      })
      const data = await res.json()
      console.log(`[GhostSwarm Relay] Registered. Active relays: ${data.activeRelays}`)
    } catch (e) {
      console.error('[GhostSwarm Relay] Failed to register:', e)
    }
  }

  await registerRelay()
  // Re-register every 60s (KV TTL is 120s, so we re-register well before expiry)
  setInterval(registerRelay, 60000)
  
  // Start polling for offers from clients
  pollSignaling()
}

async function initClient() {
  isRelay = false
  console.log('[GhostSwarm Worker] Starting as Client')
  
  // Retry finding relays with exponential backoff
  let retryCount = 0
  const maxRetries = 10
  
  async function tryConnect(): Promise<boolean> {
    try {
      // Create fresh peer connection each attempt
      if (peerConnection) {
        peerConnection.close()
      }
      peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      setupPeerConnection()
      
      dataChannel = peerConnection.createDataChannel('ghost-proxy')
      setupDataChannel()
      
      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)
      
      console.log('[GhostSwarm Client] Asking signaling server for relays...')
      const res = await fetch(`${SIGNALING_URL}/offer`, {
        method: 'POST',
        body: JSON.stringify({ id: localId, sdp: offer.sdp })
      })
      
      const data = await res.json()
      if (data.relayId) {
        connectedPeerId = data.relayId
        console.log(`[GhostSwarm Client] Found relay: ${data.relayId}`)
        pollSignaling()
        return true
      } else {
        console.warn(`[GhostSwarm Client] No relays available (attempt ${retryCount + 1}/${maxRetries})`)
        return false
      }
    } catch (e) {
      console.error('[GhostSwarm Client] Connection error:', e)
      return false
    }
  }

  const connected = await tryConnect()
  if (!connected) {
    // Retry every 10 seconds
    const retryInterval = setInterval(async () => {
      retryCount++
      if (retryCount >= maxRetries) {
        console.error('[GhostSwarm Client] Max retries reached. Giving up.')
        ipcRenderer.send('swarm:status', { status: 'failed', reason: 'No relays found after retries' })
        clearInterval(retryInterval)
        return
      }
      const ok = await tryConnect()
      if (ok) {
        clearInterval(retryInterval)
      }
    }, 10000)
  }
}

function setupPeerConnection() {
  if (!peerConnection) return

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && connectedPeerId) {
      fetch(`${SIGNALING_URL}/ice`, {
        method: 'POST',
        body: JSON.stringify({ id: localId, targetId: connectedPeerId, candidate: event.candidate })
      }).catch(console.error)
    }
  }

  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel
    setupDataChannel()
  }
  
  peerConnection.onconnectionstatechange = () => {
    console.log('[GhostSwarm] Connection state:', peerConnection?.connectionState)
    if (peerConnection?.connectionState === 'connected') {
      ipcRenderer.send('swarm:status', { status: 'connected', role: isRelay ? 'relay' : 'client' })
    } else if (peerConnection?.connectionState === 'disconnected' || peerConnection?.connectionState === 'failed') {
      ipcRenderer.send('swarm:status', { status: 'disconnected' })
    }
  }
}

function setupDataChannel() {
  if (!dataChannel) return

  dataChannel.binaryType = 'arraybuffer'

  dataChannel.onopen = () => console.log('[GhostSwarm] Data channel open')
  dataChannel.onclose = () => console.log('[GhostSwarm] Data channel closed')
  
  dataChannel.onmessage = async (event) => {
    try {
      if (event.data instanceof ArrayBuffer) {
        // Binary response from relay
        // Protocol: first 36 chars is reqId, rest is data
        const reqIdRaw = new TextDecoder().decode(new Uint8Array(event.data, 0, 36))
        const reqId = reqIdRaw.trim()
        const payload = new Uint8Array(event.data, 36)
        
        ipcRenderer.send('swarm:response', { reqId, data: payload })
      } else {
        const msg = JSON.parse(event.data)
        
        if (msg.type === 'request' && isRelay) {
          // As a relay, fetch the unblocked URL
          console.log(`[GhostSwarm Relay] Fetching ${msg.url}`)
          try {
            const fetchOpts: any = { method: msg.method, headers: msg.headers }
            if (msg.body) fetchOpts.body = Buffer.from(msg.body, 'base64')
            
            const res = await fetch(msg.url, fetchOpts)
            const buf = await res.arrayBuffer()
            
            // Send back metadata
            dataChannel?.send(JSON.stringify({
              type: 'metadata',
              reqId: msg.reqId,
              status: res.status,
              headers: Object.fromEntries(res.headers.entries())
            }))
            
            // Chunking to respect WebRTC data channel limits (64KB chunks)
            const CHUNK_SIZE = 65535 - 36
            const reqIdBuf = new TextEncoder().encode(msg.reqId.padEnd(36, ' '))
            const uintBuf = new Uint8Array(buf)
            
            for (let i = 0; i < uintBuf.length; i += CHUNK_SIZE) {
              const chunk = uintBuf.slice(i, i + CHUNK_SIZE)
              const combined = new Uint8Array(reqIdBuf.length + chunk.length)
              combined.set(reqIdBuf, 0)
              combined.set(chunk, reqIdBuf.length)
              dataChannel?.send(combined)
            }
            
            // Send EOF
            dataChannel?.send(JSON.stringify({ type: 'eof', reqId: msg.reqId }))
            
          } catch (e: any) {
            dataChannel?.send(JSON.stringify({ type: 'error', reqId: msg.reqId, error: e.message }))
          }
        } else if (msg.type === 'metadata' && !isRelay) {
          ipcRenderer.send('swarm:metadata', msg)
        } else if (msg.type === 'error' && !isRelay) {
          ipcRenderer.send('swarm:error', msg)
        } else if (msg.type === 'eof' && !isRelay) {
          ipcRenderer.send('swarm:eof', msg.reqId)
        }
      }
    } catch (e) {
      console.error('Error handling message:', e)
    }
  }
}

async function pollSignaling() {
  setInterval(async () => {
    try {
      const res = await fetch(`${SIGNALING_URL}/poll?id=${localId}`)
      const data = await res.json()
      
      for (const msg of data.messages) {
        if (msg.type === 'offer' && isRelay) {
          connectedPeerId = msg.from
          peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
          setupPeerConnection()
          
          await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }))
          const answer = await peerConnection.createAnswer()
          await peerConnection.setLocalDescription(answer)
          
          await fetch(`${SIGNALING_URL}/answer`, {
            method: 'POST',
            body: JSON.stringify({ id: localId, targetId: msg.from, sdp: answer.sdp })
          })
        } else if (msg.type === 'answer' && !isRelay) {
          if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }))
          }
        } else if (msg.type === 'ice') {
          if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate))
          }
        }
      }
    } catch (e) {
      // Ignore polling errors
    }
  }, 2000)
}

// IPC from Main process
ipcRenderer.on('swarm:init', (_event, role: 'relay' | 'client') => {
  if (role === 'relay') initRelay()
  else initClient()
})

ipcRenderer.on('swarm:request', (_event, reqData: any) => {
  if (!isRelay && dataChannel?.readyState === 'open') {
    dataChannel.send(JSON.stringify({
      type: 'request',
      ...reqData
    }))
  }
})
