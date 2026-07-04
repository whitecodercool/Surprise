/**
 * DarkRoomProxy — local TCP proxy that tunnels traffic through Tor SOCKS5
 * to the .onion server.
 *
 * The renderer's WebSocket connects to ws://127.0.0.1:localPort.
 * All bytes are piped through the Tor SOCKS5 proxy to the hidden service.
 * The renderer never knows the actual .onion address.
 */

import * as net from 'net'
import { app } from 'electron'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'

// Remote endpoint that returns { onionAddr: "xxx.onion" }
// Deploy a Cloudflare Worker (or any HTTPS endpoint) that serves this JSON.
// The .onion address is never bundled in the app — fetched at runtime and cached locally.
const DARKROOM_CONFIG_URL = 'https://darkroom.ghostbrowser.workers.dev/config'

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'darkroom_config.json')
const HMAC_KEY_PATH = () => path.join(app.getPath('userData'), 'darkroom_hmac.key')

interface DarkRoomConfig {
  onionAddr: string
  mac: string
}

function getOrCreateHmacKey(): Buffer {
  const p = HMAC_KEY_PATH()
  try {
    const key = fs.readFileSync(p)
    if (key.length === 32) return key
  } catch {}
  const key = crypto.randomBytes(32)
  fs.writeFileSync(p, key)
  return key
}

function computeMac(addr: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(addr, 'utf-8').digest('hex')
}

function saveCachedOnionAddr(addr: string): void {
  const key = getOrCreateHmacKey()
  const mac = computeMac(addr.trim(), key)
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify({ onionAddr: addr.trim(), mac }), 'utf-8')
}

function loadCachedOnionAddr(): string {
  try {
    const raw = fs.readFileSync(CONFIG_PATH(), 'utf-8')
    const cfg: DarkRoomConfig = JSON.parse(raw)
    const addr = cfg.onionAddr?.trim()
    if (!addr || !cfg.mac) return ''
    const key = getOrCreateHmacKey()
    const expected = Buffer.from(computeMac(addr, key), 'hex')
    const actual = Buffer.from(cfg.mac, 'hex')
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      console.error('[DarkRoom] darkroom_config.json MAC mismatch — rejecting cached address')
      return ''
    }
    return addr
  } catch {
    return ''
  }
}

async function fetchOnionAddr(): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(DARKROOM_CONFIG_URL, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { onionAddr?: string }
    const addr = data.onionAddr?.trim()
    if (!addr?.endsWith('.onion')) throw new Error('Invalid response from config endpoint')
    return addr
  } finally {
    clearTimeout(timeout)
  }
}

// Resolves the onion address: local cache first, remote fetch if not cached.
export async function resolveOnionAddr(): Promise<string> {
  const cached = loadCachedOnionAddr()
  if (cached) return cached

  const addr = await fetchOnionAddr()
  saveCachedOnionAddr(addr)
  return addr
}

// ── Proxy server ──────────────────────────────────────────────────────────────
class DarkRoomProxy {
  private server: net.Server | null = null
  private localPort = 0
  private torSocksPort: number
  private onionAddr: string

  constructor(torSocksPort: number) {
    this.torSocksPort = torSocksPort
    this.onionAddr = loadCachedOnionAddr()
  }

  setOnionAddr(addr: string) {
    this.onionAddr = addr
    saveCachedOnionAddr(addr)
  }

  getOnionAddr() {
    return this.onionAddr
  }
  getLocalPort() {
    return this.localPort
  }

