import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Tab management
  createTab: (url: string): Promise<string> => ipcRenderer.invoke('tab:create', url),
  closeTab: (id: string): void => ipcRenderer.send('tab:close', id),
  switchTab: (id: string): void => ipcRenderer.send('tab:switch', id),
  navigateTo: (id: string, url: string): void => ipcRenderer.send('tab:navigate', id, url),
  goBack: (id: string): void => ipcRenderer.send('tab:back', id),
  goForward: (id: string): void => ipcRenderer.send('tab:forward', id),
  reload: (id: string): void => ipcRenderer.send('tab:reload', id),
  muteTab: (id: string): void => ipcRenderer.send('tab:mute', id),
  unmuteTab: (id: string): void => ipcRenderer.send('tab:unmute', id),

  // Split view
  toggleSplitView: (mode: string, primaryId: string, secondaryId: string | null): void =>
    ipcRenderer.send('split:toggle', mode, primaryId, secondaryId),

  // Sidebar
  updateSidebarWidth: (width: number): void => ipcRenderer.send('sidebar:width', width),

  // Overlay
  setOverlayActive: (active: boolean): void => ipcRenderer.send('overlay:active', active),

  // Tab events from main process
  onTabCreated: (callback: (_tab: unknown) => void): void => {
    ipcRenderer.removeAllListeners('tab:created')
    ipcRenderer.on('tab:created', (_event, tab) => callback(tab))
  },
  onTabUpdated: (callback: (_id: string, _updates: unknown) => void): void => {
    ipcRenderer.removeAllListeners('tab:updated')
    ipcRenderer.on('tab:updated', (_event, id, updates) => callback(id, updates))
  },
  onTabClosed: (callback: (_id: string) => void): void => {
    ipcRenderer.removeAllListeners('tab:closed')
    ipcRenderer.on('tab:closed', (_event, id) => callback(id))
  },

  // Window controls
  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window:maximize'),
  closeWindow: (): void => ipcRenderer.send('window:close'),

  // Performance
  getStartupMetrics: (): Promise<number> => ipcRenderer.invoke('app:get-startup-metrics'),
  onMemoryMetrics: (callback: (_memory: unknown) => void): void => {
    ipcRenderer.removeAllListeners('app:memory-metrics')
    ipcRenderer.on('app:memory-metrics', (_event, memory) => callback(memory))
  },

  // ─── GhostStack API ───
  ghoststackGetStatus: (): Promise<any> => ipcRenderer.invoke('ghoststack:get-status'),
  ghoststackGetSettings: (): Promise<any> => ipcRenderer.invoke('ghoststack:get-settings'),
  ghoststackUpdateSettings: (settings: any): void => ipcRenderer.send('ghoststack:update-settings', settings),
  ghoststackRescanNetwork: (): Promise<any> => ipcRenderer.invoke('ghoststack:rescan-network'),
  ghoststackGetNetworkEnv: (): Promise<any> => ipcRenderer.invoke('ghoststack:get-network-env'),
  onGhoststackStatusChanged: (callback: (_status: any) => void): void => {
    ipcRenderer.removeAllListeners('ghoststack:status-changed')
    ipcRenderer.on('ghoststack:status-changed', (_event, status) => callback(status))
  },
  onGhoststackToast: (callback: (_data: any) => void): void => {
    ipcRenderer.removeAllListeners('ghoststack:toast')
    ipcRenderer.on('ghoststack:toast', (_event, data) => callback(data))
  },
  onGhoststackLogEntry: (callback: (_log: any) => void): void => {
    ipcRenderer.on('ghoststack:log-entry', (_event, log) => callback(log))
  },

  // GhostStack Privacy
  ghoststackGetPrivacySettings: (): Promise<any> => ipcRenderer.invoke('ghoststack:get-privacy-settings'),
  ghoststackUpdatePrivacySettings: (settings: any): void => ipcRenderer.send('ghoststack:update-privacy-settings', settings),
  ghoststackSetPrivacyLevel: (level: string): void => ipcRenderer.send('ghoststack:set-privacy-level', level),
  ghoststackTestFingerprint: (): Promise<any> => ipcRenderer.invoke('ghoststack:test-fingerprint'),
  ghoststackClearAllData: (): void => ipcRenderer.send('ghoststack:clear-all-data'),

  // GhostStack Blocking
  ghoststackGetBlockingStats: (): Promise<any> => ipcRenderer.invoke('ghoststack:get-blocking-stats'),
  ghoststackGetBlockingSettings: (): Promise<any> => ipcRenderer.invoke('ghoststack:get-blocking-settings'),
  ghoststackUpdateBlockingSettings: (settings: any): void => ipcRenderer.send('ghoststack:update-blocking-settings', settings),
  ghoststackAddAllowlist: (domain: string): void => ipcRenderer.send('ghoststack:add-allowlist', domain),
  ghoststackRemoveAllowlist: (domain: string): void => ipcRenderer.send('ghoststack:remove-allowlist', domain),
  ghoststackGetAllowlist: (): Promise<string[]> => ipcRenderer.invoke('ghoststack:get-allowlist'),

  // GhostStack DNS
  ghoststackGetDNSSettings: (): Promise<any> => ipcRenderer.invoke('ghoststack:get-dns-settings'),
  ghoststackUpdateDNSSettings: (settings: any): void => ipcRenderer.send('ghoststack:update-dns-settings', settings),
  ghoststackFlushDNSCache: (): Promise<boolean> => ipcRenderer.invoke('ghoststack:flush-dns-cache'),
  ghoststackDNSLeakTest: (): Promise<any> => ipcRenderer.invoke('ghoststack:dns-leak-test'),

  // ── Dark Room ──
  darkroomGetConfig: (): Promise<any> => ipcRenderer.invoke('darkroom:get-config'),
  darkroomStart: (): Promise<any> => ipcRenderer.invoke('darkroom:start'),
  darkroomStop: (): Promise<boolean> => ipcRenderer.invoke('darkroom:stop'),
  onDarkroomTorStatus: (cb: (_data: any) => void): void => {
    ipcRenderer.removeAllListeners('darkroom:tor-status')
    ipcRenderer.on('darkroom:tor-status', (_e, data) => cb(data))
  },

}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
