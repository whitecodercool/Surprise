/**
 * GhostStack DNS Resolver — Multi-protocol encrypted DNS resolution chain.
 * Supports DoH + DoT with TTL-aware caching, negative caching, and IPv6.
 * @module DNSResolver
 */
import { queryDoH, consensusResolve, type DoHProvider } from './DoHClient'
import { queryDoT, consensusDoT, type DoTProvider } from './DoTClient'
import type { SessionCache } from '../core/SessionCache'
import { Web3Resolver } from './Web3Resolver'

export interface DNSSettings {
  primaryProvider: DoHProvider
  dnssecValidation: boolean
  customUrl: string | null
  /** Enable DNS-over-TLS as a fallback when DoH fails */
  enableDoT: boolean
  /** Preferred DoT provider */
  dotProvider: DoTProvider
  /** Enable IPv6 (AAAA) resolution alongside IPv4 */
  enableIPv6: boolean
  /** Enable negative caching (cache NXDOMAIN results) */
  enableNegativeCache: boolean
}

/** Cached DNS entry with TTL-aware expiration */
interface DNSCacheEntry {
  ip: string
  ipv6: string | null
  provider: string
  cachedAt: number
  /** TTL from the DNS response in seconds */
  ttl: number
  /** Whether this is a negative (NXDOMAIN) cache entry */
  isNegative: boolean
}

/**
 * Full resolution stats exposed for the HUD/diagnostics.
 */
export interface DNSResolutionStats {
  totalQueries: number
  cacheHits: number
  dohSuccesses: number
  dotSuccesses: number
  consensusSuccesses: number
  failures: number
  averageResolutionMs: number
  cacheSize: number
  negativeCacheSize: number
}

export class DNSResolver {
  private sessionCache: SessionCache
  private settings: DNSSettings = {
    primaryProvider: 'cloudflare',
    dnssecValidation: true,
    customUrl: null,
    enableDoT: true,
    dotProvider: 'cloudflare',
    enableIPv6: false,
    enableNegativeCache: true
  }

  private web3Resolver = new Web3Resolver()

  /** Local TTL-aware DNS cache (separate from SessionCache which tracks bypass IPs) */
  private dnsCache: Map<string, DNSCacheEntry> = new Map()
  /** Negative cache — domains that don't exist */
  private negativeCache: Map<string, DNSCacheEntry> = new Map()
  /** In-flight DoH lookups — coalesces parallel CONNECT requests for the same domain */
  private inFlight: Map<string, Promise<string | null>> = new Map()
  /** Max negative cache TTL (5 minutes) */
  private readonly NEGATIVE_TTL = 300
  /** Max cache size before eviction */
  private readonly MAX_CACHE_SIZE = 2000
  /** Stats tracking */
  private stats = {
    totalQueries: 0,
    cacheHits: 0,
    dohSuccesses: 0,
    dotSuccesses: 0,
    consensusSuccesses: 0,
    failures: 0,
    totalResolutionMs: 0,
    queryCount: 0
  }

  constructor(cache: SessionCache) {
    this.sessionCache = cache

    // Periodic cache cleanup every 5 minutes
    setInterval(() => this.evictExpiredEntries(), 300000)
  }

  /**
   * Resolve a domain using the full multi-protocol resolution chain.
   * Order: Local cache → SessionCache → Primary DoH → Fallback DoH providers
   *        → DoH Consensus → DoT primary → DoT consensus → fail
   */
  async resolve(domain: string): Promise<string | null> {
    this.stats.totalQueries++
    const startTime = Date.now()

    try {
      // 0. Native Web3 Domain Resolution
      if (domain.endsWith('.eth')) {
        const web3Result = await this.web3Resolver.resolve(domain)
        if (web3Result) {
          // Do not cache Web3 results locally to ensure freshness
          return web3Result // Returns ipfs://CID or IP
        }
        return null // If Web3 resolution fails, don't fallback to DoH
      }

      // 1. Local TTL-aware cache
      const cached = this.getCached(domain)
      if (cached !== undefined) {
        this.stats.cacheHits++
        return cached // null for negative cache hits
      }

      // 2. SessionCache (bypass IP cache)
      const sessionCached = this.sessionCache.getIP(domain)
      if (sessionCached) {
        this.stats.cacheHits++
        return sessionCached.ip
      }

      // 3-7. Network resolution — deduplicate parallel CONNECT requests for the same domain
      const existing = this.inFlight.get(domain)
      if (existing) return existing

      const promise = this._networkResolve(domain)
      this.inFlight.set(domain, promise)
      promise.finally(() => this.inFlight.delete(domain))
      return promise
    } finally {
      const elapsed = Date.now() - startTime
      this.stats.totalResolutionMs += elapsed
      this.stats.queryCount++
    }
  }

