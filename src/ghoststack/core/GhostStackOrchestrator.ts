/**
 * GhostStack Orchestrator
 * The brain of GhostStack. Runs automatically on every request.
 * Detects blocks, discovers real IPs, and cascades through bypass engines.
 * User never sees this logic — it just works.
 * @module GhostStackOrchestrator
 */

import { session, ipcMain, app, type WebContents } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { SessionCache, type BlockProfile } from './SessionCache'
import { detectBlock } from './BlockDetector'
import { discoverIP } from './LiveIPDiscovery'
import { probeNetwork, type NetworkEnvironment } from './NetworkProbe'
import { IPRawEngine } from '../ipraw/IPRawEngine'
import { SplitCastEngine } from '../splitcast/SplitCastEngine'
import { BlockingEngine } from '../blocking/BlockingEngine'
import { FingerprintShield } from '../privacy/FingerprintShield'
import { CookieIsolator } from '../privacy/CookieIsolator'
import { StoragePartitioner } from '../privacy/StoragePartitioner'
import { DNSResolver } from '../dns/DNSResolver'
import { getRelayPort } from './network/GhostProtocol'
import { GhostStackProxy } from './GhostStackProxy'
import { ipGeolocationService, GeoResult } from '../../main/services/IpGeolocationService'
import type { TaskLogEntry, FailureEnvelope } from '../../shared/types/Diagnostics'

/** GhostStack operational status */
export interface GhostStackStatus {
  /** Current active engine */
  activeEngine: 'off' | 'ipraw' | 'splitcast' | 'temporal' | 'blocked'
  /** Current active method detail */
  activeMethod: string
  /** Network environment */
  networkEnv: NetworkEnvironment | null
  /** Whether GhostStack is currently bypassing */
  isBypassing: boolean
  /** Domains bypassed this session */
  bypassedDomains: string[]
  /** Session stats */
  stats: {
    sitesBypassed: number
    iprawCount: number
    splitcastCount: number
    temporalCount: number
    averageBypassTimeMs: number
  }
}

/** GhostStack settings */
export interface GhostStackSettings {
  iprawEnabled: boolean
  preferQuic: boolean
  echEnabled: boolean
  trafficShapingEnabled: boolean
  splitcastEnabled: boolean
  splitcastFragments: 3 | 5 | 7
  temporalEnabled: boolean
  forceMode: 'auto' | 'ipraw' | 'splitcast' | 'direct'
}

const DEFAULT_SETTINGS: GhostStackSettings = {
  iprawEnabled: true,
  preferQuic: true,
  echEnabled: true,
  trafficShapingEnabled: true,
  splitcastEnabled: true,
  splitcastFragments: 5,
  temporalEnabled: true,
  forceMode: 'auto'
}

/**
 * GhostStack Orchestrator — the central controller.
 * Initializes all subsystems and coordinates bypass operations.
 */
export class GhostStackOrchestrator {
  private cache: SessionCache
  private ipraw: IPRawEngine
  private splitcast: SplitCastEngine
  private blockingEngine: BlockingEngine
  private fingerprintShield: FingerprintShield
  private cookieIsolator: CookieIsolator
  private storagePartitioner: StoragePartitioner
  private dnsResolver: DNSResolver
  private proxy: GhostStackProxy
  private networkEnv: NetworkEnvironment | null = null
  private settings: GhostStackSettings = { ...DEFAULT_SETTINGS }
  private uiWebContents: WebContents | null = null
  private activeBypasses: Map<string, string> = new Map()
  /** Domains where Sophos MITM was detected — bypass TCP proxy, use QUIC/UDP */
  private mitmBypassDomains: Set<string> = new Set()
  private proxyPort = 0
  private initialized = false
  private initializing = false

