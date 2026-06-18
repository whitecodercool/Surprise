import { app, BaseWindow, WebContentsView, ipcMain, Menu, nativeImage } from 'electron'
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
let ghostStack: GhostStackOrchestrator | null = null

let startupTimeMs = 0

// Register custom ghost:// protocol for deep DPI evasion
import { protocol } from 'electron'
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ghost',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
      stream: true
    }
  }
])

export interface WindowInstance {
  mainWindow: BaseWindow
  uiView: WebContentsView
  tabManager: TabManager
  windowManager: WindowManager
  ghostStack: GhostStackOrchestrator
}

export const windowInstances: WindowInstance[] = []

export function findInstanceByWebContents(sender: any): WindowInstance | null {
  if (!sender || typeof sender.id !== 'number') return null
  for (const inst of windowInstances) {
    if (inst.uiView.webContents.id === sender.id) {
      return inst
    }
    if (inst.tabManager.hasWebContents(sender)) {
      return inst
    }
  }
  return null
}

export function createWindow(initialUrl?: string): void {
  const isFirstWindow = windowInstances.length === 0
  const window = new BaseWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#141414',
    ...(process.platform !== 'darwin' ? { icon: join(__dirname, '../../resources/icon.png') } : {})
  })

  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  view.setBackgroundColor('#141414')
  window.contentView.addChildView(view)

  // Initialize GhostStack
  const stack = new GhostStackOrchestrator()
  // Initialize managers
  const winMgr = new WindowManager(window)
  const tabMgr = new TabManager(window, view, winMgr, stack)

  // Fallbacks for backward compatibility
  mainWindow = window
  uiView = view
  ghostStack = stack

  const instance: WindowInstance = {
    mainWindow: window,
    uiView: view,
    tabManager: tabMgr,
    windowManager: winMgr,
    ghostStack: stack
  }
  windowInstances.push(instance)

  window.on('closed', () => {
    const idx = windowInstances.indexOf(instance)
    if (idx !== -1) {
      windowInstances.splice(idx, 1)
    }
    stack.destroy()

    if (windowInstances.length > 0) {
      const remainingInst = windowInstances[windowInstances.length - 1]
      mainWindow = remainingInst.mainWindow
      uiView = remainingInst.uiView
      ghostStack = remainingInst.ghostStack
      remainingInst.ghostStack.updateProxyRules()
    } else {
      mainWindow = null
      uiView = null
      ghostStack = null
    }
  })

  // Set initial UI view bounds
  const { width, height } = window.getContentBounds()
  view.setBounds({ x: 0, y: 0, width, height })

  window.on('resize', () => {
    const bounds = window.getContentBounds()
    view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
    winMgr.handleResize()
    tabMgr.positionTabs()
  })

  view.webContents.once('did-finish-load', async () => {
    window.show()
    startupTimeMs = process.uptime() * 1000
    startMemoryMonitor(view)

    // Initialize GhostStack after UI is ready
    stack.setUIWebContents(view.webContents)
    stack.setTabManager(tabMgr)
    await stack.initialize(view.webContents)

    // Open initial tab if specified
    if (initialUrl) {
      tabMgr.createTab(initialUrl)
    }
  })

  // Load the React UI
  const queryParam = isFirstWindow ? '' : '?noSplash=true'
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    view.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'] + queryParam)
  } else {
    view.webContents.loadFile(join(__dirname, '../renderer/index.html'), {
      query: isFirstWindow ? {} : { noSplash: 'true' }
    })
  }

  Menu.setApplicationMenu(null)
}

