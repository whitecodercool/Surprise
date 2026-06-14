// Injected into every content tab. Hides Electron/automation signals from web pages.
try {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true })
} catch {}
