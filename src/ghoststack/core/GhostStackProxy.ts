/**
 * GhostStack Local Proxy
 * An in-memory HTTP CONNECT proxy that lives inside the Electron process.
 * When Chromium navigates to a blocked domain, traffic flows through this proxy.
 * The proxy resolves the real IP via DoH, then connects directly to it
 * while fragmenting the TLS ClientHello to evade DPI (SplitCast).
 *
 * No external binaries. No VPN. No Tor. Pure Node.js.
 * @module GhostStackProxy
 */

import * as http from 'http'
import * as net from 'net'
import type { SessionCache } from './SessionCache'
import { WorkerTunnel } from './network/WorkerTunnel'

/** Proxy status */
export interface ProxyStatus {
  running: boolean
  port: number
  tunnelsActive: number
  totalTunneled: number
}

/**
 * GhostStack Local Proxy — the real bypass engine.
 * Runs a tiny CONNECT proxy on 127.0.0.1 that:
 * 1. Intercepts Chromium's outgoing connections
 * 2. Resolves real IPs via the SessionCache (DoH-resolved)
 * 3. Fragments TLS ClientHello across multiple TCP writes to evade DPI
 * 4. Pipes the remaining traffic transparently
 */
export class GhostStackProxy {
  private server: http.Server | null = null
  private port = 0
  private activeTunnels = 0
  private totalTunneled = 0
  private cache: SessionCache
  private resolveIP: ((domain: string) => Promise<string | null>) | null = null
  /** Map of domain -> alternative port that bypasses the firewall */
  private portOverrides: Map<string, number> = new Map()

  /** Cloudflare's alternative HTTPS ports that most firewalls don't inspect */
  private static readonly ALT_PORTS = [8443, 2053, 2083, 2087, 2096]

  /** Cloudflare IPv4 ranges (first two octets) */
  private static readonly CF_RANGES = [
    '104.16', '104.17', '104.18', '104.19', '104.20', '104.21', '104.22',
    '104.23', '104.24', '104.25', '104.26', '104.27',
    '172.64', '172.65', '172.66', '172.67',
    '141.101', '162.158', '190.93', '188.114',
    '197.234', '198.41'
  ]

  constructor(cache: SessionCache) {
    this.cache = cache
  }

  /**
   * Set the IP resolver function (from GhostStackOrchestrator).
   * This allows the proxy to resolve domains via DoH.
   */
  setIPResolver(resolver: (domain: string) => Promise<string | null>): void {
    this.resolveIP = resolver
  }

