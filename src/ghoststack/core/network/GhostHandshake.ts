import * as tls from 'tls'
import * as net from 'net'
import * as https from 'https'
import { Duplex } from 'stream'
import { queryDoH } from '../../dns/DoHClient'

/**
 * FragmentedSocket
 *
 * A Duplex stream wrapper around a raw TCP socket.
 * Intercepts the FIRST write (TLS ClientHello) and splits it into
 * two separate TCP segments with a timing gap.
 * This defeats DPI engines (Sophos, Fortinet, etc.) that inspect
 * the SNI field in the ClientHello — they can't reassemble
 * fragmented packets in real-time and default to forwarding.
 *
 * TCP_NODELAY must be set on the underlying socket to ensure
 * each write() becomes a separate TCP packet (disables Nagle).
 */
class FragmentedSocket extends Duplex {
  private tcpSocket: net.Socket
  private isFirstWrite = true
  private splitPos: number
  private gapMs: number

  constructor(tcpSocket: net.Socket, splitPos: number, gapMs: number) {
    super({ allowHalfOpen: true })
    this.tcpSocket = tcpSocket
    this.splitPos = splitPos
    this.gapMs = gapMs

    tcpSocket.on('data', (data) => {
      if (!this.push(data)) tcpSocket.pause()
    })
    tcpSocket.on('end', () => this.push(null))
    tcpSocket.on('close', () => this.destroy())
    tcpSocket.on('error', (err) => this.destroy(err))
  }

  _read(): void {
    this.tcpSocket.resume()
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (err?: Error | null) => void): void {
    if (this.isFirstWrite && Buffer.isBuffer(chunk) && chunk.length > this.splitPos) {
      this.isFirstWrite = false
      const part1 = chunk.subarray(0, this.splitPos)
      const part2 = chunk.subarray(this.splitPos)

      console.log(
        `[GhostStack/Fragment] ClientHello split: ${part1.length}+${part2.length} bytes, ${this.gapMs}ms gap`
      )

      this.tcpSocket.write(part1, () => {
        setTimeout(() => {
          if (!this.tcpSocket.destroyed && this.tcpSocket.writable) {
            this.tcpSocket.write(part2, callback)
          } else {
            callback(new Error('Socket destroyed during fragment delay'))
          }
        }, this.gapMs)
      })
    } else {
      if (!this.tcpSocket.destroyed && this.tcpSocket.writable) {
        this.tcpSocket.write(chunk, callback)
      } else {
        callback(new Error('Socket not writable'))
      }
    }
  }

  _final(callback: (err?: Error | null) => void): void {
    if (!this.tcpSocket.destroyed && this.tcpSocket.writable) {
      try {
        this.tcpSocket.end(callback)
      } catch (e) {
        callback()
      }
    } else {
      callback()
    }
  }

  _destroy(err: Error | null, callback: (err?: Error | null) => void): void {
    if (!this.tcpSocket.destroyed) {
      this.tcpSocket.destroy()
    }
    callback(err)
  }
}

/**
 * Raw TLS DoH resolver — connects directly to DoH servers by IP address
 * using Node.js HTTPS, completely bypassing Electron's network stack and
 * any ISP interference. This is the nuclear option when Electron's net.request fails.
 */
