/**
 * GhostStack Live IP Discovery
 * Discovers real IP addresses of blocked domains in real-time using 4 cascading methods.
 * No pre-stored database. Everything discovered live the moment a block is detected.
 * @module LiveIPDiscovery
 */

import { net } from 'electron'
import { queryDoH, consensusResolve, type DoHProvider } from '../dns/DoHClient'
import type { SessionCache, CachedIPEntry } from './SessionCache'

/** CDN IP ranges for range scanning */
const CDN_RANGES: Record<string, string[]> = {
  google: ['142.250.0.', '142.251.', '172.217.', '216.58.', '172.253.'],
  cloudflare: [
    '104.16.',
    '104.17.',
    '104.18.',
    '104.19.',
    '104.20.',
    '104.21.',
    '104.22.',
    '104.23.',
    '104.24.',
    '104.25.',
    '172.64.',
    '172.65.',
    '172.66.',
    '172.67.'
  ],
  fastly: [
    '151.101.0.',
    '151.101.1.',
    '151.101.64.',
    '151.101.65.',
    '151.101.128.',
    '151.101.129.',
    '151.101.192.',
    '151.101.193.'
  ],
  akamai: [
    '23.32.',
    '23.33.',
    '23.34.',
    '23.35.',
    '23.36.',
    '23.37.',
    '23.38.',
    '23.39.',
    '23.40.',
    '23.41.'
  ],
  amazon: ['13.224.', '13.225.', '13.226.', '13.227.', '13.249.', '13.250.']
}

/**
 * Identify which CDN a given IP belongs to.
 * @param ip - IP address to check
 * @returns CDN name or null
 */
export function identifyCDN(ip: string): string | null {
  for (const [cdn, prefixes] of Object.entries(CDN_RANGES)) {
    for (const prefix of prefixes) {
      if (ip.startsWith(prefix)) return cdn
    }
  }
  return null
}

/**
 * Discover the real IP of a blocked domain using 4 cascading methods.
 * Methods are tried in order: DoH Consensus → CDN Range Scan → CT Log → TemporalDNS
 * @param domain - The blocked domain
 * @param cache - Session cache instance
 * @returns Discovery result or null if all methods fail
 */
export async function discoverIP(
  domain: string,
  cache: SessionCache
): Promise<CachedIPEntry | null> {
  // Check cache first
  const cached = cache.getIP(domain)
  if (cached) return cached

  // METHOD 1 — Encrypted Multi-DoH Consensus
  try {
    const result = await method1_DoHConsensus(domain)
    if (result) {
      const cdn = identifyCDN(result.ip)
      cache.setIP(domain, result.ip, cdn, 'DOH_CONSENSUS')
      return cache.getIP(domain)
    }
  } catch {
    // Method 1 failed, continue to Method 2
  }

  // METHOD 2 — CDN Range Live Scan
  try {
    const result = await method2_CDNRangeScan(domain)
    if (result) {
      cache.setIP(domain, result.ip, result.cdn, 'CDN_SCAN')
      return cache.getIP(domain)
    }
  } catch {
    // Method 2 failed, continue to Method 3
  }

  // METHOD 3 — Certificate Transparency Log Query
  try {
    const result = await method3_CTLogQuery(domain)
    if (result) {
      cache.setIP(domain, result, null, 'CT_LOG')
      return cache.getIP(domain)
    }
  } catch {
    // Method 3 failed, continue to Method 4
  }

  // METHOD 4 — TemporalDNS (handled by TemporalDNS module)
  // This is the last resort and is slow — the orchestrator will call TemporalDNS directly

  return null
}

/**
 * METHOD 1: Query multiple DoH providers and find consensus IP.
 * @param domain - Domain to resolve
 * @returns Consensus result or null
 */
async function method1_DoHConsensus(
  domain: string
): Promise<{ ip: string; provider: string } | null> {
  return consensusResolve(domain)
}

/**
 * METHOD 2: Identify CDN from DoH result, then scan random IPs in that CDN range.
 * For each candidate IP, attempt TLS connection and verify certificate matches domain.
 * @param domain - Domain to resolve
 * @returns IP and CDN if found
 */
