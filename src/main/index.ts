import { app, BaseWindow, WebContentsView, ipcMain, Menu } from 'electron'
import { initializeGhostProtocol } from '../ghoststack/core/network/GhostProtocol'

import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { TabManager } from './tabManager'
import { WindowManager } from './windowManager'
import { GhostStackOrchestrator } from '../ghoststack/core/GhostStackOrchestrator'
import { initLogger, closeLogger, getLogFilePath } from '../ghoststack/core/Logger'
import { torService } from './services/TorService'
import { darkRoomProxy, resolveOnionAddr } from './services/DarkRoomProxy'

// ─── GhostStack Chromium Flags ───
// Encrypt DNS queries
app.commandLine.appendSwitch('dns-over-https-mode', 'secure')
app.commandLine.appendSwitch('dns-over-https-templates', 'https://cloudflare-dns.com/dns-query')
// Enable ECH — hides domain name from DPI inspection
app.commandLine.appendSwitch(
  'enable-features',
  'EncryptedClientHello,DnsOverHttps,DnsHttpssvc,UseDnsHttpsSvcb'
)
// Enable QUIC/HTTP3 — uses UDP which firewalls cannot deep-inspect
app.commandLine.appendSwitch('enable-quic')
app.commandLine.appendSwitch('quic-version', 'h3')
// Allow self-signed certs ONLY for our local proxy (127.0.0.1)
app.commandLine.appendSwitch('allow-insecure-localhost', 'true')

// --- Anti-Bot / Anti-Fingerprint ---
// Hide the fact that this is an automated browser (removes navigator.webdriver)
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')

import { UserAgentRotator } from '../ghoststack/privacy/UserAgentRotator'
const uaRotator = new UserAgentRotator()
app.userAgentFallback = uaRotator.getSessionUA()

let mainWindow: BaseWindow | null = null
let uiView: WebContentsView | null = null
let tabManager: TabManager | null = null
let windowManager: WindowManager | null = null
let ghostStack: GhostStackOrchestrator | null = null

let startupTimeMs = 0

// Register custom ghost:// protocol for deep DPI evasion
import { protocol } from 'electron'
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ghost',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true, stream: true }
  }
])

function createWindow(): void {
  mainWindow = new BaseWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#141414',
    ...(process.platform === 'linux' ? { icon: join(__dirname, '../../resources/icon.png') } : {})
  })

  uiView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  uiView.setBackgroundColor('#141414')
  mainWindow.contentView.addChildView(uiView)



  // Initialize GhostStack
  ghostStack = new GhostStackOrchestrator()
  // Initialize managers — GhostStack replaces PrivacyEngine, RoutingEngine, AntiFingerprintEngine
  windowManager = new WindowManager(mainWindow)
  tabManager = new TabManager(mainWindow, uiView, windowManager, ghostStack)

  // Set initial UI view bounds
  const { width, height } = mainWindow.getContentBounds()
  uiView.setBounds({ x: 0, y: 0, width, height })

  mainWindow.on('resize', () => {
    if (!mainWindow || !uiView || !windowManager) return
    const bounds = mainWindow.getContentBounds()
    uiView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
    windowManager.handleResize()
    tabManager?.positionTabs()
  })

  uiView.webContents.once('did-finish-load', async () => {
    mainWindow?.show()
    startupTimeMs = process.uptime() * 1000
    startMemoryMonitor()

    // Initialize GhostStack after UI is ready
    if (ghostStack && uiView) {
      ghostStack.setUIWebContents(uiView.webContents)
      if (tabManager) ghostStack.setTabManager(tabManager)
      await ghostStack.initialize(uiView.webContents)
    }
  })

  // Load the React UI
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    uiView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    uiView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  Menu.setApplicationMenu(null)
}

