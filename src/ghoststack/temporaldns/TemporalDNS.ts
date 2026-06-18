/**
 * GhostStack TemporalDNS
 * Last-resort DNS resolution using multi-path covert channels.
 * Used when all normal DNS methods are blocked.
 * @module TemporalDNS
 */

import { TimingEncoder } from './TimingEncoder'
import { TimingDecoder } from './TimingDecoder'
import { net } from 'electron'

/** TemporalDNS resolution result */
export interface TemporalResult {
  success: boolean
  ip: string | null
  method: string
  latencyMs: number
  error?: string
}

/**
 * TemporalDNS — multi-path covert DNS resolution.
 * When all standard DoH providers are blocked, this module attempts
 * DNS resolution through alternative allowed paths.
 */
export class TemporalDNS {
  private timingEncoder: TimingEncoder
  private timingDecoder: TimingDecoder
  private cache: Map<string, { ip: string; expiresAt: number }> = new Map()

  constructor() {
    this.timingEncoder = new TimingEncoder()
    this.timingDecoder = new TimingDecoder()
  }

  /**
   * Resolve a domain using covert DNS methods.
   * Tries multiple alternative resolution paths.
   * @param domain - Domain to resolve
   * @returns Resolution result
   */
  async resolve(domain: string): Promise<TemporalResult> {
    const start = Date.now()

    // Check local cache first
    const cached = this.cache.get(domain)
    if (cached && Date.now() < cached.expiresAt) {
      return {
        success: true,
        ip: cached.ip,
        method: 'TEMPORAL_CACHE',
        latencyMs: 0
      }
    }

    // Method 1: DNS over alternative HTTPS paths
    try {
      const ip = await this.resolveViaAlternativePaths(domain)
      if (ip) {
        this.cacheResult(domain, ip)
        return {
          success: true,
          ip,
          method: 'ALT_HTTPS_PATH',
          latencyMs: Date.now() - start
        }
      }
    } catch {
      // Continue to next method
    }

    // Method 2: DNS via public API endpoints that happen to resolve domains
    try {
      const ip = await this.resolveViaPublicAPIs(domain)
      if (ip) {
        this.cacheResult(domain, ip)
        return {
          success: true,
          ip,
          method: 'PUBLIC_API_DNS',
          latencyMs: Date.now() - start
        }
      }
    } catch {
      // Continue to next method
    }

    // Method 3: Timing-encoded DNS query
    try {
      const ip = await this.resolveViaTiming(domain)
      if (ip) {
        this.cacheResult(domain, ip)
        return {
          success: true,
          ip,
          method: 'TIMING_CHANNEL',
          latencyMs: Date.now() - start
        }
      }
    } catch {
      // All methods failed
    }

    return {
      success: false,
      ip: null,
      method: 'NONE',
      latencyMs: Date.now() - start,
      error: 'All TemporalDNS methods failed'
    }
  }

  /**
   * Method 1: Try DoH through alternative HTTPS paths.
   * Some networks block 1.1.1.1 and 8.8.8.8 but allow other DoH endpoints.
   * @param domain - Domain to resolve
   * @returns Resolved IP or null
   */
  private async resolveViaAlternativePaths(domain: string): Promise<string | null> {
    const alternativeDoHEndpoints = [
      `https://dns.adguard-dns.com/dns-query?name=${domain}&type=A`,
      `https://doh.cleanbrowsing.org/doh/family-filter/?name=${domain}&type=A`,
      `https://dns.mullvad.net/dns-query?name=${domain}&type=A`,
      `https://doh.applied-privacy.net/query?name=${domain}&type=A`,
      `https://dns.digitale-gesellschaft.ch/dns-query?name=${domain}&type=A`
    ]

    for (const url of alternativeDoHEndpoints) {
      try {
        const result = await this.fetchJSON(url, {
          Accept: 'application/dns-json'
        })

        if (result && result.Answer) {
          for (const answer of result.Answer) {
            if (answer.type === 1 && answer.data) {
              return answer.data
            }
          }
        }
      } catch {
        continue
      }
    }

    return null
  }

