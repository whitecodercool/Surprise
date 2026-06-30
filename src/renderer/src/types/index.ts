export interface Tab {
  id: string
  title: string
  url: string
  favicon: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  isSecure: boolean
  isPinned: boolean
  isMuted: boolean
  lastAccessed: number
}

export interface ClosedTab {
  id: string
  title: string
  url: string
  favicon: string
  closedAt: number
}

export interface Shortcut {
  name: string
  url: string
  icon: string
  color: string
}

export interface SidebarSection {
  id: string
  title: string
  icon: string
  isCollapsed: boolean
}

export interface UISettings {
  theme: 'system' | 'light' | 'dark'
  accentColor: string
  compactMode: boolean
  transparency: number
}

export interface PerformanceMetrics {
  memoryUsageMB: number
  startupTimeMs: number
}

export interface CommandAction {
  id: string
  label: string
  shortcut?: string
  icon?: string
  action: () => void
  category: string
}

// ─── GhostStack Types ───

export type GhostStackEngine = 'off' | 'ipraw' | 'splitcast' | 'temporal' | 'blocked'

export interface GhostStackStatus {
  activeEngine: GhostStackEngine
  activeMethod: string
  networkEnv: NetworkEnvironment | null
  isBypassing: boolean
  bypassedDomains: string[]
  stats: GhostStackStats
}

export interface GhostStackStats {
  sitesBypassed: number
  iprawCount: number
  splitcastCount: number
  temporalCount: number
  averageBypassTimeMs: number
}

export interface NetworkEnvironment {
  networkType: 'open' | 'filtered' | 'heavily_restricted' | 'unknown'
  firewallType: string | null
  sslIntercepted: boolean
  interceptorIssuer: string | null
  dnsFiltered: boolean
  latencyMs: number
  quicAvailable: boolean
  lastProbeAt: number
}

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

export interface BlockingStats {
  adsBlocked: number
  trackersBlocked: number
  bandwidthSavedBytes: number
}

export type SplitViewMode = 'none' | 'horizontal' | 'vertical'

export type SettingsTab = 'ghoststack' | 'privacy' | 'blocking' | 'dns' | 'security'

export interface BrowserState {
  tabs: Tab[]
  activeTabId: string | null
  sidebarCollapsed: boolean
  sidebarWidth: number
  splitViewMode: SplitViewMode
  splitViewTabId: string | null
  commandPaletteOpen: boolean
  isLoading: boolean
  showSplash: boolean
  recentlyClosed: ClosedTab[]
  tabSearchQuery: string
  tabSearchOpen: boolean
  settingsOpen: boolean
  settingsTab: SettingsTab
  darkRoomOpen: boolean
  ghoststackStatus: GhostStackStatus | null
  uiSettings: UISettings
  performanceMetrics: PerformanceMetrics
  shortcuts: Shortcut[]
}

export type BrowserAction =
  | { type: 'SET_TABS'; payload: { tabs: Tab[]; activeTabId: string | null } }
  | { type: 'ADD_TAB'; payload: Tab }
  | { type: 'CLOSE_TAB'; payload: string }
  | { type: 'SWITCH_TAB'; payload: string }
  | { type: 'UPDATE_TAB'; payload: { id: string; updates: Partial<Tab> } }
  | { type: 'REORDER_TABS'; payload: { fromIndex: number; toIndex: number } }
  | { type: 'PIN_TAB'; payload: string }
  | { type: 'UNPIN_TAB'; payload: string }
  | { type: 'MUTE_TAB'; payload: string }
  | { type: 'UNMUTE_TAB'; payload: string }
  | { type: 'RESTORE_TAB'; payload: ClosedTab }
  | { type: 'CLEAR_RECENTLY_CLOSED' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_WIDTH'; payload: number }
  | { type: 'SET_SPLIT_VIEW'; payload: { mode: SplitViewMode; tabId: string | null } }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'HIDE_SPLASH' }
  | { type: 'SET_TAB_SEARCH'; payload: string }
  | { type: 'TOGGLE_TAB_SEARCH' }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'SET_SETTINGS_TAB'; payload: SettingsTab }
  | { type: 'TOGGLE_DARK_ROOM' }
  | { type: 'SET_GHOSTSTACK_STATUS'; payload: GhostStackStatus }
  | { type: 'SET_UI_SETTINGS'; payload: Partial<UISettings> }
  | { type: 'SET_PERFORMANCE_METRICS'; payload: Partial<PerformanceMetrics> }
  | { type: 'ADD_SHORTCUT'; payload: Shortcut }
  | { type: 'REMOVE_SHORTCUT'; payload: string }
  | { type: 'SET_SHORTCUTS'; payload: Shortcut[] }

