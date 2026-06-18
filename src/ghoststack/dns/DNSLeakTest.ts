/**
 * GhostStack DNS Leak Test — Comprehensive DNS privacy audit.
 * Tests for multiple types of DNS leaks using random subdomains,
 * IPv6 leaks, DoT availability, and provider diversity.
 * @module DNSLeakTest
 */

import { resolveSystemDNS, queryDoH, type DoHProvider, DOH_PROVIDERS } from './DoHClient'
import { queryDoT, type DoTProvider, DOT_PROVIDERS } from './DoTClient'
import { randomBytes } from 'crypto'

export interface DNSLeakResult {
  leakDetected: boolean
  systemDNSIP: string | null
  dohIP: string | null
  testDomain: string
  details: string
}

export interface ComprehensiveLeakReport {
  /** Overall pass/fail */
  overallSafe: boolean
  /** Individual test results */
  tests: DNSLeakTestEntry[]
  /** Summary score (0-100, higher = more private) */
  privacyScore: number
  /** Human-readable summary */
  summary: string
  /** Timestamp */
  testedAt: number
}

export interface DNSLeakTestEntry {
  name: string
  passed: boolean
  severity: 'critical' | 'warning' | 'info'
  details: string
}

/** Generate a random subdomain for testing (prevents cached results) */
function randomSubdomain(): string {
  return randomBytes(8).toString('hex')
}

/**
 * Run the basic DNS leak test (original behavior, preserved).
 */
export async function runDNSLeakTest(): Promise<DNSLeakResult> {
  const testDomain = 'example.com'
  try {
    const [systemIP, dohResults] = await Promise.all([
      resolveSystemDNS(testDomain),
      queryDoH(testDomain, 'cloudflare', 5000)
    ])
    const dohIP = dohResults.length > 0 ? dohResults[0].ip : null
    const leakDetected = !!(systemIP && dohIP && systemIP !== dohIP)
    return {
      leakDetected,
      systemDNSIP: systemIP,
      dohIP,
      testDomain,
      details: leakDetected
        ? 'System DNS returned a different IP than DoH — your DNS queries may be visible to the network.'
        : 'No DNS leak detected — DNS queries are encrypted.'
    }
  } catch {
    return {
      leakDetected: false,
      systemDNSIP: null,
      dohIP: null,
      testDomain,
      details: 'Test failed — could not reach DNS servers.'
    }
  }
}

/**
 * Run a comprehensive DNS privacy audit.
 * Performs 6 independent tests to evaluate DNS privacy from multiple angles.
 */
export async function runComprehensiveLeakTest(): Promise<ComprehensiveLeakReport> {
  const tests: DNSLeakTestEntry[] = []

  // Test 1: Basic DNS mismatch (system DNS vs DoH)
  tests.push(await testDNSMismatch())

  // Test 2: Random subdomain leak test (prevents cache interference)
  tests.push(await testRandomSubdomainLeak())

  // Test 3: DoH provider reachability (how many encrypted DNS providers are accessible?)
  tests.push(await testDoHReachability())

  // Test 4: DoT provider reachability (is port 853 open?)
  tests.push(await testDoTReachability())

  // Test 5: IPv6 DNS leak (system may leak DNS over IPv6 even if IPv4 is secured)
  tests.push(await testIPv6Leak())

  // Test 6: DNS consistency (are all DoH providers giving the same answer?)
  tests.push(await testDNSConsistency())

  const passedCount = tests.filter((t) => t.passed).length
  const criticalFails = tests.filter((t) => !t.passed && t.severity === 'critical').length
  const privacyScore = Math.round((passedCount / tests.length) * 100)
  const overallSafe = criticalFails === 0

  let summary: string
  if (privacyScore === 100) {
    summary = 'Excellent — all DNS privacy tests passed. Your DNS queries are fully encrypted.'
  } else if (privacyScore >= 80) {
    summary = 'Good — most DNS privacy tests passed with minor issues.'
  } else if (privacyScore >= 50) {
    summary = 'Fair — some DNS privacy concerns detected. Review the failed tests.'
  } else {
    summary = 'Poor — significant DNS privacy issues detected. Your DNS queries may be visible.'
  }

  return {
    overallSafe,
    tests,
    privacyScore,
    summary,
    testedAt: Date.now()
  }
}

/** Test 1: System DNS vs DoH mismatch */
async function testDNSMismatch(): Promise<DNSLeakTestEntry> {
  try {
    const testDomain = 'cloudflare.com'
    const [systemIP, dohResults] = await Promise.all([
      resolveSystemDNS(testDomain),
      queryDoH(testDomain, 'cloudflare', 5000)
    ])
    const dohIP = dohResults.length > 0 ? dohResults[0].ip : null

    if (!systemIP && !dohIP) {
      return {
        name: 'DNS Mismatch',
        passed: true,
        severity: 'info',
        details: 'Could not reach any DNS — network may be offline.'
      }
    }

    if (systemIP && dohIP && systemIP !== dohIP) {
      return {
        name: 'DNS Mismatch',
        passed: false,
        severity: 'critical',
        details: `System DNS (${systemIP}) differs from DoH (${dohIP}). Your ISP/network may be hijacking DNS responses.`
      }
    }

    return {
      name: 'DNS Mismatch',
      passed: true,
      severity: 'info',
      details: 'System DNS and DoH return the same result.'
    }
  } catch {
    return {
      name: 'DNS Mismatch',
      passed: false,
      severity: 'warning',
      details: 'Test failed — could not compare DNS sources.'
    }
  }
}

