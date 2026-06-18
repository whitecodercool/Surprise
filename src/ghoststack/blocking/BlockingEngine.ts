/**
 * GhostStack Blocking Engine
 * Network-level ad/tracker blocking via Electron session.webRequest.
 * @module BlockingEngine
 */

import { BloomFilter } from './BloomFilter'
import { URLStripper } from './URLStripper'

export interface BlockingSettings {
  ads: boolean
  trackers: boolean
  socialWidgets: boolean
  cookieConsent: boolean
  cryptoMiners: boolean
  malware: boolean
  analytics: boolean
  stripTrackingParams: boolean
}

export interface BlockingStats {
  adsBlocked: number
  trackersBlocked: number
  bandwidthSavedBytes: number
  trackingUrlsStripped: number
}

/** Built-in tracker domains */
const TRACKER_DOMAINS = [
  'google-analytics.com',
  'doubleclick.net',
  'facebook.net',
  'connect.facebook.net',
  'pixel.facebook.com',
  'analytics.yahoo.com',
  'scorecardresearch.com',
  'quantserve.com',
  'adservice.google.com',
  'googlesyndication.com',
  'googleadservices.com',
  'amazon-adsystem.com',
  'criteo.com',
  'outbrain.com',
  'taboola.com',
  'moatads.com',
  'adsafeprotected.com',
  'bidswitch.net',
  'casalemedia.com',
  'demdex.net',
  'exelator.com',
  'eyeota.net',
  'liadm.com',
  'mathtag.com',
  'mxptint.net',
  'openx.net',
  'pubmatic.com',
  'rfihub.com',
  'rlcdn.com',
  'rubiconproject.com',
  'serving-sys.com',
  'sharethrough.com',
  'simpli.fi',
  'spotxchange.com',
  'tapad.com',
  'tremorhub.com',
  'turn.com',
  'undertone.com',
  'zedo.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'amplitude.com',
  'fullstory.com',
  'newrelic.com',
  'sentry.io',
  'cookiebot.com',
  'onetrust.com',
  'trustarc.com',
  'consensu.org',
  'coinhive.com',
  'coin-hive.com',
  'jsecoin.com',
  'cryptoloot.pro',
  'minero.cc',
  'addthis.com',
  'sharethis.com',
  'sumo.com'
]

const SOCIAL_WIDGETS = [
  'platform.twitter.com',
  'connect.facebook.net',
  'platform.linkedin.com',
  'apis.google.com/js/platform.js'
]
const CRYPTO_MINERS = [
  'coinhive.com',
  'coin-hive.com',
  'jsecoin.com',
  'cryptoloot.pro',
  'minero.cc',
  'webminepool.com'
]

export class BlockingEngine {
  private bloomFilter: BloomFilter

  private settings: BlockingSettings
  private stats: BlockingStats = {
    adsBlocked: 0,
    trackersBlocked: 0,
    bandwidthSavedBytes: 0,
    trackingUrlsStripped: 0
  }
  private allowlist: Set<string> = new Set()

  constructor() {
    this.bloomFilter = new BloomFilter(100000, 7)
    this.settings = {
      ads: true,
      trackers: true,
      socialWidgets: true,
      cookieConsent: true,
      cryptoMiners: true,
      malware: true,
      analytics: true,
      stripTrackingParams: true
    }
  }

  /** Initialize the blocking engine — populate bloom filter */
  async initialize(): Promise<void> {
    for (const domain of TRACKER_DOMAINS) this.bloomFilter.add(domain)
    for (const d of SOCIAL_WIDGETS) this.bloomFilter.add(d)
    for (const d of CRYPTO_MINERS) this.bloomFilter.add(d)
  }

  /** Handle Electron webRequest interceptor */
  handleBeforeRequest(
    details: Electron.OnBeforeRequestListenerDetails
  ): Electron.CallbackResponse | null {
    try {
      let urlStr = details.url
      // Unwrap GhostProtocol local relay URLs so we can block the actual domain
      if (urlStr.startsWith('http://127.0.0.1') && urlStr.includes('/r?u=')) {
        const uParams = new URL(urlStr)
        const innerUrl = uParams.searchParams.get('u')
        if (innerUrl) {
          urlStr = innerUrl
        }
      }

      const url = new URL(urlStr)
      const domain = url.hostname

      // 1. URL Parameter Stripping
      // We only strip on GET requests (main navigation) to prevent corrupting POST payloads
      if (this.settings.stripTrackingParams && details.method === 'GET') {
        const cleaned = URLStripper.cleanUrl(details.url)
        if (cleaned) {
          this.stats.trackingUrlsStripped++
          // Redirect the browser instantly to the clean URL before the page even loads
          return { redirectURL: cleaned }
        }
      }

      // 2. Allowlist Check
      if (this.allowlist.has(domain)) return null

      // 3. Ad & Tracker Domain Block
      if (this.shouldBlock(domain)) {
        console.log(`[BlockingEngine] Blocked domain: ${domain} (url: ${urlStr})`)
        this.stats.adsBlocked++
        this.stats.bandwidthSavedBytes += 15000 // avg ad size estimate
        return { cancel: true }
      }
    } catch {}
    return null
  }

  /** Check if a domain should be blocked */
  private shouldBlock(domain: string): boolean {
    if (!this.settings.ads && !this.settings.trackers) return false
    if (this.bloomFilter.has(domain)) return true
    // Check parent domains
    const parts = domain.split('.')
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.')
      if (this.bloomFilter.has(parent)) return true
    }
    return false
  }

  getStats(): BlockingStats {
    return { ...this.stats }
  }
  getSettings(): BlockingSettings {
    return { ...this.settings }
  }
  updateSettings(s: Partial<BlockingSettings>): void {
    this.settings = { ...this.settings, ...s }
  }
  addToAllowlist(d: string): void {
    this.allowlist.add(d)
  }
  removeFromAllowlist(d: string): void {
    this.allowlist.delete(d)
  }
  getAllowlist(): string[] {
    return Array.from(this.allowlist)
  }
  destroy(): void {
    this.stats = {
      adsBlocked: 0,
      trackersBlocked: 0,
      bandwidthSavedBytes: 0,
      trackingUrlsStripped: 0
    }
  }
}