  start(): Promise<number> {
    if (this.server) return Promise.resolve(this.localPort)

    this.server = net.createServer((client) => {
      client.on('error', () => {})

      this._connectViaSocks5()
        .then((torSocket) => {
          let first = true
          client.on('data', (chunk) => {
            if (first) {
              first = false
              let req = chunk.toString('utf8')
              if (req.startsWith('GET ')) {
                req = req.replace(/(?<=^|\r\n)Host: [^\r\n]+/i, `Host: ${this.onionAddr}`)
                req = req.replace(/(?<=^|\r\n)Origin: [^\r\n]+/i, `Origin: http://${this.onionAddr}`)
                torSocket.write(Buffer.from(req, 'utf8'))
                return
              }
            }
            torSocket.write(chunk)
          })

          torSocket.pipe(client)

          client.on('close', () => torSocket.destroy())
          torSocket.on('close', () => client.destroy())
          torSocket.on('error', () => client.destroy())
        })
        .catch((err) => {
          console.error('[DarkRoomProxy] SOCKS5 connection failed:', err)
          client.destroy()
        })
    })

    return new Promise((resolve, reject) => {
      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as net.AddressInfo
        this.localPort = addr.port
        resolve(this.localPort)
      })
      this.server!.on('error', reject)
    })
  }

  stop() {
    this.server?.close()
    this.server = null
    this.localPort = 0
  }

  // ── SOCKS5 handshake (no auth) ────────────────────────────────────────────
  private _connectViaSocks5(): Promise<net.Socket> {
    const onionAddr = this.onionAddr
    const socksPort = this.torSocksPort

    return new Promise((resolve, reject) => {
      const socket = net.connect(socksPort, '127.0.0.1')
      socket.on('error', reject)
      // Set a long timeout (60s) for Tor to build circuits to new hidden services
      socket.setTimeout(60_000, () => {
        socket.destroy()
        reject(new Error('SOCKS5 connection timed out'))
      })

      let state: 'greeting' | 'connecting' | 'done' = 'greeting'
      let buf = Buffer.alloc(0)

      socket.once('connect', () => {
        // SOCKS5 greeting: [VER=5, NMETHODS=1, METHOD=0 (no auth)]
        socket.write(Buffer.from([0x05, 0x01, 0x00]))
      })

      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk])

        if (state === 'greeting' && buf.length >= 2) {
          if (buf[0] !== 0x05 || buf[1] !== 0x00) {
            socket.destroy()
            reject(new Error('SOCKS5: auth rejected'))
            return
          }
          buf = buf.subarray(2)
          state = 'connecting'

          // SOCKS5 CONNECT for .onion domain
          const host = Buffer.from(onionAddr, 'ascii')
          const req = Buffer.allocUnsafe(5 + host.length + 2)
          req[0] = 0x05 // VER
          req[1] = 0x01 // CMD = CONNECT
          req[2] = 0x00 // RSV
          req[3] = 0x03 // ATYP = domain
          req[4] = host.length
          host.copy(req, 5)
          req.writeUInt16BE(80, 5 + host.length)
          socket.write(req)
          return
        }

        if (state === 'connecting' && buf.length >= 4) {
          if (buf[1] !== 0x00) {
            socket.destroy()
            reject(new Error(`SOCKS5: connect error code ${buf[1]}`))
            return
          }

          // Calculate actual SOCKS5 response length based on ATYP
          let respLen: number
          switch (buf[3]) {
            case 0x01: respLen = 10; break        // IPv4: 4 header + 4 addr + 2 port
            case 0x04: respLen = 22; break        // IPv6: 4 header + 16 addr + 2 port
            case 0x03:                            // Domain: 4 header + 1 len + N + 2 port
              if (buf.length < 5) return          // need at least 5 bytes to read domain length
              respLen = 7 + buf[4]
              break
            default:   respLen = 10; break
          }

          if (buf.length < respLen) return         // wait for full response

          // SOCKS5 response consumed — socket is now a transparent tunnel
          state = 'done'
          socket.setTimeout(0)

          // Any bytes after the SOCKS5 response header belong to the
          // application; put them back on the stream.
          const leftover = buf.subarray(respLen)
          buf = Buffer.alloc(0)

          // Pause the socket BEFORE removing listeners to prevent data loss.
          // The stream is in flowing mode due to the 'data' listener; removing
          // it without pausing first leaves a gap where incoming bytes are
          // silently discarded before .pipe() is established by the caller.
          socket.pause()
          socket.removeAllListeners('data')

          if (leftover.length > 0) {
            // Push leftover bytes back so the next consumer (ws) sees them
            socket.unshift(leftover)
          }

          resolve(socket)
        }
      })
    })
  }
}

export const darkRoomProxy = new DarkRoomProxy(19051)