  /**
   * Method 2: Resolve via public APIs that expose DNS information.
   * Some public web APIs inadvertently resolve domains as part of their operation.
   * @param domain - Domain to resolve
   * @returns Resolved IP or null
   */
  private async resolveViaPublicAPIs(domain: string): Promise<string | null> {
    // Use DNS lookup APIs
    const dnsAPIs = [
      `https://dns.google/resolve?name=${domain}&type=A`,
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=A`
    ]

    for (const url of dnsAPIs) {
      try {
        const result = await this.fetchJSON(url, {
          Accept: 'application/dns-json'
        })

        if (result?.Answer) {
          for (const answer of result.Answer) {
            if (answer.type === 1) return answer.data
          }
        }
      } catch {
        continue
      }
    }

    return null
  }

  /**
   * Method 3: Timing-encoded DNS resolution.
   * Encodes the domain name into packet timing patterns sent to allowed endpoints.
   * The response timing patterns encode the resolved IP.
   * @param domain - Domain to resolve
   * @returns Resolved IP or null
   */
  private async resolveViaTiming(domain: string): Promise<string | null> {
    // Encode domain into timing sequence
    const timingSequence = this.timingEncoder.encode(domain)

    // Send timing-encoded requests to allowed endpoints
    const endpoints = [
      'https://www.google.com/generate_204',
      'https://detectportal.firefox.com/success.txt',
      'https://www.msftconnecttest.com/connecttest.txt'
    ]

    for (const endpoint of endpoints) {
      try {
        const timings: number[] = []

        for (const delay of timingSequence) {
          const start = Date.now()
          await this.fetchRaw(endpoint)
          timings.push(Date.now() - start)

          // Wait the encoded delay
          await new Promise((r) => setTimeout(r, delay))
        }

        // Decode the response timings
        const ip = this.timingDecoder.decode(timings)
        if (ip && this.isValidIP(ip)) {
          return ip
        }
      } catch {
        continue
      }
    }

    return null
  }

  /**
   * Fetch JSON from a URL.
   * @param url - URL to fetch
   * @param headers - Request headers
   * @returns Parsed JSON response
   */
  private fetchJSON(url: string, headers: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), 5000)

      try {
        const request = net.request({ url, method: 'GET' })

        for (const [key, value] of Object.entries(headers)) {
          request.setHeader(key, value)
        }

        request.on('response', (response) => {
          let body = ''
          response.on('data', (chunk) => {
            body += chunk.toString()
          })
          response.on('end', () => {
            clearTimeout(timer)
            try {
              resolve(JSON.parse(body))
            } catch {
              reject(new Error('Parse error'))
            }
          })
          response.on('error', () => {
            clearTimeout(timer)
            reject(new Error('Response error'))
          })
        })

        request.on('error', () => {
          clearTimeout(timer)
          reject(new Error('Request error'))
        })

        request.end()
      } catch (err) {
        clearTimeout(timer)
        reject(err)
      }
    })
  }

  /**
   * Fetch raw response from a URL (for timing measurements).
   * @param url - URL to fetch
   * @returns Response status code
   */
  private fetchRaw(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), 3000)

      try {
        const request = net.request({ url, method: 'HEAD' })

        request.on('response', (response) => {
          clearTimeout(timer)
          response.on('data', () => {})
          response.on('end', () => {})
          resolve(response.statusCode)
        })

        request.on('error', () => {
          clearTimeout(timer)
          reject(new Error('Request error'))
        })

        request.end()
      } catch {
        clearTimeout(timer)
        reject(new Error('Setup error'))
      }
    })
  }

  /**
   * Cache a resolved IP.
   * @param domain - Domain
   * @param ip - Resolved IP
   */
  private cacheResult(domain: string, ip: string): void {
    this.cache.set(domain, {
      ip,
      expiresAt: Date.now() + 86400000 // 24 hours
    })
  }

  /**
   * Validate an IP address string.
   * @param ip - String to validate
   * @returns true if valid IPv4
   */
  private isValidIP(ip: string): boolean {
    const parts = ip.split('.')
    if (parts.length !== 4) return false
    return parts.every((p) => {
      const n = parseInt(p, 10)
      return !isNaN(n) && n >= 0 && n <= 255
    })
  }

  /**
   * Clear the TemporalDNS cache.
   */
  clearCache(): void {
    this.cache.clear()
  }
}