async function rawDoHResolve(domain: string, timeout = 4000): Promise<string | null> {
  // Try Cloudflare (1.1.1.1) first, then Google (8.8.8.8)
  const servers = [
    {
      ip: '1.1.1.1',
      path: `/dns-query?name=${encodeURIComponent(domain)}&type=A`,
      host: '1.1.1.1'
    },
    { ip: '8.8.8.8', path: `/resolve?name=${encodeURIComponent(domain)}&type=A`, host: '8.8.8.8' }
  ]

  for (const server of servers) {
    try {
      const ip = await new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), timeout)

        const req = https.request(
          {
            hostname: server.ip,
            port: 443,
            path: server.path,
            method: 'GET',
            headers: {
              Accept: 'application/dns-json',
              Host: server.host
            },
            rejectUnauthorized: false,
            // Connect by IP — no DNS lookup needed
            servername: server.host
          },
          (res) => {
            let body = ''
            res.on('data', (chunk: Buffer) => {
              body += chunk.toString()
            })
            res.on('end', () => {
              clearTimeout(timer)
              try {
                const json = JSON.parse(body)
                if (json.Status === 0 && json.Answer) {
                  for (const answer of json.Answer) {
                    if (answer.type === 1) {
                      // A record
                      resolve(answer.data)
                      return
                    }
                  }
                }
                // Status 3 = NXDOMAIN — domain genuinely doesn't exist
                if (json.Status === 3) {
                  resolve(null)
                  return
                }
              } catch {}
              resolve(null)
            })
            res.on('error', () => {
              clearTimeout(timer)
              resolve(null)
            })
          }
        )

        req.on('error', () => {
          clearTimeout(timer)
          resolve(null)
        })
        req.end()
      })

      if (ip) {
        console.log(`[GhostStack/Handshake] RawDoH resolved ${domain} → ${ip} via ${server.ip}`)
        return ip
      }
    } catch {
      // Try next server
    }
  }
  return null
}

/**
 * GhostHandshake — DPI-Evasion TLS Connection Factory
 *
 * 1. Resolves the real IP via DoH (bypasses DNS hijacking by Sophos).
 * 2. Opens a raw TCP socket to the REAL IP with TCP_NODELAY.
 * 3. Wraps it in a FragmentedSocket that splits the TLS ClientHello.
 * 4. Sophos's transparent proxy can't read the SNI → forwards transparently.
 * 5. The real server (Cloudflare/etc) reassembles and completes the handshake.
 *
 * Tries multiple fragmentation strategies (split positions & delays).
 */
export class GhostHandshake {
  /** Strategies to try in order — different split positions and delays */
  private static STRATEGIES: Array<{
    splitPos: number
    gapMs: number
    name: string
    suppressSNI?: boolean
  }> = [
    { splitPos: 1, gapMs: 50, name: '1B+50ms' },
    { splitPos: 5, gapMs: 100, name: '5B+100ms' },
    { splitPos: 3, gapMs: 30, name: '3B+30ms' },
    // Last resort: send no SNI at all — defeats keyword-based DPI that matches on domain name in
    // the ClientHello (e.g. "porn-cdn", "xxx"). Server routes via HTTP Host header instead.
    { splitPos: 9999, gapMs: 0, name: 'no-SNI', suppressSNI: true }
  ]

  /** Cache of resolved IPs to avoid re-resolving on every sub-resource */
  private static ipCache: Map<string, { ip: string; ts: number }> = new Map()
  private static IP_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  /**
   * Get the last resolved IP for a domain (for GhostEngine to use).
   */
  static getResolvedIP(domain: string): string | null {
    const entry = this.ipCache.get(domain)
    if (!entry) return null
    if (Date.now() - entry.ts > this.IP_CACHE_TTL) {
      this.ipCache.delete(domain)
      return null
    }
    return entry.ip
  }

  /**
   * Establishes a trusted TLS connection with DPI evasion.
   */
  static async establishTrustedConnection(
    targetDomain: string,
    port: number = 443
  ): Promise<tls.TLSSocket> {
    console.log(`[GhostStack/Handshake] Initiating bypass for ${targetDomain}:${port}`)

    // If the target is already an IP address, skip DNS resolution entirely
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(targetDomain)) {
      return this.tryStrategies(targetDomain, port, targetDomain)
    }

    // Check IP cache first
    const cachedIP = this.getResolvedIP(targetDomain)
    if (cachedIP) {
      console.log(`[GhostStack/Handshake] Using cached IP for ${targetDomain} → ${cachedIP}`)
      return this.tryStrategies(cachedIP, port, targetDomain)
    }

    // Step 1: Resolve real IP via DoH (bypass DNS hijacking)
    // Try multiple resolution methods in order of reliability
    let realIP: string | null = null