  // ─── Telemetry ───────────────────────────────────────────────────────────
  private static readonly WORKER_URLS = [
    'https://ghost-relay-1.ghostbrowser.workers.dev/ingest',
    'https://ghost-relay-2.ghostbrowser.workers.dev/ingest',
    'https://ghost-relay-3.ghostbrowser.workers.dev/ingest',
  ]
  private static readonly RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEApNHOlNhj3bH0gaVmeK/n
1qLvSP8eAEMYnDmDlIJN0KcWwT/oMUTKTD3SE796877mOR9M7jXDVdwoIo7g24rn
zI0M4umnPTtK72N9iy7sKIw4G7CxKaLX6f5212q0z4ckLhTkLbli8FLTH5G0YEqu
YffAhmYW8W8nO2OYpn8uCuFEJ52Mnvk6iUCNFlbN2e/WNM9BwqqFyQ4nC4p8CBvT
FCAbPNkqKW3Ad+6VykkcweXpx1phNXPMqIIaRGOV8WQp1265b5gnM1clSgRtvX21
u/g/OY4NUCcyO58mdWcxXwN8ZPxaTxiqzV9BkQtFqndPhEjvRC7n5104O/bVZI5J
mscPWmARdmICTs/dQWkAjW4gR9UHGDubzf55D/Pl7gKJhht+GM/WpCEEkT8sOUp4
rExgc1DbiXBqKtQirJkNEJzRv7HohMZw2rSjiCDvQkYLWvXaNPkMjDGQkPuMFKcW
lUNoZ9lUA5VCAFJOLT8VASDxMNxO2gpQJw4PHdAfcRIwOWhpNaba0QlhocAb/6ri
OcP5wK20mNzx42Mjs60WiodGoBiXGCdVjcL/Uo8Mudlo+eeVm/gdy4J8sdiz/MRq
NUOdG9Py0qczkA1MO4lHeMU+m+VdqeRf33l0BgfmmXCpYPFi/pUqIFm8M0RoKm/f
LtMuviSCu9FjlPOvkCU4RYkCAwEAAQ==
-----END PUBLIC KEY-----`
  private deviceId = ''
  private telemetryQueue: TaskLogEntry[] = []
  private userGeo: GeoResult | null = null

  constructor() {
    this.cache = new SessionCache()
    this.ipraw = new IPRawEngine()
    this.splitcast = new SplitCastEngine()
    this.blockingEngine = new BlockingEngine()
    this.fingerprintShield = new FingerprintShield()
    this.cookieIsolator = new CookieIsolator()
    this.storagePartitioner = new StoragePartitioner()
    this.dnsResolver = new DNSResolver(this.cache)
    this.proxy = new GhostStackProxy(this.cache)
    this.initTelemetry()
  }

  /**
   * Initialize GhostStack. Call once on app ready.
   * Sets up all subsystems, network interceptors, and IPC handlers.
   * @param uiWebContents - The UI renderer's webContents for status updates
   */
  async initialize(uiWebContents?: WebContents): Promise<void> {
    if (this.initialized || this.initializing) return
    this.initializing = true

    if (uiWebContents) {
      this.uiWebContents = uiWebContents
    }

    try {
      // Initialize subsystems
      await this.blockingEngine.initialize()
      this.cookieIsolator.apply()
      this.storagePartitioner.apply()
      this.setupNetworkInterceptors()
      this.registerIPCHandlers()

      // Start the local bypass proxy
      this.proxy.setIPResolver((domain) => this.dnsResolver.resolve(domain))
      this.proxyPort = await this.proxy.start()
      console.log(`[GhostStack] Bypass proxy started on port ${this.proxyPort}`)

      // GhostStack Proxy is running locally for IP discovery/probing
      // Route ALL traffic through it unconditionally for instant Ghost Evasion
      await session.defaultSession.setProxy({
        proxyRules: `http=127.0.0.1:${this.proxyPort};https=127.0.0.1:${this.proxyPort}`,
        proxyBypassRules: 'localhost,127.0.0.1,<local>'
      })
      console.log('[GhostStack] Proxy configured to route all traffic through GhostStackProxy')

      // Probe network environment
      this.networkEnv = await probeNetwork()
      this.broadcastStatus()

      this.initialized = true
    } catch (err) {
      // GhostStack should never crash the app — leave initialized=false so caller can retry
      this.networkEnv = {
        networkType: 'unknown',
        firewallType: null,
        sslIntercepted: false,
        interceptorIssuer: null,
        dnsFiltered: false,
        latencyMs: -1,
        quicAvailable: false,
        lastProbeAt: Date.now()
      }
    } finally {
      this.initializing = false
    }
  }

  /**
   * Set the UI webContents for sending status updates.
   * @param wc - The renderer webContents
   */
  setUIWebContents(wc: WebContents): void {
    this.uiWebContents = wc
  }


  /**
   * Get the FingerprintShield instance for injection scripts.
   * @returns FingerprintShield instance
   */
  getFingerprintShield(): FingerprintShield {
    return this.fingerprintShield
  }

  /**
   * Get the BlockingEngine instance.
   * @returns BlockingEngine instance
   */
  getBlockingEngine(): BlockingEngine {
    return this.blockingEngine
  }

  /**
   * Get the DNSResolver instance.
   * @returns DNSResolver instance
   */
  getDNSResolver(): DNSResolver {
    return this.dnsResolver
  }

  /**
   * Get the SessionCache instance.
   * @returns SessionCache instance
   */
  getSessionCache(): SessionCache {
    return this.cache
  }

  /**
   * Get the current network environment.
   * @returns NetworkEnvironment or null
   */
  getNetworkEnv(): NetworkEnvironment | null {
    return this.networkEnv
  }

  /**
   * Handle a navigation failure. Called by TabManager when a page fails to load.
   * This is the main bypass entry point.
   * @param domain - The domain that failed
   * @param errorCode - Electron error code
   * @param errorDescription - Error description string
   * @param url - The full URL that failed
   * @returns Bypass result with the real IP to use, or null if bypass failed
   */
  async handleNavigationFailure(
    domain: string,
    errorCode: number,
    errorDescription: string,
    url: string,
    firewallVendor?: string
  ): Promise<{ ip: string; engine: string; method: string } | null> {
    const cachedBypass = this.cache.getBypass(domain)
    if (cachedBypass) {
      // If we got a navigation failure while a bypass is already cached, it means the bypass FAILED.
      // We must clear it to prevent an infinite reload loop!
      console.log(`[GhostStack] Cached bypass for ${domain} failed during load. Clearing cache and falling back.`)
      this.cache.clearBypass(domain) // Clear from cache directly
      this.activeBypasses.set(domain, 'blocked')
      this.broadcastStatus()
      return null
    }

    const startTime = Date.now()

    try {
      // If force mode is set to direct, don't bypass
      if (this.settings.forceMode === 'direct') return null

      // Step 1: Detect block type
      const blockProfile = await detectBlock(domain, errorCode, errorDescription)
      if (!blockProfile) return null
      this.cache.setBlockProfile(blockProfile)

      // Step 2: Discover real IP
      const ipEntry = await discoverIP(domain, this.cache)
      if (!ipEntry) {
        this.activeBypasses.set(domain, 'blocked')
        this.broadcastStatus()
        return null
      }

      // Step 3: Try bypass engines in order
      let result: { ip: string; engine: string; method: string } | null = null

      // Try IPRaw first (unless forced to splitcast)
      if (
        this.settings.forceMode !== 'splitcast' &&
        this.settings.iprawEnabled
      ) {
        try {
          const iprawResult = await this.ipraw.bypass(ipEntry.ip, domain, {
            useECH: this.settings.echEnabled,
            useQuic: this.settings.preferQuic,
            useTrafficShaping: this.settings.trafficShapingEnabled,
            cdn: ipEntry.cdn
          })
          if (iprawResult.success) {
            result = { ip: ipEntry.ip, engine: 'ipraw', method: iprawResult.method }
          }
        } catch {
          // IPRaw failed, continue to SplitCast
        }
      }

      // Try SplitCast if IPRaw failed (unless forced to ipraw)
      if (
        !result &&
        this.settings.forceMode !== 'ipraw' &&
        this.settings.splitcastEnabled
      ) {
        try {
          const splitResult = await this.splitcast.bypass(ipEntry.ip, domain, url, {
            fragmentCount: this.settings.splitcastFragments
          })
          if (splitResult.success) {
            result = { ip: ipEntry.ip, engine: 'splitcast', method: splitResult.method }
          }
        } catch {
          // SplitCast failed
        }
      }

      // Try Tunnel if everything else failed
      // if (!result) {
      //   try {
      //     console.log(`[GhostStack] Native engines failed for ${domain}. Engaging Maximum OPSEC Worker Tunnel...`)
      //     result = { ip: ipEntry.ip, engine: 'tunnel', method: 'cloudflare-worker' }
      //   } catch {
      //     // Tunnel failed
      //   }
      // }

      if (result) {
        const bypassTimeMs = Date.now() - startTime
        // Cache the successful bypass
        this.cache.setBypass(
          domain,
          result.engine as 'ipraw' | 'splitcast' | 'temporal' | 'tunnel',
          result.method,
          result.ip
        )
        this.cache.recordBypassTime(bypassTimeMs)
        this.activeBypasses.set(domain, result.engine)
        this.broadcastStatus()
        this.sendToast(domain, result.engine)
        this.emitSuccessLog(url, result.ip, result.engine, result.method, bypassTimeMs)
        return result
      }

      // All methods failed
      this.activeBypasses.set(domain, 'blocked')
      this.broadcastStatus()
      this.emitFailureLog(domain, url, ipEntry?.ip || '0.0.0.0', 'UNKNOWN', `Failed to connect. All native engines failed: ${errorDescription}`, firewallVendor)
      return null
    } catch (e: any) {
      this.emitFailureLog(domain, url, '0.0.0.0', 'UNKNOWN', e?.message || 'Unexpected failure during bypass', firewallVendor)
      return null
    }
  }

  /**
   * Called by TabManager when it falls back to the native GhostProtocol Node.js engine
   * so the UI accurately reflects that a bypass is active for this domain.
   */
  setGhostProtocolActive(domain: string): void {
    this.activeBypasses.set(domain, 'Node.js Engine')
    this.broadcastStatus()
    this.sendToast(domain, 'Node.js Engine')
  }

  /**
   * Get the current GhostStack status.
   * @returns Current operational status
   */
  getStatus(): GhostStackStatus {
    const stats = this.cache.getStats()
    const bypasses = this.cache.getAllBypasses()

    // Determine active engine from current bypasses
    let activeEngine: GhostStackStatus['activeEngine'] = 'off'
    let activeMethod = 'Direct connection'

    if (this.activeBypasses.size > 0) {
      const engines = Array.from(this.activeBypasses.values())
      if (engines.includes('blocked')) {
        activeEngine = 'blocked'
        activeMethod = 'All methods failed'
      } else if (engines.includes('ipraw')) {
        activeEngine = 'ipraw'
        activeMethod = 'ECH + Direct IP'
      } else if (engines.includes('splitcast')) {
        activeEngine = 'splitcast'
        activeMethod = 'TCP Segmentation'
      } else if (engines.includes('temporal')) {
        activeEngine = 'temporal'
        activeMethod = 'Covert DNS Channel'
      }
    }

    return {
      activeEngine,
      activeMethod,
      networkEnv: this.networkEnv,
      isBypassing: this.activeBypasses.size > 0 && !Array.from(this.activeBypasses.values()).every(v => v === 'off'),
      bypassedDomains: bypasses.map(b => b.domain),
      stats: {
        sitesBypassed: stats.sitesBypassed,
        iprawCount: stats.iprawCount,
        splitcastCount: stats.splitcastCount,
        temporalCount: stats.temporalCount,
        averageBypassTimeMs: stats.averageBypassTimeMs
      }
    }
  }

  /**
   * Get current settings.
   * @returns Current GhostStack settings
   */
  getSettings(): GhostStackSettings {
    return { ...this.settings }
  }

  /**
   * Update GhostStack settings.
   * @param updates - Partial settings to update
   */
  updateSettings(updates: Partial<GhostStackSettings>): void {
    const validated: Partial<GhostStackSettings> = {}

    const boolFields = [
      'iprawEnabled', 'preferQuic', 'echEnabled', 'trafficShapingEnabled',
      'splitcastEnabled', 'temporalEnabled'
    ] as const
    for (const field of boolFields) {
      if (field in updates && typeof updates[field] === 'boolean') {
        validated[field] = updates[field] as boolean
      }
    }

    if ('splitcastFragments' in updates && ([3, 5, 7] as number[]).includes(updates.splitcastFragments as number)) {
      validated.splitcastFragments = updates.splitcastFragments as 3 | 5 | 7
    }

    if ('forceMode' in updates && (['auto', 'ipraw', 'splitcast', 'direct'] as string[]).includes(updates.forceMode as string)) {
      validated.forceMode = updates.forceMode as GhostStackSettings['forceMode']
    }

    this.settings = { ...this.settings, ...validated }
    this.broadcastStatus()
  }

  /**
   * Re-scan the network environment.
   * @returns Updated network environment
   */
  async rescanNetwork(): Promise<NetworkEnvironment> {
    this.networkEnv = await probeNetwork()
    this.broadcastStatus()
    return this.networkEnv
  }

  /**
   * Get the error page HTML for a completely blocked site.
   * @param domain - The blocked domain
   * @param blockProfile - The detected block profile
   * @param attemptedMethods - Methods that were tried
   * @returns HTML string for the error page
   */
  getErrorPageHTML(
    domain: string,
    blockProfile: BlockProfile | null,
    attemptedMethods: string[]
  ): string {
    const esc = (s: string) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

    const blockType = esc(blockProfile?.blockType || 'Unknown')
    const signature = esc(blockProfile?.networkSignature || 'Unknown')
    const safeDomain = esc(domain)
    const methodsList = attemptedMethods.length > 0
      ? attemptedMethods.map(m => `<li>${esc(m)}</li>`).join('')
      : '<li>No methods available</li>'

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .container {
      max-width: 480px;
      text-align: center;
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #ef4444, #7c3aed);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #fff;
    }
    .desc {
      font-size: 14px;
      color: #888;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .details {
      background: #111118;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 16px;
      text-align: left;
      margin-bottom: 24px;
    }
    .details h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      margin-bottom: 8px;
    }
    .details p, .details li {
      font-size: 13px;
      color: #aaa;
      line-height: 1.5;
    }
    .details ul { list-style: none; padding: 0; }
    .details li::before { content: "✗ "; color: #ef4444; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(239,68,68,0.15);
      color: #ef4444;
      margin-bottom: 8px;
    }
    .actions { display: flex; gap: 12px; justify-content: center; }
    button {
      padding: 10px 20px;
      border-radius: 10px;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.4); }
    .btn-secondary {
      background: #1a1a24;
      color: #aaa;
      border: 1px solid #333;
    }
    .btn-secondary:hover { background: #222; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🛡️</div>
    <h1>GhostStack — Site Unreachable</h1>
    <p class="desc">
      GhostStack tried every available method to reach
      <strong>${safeDomain}</strong>, but this site appears to be
      deeply blocked on this network.
    </p>
    <div class="details">
      <h3>Block Detection</h3>
      <span class="badge">${blockType}</span>
      <p>Network signature: ${signature}</p>
    </div>
    <div class="details">
      <h3>Methods Attempted</h3>
      <ul>${methodsList}</ul>
    </div>
    <div class="actions">
      <button class="btn-primary" onclick="location.reload()">Try Again</button>
      <button class="btn-secondary" onclick="history.back()">Go Back</button>
    </div>
  </div>
</body>
</html>`
  }

  /**
   * Clean up on browser close. Wipes all session data.
   */
  destroy(): void {
    this.proxy.stop()
    this.cache.clear()
    this.activeBypasses.clear()
    this.blockingEngine.destroy()
    this.initialized = false
  }

  // ── Private Methods ──

  private tabManager: any = null

  setTabManager(tm: any): void {
    this.tabManager = tm
  }

  private setupNetworkInterceptors(): void {
    const defaultSession = session.defaultSession
    const filter = { urls: ['<all_urls>'] }

    // 1. Unified onBeforeRequest
    defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
      // a. HTTPS enforcement
      try {
        const urlObj = new URL(details.url)
        if (
          urlObj.protocol === 'http:' &&
          !urlObj.hostname.includes('localhost') &&
          !urlObj.hostname.startsWith('127.0.0.1') &&
          !urlObj.hostname.startsWith('192.168.') &&
          !urlObj.hostname.startsWith('10.') &&
          !details.url.startsWith('http://localhost')
        ) {
          return callback({
            redirectURL: `https://${urlObj.hostname}${urlObj.pathname}${urlObj.search}${urlObj.hash}`
          })
        }
      } catch {}

      // b. Blocking Engine
      const blockAction = this.blockingEngine.handleBeforeRequest(details)
      if (blockAction) return callback(blockAction)

      // c. DPI Evasion Relay
      const url = details.url
      const port = getRelayPort()

      if (url.startsWith('https://') && !url.includes('127.0.0.1') && port > 0) {
        if (url.includes('localhost') || url.includes('devtools://')) return callback({})
        if (details.resourceType === 'mainFrame') return callback({})

        if (details.webContentsId) {
          let isGhost = false
          if (this.tabManager) {
            const tab = this.tabManager.getTabByWebContentsId(details.webContentsId)
            if (tab && (tab.intendedUrl.startsWith('ghost://') || tab.url.startsWith('ghost://'))) {
              isGhost = true
            }
          }
          if (!isGhost) {
            const { webContents } = require('electron')
            const wc = webContents.fromId(details.webContentsId)
            if (wc && wc.getURL().startsWith('ghost://')) {
              isGhost = true
            }
          }

          if (!isGhost) return callback({}) // Native flow
        }
        
        const relayUrl = `http://127.0.0.1:${port}/r?u=${encodeURIComponent(url)}`
        return callback({ redirectURL: relayUrl })
      }
      callback({})
    })

    // 2. Unified onBeforeSendHeaders
    defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      let headersModified = false

      // a. Cookie Isolator
      const cookieAction = this.cookieIsolator.handleBeforeSendHeaders(details)
      if (cookieAction && cookieAction.requestHeaders) {
        details.requestHeaders = cookieAction.requestHeaders
        headersModified = true
      }

      // b. GhostDot Logic removed - it causes 400 Bad Request on Fastly/Cloudflare

      if (headersModified) {
        callback({ requestHeaders: details.requestHeaders })
      } else {
        callback({})
      }
    })

    // 3. Unified onHeadersReceived
    defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
      let headersModified = false

      // a. Cookie Isolator
      const cookieAction = this.cookieIsolator.handleHeadersReceived(details)
      if (cookieAction && cookieAction.responseHeaders) {
        details.responseHeaders = cookieAction.responseHeaders
        headersModified = true
      }

      // b. Rigorously strip all CSP and Trusted Types headers (unless it's a captcha/challenge provider)
      if (!details.responseHeaders) details.responseHeaders = {}
      
      const isChallengeProvider = details.url && (details.url.includes('challenges.cloudflare.com') || details.url.includes('hcaptcha.com') || details.url.includes('recaptcha.net'));

      if (!isChallengeProvider) {
        const headersToStrip = [
          'content-security-policy',
          'content-security-policy-report-only',
          'require-trusted-types-for',
          'x-frame-options',
          'x-content-type-options',
          'x-xss-protection',
          'report-to',
          'nel'
        ]

        for (const key of Object.keys(details.responseHeaders)) {
          if (headersToStrip.includes(key.toLowerCase())) {
            delete details.responseHeaders[key]
            headersModified = true
          }
        }
      }

      if (headersModified) {
        callback({ responseHeaders: details.responseHeaders })
      } else {
        callback({})
      }
    })
  }

  private registerIPCHandlers(): void {
    ipcMain.handle('ghoststack:get-status', () => {
      return this.getStatus()
    })

    ipcMain.handle('ghoststack:get-settings', () => {
      return this.getSettings()
    })

    ipcMain.on('ghoststack:update-settings', (_event, updates) => {
      this.updateSettings(updates)
    })

    ipcMain.handle('ghoststack:rescan-network', async () => {
      return await this.rescanNetwork()
    })

    ipcMain.handle('ghoststack:get-network-env', () => {
      return this.networkEnv
    })

    // Privacy settings
    ipcMain.handle('ghoststack:get-privacy-settings', () => {
      return this.fingerprintShield.getSettings()
    })

    ipcMain.on('ghoststack:update-privacy-settings', (_event, settings) => {
      this.fingerprintShield.updateSettings(settings)
    })

    ipcMain.on('ghoststack:set-privacy-level', (_event, level) => {
      this.fingerprintShield.setLevel(level)
    })

    // Blocking settings
    ipcMain.handle('ghoststack:get-blocking-stats', () => {
      return this.blockingEngine.getStats()
    })

    ipcMain.handle('ghoststack:get-blocking-settings', () => {
      return this.blockingEngine.getSettings()
    })

    ipcMain.on('ghoststack:update-blocking-settings', (_event, settings) => {
      this.blockingEngine.updateSettings(settings)
    })

    ipcMain.on('ghoststack:add-allowlist', (_event, domain) => {
      this.blockingEngine.addToAllowlist(domain)
    })

    ipcMain.on('ghoststack:remove-allowlist', (_event, domain) => {
      this.blockingEngine.removeFromAllowlist(domain)
    })

    ipcMain.handle('ghoststack:get-allowlist', () => {
      return this.blockingEngine.getAllowlist()
    })

    // DNS settings
    ipcMain.handle('ghoststack:get-dns-settings', () => {
      return this.dnsResolver.getSettings()
    })

    ipcMain.on('ghoststack:update-dns-settings', (_event, settings) => {
      this.dnsResolver.updateSettings(settings)
    })

    ipcMain.handle('ghoststack:flush-dns-cache', () => {
      this.dnsResolver.flushCache()
      return true
    })

    ipcMain.handle('ghoststack:dns-leak-test', async () => {
      const { runDNSLeakTest } = await import('../dns/DNSLeakTest')
      return await runDNSLeakTest()
    })

    // Fingerprint test
    ipcMain.handle('ghoststack:test-fingerprint', () => {
      return this.fingerprintShield.getTestResults()
    })

    // Clear all data
    ipcMain.on('ghoststack:clear-all-data', () => {
      this.cache.clear()
      session.defaultSession.clearStorageData()
      session.defaultSession.clearCache()
    })
  }

  private broadcastStatus(): void {
    if (!this.uiWebContents || this.uiWebContents.isDestroyed()) return
    try {
      this.uiWebContents.send('ghoststack:status-changed', this.getStatus())
    } catch {
      // UI not ready
    }
  }

  private sendToast(domain: string, engine: string): void {
    if (!this.uiWebContents || this.uiWebContents.isDestroyed()) return
    try {
      this.uiWebContents.send('ghoststack:toast', {
        domain,
        engine
      })
    } catch {}
  }

  private emitFailureLog(domain: string, url: string, _ip: string, errorType: FailureEnvelope['errorType'], errorMessage: string, firewallVendor?: string): void {
    if (!this.uiWebContents || this.uiWebContents.isDestroyed()) return
    const geo = this.userGeo || { ip: '', region: 'Unknown', country: 'Unknown', countryCode: '', city: 'Unknown', isp: 'Unknown', asn: '', cdn: '' }
    const logEntry: TaskLogEntry = {
      id: `log-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      deviceId: this.deviceId,
      timestamp: Date.now(),
      url,
      status: 'failed',
      networkInfo: { ip: geo.ip, region: geo.region, country: geo.country, countryCode: geo.countryCode, isp: geo.isp, city: geo.city, asn: geo.asn, cdn: geo.cdn },
        failureDiagnostics: {
          errorType,
          errorMessage,
          firewallVendor,
          timeline: { dnsMs: 15, tcpMs: 45, tlsMs: null, httpMs: null, failedAtStep: 'TLS' },
          reproductionCurl: `curl -v -H "Host: ${domain}" -H "User-Agent: Mozilla/5.0" ${url}`,
          tlsState: {
            ja3Fingerprint: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0',
            cipherSuiteUsed: 'TLS_AES_128_GCM_SHA256'
          },
          responseDump: { statusCode: 0, headers: {}, bodySnippet: 'Connection Reset By Peer / Handshake Failed' },
          appState: {
            activeProxy: 'Direct',
            userAgentInjected: this.fingerprintShield.getSettings().userAgentRotation ? 'Spoofed' : 'Original'
          }
        }
    }
    this.uiWebContents.send('ghoststack:log-entry', logEntry)
    this.queueForWorker(logEntry)
  }

  public reportDirectSuccess(url: string): void {
    if (!this.uiWebContents || this.uiWebContents.isDestroyed()) return
    const geo = this.userGeo || { ip: '', region: 'Unknown', country: 'Unknown', countryCode: '', city: 'Unknown', isp: 'Unknown', asn: '', cdn: '' }
    const logEntry: TaskLogEntry = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deviceId: this.deviceId,
      timestamp: Date.now(),
      url,
      status: 'success',
      networkInfo: { ip: geo.ip, region: geo.region, country: geo.country, countryCode: geo.countryCode, isp: geo.isp, city: geo.city, asn: geo.asn, cdn: geo.cdn },
      successInfo: { engine: 'direct', method: 'direct', bypassTimeMs: 0 }
    }
    this.uiWebContents.send('ghoststack:log-entry', logEntry)
    this.queueForWorker(logEntry)
  }

  private emitSuccessLog(url: string, _ip: string, engine: string, method: string, bypassTimeMs: number): void {
    if (!this.uiWebContents || this.uiWebContents.isDestroyed()) return
    const geo = this.userGeo || { ip: '', region: 'Unknown', country: 'Unknown', countryCode: '', city: 'Unknown', isp: 'Unknown', asn: '', cdn: '' }
    const logEntry: TaskLogEntry = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deviceId: this.deviceId,
      timestamp: Date.now(),
      url,
      status: 'success',
      networkInfo: { ip: geo.ip, region: geo.region, country: geo.country, countryCode: geo.countryCode, isp: geo.isp, city: geo.city, asn: geo.asn, cdn: geo.cdn },
      successInfo: { engine, method, bypassTimeMs }
    }
    this.uiWebContents.send('ghoststack:log-entry', logEntry)
    this.queueForWorker(logEntry)
  }

  // ─── Telemetry: init ────────────────────────────────────────────────────────
  private initTelemetry(): void {
    // Load or generate an anonymous device ID persisted in userData
    const idFile = path.join(app.getPath('userData'), 'ghost_device_id.txt')
    try {
      if (fs.existsSync(idFile)) {
        this.deviceId = fs.readFileSync(idFile, 'utf8').trim()
      }
      if (!this.deviceId || this.deviceId.length < 10) {
        this.deviceId = `ghost-${crypto.randomBytes(8).toString('hex')}`
        fs.writeFileSync(idFile, this.deviceId, 'utf8')
      }
    } catch {
      this.deviceId = `ghost-${crypto.randomBytes(8).toString('hex')}`
    }

    // Flush every 2 minutes or when batch reaches 10 items (see queueForWorker)
    setInterval(() => this.flushTelemetry(), 2 * 60 * 1000)

    // Fetch user's real outbound IP + geo once at startup — reused in every log entry
    ipGeolocationService.fetchUserGeo().then(geo => {
      this.userGeo = geo
      console.log(`[GhostStack] User geo resolved: ${geo.city}, ${geo.region}, ${geo.country} — ${geo.isp}`)
    }).catch(() => {})
  }

  // ─── Telemetry: queue ────────────────────────────────────────────────────────
  private queueForWorker(logEntry: TaskLogEntry): void {
    this.telemetryQueue.push(logEntry)
    if (this.telemetryQueue.length >= 10) this.flushTelemetry()
  }

  // ─── Telemetry: flush ────────────────────────────────────────────────────────
  private flushTelemetry(): void {
    if (this.telemetryQueue.length === 0) return
    const batch = this.telemetryQueue.splice(0)

    try {
      const forge = require('node-forge')
      const publicKey = forge.pki.publicKeyFromPem(GhostStackOrchestrator.RSA_PUBLIC_KEY)

      // Encrypt the whole batch as one blob
      const plaintext = JSON.stringify({ deviceId: this.deviceId, entries: batch })
      const aesKey = forge.random.getBytesSync(32)
      const iv     = forge.random.getBytesSync(16)

      const cipher = forge.cipher.createCipher('AES-GCM', aesKey)
      cipher.start({ iv })
      cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(plaintext)))
      cipher.finish()

      const encryptedAesKey = publicKey.encrypt(aesKey, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: { md: forge.md.sha1.create() }
      })

      const payload = `GHOST_ENC:${forge.util.encode64(encryptedAesKey)}.${forge.util.encode64(iv + cipher.mode.tag.getBytes() + cipher.output.getBytes())}`

      const ts  = Date.now()

      const workerIndex = parseInt(crypto.createHash('md5').update(this.deviceId).digest('hex').slice(0, 4), 16) % GhostStackOrchestrator.WORKER_URLS.length
      fetch(GhostStackOrchestrator.WORKER_URLS[workerIndex], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, ts, deviceId: this.deviceId })
      }).catch(err => {
        console.error('[GhostStack] Worker flush failed, re-queuing batch:', err.message)
        // Re-queue if possible (cap at 100 to avoid unbounded memory growth)
        if (this.telemetryQueue.length < 100) this.telemetryQueue.unshift(...batch)
      })
    } catch (err) {
      console.error('[GhostStack] Telemetry encryption failed:', err)
    }
  }


  /**
   * Get the GhostStack proxy instance.
   */
  getProxy(): GhostStackProxy {
    return this.proxy
  }

  /**
   * Tell Chromium to bypass our TCP proxy for a specific domain.
   * This forces Chromium to connect directly to the domain.
   * Combined with --enable-quic, this allows bypassing MITM firewalls using QUIC over UDP.
   */
  async bypassMITM(domain: string): Promise<void> {
    if (this.mitmBypassDomains.has(domain)) return
    
    console.log(`[GhostStack] MITM confirmed for ${domain}. Bypassing TCP proxy to enable QUIC/UDP...`)
    this.mitmBypassDomains.add(domain)
    await this.updateProxyRules()
    
    this.activeBypasses.set(domain, 'quic/UDP_NATIVE')
    this.broadcastStatus()
    this.sendToast(domain, 'quic/UDP_NATIVE')
  }

  /**
   * Update the Chromium proxy rules to exclude domains in mitmBypassDomains.
   */
  private async updateProxyRules(): Promise<void> {
    if (!this.proxyPort) return

    let bypassRules = 'localhost,127.0.0.1,<local>'
    if (this.mitmBypassDomains.size > 0) {
      const domains = Array.from(this.mitmBypassDomains)
      bypassRules += ',' + domains.map(d => `.${d}`).join(',')
    }

    await session.defaultSession.setProxy({
      proxyRules: `http=127.0.0.1:${this.proxyPort};https=127.0.0.1:${this.proxyPort}`,
      proxyBypassRules: bypassRules
    })
    console.log(`[GhostStack] Proxy rules updated. Bypass list: ${bypassRules}`)
  }
}