  /**
   * Resolve both IPv4 and IPv6 addresses for a domain.
   * @returns Object with ipv4 and ipv6 addresses
   */
  async resolveDual(domain: string): Promise<{ ipv4: string | null; ipv6: string | null }> {
    const ipv4 = await this.resolve(domain)

    let ipv6: string | null = null
    if (this.settings.enableIPv6) {
      try {
        const results = await queryDoH(domain, this.settings.primaryProvider, 3000, 'AAAA')
        if (results.length > 0) {
          ipv6 = results[0].ip
          // Update cache with IPv6
          const cached = this.dnsCache.get(domain)
          if (cached) cached.ipv6 = ipv6
        }
      } catch {}
    }

    return { ipv4, ipv6 }
  }

  /** Network resolution chain (steps 3-7). Called once per domain; parallel callers share the same Promise. */
  private async _networkResolve(domain: string): Promise<string | null> {
    // 3. Primary DoH
    const primaryResult = await this.resolveViaDoH(domain, this.settings.primaryProvider)
    if (primaryResult) {
      this.stats.dohSuccesses++
      return primaryResult
    }

    // 4. Fallback DoH providers
    const fallbacks: DoHProvider[] = [
      'cloudflare',
      'google',
      'nextdns',
      'quad9',
      'adguard',
      'mullvad'
    ]
    for (const provider of fallbacks) {
      if (provider === this.settings.primaryProvider) continue
      const result = await this.resolveViaDoH(domain, provider)
      if (result) {
        this.stats.dohSuccesses++
        return result
      }
    }

    // 5. DoH Consensus (query all providers simultaneously)
    try {
      const consensusResult = await consensusResolve(domain)
      if (consensusResult) {
        this.cacheResult(domain, consensusResult.ip, null, consensusResult.provider, 300)
        this.sessionCache.setIP(domain, consensusResult.ip, null, 'DOH_CONSENSUS')
        this.stats.consensusSuccesses++
        return consensusResult.ip
      }
    } catch {}

    // 6. DNS-over-TLS (if DoH is blocked/failing)
    if (this.settings.enableDoT) {
      const dotResult = await this.resolveViaDoT(domain, this.settings.dotProvider)
      if (dotResult) {
        this.stats.dotSuccesses++
        return dotResult
      }

      // 7. DoT consensus (multiple DoT providers)
      try {
        const dotConsensus = await consensusDoT(domain)
        if (dotConsensus) {
          this.cacheResult(domain, dotConsensus.ip, null, dotConsensus.provider, 300)
          this.sessionCache.setIP(domain, dotConsensus.ip, null, 'DOH_CONSENSUS')
          this.stats.dotSuccesses++
          return dotConsensus.ip
        }
      } catch {}
    }

    // All methods failed — negative cache this domain
    if (this.settings.enableNegativeCache) {
      this.cacheNegative(domain)
    }
    this.stats.failures++
    return null
  }

  /** Resolve via a single DoH provider */
  private async resolveViaDoH(domain: string, provider: DoHProvider): Promise<string | null> {
    try {
      const results = await queryDoH(domain, provider, 3000)
      if (results.length > 0) {
        const ttl = results[0].ttl || 300
        this.cacheResult(domain, results[0].ip, null, provider, ttl)
        this.sessionCache.setIP(domain, results[0].ip, null, 'DOH_CONSENSUS')

        // Also resolve AAAA if enabled
        if (this.settings.enableIPv6) {
          queryDoH(domain, provider, 3000, 'AAAA')
            .then((v6results) => {
              if (v6results.length > 0) {
                const cached = this.dnsCache.get(domain)
                if (cached) cached.ipv6 = v6results[0].ip
              }
            })
            .catch(() => {})
        }

        return results[0].ip
      }
    } catch {}
    return null
  }

