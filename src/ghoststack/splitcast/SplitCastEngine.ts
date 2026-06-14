/**
 * GhostStack SplitCast Bypass Engine
 * Splits TLS handshake into fragments to evade DPI pattern matching.
 * Uses TCP segmentation — a real, proven DPI evasion technique.
 * @module SplitCastEngine
 */

import { FragmentEncoder } from './FragmentEncoder'

/** SplitCast options */
export interface SplitCastOptions {
  fragmentCount: 3 | 5 | 7
}

/** SplitCast result */
export interface SplitCastResult {
  success: boolean
  method: string
  latencyMs: number
  error?: string
}

/**
 * SplitCast Engine — TCP segmentation DPI evasion.
 * Fragments the TLS Client Hello across multiple TCP segments.
 * Firewall DPI cannot reassemble and inspect the full handshake.
 */
export class SplitCastEngine {
  private fragmentEncoder: FragmentEncoder

  constructor() {
    this.fragmentEncoder = new FragmentEncoder()
  }

  /**
   * Attempt to bypass a block using TCP segmentation.
   * Fragments the TLS handshake so DPI cannot read the SNI field.
   * @param ip - Real IP address
   * @param domain - Target domain
   * @param url - Full URL to fetch
   * @param options - SplitCast options
   * @returns Bypass result
   */
  async bypass(
    ip: string,
    domain: string,
    _url: string,
    options: SplitCastOptions
  ): Promise<SplitCastResult> {
    const start = Date.now()

    // Strategy 1: TCP segmentation of TLS Client Hello
    try {
      const result = await this.tcpSegmentedConnect(ip, domain, options.fragmentCount)
      if (result) {
        return {
          success: true,
          method: `TCP_SEGMENT_${options.fragmentCount}`,
          latencyMs: Date.now() - start
        }
      }
    } catch {
      // Segmentation failed
    }

    // Strategy 2: retry with maximum fragments — some DPI systems fail to
    // reassemble beyond a certain segment count even when fewer fragments pass
    const fallbackCount = options.fragmentCount === 7 ? 3 : 7
    try {
      const result2 = await this.tcpSegmentedConnect(ip, domain, fallbackCount)
      if (result2) {
        return {
          success: true,
          method: `TCP_SEGMENT_${fallbackCount}_FALLBACK`,
          latencyMs: Date.now() - start
        }
      }
    } catch {
      // Fallback segmentation failed
    }

    return {
      success: false,
      method: 'NONE',
      latencyMs: Date.now() - start,
      error: 'All SplitCast methods failed'
    }
  }

  /**
   * Connect to target using TCP segmentation.
   * Splits the TLS Client Hello into small segments that DPI cannot reassemble.
   * @param ip - Target IP
   * @param domain - Target domain
   * @param segments - Number of segments to split into
   * @returns true if connection succeeded
   */
  private async tcpSegmentedConnect(
    ip: string,
    domain: string,
    segments: number
  ): Promise<boolean> {
    const net = require('net')

    return new Promise((resolve) => {
      let done = false
      let socket: import('net').Socket | undefined

      const finish = (result: boolean): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        socket?.destroy()
        resolve(result)
      }

      const timer = setTimeout(() => finish(false), 8000)  // bug 3: destroy on timeout

      try {
        // Create raw TCP socket
        const s = new net.Socket()
        socket = s  // expose to finish() for cleanup
        s.setNoDelay(true) // Disable Nagle's algorithm for precise segmentation

        s.connect(443, ip, () => {
          // Build a TLS Client Hello manually
          const clientHello = this.buildMinimalClientHello(domain)

          // Split the Client Hello into N segments
          const fragments = this.fragmentEncoder.fragment(clientHello, segments)

          // Send each fragment as a separate TCP segment
          let fragmentIndex = 0
          const sendNext = (): void => {
            if (done || fragmentIndex >= fragments.length) return  // bug 2: stop if done

            const fragment = fragments[fragmentIndex++]
            s.write(fragment, () => {
              // Small random delay between fragments to prevent reassembly
              const delay = Math.floor(Math.random() * 50) + 10
              setTimeout(sendNext, delay)
            })
          }

          // bug 1: 0x16 = TLS Handshake (ServerHello) — anything else is a rejection
          s.once('data', (data: Buffer) => {
            finish(data.length > 0 && data[0] === 0x16)
          })

          sendNext()
        })

        s.on('error', () => finish(false))
        s.on('timeout', () => finish(false))
        s.setTimeout(8000)
      } catch {
        finish(false)
      }
    })
  }

  /**
   * Build a minimal TLS 1.3 Client Hello for segmentation.
   * @param domain - Domain for SNI extension
   * @returns Client Hello buffer
   */
  private buildMinimalClientHello(domain: string): Buffer {
    const domainBytes = Buffer.from(domain, 'ascii')

    // SNI extension
    const sniExtension = Buffer.alloc(9 + domainBytes.length)
    // Extension type: server_name (0x0000)
    sniExtension.writeUInt16BE(0x0000, 0)
    // Extension length
    sniExtension.writeUInt16BE(domainBytes.length + 5, 2)
    // Server name list length
    sniExtension.writeUInt16BE(domainBytes.length + 3, 4)
    // Host name type (0)
    sniExtension.writeUInt8(0, 6)
    // Host name length
    sniExtension.writeUInt16BE(domainBytes.length, 7)
    // Host name
    domainBytes.copy(sniExtension, 9)

    // Supported versions extension (TLS 1.3 = 0x0304)
    const versionsExt = Buffer.from([
      0x00, 0x2b, // extension type: supported_versions
      0x00, 0x03, // extension length
      0x02,       // supported versions length
      0x03, 0x04  // TLS 1.3
    ])

    // Combine extensions
    const extensions = Buffer.concat([sniExtension, versionsExt])

    // Client Hello body
    const crypto = require('crypto')
    const random = crypto.randomBytes(32)
    const sessionId = crypto.randomBytes(32)

    const body = Buffer.alloc(2 + 32 + 1 + 32 + 2 + 2 + 1 + 1 + 2 + extensions.length)
    let offset = 0

    // Protocol version (TLS 1.2 for compatibility)
    body.writeUInt16BE(0x0303, offset); offset += 2
    // Random
    random.copy(body, offset); offset += 32
    // Session ID length
    body.writeUInt8(32, offset); offset += 1
    // Session ID
    sessionId.copy(body, offset); offset += 32
    // Cipher suites length (2 bytes for 1 suite)
    body.writeUInt16BE(2, offset); offset += 2
    // TLS_AES_128_GCM_SHA256
    body.writeUInt16BE(0x1301, offset); offset += 2
    // Compression methods length
    body.writeUInt8(1, offset); offset += 1
    // No compression
    body.writeUInt8(0, offset); offset += 1
    // Extensions length
    body.writeUInt16BE(extensions.length, offset); offset += 2
    // Extensions
    extensions.copy(body, offset)

    // Handshake header
    const handshake = Buffer.alloc(4 + body.length)
    handshake.writeUInt8(1, 0) // Client Hello type
    handshake.writeUInt8(0, 1)
    handshake.writeUInt16BE(body.length, 2)
    body.copy(handshake, 4)

    // TLS record header
    const record = Buffer.alloc(5 + handshake.length)
    record.writeUInt8(22, 0) // Content type: Handshake
    record.writeUInt16BE(0x0301, 1) // TLS 1.0 (compatibility)
    record.writeUInt16BE(handshake.length, 3)
    handshake.copy(record, 5)

    return record
  }

}
