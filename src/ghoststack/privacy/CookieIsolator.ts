/**
 * GhostStack Cookie Isolator
 * Per-site cookie jars with third-party blocking.
 * @module CookieIsolator
 */
import { session, type Session } from 'electron'

export class CookieIsolator {
  private allowlist: Set<string> = new Set()

  /** Apply cookie isolation to the default session */
  apply(): void { /* Applied via applyToSession */ }

  /** Apply cookie isolation interceptors to a session */
  applyToSession(_ses: Session): void {
    // Handled in GhostStackOrchestrator unified interceptor
  }

  handleBeforeSendHeaders(details: any): { requestHeaders?: any } | null {
    if (!details.requestHeaders['Cookie'] || (details.resourceType as any) === 'mainFrame') {
      return null
    }
    let is3p = false
    if (details.requestHeaders['Referer']) {
      try {
        const ref = new URL(details.requestHeaders['Referer']).hostname
        const req = new URL(details.url).hostname
        if (!req.endsWith(ref) && !ref.endsWith(req)) is3p = true
      } catch { /* invalid URL */ }
    } else if ((details.resourceType as any) !== 'subFrame') {
      is3p = true
    }
    if (is3p) {
      delete details.requestHeaders['Cookie']
      return { requestHeaders: details.requestHeaders }
    }
    return null
  }

  handleHeadersReceived(details: any): { responseHeaders?: any } | null {
    if (!details.responseHeaders || (details.resourceType as any) === 'mainFrame') {
      return null
    }
    const sc = details.responseHeaders['Set-Cookie'] || details.responseHeaders['set-cookie']
    if (sc && (details.resourceType as any) !== 'mainFrame') {
      delete details.responseHeaders['Set-Cookie']
      delete details.responseHeaders['set-cookie']
      return { responseHeaders: details.responseHeaders }
    }
    return null
  }

  /** Add domain to cookie allowlist */
  addToAllowlist(domain: string): void { this.allowlist.add(domain) }
  /** Remove domain from allowlist */
  removeFromAllowlist(domain: string): void { this.allowlist.delete(domain) }
  /** Check if domain is allowlisted */
  isAllowlisted(domain: string): boolean { return this.allowlist.has(domain) }
  /** Clear all session cookies */
  async clearSessionCookies(): Promise<void> {
    const cookies = await session.defaultSession.cookies.get({})
    for (const cookie of cookies) {
      if (!cookie.expirationDate) {
        const url = `${cookie.secure ? 'https' : 'http'}://${cookie.domain?.replace(/^\./, '')}${cookie.path}`
        try { await session.defaultSession.cookies.remove(url, cookie.name) } catch {}
      }
    }
  }
  /** Clear all cookies and storage */
  async clearAll(): Promise<void> {
    await session.defaultSession.clearStorageData()
    await session.defaultSession.clearCache()
  }
}
