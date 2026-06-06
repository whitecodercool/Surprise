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

  // Web3 Wallet
  onWalletPrompt: (callback: (_data: any) => void): void => {
    ipcRenderer.removeAllListeners('wallet:prompt-approval')
    ipcRenderer.on('wallet:prompt-approval', (_event, data) => callback(data))
  },
  respondWalletPrompt: (approved: boolean): Promise<any> => ipcRenderer.invoke('wallet:respond-approval', approved)
}

const ethereum = {
  isMetaMask: true, // We spoof MetaMask for maximum dApp compatibility
  request: async ({ method, params }: { method: string, params?: any[] }) => {
    switch (method) {
      case 'eth_requestAccounts':
        return await ipcRenderer.invoke('wallet:requestAccounts')
      case 'eth_accounts':
        try {
          const status = await ipcRenderer.invoke('wallet:status')
          return status.isUnlocked ? [status.address] : []
        } catch { return [] }
      case 'eth_sendTransaction':
        return await ipcRenderer.invoke('wallet:sendTransaction', params?.[0])
      case 'personal_sign':
        return await ipcRenderer.invoke('wallet:personalSign', params?.[0])
      case 'eth_chainId':
        return '0x1' // Default Mainnet for now
      default:
        console.warn(`[GhostWallet] Unhandled Ethereum RPC method: ${method}`)
        // Ideally we proxy unknown read-methods directly to the PublicNode RPC via IPC
        throw new Error(`Method ${method} not implemented in GhostWallet yet`)
    }
  },
  on: (event: string, _callback: any) => {
    // Stub out event listeners so dApps don't crash
    console.log(`[GhostWallet] Stubbed event listener for: ${event}`)
  },
  removeListener: () => {}
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('ethereum', ethereum)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
  // @ts-ignore
  window.ethereum = ethereum
}