  /**
   * Start the proxy on a random local port.
   * @returns The port number the proxy is listening on
   */
  async start(): Promise<number> {
    if (this.server) return this.port

    return new Promise((resolve, reject) => {
      this.server = http.createServer((_req, res) => {
        // We only handle CONNECT tunnels, reject plain HTTP
        res.writeHead(405)
        res.end('GhostStack proxy only supports CONNECT tunnels')
      })

      // Handle CONNECT method — this is where the magic happens
      this.server.on('connect', (req, clientSocket, head) => {
        this.handleConnect(req, clientSocket as net.Socket, head)
      })

      this.server.on('error', (err) => {
        console.error('[GhostStack Proxy] Server error:', err.message)
      })

      // Listen on random port, localhost only
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as net.AddressInfo
        this.port = addr.port
        console.log(`[GhostStack Proxy] Running on 127.0.0.1:${this.port}`)
        resolve(this.port)
      })

      this.server.on('error', (err) => {
        reject(err)
      })
    })
  }

  /**
   * Handle a CONNECT tunnel request from Chromium.
   * This is the core bypass logic:
   * 1. Extract target domain:port
   * 2. Look up bypass IP from cache, or resolve via DoH
   * 3. Connect to real IP
   * 4. Fragment the first TLS ClientHello write to evade DPI
   * 5. Pipe the rest transparently
   */
  private async handleConnect(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer
  ): Promise<void> {
    const [host, portStr] = (req.url || '').split(':')
    const port = parseInt(portStr, 10) || 443
    const domain = host

    if (!domain) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      return
    }

    // Skip proxy for localhost and local network
    if (
      domain === '127.0.0.1' ||
      domain === 'localhost' ||
      domain.startsWith('192.168.') ||
      domain.startsWith('10.') ||
      domain.endsWith('.local')
    ) {
      this.directTunnel(domain, port, clientSocket, head)
      return
    }

    try {
      // Step 1: Find the real IP — check cache first, then resolve via DoH
      let targetIP: string | null = null

      const cachedIP = this.cache.getIP(domain)
      if (cachedIP) {
        targetIP = cachedIP.ip
      } else if (this.resolveIP) {
        targetIP = await this.resolveIP(domain)
      }

      // If we have a real IP, connect to it directly (bypassing DNS hijack)
      const connectTo = targetIP || domain

      // Check if we have a port override (alternative port that bypasses the firewall)
      const overridePort = this.portOverrides.get(domain)
      const connectPort = overridePort || port
      
      if (targetIP) {
        console.log(`[GhostStack Proxy] ${domain} -> direct IP ${targetIP}:${connectPort}${overridePort ? ' (ALT PORT)' : ''}`)
      }

      // Check if we should use the Worker Tunnel bypass

      // if (bypass?.engine === 'tunnel') {
      //   console.log(`[GhostStack Proxy] ${domain} -> Routing through Worker Tunnel...`)
      //   try {
      //     const WORKER_URL = 'https://lingering-butterfly-0459.goyalashish367.workers.dev'
      //     const workerStream = await WorkerTunnel.establishRawTunnel(domain, port, WORKER_URL)
          
      //     clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      //     this.activeTunnels++
      //     this.totalTunneled++

      //     if (head.length > 0) {
      //       workerStream.write(head)
      //     }

      //     clientSocket.pipe(workerStream)
      //     workerStream.pipe(clientSocket)

      //     const cleanup = () => {
      //       this.activeTunnels = Math.max(0, this.activeTunnels - 1)
      //       clientSocket.destroy()
      //       workerStream.destroy()
      //     }

      //     clientSocket.on('error', cleanup)
      //     clientSocket.on('end', cleanup)
      //     workerStream.on('error', cleanup)
      //     workerStream.on('end', cleanup)
      //     return
      //   } catch (err: any) {
      //     console.error(`[GhostStack Proxy] Worker Tunnel to ${domain}:${port} failed:`, err.message)
      //     clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      //     return
      //   }
      // }


      // Default logic: Open TCP connection to the real server
      const serverSocket = net.connect(connectPort, connectTo, () => {
        // CRITICAL: Disable Nagle's algorithm so each write() = separate TCP segment
        serverSocket.setNoDelay(true)
        
        // Tell Chromium the tunnel is open
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')

        this.activeTunnels++
        this.totalTunneled++

        // Write the initial head chunk if provided
        if (head.length > 0) {
          serverSocket.write(head)
        }

        // Apply DPI Evasion unconditionally to ALL traffic!
        // This fragments the TLS ClientHello so DPI systems cannot read the SNI domain.
        console.log(`[GhostStack Proxy] ${domain} -> Applying Native SplitCast (1B+50ms)`)
        let isFirstChunk = true
        
        clientSocket.on('data', (chunk) => {
          if (isFirstChunk && chunk.length > 10 && chunk[0] === 0x16) { // 0x16 is TLS Handshake
            isFirstChunk = false
            const splitPoint = 1
            const delay = 50
            
            const chunk1 = chunk.subarray(0, splitPoint)
            const chunk2 = chunk.subarray(splitPoint)
            
            serverSocket.write(chunk1)
            setTimeout(() => {
              if (!serverSocket.destroyed) serverSocket.write(chunk2)
            }, delay)
          } else {
            if (!serverSocket.destroyed) serverSocket.write(chunk)
          }
        })
        serverSocket.pipe(clientSocket)

        const cleanup = () => {
          this.activeTunnels = Math.max(0, this.activeTunnels - 1)
          clientSocket.destroy()
          serverSocket.destroy()
        }

        clientSocket.on('error', cleanup)
        clientSocket.on('end', cleanup)
        serverSocket.on('error', cleanup)
        serverSocket.on('end', cleanup)
      })

      serverSocket.on('error', (err) => {
        console.error(`[GhostStack Proxy] Connect to ${connectTo}:${port} failed:`, err.message)
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      })

      serverSocket.setTimeout(10000, () => {
        serverSocket.destroy()
        clientSocket.end('HTTP/1.1 504 Gateway Timeout\r\n\r\n')
      })
    } catch (err: any) {
      console.error(`[GhostStack Proxy] Tunnel error for ${domain}:`, err.message)
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    }
  }

  /**
  /**
   * Direct tunnel without fragmentation (for localhost/local network).
   */
  private directTunnel(host: string, port: number, clientSocket: net.Socket, head: Buffer): void {
    const serverSocket = net.connect(port, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) serverSocket.write(head)
      clientSocket.pipe(serverSocket)
      serverSocket.pipe(clientSocket)
    })

    serverSocket.on('error', () => {
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    })
  }

  /**
   * Get proxy status.
   */
  getStatus(): ProxyStatus {
    return {
      running: this.server !== null,
      port: this.port,
      tunnelsActive: this.activeTunnels,
      totalTunneled: this.totalTunneled
    }
  }

  /**
   * Get the proxy URL for Electron session configuration.
   */
  getProxyURL(): string {
    return `http://127.0.0.1:${this.port}`
  }

  /**
   * Stop the proxy.
   */
  /**
   * Probe alternative ports for a domain.
   * Cloudflare supports HTTPS on ports 2053, 2083, 2087, 2096, 8443.
   * Most firewalls only inspect port 443, so these bypass MITM inspection.
   * @returns The working alternative port, or null if none work
   */
  async probeAlternativePorts(domain: string): Promise<number | null> {
    // Get the IP for this domain
    let ip: string | null = null
    const cached = this.cache.getIP(domain)
    if (cached) {
      ip = cached.ip
    } else if (this.resolveIP) {
      ip = await this.resolveIP(domain)
    }

    if (!ip) return null

    // Only try alternative ports for Cloudflare IPs
    const isCloudflare = GhostStackProxy.CF_RANGES.some(range => ip!.startsWith(range))
    if (!isCloudflare) {
      console.log(`[GhostStack Proxy] ${domain} (${ip}) is not Cloudflare, skipping alt ports`)
      return null
    }

    console.log(`[GhostStack Proxy] Probing alternative ports for ${domain} (${ip})...`)

    // Try each alternative port
    for (const altPort of GhostStackProxy.ALT_PORTS) {
      try {
        const works = await this.testPort(ip, domain, altPort)
        if (works) {
          console.log(`[GhostStack Proxy] ✓ Port ${altPort} works for ${domain}!`)
          this.portOverrides.set(domain, altPort)
          return altPort
        }
      } catch {
        // Port failed, try next
      }
    }

    console.log(`[GhostStack Proxy] ✗ No alternative ports work for ${domain}`)
    return null
  }

  /**
   * Test if a specific port works for a domain by doing a TLS handshake.
   * If the handshake succeeds and the certificate matches, the port works.
   */
  private testPort(ip: string, domain: string, port: number): Promise<boolean> {
    const tls = require('tls')
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 4000)
      try {
        const socket = tls.connect({
          host: ip,
          port,
          servername: domain,
          rejectUnauthorized: false,
          timeout: 4000,
          ALPNProtocols: ['h2', 'http/1.1']
        }, () => {
          clearTimeout(timer)
          // Check if the certificate is from the real server (not MITM)
          const cert = socket.getPeerCertificate()
          const issuer = cert?.issuer?.O || ''
          const isMITM = issuer.toLowerCase().includes('sophos') ||
                         issuer.toLowerCase().includes('fortinet') ||
                         issuer.toLowerCase().includes('zscaler') ||
                         issuer.toLowerCase().includes('bluecoat') ||
                         issuer.toLowerCase().includes('barracuda')
          socket.destroy()
          if (isMITM) {
            console.log(`[GhostStack Proxy] Port ${port}: MITM detected (${issuer})`)
            resolve(false)
          } else {
            resolve(true)
          }
        })
        socket.on('error', () => { clearTimeout(timer); resolve(false) })
        socket.on('timeout', () => { clearTimeout(timer); socket.destroy(); resolve(false) })
      } catch { clearTimeout(timer); resolve(false) }
    })
  }

  /**
   * Check if a port override exists for a domain.
   */
  hasPortOverride(domain: string): boolean {
    return this.portOverrides.has(domain)
  }

  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
      this.port = 0
    }
  }
}
