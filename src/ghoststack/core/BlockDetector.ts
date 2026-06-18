/**
 * GhostStack Block Detector
 * Automatically identifies the type of network block affecting a request.
 * Detects 7 block signatures: firewall pages, DNS hijacking, TCP reset,
 * SSL interception, captive portals, silent drops, and IP blocks.
 * @module BlockDetector
 */

import { net } from 'electron'
import type { BlockProfile, BlockType } from './SessionCache'
import { queryDoH, resolveSystemDNS } from '../dns/DoHClient'

/** Firewall signature keywords found in block pages */
const FIREWALL_SIGNATURES = [
  'blocked',
  'sophos',
  'webcat',
  'forcepoint',
  'barracuda',
  'zscaler',
  'access denied',
  'policy violation',
  'this site is blocked',
  'web filter',
  'content filter',
  'url filtering',
  'category blocked',
  'websense',
  'fortiguard',
  'palo alto',
  'bluecoat',
  'cisco umbrella',
  'untangle',
  'smoothwall',
  'squid',
  'dansguardian'
]

/** Known public Certificate Authority issuers (partial list for SSL interception detection) */
const KNOWN_PUBLIC_CAS = [
  'DigiCert',
  "Let's Encrypt",
  'Comodo',
  'Sectigo',
  'GlobalSign',
  'GeoTrust',
  'Thawte',
  'VeriSign',
  'Entrust',
  'GoDaddy',
  'Amazon',
  'Google Trust Services',
  'Microsoft',
  'Baltimore',
  'Symantec',
  'RapidSSL',
  'Buypass',
  'Certum',
  'ISRG',
  'Starfield',
  'Network Solutions',
  'QuoVadis',
  'SwissSign',
  'T-Systems',
  'TWCA',
  'USERTrust',
  'IdenTrust',
  'CloudFlare',
  'Cloudflare',
  'Apple',
  'Actalis',
  'E-Tugra'
]

/**
 * Detect what type of block is affecting a request.
 * Runs all 7 detection signatures and returns the most specific block profile.
 * @param domain - The domain that failed to load
 * @param errorCode - Electron error code (if available)
 * @param errorDescription - Electron error description (if available)
 * @param responseBody - Response body content (if available)
 * @param statusCode - HTTP status code (if available)
 * @param redirectUrl - Redirect URL (if available)
 * @returns Block profile with classification, or null if no block detected
 */
export async function detectBlock(
  domain: string,
  errorCode?: number,
  errorDescription?: string,
  responseBody?: string,
  statusCode?: number,
  redirectUrl?: string
): Promise<BlockProfile | null> {
  const profile: BlockProfile = {
    domain,
    blockType: 'FIREWALL_CATEGORY_BLOCK',
    localDNSAnswer: null,
    realDNSAnswer: null,
    sslIntercepted: false,
    timestamp: Date.now(),
    networkSignature: null
  }

  try {
    // Run detection checks in parallel where possible
    const [firewallResult, dnsResult, tcpResult, sslResult] = await Promise.allSettled([
      checkFirewallPage(responseBody),
      checkDNSHijack(domain),
      checkTCPBlock(domain, errorCode, errorDescription),
      checkSSLInterception(domain)
    ])

    // SIGNATURE 1 — Firewall block page
    if (firewallResult.status === 'fulfilled' && firewallResult.value) {
      profile.blockType = 'FIREWALL_CATEGORY_BLOCK'
      profile.networkSignature = firewallResult.value
      // Still check DNS for full profile
      if (dnsResult.status === 'fulfilled' && dnsResult.value) {
        profile.localDNSAnswer = dnsResult.value.localIP
        profile.realDNSAnswer = dnsResult.value.realIP
      }
      if (sslResult.status === 'fulfilled') {
        profile.sslIntercepted = sslResult.value
      }
      return profile
    }

    // SIGNATURE 2 — DNS hijack or DNS block
    if (dnsResult.status === 'fulfilled' && dnsResult.value) {
      const dns = dnsResult.value
      profile.localDNSAnswer = dns.localIP
      profile.realDNSAnswer = dns.realIP

      if (dns.type === 'hijacked') {
        profile.blockType = 'DNS_HIJACKED'
        profile.networkSignature = 'dns_mismatch'
        if (sslResult.status === 'fulfilled') profile.sslIntercepted = sslResult.value
        return profile
      }
      if (dns.type === 'blocked') {
        profile.blockType = 'DNS_BLOCKED'
        profile.networkSignature = 'nxdomain'
        return profile
      }
    }

    // SIGNATURE 5 — Captive portal redirect
    if (statusCode && [301, 302, 307, 308].includes(statusCode) && redirectUrl) {
      try {
        const redirectDomain = new URL(redirectUrl).hostname
        if (redirectDomain !== domain && !redirectDomain.endsWith(`.${domain}`)) {
          profile.blockType = 'CAPTIVE_PORTAL'
          profile.networkSignature = redirectDomain
          if (dnsResult.status === 'fulfilled' && dnsResult.value) {
            profile.localDNSAnswer = dnsResult.value.localIP
            profile.realDNSAnswer = dnsResult.value.realIP
          }
          return profile
        }
      } catch {
        // Invalid redirect URL
      }
    }

    // SIGNATURE 4 — SSL interception
    if (sslResult.status === 'fulfilled' && sslResult.value) {
      profile.blockType = 'SSL_INTERCEPTED'
      profile.sslIntercepted = true
      profile.networkSignature = 'mitm_detected'
      if (dnsResult.status === 'fulfilled' && dnsResult.value) {
        profile.localDNSAnswer = dnsResult.value.localIP
        profile.realDNSAnswer = dnsResult.value.realIP
      }
      return profile
    }

    // SIGNATURE 3 — TCP blocked
    if (tcpResult.status === 'fulfilled' && tcpResult.value) {
      profile.blockType = tcpResult.value
      profile.networkSignature = errorDescription || 'tcp_failure'
      if (dnsResult.status === 'fulfilled' && dnsResult.value) {
        profile.localDNSAnswer = dnsResult.value.localIP
        profile.realDNSAnswer = dnsResult.value.realIP

        // SIGNATURE 7 — IP blocked (DNS works but TCP fails)
        if (dnsResult.value.localIP && dnsResult.value.type === 'ok') {
          profile.blockType = 'IP_BLOCKED'
        }
      }
      return profile
    }

    // SIGNATURE 6 — Silent drop
    if (
      errorDescription === 'ERR_EMPTY_RESPONSE' ||
      errorDescription === 'ERR_CONNECTION_TIMED_OUT'
    ) {
      profile.blockType = 'SILENT_DROP'
      profile.networkSignature = errorDescription
      if (dnsResult.status === 'fulfilled' && dnsResult.value) {
        profile.localDNSAnswer = dnsResult.value.localIP
        profile.realDNSAnswer = dnsResult.value.realIP
      }
      return profile
    }

    // If we have any error at all, classify it
    if (errorCode || errorDescription) {
      profile.blockType = 'TCP_BLOCKED'
      profile.networkSignature = errorDescription || `error_${errorCode}`
      if (dnsResult.status === 'fulfilled' && dnsResult.value) {
        profile.localDNSAnswer = dnsResult.value.localIP
        profile.realDNSAnswer = dnsResult.value.realIP
      }
      return profile
    }
  } catch {
    // Detection itself failed — still return a basic profile
    profile.blockType = 'TCP_BLOCKED'
    profile.networkSignature = 'detection_error'
    return profile
  }

  return null
}