export interface GhostAPI {
  createTab: (url: string) => Promise<string>
  getTabs: () => Promise<{ tabs: Tab[]; activeTabId: string | null }>
  closeTab: (id: string) => void
  switchTab: (id: string) => void
  navigateTo: (id: string, url: string) => void
  goBack: (id: string) => void
  goForward: (id: string) => void
  reload: (id: string) => void
  muteTab: (id: string) => void
  unmuteTab: (id: string) => void
  toggleSplitView: (mode: SplitViewMode, primaryId: string, secondaryId: string | null) => void
  updateSidebarWidth: (width: number) => void
  setOverlayActive?: (active: boolean) => void
  onTabCreated: (callback: (tab: Tab) => void) => void
  onTabUpdated: (callback: (id: string, updates: Partial<Tab>) => void) => void
  onTabClosed: (callback: (id: string) => void) => void
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  getStartupMetrics: () => Promise<number>
  onMemoryMetrics: (callback: (memory: any) => void) => void
  // GhostStack
  ghoststackGetStatus: () => Promise<GhostStackStatus>
  ghoststackGetSettings: () => Promise<GhostStackSettings>
  ghoststackUpdateSettings: (settings: Partial<GhostStackSettings>) => void
  ghoststackRescanNetwork: () => Promise<NetworkEnvironment>
  ghoststackGetNetworkEnv: () => Promise<NetworkEnvironment>
  onGhoststackStatusChanged: (callback: (status: GhostStackStatus) => void) => void
  onGhoststackLogEntry: (callback: (log: any) => void) => void
  onGhoststackToast: (
    callback: (data: { domain: string; engine: string; message: string }) => void
  ) => void
  ghoststackGetPrivacySettings: () => Promise<any>
  ghoststackUpdatePrivacySettings: (settings: any) => void
  ghoststackSetPrivacyLevel: (level: string) => void
  ghoststackTestFingerprint: () => Promise<any>
  ghoststackClearAllData: () => void
  ghoststackGetBlockingStats: () => Promise<BlockingStats>
  ghoststackGetBlockingSettings: () => Promise<any>
  ghoststackUpdateBlockingSettings: (settings: any) => void
  ghoststackAddAllowlist: (domain: string) => void
  ghoststackRemoveAllowlist: (domain: string) => void
  ghoststackGetAllowlist: () => Promise<string[]>
  ghoststackGetDNSSettings: () => Promise<any>
  ghoststackUpdateDNSSettings: (settings: any) => void
  ghoststackFlushDNSCache: () => Promise<boolean>
  ghoststackDNSLeakTest: () => Promise<any>
  // Dark Room
  darkroomGetConfig: () => Promise<{ onionAddr: string; torStatus: string; torFound: boolean }>
  darkroomSetOnionAddr: (addr: string) => Promise<boolean>
  darkroomStart: () => Promise<{ ok: boolean; port?: number; error?: string }>
  darkroomStop: () => Promise<boolean>
  onDarkroomTorStatus: (cb: (data: { status: string; progress: number | null }) => void) => void
  showKebabMenu: (currentTheme: string) => void
  onMenuAction: (callback: (action: string) => void) => void
  onThemeChange: (callback: (theme: 'light' | 'dark' | 'system') => void) => void
  getGhostId: () => Promise<string>
}
