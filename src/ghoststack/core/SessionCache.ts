/**
 * GhostStack Session Cache
 * In-memory only cache for discovered IPs, bypass methods, and block profiles.
 * All data wiped when browser closes. Nothing written to disk. No logs. No telemetry.
 * @module SessionCache
 */

export interface CachedIPEntry {
  ip: string
  cdn: string | null
  method: 'DOH_CONSENSUS' | 'CDN_SCAN' | 'CT_LOG' | 'TEMPORAL_DNS'
  discoveredAt: number
  expiresAt: number
}

export interface CachedBypassEntry {
  engine: 'ipraw' | 'splitcast' | 'temporal' | 'tunnel'
  method: string
  ip: string
  succeededAt: number
}

export interface BlockProfile {
  domain: string
  blockType: BlockType
  localDNSAnswer: string | null
  realDNSAnswer: string | null
  sslIntercepted: boolean
  timestamp: number
  networkSignature: string | null
}

export type BlockType =
  | 'FIREWALL_CATEGORY_BLOCK'
  | 'DNS_HIJACKED'
  | 'DNS_BLOCKED'
  | 'TCP_BLOCKED'
  | 'SSL_INTERCEPTED'
  | 'CAPTIVE_PORTAL'
  | 'SILENT_DROP'
  | 'IP_BLOCKED'

/**
 * Pure in-memory session cache. All state vanishes on process exit.
 * Provides O(1) lookups for IPs, bypass methods, and block profiles.
 */
export class SessionCache {
  private ipCache: Map<string, CachedIPEntry> = new Map()
  private bypassCache: Map<string, CachedBypassEntry> = new Map()
  private blockProfiles: Map<string, BlockProfile> = new Map()
  private stats = {
    sitesBypassed: 0,
    iprawCount: 0,
    splitcastCount: 0,
    temporalCount: 0,
    totalBypassTimeMs: 0,
    bypassCount: 0
  }

  /** Time-to-live for cached IPs in milliseconds (24 hours) */
  private readonly IP_TTL = 86400000

  /**
   * Store a discovered IP for a domain.
   * @param domain - The domain name
   * @param ip - The resolved IP address
   * @param cdn - CDN provider if identified, null otherwise
   * @param method - Discovery method used
   */
  setIP(domain: string, ip: string, cdn: string | null, method: CachedIPEntry['method']): void {
    const now = Date.now()
    this.ipCache.set(domain, {
      ip,
      cdn,
      method,
      discoveredAt: now,
      expiresAt: now + this.IP_TTL
    })
  }

  /**
   * Get a cached IP for a domain. Returns null if not cached or expired.
   * @param domain - The domain to look up
   * @returns Cached IP entry or null
   */
  getIP(domain: string): CachedIPEntry | null {
    const entry = this.ipCache.get(domain)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.ipCache.delete(domain)
      return null
    }
    return entry
  }

  /**
   * Store a successful bypass method for a domain.
   * @param domain - The domain that was bypassed
   * @param engine - Which engine succeeded
   * @param method - Specific method within the engine
   * @param ip - IP address used
   */
  setBypass(domain: string, engine: CachedBypassEntry['engine'], method: string, ip: string): void {
    const isNew = !this.bypassCache.has(domain)
    this.bypassCache.set(domain, {
      engine,
      method,
      ip,
      succeededAt: Date.now()
    })
    if (isNew) this.stats.sitesBypassed++
    if (engine === 'ipraw') this.stats.iprawCount++
    else if (engine === 'splitcast') this.stats.splitcastCount++
    else if (engine === 'temporal') this.stats.temporalCount++
  }

  /**
   * Get a cached bypass method for a domain. Returns null if not cached.
   * @param domain - The domain to look up
   * @returns Cached bypass entry or null
   */
  getBypass(domain: string): CachedBypassEntry | null {
    return this.bypassCache.get(domain) || null
  }

  /**
   * Clear a cached bypass method for a domain.
   * @param domain - The domain to clear
   */
  clearBypass(domain: string): void {
    if (this.bypassCache.has(domain)) {
      this.bypassCache.delete(domain)
      this.stats.sitesBypassed = Math.max(0, this.stats.sitesBypassed - 1)
    }
  }

  /**
   * Store a block profile for a domain.
   * @param profile - The block profile to cache
   */
  setBlockProfile(profile: BlockProfile): void {
    this.blockProfiles.set(profile.domain, profile)
  }

  /**
   * Get a cached block profile for a domain.
   * @param domain - The domain to look up
   * @returns Block profile or null
   */
  getBlockProfile(domain: string): BlockProfile | null {
    return this.blockProfiles.get(domain) || null
  }

  /**
   * Record bypass timing for average calculation.
   * @param timeMs - Time taken to bypass in milliseconds
   */
  recordBypassTime(timeMs: number): void {
    this.stats.totalBypassTimeMs += timeMs
    this.stats.bypassCount++
  }

  /**
   * Get session statistics.
   * @returns Current session stats
   */
  getStats(): {
    sitesBypassed: number
    iprawCount: number
    splitcastCount: number
    temporalCount: number
    averageBypassTimeMs: number
  } {
    return {
      sitesBypassed: this.stats.sitesBypassed,
      iprawCount: this.stats.iprawCount,
      splitcastCount: this.stats.splitcastCount,
      temporalCount: this.stats.temporalCount,
      averageBypassTimeMs:
        this.stats.bypassCount > 0
          ? Math.round(this.stats.totalBypassTimeMs / this.stats.bypassCount)
          : 0
    }
  }

  /**
   * Clear all cached data. Called on browser close.
   */
  clear(): void {
    this.ipCache.clear()
    this.bypassCache.clear()
    this.blockProfiles.clear()
    this.stats = {
      sitesBypassed: 0,
      iprawCount: 0,
      splitcastCount: 0,
      temporalCount: 0,
      totalBypassTimeMs: 0,
      bypassCount: 0
    }
  }

  /**
   * Get count of cached IPs.
   * @returns Number of cached IP entries
   */
  getCachedIPCount(): number {
    return this.ipCache.size
  }

  /**
   * Get count of cached bypasses.
   * @returns Number of cached bypass entries
   */
  getCachedBypassCount(): number {
    return this.bypassCache.size
  }

  /**
   * Get all cached domains with their bypass methods. For diagnostics only.
   * @returns Array of domain-engine pairs
   */
  getAllBypasses(): Array<{ domain: string; engine: string; method: string }> {
    const result: Array<{ domain: string; engine: string; method: string }> = []
    for (const [domain, entry] of this.bypassCache) {
      result.push({ domain, engine: entry.engine, method: entry.method })
    }
    return result
  }
}