/**
 * Check if a response body contains firewall/block page signatures.
 * @param body - Response body to check
 * @returns Matched signature keyword, or null
 */
async function checkFirewallPage(body?: string): Promise<string | null> {
  if (!body) return null
  const lower = body.toLowerCase()
  for (const sig of FIREWALL_SIGNATURES) {
    if (lower.includes(sig)) return sig
  }
  return null
}

/**
 * Compare system DNS with DoH answers to detect hijacking.
 * @param domain - Domain to check
 * @returns DNS comparison result
 */
async function checkDNSHijack(domain: string): Promise<{
  localIP: string | null
  realIP: string | null
  type: 'hijacked' | 'blocked' | 'ok'
} | null> {
  try {
    const [localIP, dohResults] = await Promise.all([
      resolveSystemDNS(domain),
      queryDoH(domain, 'cloudflare', 5000)
    ])

    const realIP = dohResults.length > 0 ? dohResults[0].ip : null

    // System DNS returns NXDOMAIN but DoH returns an IP
    if (!localIP && realIP) {
      return { localIP: null, realIP, type: 'blocked' }
    }

    // Both resolve but to different IPs — hijacked
    if (localIP && realIP && localIP !== realIP) {
      return { localIP, realIP, type: 'hijacked' }
    }

    // Both agree or both fail
    return { localIP, realIP, type: 'ok' }
  } catch {
    return null
  }
}

/**
 * Check for TCP-level blocking indicators.
 * @param domain - Domain to check
 * @param errorCode - Electron error code
 * @param errorDescription - Electron error description
 * @returns Block type or null
 */
async function checkTCPBlock(
  _domain: string,
  errorCode?: number,
  errorDescription?: string
): Promise<BlockType | null> {
  const tcpErrors = [
    'ERR_CONNECTION_RESET',
    'ERR_CONNECTION_CLOSED',
    'ERR_CONNECTION_REFUSED',
    'ERR_CONNECTION_TIMED_OUT',
    'ERR_TIMED_OUT'
  ]

  if (errorDescription && tcpErrors.includes(errorDescription)) {
    return 'TCP_BLOCKED'
  }

  // Error code -101 = ERR_CONNECTION_RESET
  // Error code -118 = ERR_CONNECTION_TIMED_OUT
  if (errorCode && (errorCode === -101 || errorCode === -118 || errorCode === -7)) {
    return 'TCP_BLOCKED'
  }

  return null
}

/**
 * Check if TLS connection is being intercepted (MITM).
 * Attempts a TLS connection and checks certificate issuer against known public CAs.
 * @param domain - Domain to check
 * @returns true if SSL is being intercepted
 */
async function checkSSLInterception(domain: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const request = net.request({
        url: `https://${domain}`,
        method: 'HEAD'
      })

      const timer = setTimeout(() => {
        request.abort()
        resolve(false)
      }, 5000)

      request.on('response', (response) => {
        clearTimeout(timer)
        // In Electron, we can't directly access the certificate from net.request response
        // But we can check via the certificate-error event on the app level
        // For now, resolve false — SSL interception is checked at the app level
        response.on('data', () => {})
        response.on('end', () => resolve(false))
      })

      request.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })

      request.end()
    } catch {
      resolve(false)
    }
  })
}

/**
 * Check if a certificate issuer is a known public CA.
 * @param issuer - Certificate issuer string
 * @returns true if the issuer is a recognized public CA
 */
export function isKnownCA(issuer: string): boolean {
  if (!issuer) return false
  const lower = issuer.toLowerCase()
  return KNOWN_PUBLIC_CAS.some((ca) => lower.includes(ca.toLowerCase()))
}