async function method2_CDNRangeScan(domain: string): Promise<{ ip: string; cdn: string } | null> {
  // First, try to get an IP from any single DoH provider to identify CDN
  const providers: DoHProvider[] = ['cloudflare', 'google', 'nextdns', 'quad9']
  let referenceIP: string | null = null
  let detectedCDN: string | null = null

  for (const provider of providers) {
    try {
      const results = await queryDoH(domain, provider, 3000)
      if (results.length > 0) {
        referenceIP = results[0].ip
        detectedCDN = identifyCDN(referenceIP)
        break
      }
    } catch {
      continue
    }
  }

  if (!detectedCDN || !CDN_RANGES[detectedCDN]) {
    return null
  }

  // Generate 10 random IPs from the CDN range
  const prefixes = CDN_RANGES[detectedCDN]
  const candidates: string[] = []

  for (let i = 0; i < 10; i++) {
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    // Generate last octet(s) randomly
    if (prefix.split('.').filter(Boolean).length === 3) {
      // Prefix has 3 octets, generate 4th
      candidates.push(`${prefix}${Math.floor(Math.random() * 254) + 1}`)
    } else {
      // Prefix has 2 octets, generate 3rd and 4th
      candidates.push(
        `${prefix}${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`
      )
    }
  }

  // If we have the reference IP from DoH, add it as first candidate
  if (referenceIP) {
    candidates.unshift(referenceIP)
  }

  // Try each candidate with TLS certificate verification
  for (const ip of candidates) {
    try {
      const valid = await verifyCertificateForDomain(ip, domain)
      if (valid) {
        return { ip, cdn: detectedCDN }
      }
    } catch {
      continue
    }
  }

  return null
}

/**
 * Verify that an IP serves a valid TLS certificate for a given domain.
 * @param ip - IP address to connect to
 * @param domain - Expected domain in certificate
 * @returns true if certificate matches domain
 */
async function verifyCertificateForDomain(ip: string, domain: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tls = require('tls')
    const timer = setTimeout(() => resolve(false), 3000)

    try {
      const socket = tls.connect(
        {
          host: ip,
          port: 443,
          servername: domain,
          rejectUnauthorized: false,
          timeout: 3000
        },
        () => {
          clearTimeout(timer)
          try {
            const cert = socket.getPeerCertificate()
            if (cert && cert.subject) {
              const cn = cert.subject.CN || ''
              const altNames = cert.subjectaltname || ''
              const matches =
                cn === domain ||
                cn === `*.${domain.split('.').slice(1).join('.')}` ||
                altNames.includes(domain)
              socket.destroy()
              resolve(matches)
            } else {
              socket.destroy()
              resolve(false)
            }
          } catch {
            socket.destroy()
            resolve(false)
          }
        }
      )

      socket.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })

      socket.on('timeout', () => {
        clearTimeout(timer)
        socket.destroy()
        resolve(false)
      })
    } catch {
      clearTimeout(timer)
      resolve(false)
    }
  })
}

/**
 * METHOD 3: Query Certificate Transparency logs via crt.sh API.
 * Extract associated IPs from recent certificates.
 * @param domain - Domain to query
 * @returns First responsive IP or null
 */
async function method3_CTLogQuery(domain: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000)

    try {
      const request = net.request({
        url: `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`,
        method: 'GET'
      })

      request.on('response', (response) => {
        let body = ''
        response.on('data', (chunk) => {
          body += chunk.toString()
        })
        response.on('end', () => {
          clearTimeout(timer)
          try {
            const entries = JSON.parse(body)
            if (Array.isArray(entries) && entries.length > 0) {
              // Extract unique common names / SAN entries
              // crt.sh returns certificate data, not IPs directly
              // We can extract domains from certificates and try DoH on subdomains
              const subdomains = new Set<string>()
              for (const entry of entries.slice(0, 20)) {
                const name = entry.common_name || entry.name_value || ''
                if (name && !name.startsWith('*')) {
                  subdomains.add(name)
                }
              }

              // Try resolving the first few subdomains via DoH
              const tryResolve = async (): Promise<string | null> => {
                for (const sub of Array.from(subdomains).slice(0, 5)) {
                  try {
                    const results = await queryDoH(sub, 'cloudflare', 3000)
                    if (results.length > 0) return results[0].ip
                  } catch {
                    continue
                  }
                }
                return null
              }

              tryResolve().then((ip) => resolve(ip))
            } else {
              resolve(null)
            }
          } catch {
            resolve(null)
          }
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