function registerIpcHandlers(): void {
  // Tab management
  ipcMain.handle('tab:create', async (event, url: string) => {
    const inst = findInstanceByWebContents(event.sender)
    if (!inst) return null
    return inst.tabManager.createTab(url)
  })

  ipcMain.handle('tabs:get', (event) => {
    const inst = findInstanceByWebContents(event.sender)
    if (!inst) return { tabs: [], activeTabId: null }
    return inst.tabManager.getTabsState()
  })

  ipcMain.on('tab:close', (event, id: string) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.tabManager.closeTab(id)
  })
  ipcMain.on('tab:switch', (event, id: string) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.tabManager.switchTab(id)
  })
  ipcMain.on('tab:navigate', (event, id: string, url: string) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.tabManager.navigateTo(id, url)
  })
  ipcMain.on('tab:back', (event, id: string) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.tabManager.goBack(id)
  })
  ipcMain.on('tab:forward', (event, id: string) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.tabManager.goForward(id)
  })
  ipcMain.on('tab:reload', (event, id: string) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.tabManager.reload(id)
  })
  ipcMain.on('tab:mute', (event, id: string) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.tabManager.muteTab(id, true)
  })
  ipcMain.on('tab:unmute', (event, id: string) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.tabManager.muteTab(id, false)
  })

  // Split view
  ipcMain.on(
    'split:toggle',
    (event, mode: string, primaryId: string, secondaryId: string | null) => {
      const inst = findInstanceByWebContents(event.sender)
      inst?.tabManager.setSplitView(
        mode as 'none' | 'horizontal' | 'vertical',
        primaryId,
        secondaryId
      )
    }
  )

  // Sidebar width
  ipcMain.on('sidebar:width', (event, width: number) => {
    const inst = findInstanceByWebContents(event.sender)
    if (inst) {
      inst.windowManager.setSidebarWidth(width)
      inst.windowManager.handleResize()
      inst.tabManager.positionTabs()
    }
  })

  ipcMain.on('overlay:active', (event, active: boolean) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.tabManager.setOverlayActive(active)
  })

  ipcMain.on('menu:kebab:show', (event, currentTheme: string) => {
    const inst = findInstanceByWebContents(event.sender)
    if (!inst) return
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'New Tab',
        accelerator: 'CmdOrCtrl+T',
        click: () => {
          inst.uiView.webContents.send('menu:action', 'new-tab')
        }
      },
      {
        label: 'New Window',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          createWindow()
        }
      },
      {
        label: 'Add Shortcut',
        click: () => {
          inst.uiView.webContents.send('menu:action', 'add-shortcut')
        }
      },
      { type: 'separator' },
      {
        label: 'Light Theme',
        type: 'radio',
        checked: currentTheme === 'light',
        click: () => {
          inst.uiView.webContents.send('menu:theme-change', 'light')
        }
      },
      {
        label: 'Dark Theme',
        type: 'radio',
        checked: currentTheme === 'dark',
        click: () => {
          inst.uiView.webContents.send('menu:theme-change', 'dark')
        }
      },
      {
        label: 'System Theme',
        type: 'radio',
        checked: currentTheme === 'system',
        click: () => {
          inst.uiView.webContents.send('menu:theme-change', 'system')
        }
      },
      { type: 'separator' },
      {
        label: 'Commands',
        accelerator: 'CmdOrCtrl+K',
        click: () => {
          inst.uiView.webContents.send('menu:action', 'commands')
        }
      }
    ])
    contextMenu.popup({ window: inst.mainWindow })
  })

  // Window controls
  ipcMain.on('window:minimize', (event) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.mainWindow.minimize()
  })
  ipcMain.on('window:maximize', (event) => {
    const inst = findInstanceByWebContents(event.sender)
    if (inst) {
      inst.mainWindow.isMaximized() ? inst.mainWindow.unmaximize() : inst.mainWindow.maximize()
    }
  })
  ipcMain.on('window:close', (event) => {
    const inst = findInstanceByWebContents(event.sender)
    inst?.mainWindow.close()
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
    onionAddr: darkRoomProxy.getOnionAddr(), // empty until first fetch completes
    torStatus: torService.getStatus(),
    torFound: !!torService.findTorBinary()
  }))

  ipcMain.handle('darkroom:start', async (event) => {
    const inst = findInstanceByWebContents(event.sender)
    if (inst) torService.setWebContents(inst.uiView.webContents)

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

function startMemoryMonitor(view: WebContentsView): void {
  const intervalId = setInterval(async () => {
    if (view.webContents.isDestroyed()) {
      clearInterval(intervalId)
      return
    }
    try {
      const memory = await process.getProcessMemoryInfo()
      view.webContents.send('app:memory-metrics', memory)
    } catch {
      /* Ignore */
    }
  }, 2000)
}

app.whenReady().then(async () => {
  // Initialize persistent logging FIRST — all console.log calls are now saved to disk
  initLogger()
  console.log(`[Ghost Browser] Log file: ${getLogFilePath()}`)

  // Set macOS Dock Icon dynamically during development
  if (process.platform === 'darwin') {
    try {
      const iconPath = join(__dirname, '../../resources/icon.png')
      const image = nativeImage.createFromPath(iconPath)
      app.dock?.setIcon(image)
    } catch (e) {
      console.error('Failed to set macOS dock icon:', e)
    }
  }

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
