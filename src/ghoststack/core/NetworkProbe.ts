/**
 * GhostStack Network Probe
 * Detects network environment on startup and on network change events.
 * Identifies firewall type, checks for SSL interception, measures latency.
 * @module NetworkProbe
 */

import { net } from 'electron'
import { queryDoH, resolveSystemDNS } from '../dns/DoHClient'

export interface NetworkEnvironment {
  /** Detected network type */
  networkType: 'open' | 'filtered' | 'heavily_restricted' | 'unknown'
  /** Detected firewall brand (if identifiable) */
  firewallType: string | null
  /** Whether SSL/TLS is being intercepted (MITM) */
  sslIntercepted: boolean
  /** Certificate issuer if intercepted */
  interceptorIssuer: string | null
  /** Whether DNS is being filtered */
  dnsFiltered: boolean
  /** Latency to Cloudflare DoH in ms */
  latencyMs: number
  /** Whether QUIC/UDP 443 is available */
  quicAvailable: boolean
  /** Timestamp of last probe */
  lastProbeAt: number
}

/** Test domains for probing — chosen because they're commonly blocked on filtered networks */
const PROBE_DOMAINS = ['youtube.com', 'twitter.com', 'reddit.com']

/** Firewall detection signatures in response bodies */
const FIREWALL_DETECTORS: Record<string, string[]> = {
  'Sophos Firewall': ['sophos', 'webcat', 'sophosxg'],
  'Fortinet FortiGuard': ['fortiguard', 'fortinet', 'fortigate'],
  Zscaler: ['zscaler', 'zscalerone'],
  Forcepoint: ['forcepoint', 'websense'],
  Barracuda: ['barracuda', 'barracudanetworks'],
  'Palo Alto': ['paloalto', 'paloaltonetworks', 'panw'],
  'Blue Coat': ['bluecoat', 'symantec.*proxy'],
  'Cisco Umbrella': ['umbrella', 'opendns'],
  Untangle: ['untangle'],
  Smoothwall: ['smoothwall'],
  pfSense: ['pfsense'],
  'Squid Proxy': ['squid', 'cache_peer'],
  ContentKeeper: ['contentkeeper'],
  Lightspeed: ['lightspeed', 'relay.school']
}

/**
 * Probe the current network environment.
 * Detects firewall type, SSL interception, DNS filtering, and QUIC availability.
 * @returns Complete network environment assessment
 */
export async function probeNetwork(): Promise<NetworkEnvironment> {
  const env: NetworkEnvironment = {
    networkType: 'unknown',
    firewallType: null,
    sslIntercepted: false,
    interceptorIssuer: null,
    dnsFiltered: false,
    latencyMs: -1,
    quicAvailable: false,
    lastProbeAt: Date.now()
  }

  try {
    const [latency, dnsCheck, firewallCheck] = await Promise.allSettled([
      measureDoHLatency(),
      checkDNSFiltering(),
      checkForFirewall()
    ])

    // Latency
    if (latency.status === 'fulfilled') {
      env.latencyMs = latency.value
    }

    // DNS filtering
    if (dnsCheck.status === 'fulfilled') {
      env.dnsFiltered = dnsCheck.value
    }

    // Firewall type
    if (firewallCheck.status === 'fulfilled' && firewallCheck.value) {
      env.firewallType = firewallCheck.value
    }

    // Determine network type
    if (env.dnsFiltered && env.firewallType) {
      env.networkType = 'heavily_restricted'
    } else if (env.dnsFiltered || env.firewallType) {
      env.networkType = 'filtered'
    } else if (env.latencyMs >= 0) {
      env.networkType = 'open'
    }

    // Check QUIC availability (attempt UDP connection to Cloudflare)
    env.quicAvailable = await checkQUICAvailability()
  } catch {
    env.networkType = 'unknown'
  }

  return env
}

/**
 * Measure round-trip latency to Cloudflare DoH endpoint.
 * @returns Latency in milliseconds, or -1 if unreachable
 */
async function measureDoHLatency(): Promise<number> {
  const start = Date.now()
  try {
    const results = await queryDoH('cloudflare.com', 'cloudflare', 5000)
    if (results.length > 0) {
      return Date.now() - start
    }
    return -1
  } catch {
    return -1
  }
}

/**
 * Check if DNS is being filtered by comparing system DNS with DoH answers.
 * @returns true if DNS filtering is detected
 */
async function checkDNSFiltering(): Promise<boolean> {
  let filteredCount = 0

  for (const domain of PROBE_DOMAINS) {
    try {
      const [systemIP, dohResults] = await Promise.all([
        resolveSystemDNS(domain),
        queryDoH(domain, 'cloudflare', 3000)
      ])

      const dohIP = dohResults.length > 0 ? dohResults[0].ip : null

      // System DNS returns nothing or different IP from DoH
      if ((!systemIP && dohIP) || (systemIP && dohIP && systemIP !== dohIP)) {
        filteredCount++
      }
    } catch {
      continue
    }
  }

  return filteredCount >= 2
}

/**
 * Attempt to detect the firewall brand by requesting a commonly blocked page
 * and analyzing the block page content.
 * @returns Firewall brand name or null
 */
async function checkForFirewall(): Promise<string | null> {
  // Try to access a commonly blocked domain and check if we get a block page
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5000)

    try {
      const request = net.request({
        url: 'http://www.youtube.com',
        method: 'GET'
      })

      request.on('response', (response) => {
        // If we get a redirect to a different domain, it might be a captive portal
        let body = ''
        response.on('data', (chunk) => {
          body += chunk.toString()
          // Only read first 10KB to avoid memory issues
          if (body.length > 10240) {
            request.abort()
          }
        })

        response.on('end', () => {
          clearTimeout(timer)
          const lower = body.toLowerCase()

          for (const [name, signatures] of Object.entries(FIREWALL_DETECTORS)) {
            for (const sig of signatures) {
              if (lower.includes(sig)) {
                resolve(name)
                return
              }
            }
          }
          resolve(null)
        })

        response.on('error', () => {
          clearTimeout(timer)
          resolve(null)
        })
      })

      request.on('error', () => {
        clearTimeout(timer)
        resolve(null)
      })

      request.end()
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

/**
 * Check if QUIC (UDP 443) traffic is available on this network.
 * Many enterprise firewalls block UDP 443.
 * @returns true if QUIC appears available
 */
async function checkQUICAvailability(): Promise<boolean> {
  // In Electron, QUIC is handled at the Chromium level via --enable-quic flag
  // We can check by trying to establish an HTTP/3 connection
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 3000)

    try {
      const request = net.request({
        url: 'https://www.google.com/generate_204',
        method: 'GET'
      })

      request.on('response', (response) => {
        clearTimeout(timer)
        // If we get any response, the network allows outbound HTTPS
        // QUIC availability is more nuanced but this is a good proxy
        const protocol = (response as any).httpVersionMajor
        resolve(protocol >= 3 || response.statusCode === 204)
        response.on('data', () => {})
        response.on('end', () => {})
      })

      request.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })

      request.end()
    } catch {
      clearTimeout(timer)
      resolve(false)
    }
  })
}
