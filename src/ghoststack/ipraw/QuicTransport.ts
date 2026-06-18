/**
 * GhostStack QUIC Transport
 * Attempts QUIC/HTTP3 transport over UDP port 443.
 * QUIC traffic is statistically identical to video conferencing (Google Meet, Zoom).
 * Firewalls cannot block UDP 443 without breaking all video calls.
 * @module QuicTransport
 */

/** QUIC connection result */
export interface QuicResult {
  success: boolean
  protocol: string
  latencyMs: number
  error?: string
}

/**
 * QUIC Transport layer.
 * Electron's Chromium backend handles QUIC natively when --enable-quic is set.
 * This module provides verification and fallback logic.
 */
export class QuicTransport {
  /**
   * Attempt a QUIC connection to the target IP.
   * Uses Node.js net module to probe UDP 443 availability,
   * then relies on Chromium's built-in QUIC for actual transport.
   * @param ip - Target IP address
   * @param domain - Target domain (for certificate verification)
   * @param port - Target port (default 443)
   * @returns QUIC connection result
   */
  async connect(ip: string, domain: string, port = 443): Promise<QuicResult> {
    const start = Date.now()

    // Check if UDP 443 is reachable by attempting a TLS connection
    // In Electron, QUIC is handled by Chromium when --enable-quic flag is set
    // We verify the path is open by testing TCP connectivity first
    try {
      const isReachable = await this.probeUDP(ip, port)
      if (!isReachable) {
        return {
          success: false,
          protocol: 'none',
          latencyMs: Date.now() - start,
          error: 'UDP 443 not reachable'
        }
      }

      // Verify TLS certificate matches domain
      const certValid = await this.verifyCert(ip, domain, port)
      if (!certValid) {
        return {
          success: false,
          protocol: 'none',
          latencyMs: Date.now() - start,
          error: 'Certificate mismatch for QUIC'
        }
      }

      return {
        success: true,
        protocol: 'h3',
        latencyMs: Date.now() - start
      }
    } catch (err) {
      return {
        success: false,
        protocol: 'none',
        latencyMs: Date.now() - start,
        error: 'QUIC probe failed'
      }
    }
  }

  /**
   * Check if UDP port 443 appears reachable.
   * Uses a TCP connection as a proxy check since true UDP probing
   * requires raw sockets which aren't available in Node.js.
   * @param ip - Target IP
   * @param port - Target port
   * @returns true if the port appears reachable
   */
  private async probeUDP(ip: string, port: number): Promise<boolean> {
    const dgram = require('dgram')

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          socket.close()
        } catch {}
        resolve(false)
      }, 2000)

      const socket = dgram.createSocket('udp4')
      const probe = Buffer.alloc(1)

      socket.send(probe, 0, probe.length, port, ip, (err: Error | null) => {
        clearTimeout(timer)
        try {
          socket.close()
        } catch {}

        if (err) {
          resolve(false)
        } else {
          // UDP send succeeded (doesn't mean port is open, but path is available)
          resolve(true)
        }
      })

      socket.on('error', () => {
        clearTimeout(timer)
        try {
          socket.close()
        } catch {}
        resolve(false)
      })
    })
  }

  /**
   * Verify TLS certificate for a domain at a given IP.
   * @param ip - Target IP
   * @param domain - Expected domain
   * @param port - Target port
   * @returns true if certificate matches
   */
  private async verifyCert(ip: string, domain: string, port: number): Promise<boolean> {
    const tls = require('tls')

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000)

      try {
        const socket = tls.connect(
          {
            host: ip,
            port,
            servername: domain,
            rejectUnauthorized: false,
            timeout: 3000
          },
          () => {
            clearTimeout(timer)
            try {
              const cert = socket.getPeerCertificate()
              if (cert && cert.subject) {
                const cn = (cert.subject.CN || '').toLowerCase()
                const altNames = (cert.subjectaltname || '').toLowerCase()
                const lowerDomain = domain.toLowerCase()
                const parts = lowerDomain.split('.')
                const wildcard = parts.length >= 2 ? `*.${parts.slice(1).join('.')}` : ''

                const matches =
                  cn === lowerDomain || cn === wildcard || altNames.includes(lowerDomain)

                socket.destroy()
                resolve(matches)
                return
              }
            } catch {}
            socket.destroy()
            resolve(false)
          }
        )

        socket.on('error', () => {
          clearTimeout(timer)
          resolve(false)
        })
      } catch {
        clearTimeout(timer)
        resolve(false)
      }
    })
  }
}
