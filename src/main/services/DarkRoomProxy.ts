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
import { is } from '@electron-toolkit/utils'
import path from 'path'
import fs from 'fs'

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'darkroom_config.json')

interface DarkRoomConfig {
  onionAddr: string
}

export function saveOnionAddr(addr: string): void {
  const cfg: DarkRoomConfig = { onionAddr: addr.trim() }
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg), 'utf-8')
}

function loadBundledOnionAddr(): string {
  try {
    const bundledPath = is.dev
      ? path.join(process.cwd(), 'resources', 'darkroom.json')
      : path.join(process.resourcesPath, 'darkroom.json')
    const raw = fs.readFileSync(bundledPath, 'utf-8')
    const cfg: DarkRoomConfig = JSON.parse(raw)
    return cfg.onionAddr?.trim() || ''
  } catch {
    return ''
  }
}

export function loadOnionAddr(): string {
  // User-saved config (manual override) takes priority
  try {
    const raw = fs.readFileSync(CONFIG_PATH(), 'utf-8')
    const cfg: DarkRoomConfig = JSON.parse(raw)
    if (cfg.onionAddr?.trim()) return cfg.onionAddr.trim()
  } catch {}
  // Fall back to the address baked in by the developer at build time
  return loadBundledOnionAddr()
}

// ── Proxy server ──────────────────────────────────────────────────────────────
class DarkRoomProxy {
  private server: net.Server | null = null
  private localPort = 0
  private torSocksPort: number
  private onionAddr: string

  constructor(torSocksPort: number) {
    this.torSocksPort = torSocksPort
    this.onionAddr = loadOnionAddr()
  }

  setOnionAddr(addr: string) {
    this.onionAddr = addr
    saveOnionAddr(addr)
  }

  getOnionAddr() { return this.onionAddr }
  getLocalPort() { return this.localPort }

  start(): Promise<number> {
    if (this.server) return Promise.resolve(this.localPort)

    this.server = net.createServer((client) => {
      client.on('error', () => {})

      this._connectViaSocks5()
        .then((torSocket) => {
          client.pipe(torSocket)
          torSocket.pipe(client)
          client.on('close', () => torSocket.destroy())
          torSocket.on('close', () => client.destroy())
          torSocket.on('error', () => client.destroy())
        })
        .catch(() => client.destroy())
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
      socket.setTimeout(30_000, () => {
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
          const req  = Buffer.allocUnsafe(5 + host.length + 2)
          req[0] = 0x05  // VER
          req[1] = 0x01  // CMD = CONNECT
          req[2] = 0x00  // RSV
          req[3] = 0x03  // ATYP = domain
          req[4] = host.length
          host.copy(req, 5)
          req.writeUInt16BE(80, 5 + host.length)
          socket.write(req)
          return
        }

        if (state === 'connecting' && buf.length >= 10) {
          if (buf[1] !== 0x00) {
            socket.destroy()
            reject(new Error(`SOCKS5: connect error code ${buf[1]}`))
            return
          }
          // SOCKS5 response consumed — socket is now a transparent tunnel
          state = 'done'
          socket.setTimeout(0)

          // Any bytes after the 10-byte SOCKS5 response header belong to the
          // application; put them back on the stream.
          const leftover = buf.subarray(10)
          buf = Buffer.alloc(0)

          socket.removeAllListeners('data')

          if (leftover.length > 0) {
            // Emit leftover so the next consumer (ws) sees it
            socket.unshift(leftover)
          }

          resolve(socket)
        }
      })
    })
  }
}

export const darkRoomProxy = new DarkRoomProxy(19051)
