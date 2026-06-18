/**
 * GhostStack DNS Module — Complete encrypted DNS privacy suite.
 *
 * Provides:
 * - DNS-over-HTTPS (DoH) with 8 providers
 * - DNS-over-TLS (DoT) with 5 providers
 * - Multi-protocol resolver with TTL-aware caching
 * - Comprehensive DNS privacy audit
 *
 * @module dns
 */

// DoH Client — HTTPS-based encrypted DNS
export {
  queryDoH,
  queryCNAME,
  consensusResolve,
  resolveSystemDNS,
  DOH_PROVIDERS,
  type DoHProvider,
  type DoHResponse,
  type ResolvedRecord
} from './DoHClient'

// DoT Client — TLS-based encrypted DNS (port 853)
export {
  queryDoT,
  consensusDoT,
  DOT_PROVIDERS,
  type DoTProvider,
  type DoTResolvedRecord
} from './DoTClient'

// DNS Resolver — Full multi-protocol resolution chain
export { DNSResolver, type DNSSettings, type DNSResolutionStats } from './DNSResolver'

// DNS Leak Test — Comprehensive privacy audit
export {
  runDNSLeakTest,
  runComprehensiveLeakTest,
  type DNSLeakResult,
  type ComprehensiveLeakReport,
  type DNSLeakTestEntry
} from './DNSLeakTest'