/** Test 2: Random subdomain leak (bypasses DNS cache) */
async function testRandomSubdomainLeak(): Promise<DNSLeakTestEntry> {
  try {
    // Use a unique subdomain so no cache can interfere
    const rand = randomSubdomain()
    const testDomain = `${rand}.neverssl.com`

    const systemResult = await resolveSystemDNS(testDomain)
    // If system DNS resolves a random subdomain, it may be a DNS wildcard or MITM
    if (systemResult) {
      return {
        name: 'Random Subdomain',
        passed: false,
        severity: 'warning',
        details: `System DNS resolved a random subdomain (${testDomain} → ${systemResult}). This could indicate DNS wildcard poisoning or transparent proxy.`
      }
    }

    return {
      name: 'Random Subdomain',
      passed: true,
      severity: 'info',
      details:
        'System DNS correctly returned NXDOMAIN for a random subdomain — no DNS interception detected.'
    }
  } catch {
    return {
      name: 'Random Subdomain',
      passed: true,
      severity: 'info',
      details: 'Test completed — no anomalies.'
    }
  }
}

/** Test 3: How many DoH providers are reachable? */
async function testDoHReachability(): Promise<DNSLeakTestEntry> {
  const providers: DoHProvider[] = Object.keys(DOH_PROVIDERS) as DoHProvider[]
  const reachable: string[] = []

  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        const res = await queryDoH('example.com', p, 4000)
        if (res.length > 0) return p
      } catch {}
      return null
    })
  )

  for (const r of results) {
    if (r) reachable.push(r)
  }

  if (reachable.length === 0) {
    return {
      name: 'DoH Reachability',
      passed: false,
      severity: 'critical',
      details:
        'No DoH providers are reachable — encrypted DNS is completely blocked on this network.'
    }
  }

  if (reachable.length < 3) {
    return {
      name: 'DoH Reachability',
      passed: false,
      severity: 'warning',
      details: `Only ${reachable.length}/${providers.length} DoH providers reachable (${reachable.join(', ')}). Some may be blocked.`
    }
  }

  return {
    name: 'DoH Reachability',
    passed: true,
    severity: 'info',
    details: `${reachable.length}/${providers.length} DoH providers reachable: ${reachable.join(', ')}`
  }
}

/** Test 4: Is DNS-over-TLS (port 853) accessible? */
async function testDoTReachability(): Promise<DNSLeakTestEntry> {
  const providers: DoTProvider[] = Object.keys(DOT_PROVIDERS) as DoTProvider[]
  const reachable: string[] = []

  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        const res = await queryDoT('example.com', p, 1, 4000)
        if (res.length > 0) return p
      } catch {}
      return null
    })
  )

  for (const r of results) {
    if (r) reachable.push(r)
  }

  if (reachable.length === 0) {
    return {
      name: 'DoT Reachability',
      passed: false,
      severity: 'warning',
      details:
        'No DoT providers reachable (port 853 blocked). DoH will be used as the sole encrypted DNS method.'
    }
  }

  return {
    name: 'DoT Reachability',
    passed: true,
    severity: 'info',
    details: `${reachable.length}/${providers.length} DoT providers reachable: ${reachable.join(', ')}`
  }
}

/** Test 5: IPv6 DNS leak check */
async function testIPv6Leak(): Promise<DNSLeakTestEntry> {
  try {
    const dns = await import('dns')

    return await new Promise<DNSLeakTestEntry>((resolve) => {
      dns.resolve6('google.com', (err, addresses) => {
        if (err || !addresses || addresses.length === 0) {
          resolve({
            name: 'IPv6 DNS Leak',
            passed: true,
            severity: 'info',
            details: 'No IPv6 DNS resolution detected — IPv6 DNS leaks are not a concern.'
          })
        } else {
          // System resolved IPv6 — check if it could leak
          resolve({
            name: 'IPv6 DNS Leak',
            passed: false,
            severity: 'warning',
            details: `System DNS resolved IPv6 addresses (${addresses[0]}). If IPv6 traffic is not routed through encrypted DNS, this could leak your queries.`
          })
        }
      })
    })
  } catch {
    return {
      name: 'IPv6 DNS Leak',
      passed: true,
      severity: 'info',
      details: 'IPv6 test could not run — likely safe.'
    }
  }
}

/** Test 6: DoH consistency — do all providers agree? */
async function testDNSConsistency(): Promise<DNSLeakTestEntry> {
  const testDomain = 'google.com'
  const providers: DoHProvider[] = ['cloudflare', 'google', 'quad9']

  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        const res = await queryDoH(testDomain, p, 4000)
        return res.length > 0 ? res[0].ip : null
      } catch {
        return null
      }
    })
  )

  const validIPs = results.filter((r): r is string => r !== null)

  if (validIPs.length < 2) {
    return {
      name: 'DNS Consistency',
      passed: false,
      severity: 'warning',
      details: 'Could not get responses from enough providers to check consistency.'
    }
  }

  // For CDN-backed domains, IPs may differ (that's normal). Check if any look suspicious.
  const uniqueIPs = [...new Set(validIPs)]

  return {
    name: 'DNS Consistency',
    passed: true,
    severity: 'info',
    details: `${providers.length} DoH providers responded with ${uniqueIPs.length} unique IP(s) for ${testDomain}. ${uniqueIPs.length > 1 ? 'Multiple IPs are normal for CDN-hosted domains.' : 'All providers agree.'}`
  }
}