    // Method 1: Electron's net.request DoH (fast, but can be ISP-interfered)
    try {
      const results = await queryDoH(targetDomain, 'cloudflare', 3000)
      if (results.length > 0) {
        realIP = results[0].ip
        console.log(`[GhostStack/Handshake] DoH resolved ${targetDomain} → ${realIP}`)
      }
    } catch {
      console.warn(`[GhostStack/Handshake] Cloudflare DoH failed`)
    }

    if (!realIP) {
      try {
        const results = await queryDoH(targetDomain, 'google', 3000)
        if (results.length > 0) {
          realIP = results[0].ip
          console.log(`[GhostStack/Handshake] Google DoH resolved ${targetDomain} → ${realIP}`)
        }
      } catch {
        console.warn(`[GhostStack/Handshake] Google DoH also failed`)
      }
    }

    // Method 2: Raw TLS DoH — connects to 1.1.1.1/8.8.8.8 by IP using Node.js HTTPS directly.
    // This bypasses Electron's network stack and any ISP interference with DoH.
    // Critical for ISPs like Jio that may interfere with Electron's net.request.
    if (!realIP) {
      console.log(
        `[GhostStack/Handshake] Electron DoH failed for ${targetDomain}, trying raw TLS DoH...`
      )
      realIP = await rawDoHResolve(targetDomain)
    }

    // If DoH resolved successfully, cache the IP
    if (realIP) {
      this.ipCache.set(targetDomain, { ip: realIP, ts: Date.now() })
    }

    if (!realIP) {
      // Domain genuinely doesn't exist or all DoH servers are unreachable
      console.error(
        `[GhostStack/Handshake] ❌ All DoH resolvers failed for ${targetDomain}. Domain may not exist.`
      )
      throw new Error(`DNS resolution failed for ${targetDomain} — domain may not exist`)
    }

    // Step 2: Try fragmentation strategies using the resolved IP
    return this.tryStrategies(realIP, port, targetDomain)
  }

  /**
   * Try all fragmentation strategies with a given host.
   */
  private static async tryStrategies(
    connectHost: string,
    port: number,
    sniDomain: string
  ): Promise<tls.TLSSocket> {
    let lastError: Error | null = null
    for (const strategy of this.STRATEGIES) {
      try {
        const socket = await this.connectFragmented(
          connectHost,
          port,
          sniDomain,
          strategy.splitPos,
          strategy.gapMs,
          strategy.suppressSNI
        )
        console.log(`[GhostStack/Handshake] ✅ TLS established via strategy ${strategy.name}`)
        return socket
      } catch (err) {
        lastError = err as Error
        console.warn(
          `[GhostStack/Handshake] Strategy ${strategy.name} failed: ${(err as Error).message}`
        )
      }
    }

    throw lastError || new Error('All DPI bypass strategies failed')
  }

  /**
   * Attempt a single fragmented TLS connection.
   */
  private static connectFragmented(
    host: string,
    port: number,
    sni: string,
    splitPos: number,
    gapMs: number,
    suppressSNI = false
  ): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const tcpSocket = net.connect({ host, port })

      // CRITICAL: Disable Nagle's algorithm so each write() = separate TCP packet
      tcpSocket.setNoDelay(true)

      const tcpTimeout = setTimeout(() => {
        tcpSocket.destroy()
        reject(new Error('TCP Connection Timeout'))
      }, 6000)

      tcpSocket.once('connect', () => {
        clearTimeout(tcpTimeout)

        // Wrap in fragmenting Duplex stream
        const wrapper = new FragmentedSocket(tcpSocket, splitPos, gapMs)

        const tlsSocket = tls.connect(
          {
            socket: wrapper as any,
            servername: suppressSNI ? undefined : sni,
            rejectUnauthorized: false,
            ALPNProtocols: ['http/1.1']
          },
          () => {
            // Clear TLS timeout on success
            tlsSocket.setTimeout(0)
            resolve(tlsSocket)
          }
        )

        tlsSocket.on('error', (err) => {
          reject(err)
        })

        tlsSocket.setTimeout(8000, () => {
          tlsSocket.destroy()
          reject(new Error('TLS Handshake Timeout'))
        })
      })

      tcpSocket.on('error', (err) => {
        clearTimeout(tcpTimeout)
        reject(err)
      })
    })
  }
}
