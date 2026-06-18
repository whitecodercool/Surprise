/**
 * GhostStack Carrier Manager
 * Manages a pool of public HTTPS endpoints used for connectivity verification.
 * These carriers are always-allowed endpoints that prove HTTPS paths work.
 * @module CarrierManager
 */

import { net } from 'electron'

/** Carrier endpoint status */
interface CarrierStatus {
  url: string
  alive: boolean
  latencyMs: number
  lastChecked: number
}

/** Default carrier endpoints — public, CORS-enabled, always-allowed */
const DEFAULT_CARRIERS = [
  'https://httpbin.org/headers',
  'https://postman-echo.com/headers',
  'https://httpbingo.org/headers',
  'https://jsonplaceholder.typicode.com/posts/1',
  'https://api.github.com/zen',
  'https://worldtimeapi.org/api/ip',
  'https://api.ipify.org?format=json',
  'https://ifconfig.me/all.json',
  'https://icanhazip.com',
  'https://checkip.amazonaws.com',
  'https://dns.google/resolve?name=example.com&type=A',
  'https://cloudflare-dns.com/dns-query?name=example.com&type=A',
  'https://www.google.com/generate_204',
  'https://www.apple.com/library/test/success.html',
  'https://detectportal.firefox.com/success.txt',
  'https://connectivity-check.ubuntu.com',
  'https://nmcheck.gnome.org/check_network_status.txt',
  'https://www.msftconnecttest.com/connecttest.txt',
  'https://captive.apple.com/hotspot-detect.html',
  'https://clients3.google.com/generate_204'
]

/**
 * Carrier Manager — maintains pool of verified HTTPS endpoints.
 * Used to verify network paths and provide connectivity confirmation.
 */
export class CarrierManager {
  private carriers: CarrierStatus[] = []

  constructor() {
    this.carriers = DEFAULT_CARRIERS.map((url) => ({
      url,
      alive: false,
      latencyMs: -1,
      lastChecked: 0
    }))
  }

  /**
   * Verify that at least some carrier endpoints are reachable.
   * @returns true if at least 3 carriers respond
   */
  async verifyCarriers(): Promise<boolean> {
    const checks = this.carriers.slice(0, 5).map((carrier) => this.checkCarrier(carrier))
    const results = await Promise.allSettled(checks)

    let aliveCount = 0
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) aliveCount++
    }

    return aliveCount >= 3
  }

  /**
   * Get a list of alive carriers.
   * @param count - Maximum number to return
   * @returns Array of alive carrier URLs
   */
  getAliveCarriers(count: number = 5): string[] {
    return this.carriers
      .filter((c) => c.alive)
      .sort((a, b) => a.latencyMs - b.latencyMs)
      .slice(0, count)
      .map((c) => c.url)
  }

  /**
   * Check a single carrier endpoint.
   * @param carrier - Carrier to check
   * @returns true if carrier is alive
   */
  private async checkCarrier(carrier: CarrierStatus): Promise<boolean> {
    const start = Date.now()

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        carrier.alive = false
        carrier.lastChecked = Date.now()
        resolve(false)
      }, 3000)

      try {
        const request = net.request({
          url: carrier.url,
          method: 'GET'
        })

        request.on('response', (response) => {
          clearTimeout(timer)
          carrier.alive = response.statusCode < 500
          carrier.latencyMs = Date.now() - start
          carrier.lastChecked = Date.now()

          // Consume response body
          response.on('data', () => {})
          response.on('end', () => {})

          resolve(carrier.alive)
        })

        request.on('error', () => {
          clearTimeout(timer)
          carrier.alive = false
          carrier.lastChecked = Date.now()
          resolve(false)
        })

        request.end()
      } catch {
        clearTimeout(timer)
        carrier.alive = false
        resolve(false)
      }
    })
  }

  /**
   * Refresh all carrier statuses.
   * @returns Number of alive carriers
   */
  async refreshAll(): Promise<number> {
    const checks = this.carriers.map((c) => this.checkCarrier(c))
    await Promise.allSettled(checks)
    return this.carriers.filter((c) => c.alive).length
  }
}