  /** Resolve via a single DoT provider */
  private async resolveViaDoT(domain: string, provider: DoTProvider): Promise<string | null> {
    try {
      const results = await queryDoT(domain, provider, 1, 5000)
      if (results.length > 0) {
        const ttl = results[0].ttl || 300
        this.cacheResult(domain, results[0].ip, null, `dot_${provider}`, ttl)
        this.sessionCache.setIP(domain, results[0].ip, null, 'DOH_CONSENSUS')

        // Also resolve AAAA via DoT if enabled
        if (this.settings.enableIPv6) {
          queryDoT(domain, provider, 28, 5000)
            .then((v6results) => {
              if (v6results.length > 0) {
                const cached = this.dnsCache.get(domain)
                if (cached) cached.ipv6 = v6results[0].ip
              }
            })
            .catch(() => {})
        }

        return results[0].ip
      }
    } catch {}
    return null
  }

  /** Get a cached result, returns undefined if not cached, null for negative cache */
  private getCached(domain: string): string | null | undefined {
    // Check negative cache first
    if (this.settings.enableNegativeCache) {
      const neg = this.negativeCache.get(domain)
      if (neg) {
        const age = (Date.now() - neg.cachedAt) / 1000
        if (age < neg.ttl) return null // Negative cache hit
        this.negativeCache.delete(domain)
      }
    }

    // Check positive cache
    const entry = this.dnsCache.get(domain)
    if (!entry) return undefined

    const age = (Date.now() - entry.cachedAt) / 1000
    if (age >= entry.ttl) {
      // TTL expired — remove and return undefined
      this.dnsCache.delete(domain)
      return undefined
    }

    return entry.ip
  }

  /** Cache a positive DNS result with its TTL */
  private cacheResult(
    domain: string,
    ip: string,
    ipv6: string | null,
    provider: string,
    ttl: number
  ): void {
    // Enforce max cache size with LRU-style eviction
    if (this.dnsCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest(this.dnsCache)
    }

    this.dnsCache.set(domain, {
      ip,
      ipv6,
      provider,
      cachedAt: Date.now(),
      ttl: Math.max(30, Math.min(ttl, 86400)), // Clamp TTL: 30s min, 24h max
      isNegative: false
    })
  }

  /** Cache a negative (NXDOMAIN) result */
  private cacheNegative(domain: string): void {
    if (this.negativeCache.size >= 500) {
      this.evictOldest(this.negativeCache)
    }

    this.negativeCache.set(domain, {
      ip: '',
      ipv6: null,
      provider: 'negative',
      cachedAt: Date.now(),
      ttl: this.NEGATIVE_TTL,
      isNegative: true
    })
  }

  /** Evict the oldest entry from a cache map */
  private evictOldest(cache: Map<string, DNSCacheEntry>): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of cache) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt
        oldestKey = key
      }
    }

    if (oldestKey) cache.delete(oldestKey)
  }

  /** Remove all expired entries from both caches */
  private evictExpiredEntries(): void {
    const now = Date.now()

    for (const [domain, entry] of this.dnsCache) {
      if ((now - entry.cachedAt) / 1000 >= entry.ttl) {
        this.dnsCache.delete(domain)
      }
    }

    for (const [domain, entry] of this.negativeCache) {
      if ((now - entry.cachedAt) / 1000 >= entry.ttl) {
        this.negativeCache.delete(domain)
      }
    }
  }

  /** Get resolution statistics */
  getResolutionStats(): DNSResolutionStats {
    return {
      totalQueries: this.stats.totalQueries,
      cacheHits: this.stats.cacheHits,
      dohSuccesses: this.stats.dohSuccesses,
      dotSuccesses: this.stats.dotSuccesses,
      consensusSuccesses: this.stats.consensusSuccesses,
      failures: this.stats.failures,
      averageResolutionMs:
        this.stats.queryCount > 0
          ? Math.round(this.stats.totalResolutionMs / this.stats.queryCount)
          : 0,
      cacheSize: this.dnsCache.size,
      negativeCacheSize: this.negativeCache.size
    }
  }

  /** Get the cached IPv6 address for a domain */
  getCachedIPv6(domain: string): string | null {
    const entry = this.dnsCache.get(domain)
    return entry?.ipv6 ?? null
  }

  /** Flush all DNS caches */
  flushCache(): void {
    this.dnsCache.clear()
    this.negativeCache.clear()
  }

  getSettings(): DNSSettings {
    return { ...this.settings }
  }

  updateSettings(s: Partial<DNSSettings>): void {
    this.settings = { ...this.settings, ...s }
  }
}
