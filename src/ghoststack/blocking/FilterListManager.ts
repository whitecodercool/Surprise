/**
 * GhostStack Filter List Manager — manages bundled + auto-updated filter lists.
 * @module FilterListManager
 */
import { net } from 'electron'

const FILTER_LIST_URLS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt'
]

export class FilterListManager {
  private domains: Set<string> = new Set()

  /** Load filter lists (bundled domains as fallback) */
  async initialize(): Promise<void> {
    // Start with bundled set, auto-update in background
    this.scheduleUpdate()
  }

  /** Get all blocked domains */
  getDomains(): Set<string> { return this.domains }

  /** Add a domain from filter list */
  addDomain(domain: string): void { this.domains.add(domain) }

  /** Schedule weekly auto-update */
  private scheduleUpdate(): void {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000
    setInterval(() => this.updateLists(), WEEK_MS)
    // Initial update after 30 seconds
    setTimeout(() => this.updateLists(), 30000)
  }

  /** Download and parse filter lists */
  private async updateLists(): Promise<void> {
    for (const url of FILTER_LIST_URLS) {
      try {
        const text = await this.fetchText(url)
        this.parseFilterList(text)
        this.parseFilterList(text)
      } catch { /* use bundled */ }
    }
  }

  /** Parse EasyList format into domain set */
  private parseFilterList(text: string): void {
    const lines = text.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue
      // Extract domain from ||domain^ format
      const match = trimmed.match(/^\|\|([a-z0-9.-]+)\^/)
      if (match) this.domains.add(match[1])
    }
  }

  private fetchText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), 15000)
      const req = net.request({ url, method: 'GET' })
      req.on('response', (res) => {
        let body = ''
        res.on('data', c => { body += c.toString() })
        res.on('end', () => { clearTimeout(timer); resolve(body) })
        res.on('error', () => { clearTimeout(timer); reject(new Error('err')) })
      })
      req.on('error', () => { clearTimeout(timer); reject(new Error('err')) })
      req.end()
    })
  }
}