function registerIpcHandlers(): void {
  // Tab management
  ipcMain.handle('tab:create', async (_event, url: string) => {
    if (!tabManager) return null
    return tabManager.createTab(url)
  })

  ipcMain.on('tab:close', (_event, id: string) => {
    tabManager?.closeTab(id)
  })
  ipcMain.on('tab:switch', (_event, id: string) => {
    tabManager?.switchTab(id)
  })
  ipcMain.on('tab:navigate', (_event, id: string, url: string) => {
    tabManager?.navigateTo(id, url)
  })
  ipcMain.on('tab:back', (_event, id: string) => {
    tabManager?.goBack(id)
  })
  ipcMain.on('tab:forward', (_event, id: string) => {
    tabManager?.goForward(id)
  })
  ipcMain.on('tab:reload', (_event, id: string) => {
    tabManager?.reload(id)
  })
  ipcMain.on('tab:mute', (_event, id: string) => {
    tabManager?.muteTab(id, true)
  })
  ipcMain.on('tab:unmute', (_event, id: string) => {
    tabManager?.muteTab(id, false)
  })

  // Split view
  ipcMain.on(
    'split:toggle',
    (_event, mode: string, primaryId: string, secondaryId: string | null) => {
      tabManager?.setSplitView(mode as 'none' | 'horizontal' | 'vertical', primaryId, secondaryId)
    }
  )

  // Sidebar width
  ipcMain.on('sidebar:width', (_event, width: number) => {
    if (windowManager) {
      windowManager.setSidebarWidth(width)
      windowManager.handleResize()
    }
    // Reposition tab content views after sidebar width change
    tabManager?.positionTabs()
  })

  ipcMain.on('overlay:active', (_event, active: boolean) => {
    tabManager?.setOverlayActive(active)
  })

  // Window controls
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })
  ipcMain.on('window:maximize', () => {
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()
  })
  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })

  // Performance
  ipcMain.handle('app:get-startup-metrics', () => startupTimeMs)

  // Logs
  ipcMain.handle('app:get-log-path', () => getLogFilePath())
  ipcMain.on('app:open-logs', () => {
    const { shell } = require('electron')
    shell.openPath(getLogFilePath().replace(/[^/\\]+$/, ''))
  })

  // GhostStack IPC handlers are registered inside the orchestrator's initialize() method

  // ── Dark Room IPC ─────────────────────────────────────────────────────────
  ipcMain.handle('darkroom:get-config', () => ({
    onionAddr:  darkRoomProxy.getOnionAddr(),  // empty until first fetch completes
    torStatus:  torService.getStatus(),
    torFound:   !!torService.findTorBinary(),
  }))

  ipcMain.handle('darkroom:start', async () => {
    if (uiView) torService.setWebContents(uiView.webContents)

    // Fetch .onion from remote if not cached locally yet
    if (!darkRoomProxy.getOnionAddr()) {
      try {
        const addr = await resolveOnionAddr()
        darkRoomProxy.setOnionAddr(addr)
      } catch {
        return { ok: false, error: 'NO_ONION_ADDR' }
      }
    }

    try {
      await torService.start()
      const port = await darkRoomProxy.start()
      return { ok: true, port }
    } catch (err: any) {
      const msg: string = err?.message || String(err)
      if (msg === 'TOR_NOT_FOUND') return { ok: false, error: 'TOR_NOT_FOUND' }
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('darkroom:stop', () => {
    darkRoomProxy.stop()
    torService.stop()
    return true
  })

}

function startMemoryMonitor(): void {
  setInterval(async () => {
    if (!uiView || uiView.webContents.isDestroyed()) return
    try {
      const memory = await process.getProcessMemoryInfo()
      uiView.webContents.send('app:memory-metrics', memory)
    } catch {
      /* Ignore */
    }
  }, 2000)
}

app.whenReady().then(async () => {
  // Initialize persistent logging FIRST — all console.log calls are now saved to disk
  initLogger()
  console.log(`[Flux] Log file: ${getLogFilePath()}`)

  // Initialize GhostProtocol for DPI evasion (starts local relay server)
  await initializeGhostProtocol()

  // Network interceptors are now centralized in GhostStackOrchestrator

  registerIpcHandlers()
  createWindow()

  // Pre-warm Tor in the background so Dark Room lobby is instant when user opens it
  setTimeout(async () => {
    try {
      if (uiView) torService.setWebContents(uiView.webContents)
      // Fetch and cache .onion address if not already cached
      if (!darkRoomProxy.getOnionAddr()) {
        const addr = await resolveOnionAddr()
        darkRoomProxy.setOnionAddr(addr)
      }
      await torService.start()
      await darkRoomProxy.start()
    } catch {
      // Silent — user will see error when they open Dark Room
    }
  }, 3000)

  app.on('activate', () => {
    if (!mainWindow) createWindow()
  })

  // Scoped SSL bypass: only trust our own local proxy, reject bad certs everywhere else
  app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
    try {
      const parsed = new URL(url)
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
        // Our local GhostStack proxy / DarkRoom Tor proxy — trust it
        event.preventDefault()
        callback(true)
      } else {
        // Public internet — enforce normal TLS verification
        callback(false)
      }
    } catch {
      callback(false)
    }
  })
})

app.on('window-all-closed', () => {
  // Clean up GhostStack — wipe all session data
  ghostStack?.destroy()
  if (process.platform !== 'darwin') {
    closeLogger()
    app.quit()
  }
})
