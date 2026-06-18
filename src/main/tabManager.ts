import { BaseWindow, WebContentsView, Menu, clipboard } from 'electron'
import { WindowManager } from './windowManager'
import type { GhostStackOrchestrator } from '../ghoststack/core/GhostStackOrchestrator'
import { createWindow } from './index'

interface ManagedTab {
  id: string
  view: WebContentsView
  url: string
  title: string
  lastAccessed: number
  isSuspended: boolean
  isPinned: boolean
  intendedUrl: string
  bypassJustLogged: boolean
  lastLoggedHostname: string | null
  firewallVendor: string | undefined
}

let tabIdCounter = 0

export class TabManager {
  private tabs: Map<string, ManagedTab> = new Map()
  private activeTabId: string | null = null
  private splitMode: 'none' | 'horizontal' | 'vertical' = 'none'
  private splitSecondaryId: string | null = null
  private isOverlayActive: boolean = false

  constructor(
    private window: BaseWindow,
    private uiView: WebContentsView,
    private windowManager: WindowManager,
    private ghostStack: GhostStackOrchestrator
  ) {
    this.startSuspensionMonitor()
  }

  createTab(url: string): string {
    const id = `tab-${++tabIdCounter}`
    const normalizedUrl = this.normalizeUrl(url)

    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        preload: require('path').join(__dirname, '../preload/tab.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    })

    view.setBackgroundColor('#ffffff')

    const managedTab: ManagedTab = {
      id,
      view,
      url: normalizedUrl,
      title: 'New Tab',
      lastAccessed: Date.now(),
      isSuspended: false,
      isPinned: false,
      intendedUrl: normalizedUrl,
      bypassJustLogged: false,
      lastLoggedHostname: null,
      firewallVendor: undefined
    }

    this.tabs.set(id, managedTab)
    this.window.contentView.addChildView(view)

    // Listen for page events
    view.webContents.on('page-title-updated', (_event, title) => {
      managedTab.title = title
      this.sendToUI('tab:updated', id, { title })
    })

    view.webContents.on('did-navigate', (_event, url) => {
      managedTab.url = url
      // Track what URL the user actually navigated to
      if (!url.startsWith('data:') && !url.includes('about:blank')) {
        managedTab.intendedUrl = url
      }
      this.sendToUI('tab:updated', id, {
        url,
        canGoBack: view.webContents.navigationHistory.canGoBack(),
        canGoForward: view.webContents.navigationHistory.canGoForward(),
        isSecure: url.startsWith('https://')
      })
    })

    view.webContents.on('console-message', (_event, _level, message, _line, _sourceId) => {
      console.log(`[Renderer ${id}] ${message}`)
    })

    // Intercept popups and open them as new tabs
    view.webContents.setWindowOpenHandler(({ url }) => {
      this.createTab(url)
      return { action: 'deny' }
    })

    // Track the URL BEFORE redirect happens (will-navigate fires before will-redirect)
    view.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('data:') && !url.includes('about:blank')) {
        managedTab.intendedUrl = url
      }

      // Upgrade Web3 Domains to GhostProtocol
      try {
        const parsedUrl = new URL(url)
        if (parsedUrl.hostname.endsWith('.eth') && parsedUrl.protocol !== 'ghost:') {
          event.preventDefault()
          const ghostUrl = url.replace(/^https?:\/\//, 'ghost://')
          view.webContents.loadURL(ghostUrl)
          return
        }
      } catch {}

      // If the main frame tries to navigate to our local relay, intercept it
      if (url.includes('127.0.0.1')) {
        try {
          const parsed = new URL(url)
          const targetUrl = parsed.searchParams.get('u')
          if (targetUrl) {
            event.preventDefault()
            const ghostUrl = targetUrl.replace(/^https?:\/\//, 'ghost://')
            view.webContents.loadURL(ghostUrl)
          } else {
            // If it's missing 'u', it's a relative navigation that got resolved against the relay
            // Recover using the current tab's domain
            event.preventDefault()
            try {
              const currentDomain = new URL(managedTab.url).hostname
              const recoverUrl = `ghost://${currentDomain}${parsed.pathname}${parsed.search}`
              view.webContents.loadURL(recoverUrl)
            } catch {}
          }
        } catch {}
      }
    })

    // Detect firewall redirects (e.g. Sophos, Fortinet, Zscaler)
    // The proxy handles DPI evasion, but we need to pre-resolve the domain
    // so the proxy knows the real IP to connect to
    let redirectRetries = 0
    const MAX_REDIRECTS = 4
    view.webContents.on('will-redirect', async (event, url, _isInPlace, isMainFrame) => {
      if (!isMainFrame) return
      const lowerUrl = url.toLowerCase()
      const isFirewallRedirect = [
        'block',
        'sophos',
        'webcat',
        'zscaler',
        'fortiguard',
        'cisco',
        'umbrella',
        'policy',
        'blocked'
      ].some((sig) => lowerUrl.includes(sig))

      // Detect firewall vendor from redirect URL for telemetry
      if (isFirewallRedirect) {
        if (lowerUrl.includes('sophos')) managedTab.firewallVendor = 'Sophos'
        else if (lowerUrl.includes('zscaler')) managedTab.firewallVendor = 'Zscaler'
        else if (lowerUrl.includes('fortiguard') || lowerUrl.includes('webcat'))
          managedTab.firewallVendor = 'Fortinet'
        else if (lowerUrl.includes('cisco') || lowerUrl.includes('umbrella'))
          managedTab.firewallVendor = 'Cisco Umbrella'
        else managedTab.firewallVendor = 'Unknown Firewall'
      }

      if (isFirewallRedirect && redirectRetries < MAX_REDIRECTS) {
        event.preventDefault()
        redirectRetries++

        try {
          // Extract the REAL blocked URL from the Sophos redirect parameter
          let blockedUrl = managedTab.intendedUrl
          try {
            const redirectParsed = new URL(url)
            const encodedUrl = redirectParsed.searchParams.get('url')
            if (encodedUrl) {
              const cleaned = encodedUrl.replace(/~/g, '=')
              const decoded = Buffer.from(cleaned, 'base64').toString('utf-8')
              if (decoded.startsWith('http')) {
                blockedUrl = decoded
                managedTab.intendedUrl = blockedUrl
              }
            }
          } catch {}

          const domain = new URL(blockedUrl).hostname
          // Stage 1: GhostProtocol (Deep Native Node.js Evasion)
          // Chromium strictly sanitizes network streams, making native DPI evasion impossible against hardened MITM.
          // GhostProtocol bypasses Chromium entirely by routing the request through our custom Node.js network stack.
          // It manually constructs TLS/HTTP bytes to inject trailing dots (GhostSNI and GhostDot), completely
          // blinding the firewall's keyword filters while rendering natively in the browser.
          if (redirectRetries === 1) {
            console.log(
              `[GhostStack] Attempting GhostProtocol bypass (Node.js Engine) for ${domain}`
            )
            const ghostUrl = blockedUrl.replace(/^https?:\/\//, 'ghost://')
            view.webContents.loadURL(ghostUrl)
          } else {
            console.log(`[GhostStack] ✗ All evasion algorithms failed. Site is deeply blocked.`)
            this.sendToUI('tab:updated', id, { isLoading: false })
            const bp = this.ghostStack.getSessionCache()?.getBlockProfile(domain) as any
            const html = this.ghostStack.getErrorPageHTML(domain, bp, [])
            view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
          }
        } catch (err) {
          console.error('[GhostStack] Failed to handle redirect bypass:', err)
          this.sendToUI('tab:updated', id, { isLoading: false })
        }
      } else if (isFirewallRedirect) {
        // Max retries exceeded — show error page
        event.preventDefault()
        this.sendToUI('tab:updated', id, { isLoading: false })
        try {
          const domain = new URL(managedTab.intendedUrl).hostname
          const blockProfile = this.ghostStack.getSessionCache()?.getBlockProfile(domain) as any
          const html = this.ghostStack.getErrorPageHTML(domain, blockProfile, [])
          view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        } catch {}
      }
    })

    // Reset redirect counter on successful navigation and log to C2
    view.webContents.on('did-finish-load', () => {
      redirectRetries = 0

      const loadedUrl = view.webContents.getURL()
      if (!loadedUrl || loadedUrl.startsWith('data:') || loadedUrl.startsWith('about:')) return

      try {
        const hostname = new URL(loadedUrl).hostname
        if (!hostname || hostname === managedTab.lastLoggedHostname) return

        managedTab.lastLoggedHostname = hostname

        if (managedTab.bypassJustLogged) {
          managedTab.bypassJustLogged = false
        } else {
          this.ghostStack.reportDirectSuccess(loadedUrl)
        }
      } catch {}
    })

    view.webContents.on('did-navigate-in-page', (_event, url) => {
      managedTab.url = url
      this.sendToUI('tab:updated', id, {
        url,
        canGoBack: view.webContents.navigationHistory.canGoBack(),
        canGoForward: view.webContents.navigationHistory.canGoForward()
      })
    })

    view.webContents.on('did-start-loading', () => {
      this.sendToUI('tab:updated', id, { isLoading: true })

      // Inject GhostStack Fingerprint Shield
      const spoofScript = this.ghostStack.getFingerprintShield().getSpoofScript()
      if (spoofScript) {
        view.webContents.executeJavaScript(spoofScript).catch((err) => {
          console.error('[GhostStack] Failed to inject fingerprint shield:', err)
        })
      }
    })

    view.webContents.on('did-stop-loading', () => {
      this.sendToUI('tab:updated', id, { isLoading: false })
    })

    view.webContents.on(
      'did-fail-load',
      async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return
        this.sendToUI('tab:updated', id, { isLoading: false })
        if (errorCode === -3) return // ERR_ABORTED is normal for some redirects/navigations

        try {
          const domain = new URL(validatedURL).hostname

          // Let GhostStack handle the block
          const result = await this.ghostStack.handleNavigationFailure(
            domain,
            errorCode,
            errorDescription,
            validatedURL,
            managedTab.firewallVendor
          )

          if (result && !validatedURL.startsWith('ghost://')) {
            // Bypass successful! Reload the original (non-ghost) URL
            managedTab.bypassJustLogged = true
            view.webContents.loadURL(validatedURL)
          } else if (!validatedURL.startsWith('ghost://') && !validatedURL.includes('127.0.0.1')) {
            // Native bypass failed (or wasn't attempted). Fallback to deep GhostProtocol Node.js relay!
            console.log(
              `[GhostStack] Native engines failed. Attempting GhostProtocol for ${domain}`
            )
            this.ghostStack.setGhostProtocolActive(domain)
            const ghostUrl = validatedURL.replace(/^https?:\/\//, 'ghost://')
            view.webContents.loadURL(ghostUrl)
          } else {
            // Completely blocked
            const blockProfile = this.ghostStack.getSessionCache()?.getBlockProfile(domain) as any
            const html = this.ghostStack.getErrorPageHTML(domain, blockProfile, [])
            view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
          }
        } catch (err) {
          console.error('[GhostStack] Failed to handle navigation failure:', err)
        }
      }
    )

    view.webContents.on('page-favicon-updated', (_event, favicons) => {
      if (favicons.length > 0) {
        this.sendToUI('tab:updated', id, { favicon: favicons[0] })
      }
    })

    view.webContents.on('context-menu', (_event, params) => {
      const template: any[] = []

      if (params.linkURL) {
        template.push({
          label: 'Open link in new tab',
          click: () => {
            this.createTab(params.linkURL)
          }
        })
        template.push({
          label: 'Open link in new window',
          click: () => {
            createWindow(params.linkURL)
          }
        })
        template.push({
          label: 'Copy link',
          click: () => {
            clipboard.writeText(params.linkURL)
          }
        })
      }

      template.push({
        label: 'Copy',
        role: 'copy',
        enabled: params.editFlags.canCopy
      })

      const contextMenu = Menu.buildFromTemplate(template)
      contextMenu.popup({ window: this.window })
    })

    // Load the URL
    if (normalizedUrl === 'ghost://newtab') {
      view.webContents.loadURL('about:blank').catch(() => {})
    } else {
      view.webContents.loadURL(normalizedUrl).catch((e) => {
        if (e?.errno === -3 || e?.code === 'ERR_ABORTED') return
      })
    }

    // Notify UI
    this.sendToUI('tab:created', {
      id,
      title: 'New Tab',
      url: normalizedUrl,
      favicon: '',
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      isSecure: normalizedUrl.startsWith('https://')
    })

    this.switchTab(id)
    return id
  }

  getTab(id: string): ManagedTab | undefined {
    return this.tabs.get(id)
  }

  getTabsState(): { tabs: any[]; activeTabId: string | null } {
    const serializedTabs = Array.from(this.tabs.values()).map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favicon: '',
      isLoading: tab.view.webContents.isLoading(),
      canGoBack: tab.view.webContents.navigationHistory.canGoBack(),
      canGoForward: tab.view.webContents.navigationHistory.canGoForward(),
      isSecure: tab.url.startsWith('https://'),
      isPinned: tab.isPinned,
      isMuted: tab.view.webContents.isAudioMuted(),
      lastAccessed: tab.lastAccessed
    }))
    return {
      tabs: serializedTabs,
      activeTabId: this.activeTabId
    }
  }

  hasWebContents(sender: any): boolean {
    if (!sender || typeof sender.id !== 'number') return false
    for (const tab of this.tabs.values()) {
      if (tab.view.webContents.id === sender.id) {
        return true
      }
    }
    return false
  }

  getTabByWebContentsId(wcId: number): ManagedTab | undefined {
    for (const tab of this.tabs.values()) {
      if (tab.view.webContents.id === wcId) return tab
    }
    return undefined
  }

  getActiveTab(): ManagedTab | undefined {
    return this.tabs.get(this.activeTabId || '')
  }

  closeTab(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return

    this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
    this.tabs.delete(id)

    if (this.activeTabId === id) {
      const remaining = Array.from(this.tabs.keys())
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1])
      } else {
        this.activeTabId = null
      }
    }

    if (this.splitSecondaryId === id) {
      this.splitMode = 'none'
      this.splitSecondaryId = null
      this.windowManager.handleResize()
    }

    this.sendToUI('tab:closed', id)
  }

  getTabIdFromWebContents(sender: Electron.WebContents): string | null {
    for (const [id, tab] of this.tabs.entries()) {
      if (tab.view.webContents === sender) {
        return id
      }
    }
    return null
  }

  switchTab(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return

    this.activeTabId = id
    tab.lastAccessed = Date.now()

    if (tab.isSuspended) {
      tab.isSuspended = false
      tab.view.webContents.loadURL(tab.url)
      this.sendToUI('tab:updated', id, { isSuspended: false })
    }

    for (const [tabId, t] of this.tabs) {
      if (tabId === id || (this.splitMode !== 'none' && tabId === this.splitSecondaryId)) {
        if (!this.window.contentView.children.includes(t.view)) {
          this.window.contentView.addChildView(t.view)
        }
        t.view.setVisible(true)
      } else {
        t.view.setVisible(false)
        if (this.window.contentView.children.includes(t.view)) {
          this.window.contentView.removeChildView(t.view)
        }
      }
    }

    this.positionTabs()
  }

  navigateTo(id: string, url: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return

    const normalizedUrl = this.normalizeUrl(url)
    tab.url = normalizedUrl
    tab.intendedUrl = normalizedUrl

    if (normalizedUrl === 'ghost://newtab') {
      tab.view.webContents.loadURL('about:blank')
    } else {
      tab.view.webContents.loadURL(normalizedUrl).catch((e) => {
        if (e?.errno === -3 || e?.code === 'ERR_ABORTED') return
      })
    }
  }

  goBack(id: string): void {
    const tab = this.tabs.get(id)
    if (tab && tab.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.goBack()
    }
  }

  goForward(id: string): void {
    const tab = this.tabs.get(id)
    if (tab && tab.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.goForward()
    }
  }

  reload(id: string): void {
    const tab = this.tabs.get(id)
    if (tab) {
      tab.view.webContents.reload()
    }
  }

  muteTab(id: string, mute: boolean): void {
    const tab = this.tabs.get(id)
    if (tab) {
      tab.view.webContents.setAudioMuted(mute)
    }
  }

  setSplitView(
    mode: 'none' | 'horizontal' | 'vertical',
    _primaryId: string,
    secondaryId: string | null
  ): void {
    this.splitMode = mode
    this.splitSecondaryId = secondaryId

    if (this.activeTabId) {
      this.switchTab(this.activeTabId)
    }
  }

  positionTabs(): void {
    const sidebarWidth = this.windowManager.getSidebarWidth()
    const toolbarHeight = 88 // TopTabBar (40px) + Toolbar (48px)
    const bounds = this.window.getContentBounds()

    const contentX = sidebarWidth
    const contentY = toolbarHeight
    const contentWidth = bounds.width - sidebarWidth
    const contentHeight = bounds.height - toolbarHeight

    if (this.isOverlayActive) {
      // Hide active tabs by moving them off-screen when a UI overlay is open
      this.tabs.forEach((tab) => {
        tab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
      })
      return
    }

    if (this.splitMode === 'none' || !this.splitSecondaryId) {
      if (this.activeTabId) {
        const tab = this.tabs.get(this.activeTabId)
        if (tab) {
          if (tab.url === 'ghost://newtab' || tab.url === 'about:blank') {
            tab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
          } else {
            tab.view.setBounds({
              x: contentX,
              y: contentY,
              width: Math.max(contentWidth, 100),
              height: Math.max(contentHeight, 100)
            })
          }
        }
      }
    } else {
      const primaryTab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
      const secondaryTab = this.tabs.get(this.splitSecondaryId)

      if (this.splitMode === 'vertical') {
        const halfWidth = Math.floor(contentWidth / 2)
        if (primaryTab) {
          if (primaryTab.url === 'ghost://newtab' || primaryTab.url === 'about:blank') {
            primaryTab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
          } else {
            primaryTab.view.setBounds({
              x: contentX,
              y: contentY,
              width: halfWidth - 1,
              height: Math.max(contentHeight, 100)
            })
          }
        }
        if (secondaryTab) {
          if (secondaryTab.url === 'ghost://newtab' || secondaryTab.url === 'about:blank') {
            secondaryTab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
          } else {
            secondaryTab.view.setBounds({
              x: contentX + halfWidth + 1,
              y: contentY,
              width: contentWidth - halfWidth - 1,
              height: Math.max(contentHeight, 100)
            })
          }
        }
      } else {
        const halfHeight = Math.floor(contentHeight / 2)
        if (primaryTab) {
          if (primaryTab.url === 'ghost://newtab' || primaryTab.url === 'about:blank') {
            primaryTab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
          } else {
            primaryTab.view.setBounds({
              x: contentX,
              y: contentY,
              width: Math.max(contentWidth, 100),
              height: halfHeight - 1
            })
          }
        }
        if (secondaryTab) {
          if (secondaryTab.url === 'ghost://newtab' || secondaryTab.url === 'about:blank') {
            secondaryTab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
          } else {
            secondaryTab.view.setBounds({
              x: contentX,
              y: contentY + halfHeight + 1,
              width: Math.max(contentWidth, 100),
              height: contentHeight - halfHeight - 1
            })
          }
        }
      }
    }
  }

  setOverlayActive(active: boolean): void {
    if (this.isOverlayActive === active) return
    this.isOverlayActive = active
    this.positionTabs()
  }

  private normalizeUrl(url: string): string {
    if (url === 'ghost://newtab' || url === 'about:blank') return url
    if (/^(https?|ghost|data|blob):/i.test(url)) return url
    if (/^[^\s]+\.[^\s]+$/.test(url) && !url.includes(' ')) {
      // Automatically use GhostProtocol for Web3 domains
      if (url.endsWith('.eth') || url.includes('.eth/')) {
        return `ghost://${url}`
      }
      return `https://${url}`
    }
    return `https://www.google.com/search?q=${encodeURIComponent(url)}`
  }

  private sendToUI(channel: string, ...args: unknown[]): void {
    try {
      this.uiView.webContents.send(channel, ...args)
    } catch {}
  }

  private startSuspensionMonitor(): void {
    setInterval(() => {
      const now = Date.now()
      const SUSPEND_THRESHOLD = 5 * 60 * 1000

      for (const [id, tab] of this.tabs) {
        if (
          id === this.activeTabId ||
          id === this.splitSecondaryId ||
          tab.isSuspended ||
          tab.isPinned ||
          tab.view.webContents.isCurrentlyAudible()
        )
          continue

        if (now - tab.lastAccessed > SUSPEND_THRESHOLD) {
          this.suspendTab(id)
        }
      }
    }, 60000)
  }

  private suspendTab(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab || tab.isSuspended) return

    tab.isSuspended = true
    tab.view.webContents.loadURL('about:blank')
    this.sendToUI('tab:updated', id, { isSuspended: true })
  }
}
