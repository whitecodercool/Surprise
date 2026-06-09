import { ChildProcess, spawn } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { is } from '@electron-toolkit/utils'

export type TorStatus = 'stopped' | 'starting' | 'bootstrapping' | 'ready' | 'error'

class TorService {
  private proc: ChildProcess | null = null
  private _status: TorStatus = 'stopped'
  private _socksPort = 19051  // separate from Tor Browser (9150) or system Tor (9050)
  private listeners: Array<(s: TorStatus, pct?: number) => void> = []
  private uiWc: Electron.WebContents | null = null
  private startPromise: Promise<void> | null = null

  setWebContents(wc: Electron.WebContents) { this.uiWc = wc }
  getSocksPort()  { return this._socksPort }
  getStatus()     { return this._status }

  // ── Find bundled or system tor binary ─────────────────────────────────────
  findTorBinary(): string | null {
    const candidates: string[] = []

    if (!is.dev) {
      // Production: bundled with the app via electron-builder extraResources
      candidates.push(path.join(process.resourcesPath, 'tor', 'tor.exe'))
    }

    // Development / fallback: Tor Browser installation on Windows
    const localAppData = process.env.LOCALAPPDATA || ''
    const appData      = process.env.APPDATA || ''
    candidates.push(
      path.join(localAppData, 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', 'tor.exe'),
      path.join(appData,      'Tor Browser', 'Browser', 'TorBrowser', 'Tor', 'tor.exe'),
      'C:\\Program Files\\Tor Browser\\Browser\\TorBrowser\\Tor\\tor.exe',
      'C:\\Users\\Public\\Desktop\\Tor Browser\\Browser\\TorBrowser\\Tor\\tor.exe',
      // Also check alongside the app (developer placed it here)
      path.join(app.getAppPath(), '..', 'resources', 'tor', 'tor.exe'),
      path.join(process.cwd(), 'resources', 'tor', 'tor.exe'),
    )

    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c
    }
    return null
  }

  // ── Start tor, wait for 100% bootstrap ────────────────────────────────────
  start(): Promise<void> {
    if (this._status === 'ready') return Promise.resolve()
    if (this.startPromise) return this.startPromise

    this.startPromise = this._doStart().finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private _doStart(): Promise<void> {
    const torBin = this.findTorBinary()
    if (!torBin) {
      this._setStatus('error')
      return Promise.reject(new Error('TOR_NOT_FOUND'))
    }

    const dataDir  = path.join(app.getPath('userData'), 'tor-data')
    fs.mkdirSync(dataDir, { recursive: true })

    const torrc = [
      `SocksPort 127.0.0.1:${this._socksPort}`,
      `DataDirectory ${dataDir}`,
      'Log notice stdout',
      'ExitPolicy reject *:*',
      'ExitRelay 0',
      'DisableDebuggerAttachment 0',
    ].join('\n')

    const torrcPath = path.join(dataDir, 'torrc')
    fs.writeFileSync(torrcPath, torrc)

    this._setStatus('starting')

    this.proc = spawn(torBin, ['-f', torrcPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.proc?.kill()
        this._setStatus('error')
        reject(new Error('Tor bootstrap timed out'))
      }, 120_000)

      this.proc!.stdout?.on('data', (chunk: Buffer) => {
        const line = chunk.toString()
        const m = line.match(/Bootstrapped (\d+)%/)
        if (m) {
          const pct = parseInt(m[1], 10)
          this._setStatus('bootstrapping', pct)
          if (pct === 100) {
            clearTimeout(timeout)
            this._setStatus('ready', 100)
            resolve()
          }
        }
      })

      this.proc!.on('exit', (code) => {
        if (this._status !== 'ready') {
          clearTimeout(timeout)
          this._setStatus('error')
          reject(new Error(`Tor exited (${code})`))
        } else {
          this._setStatus('stopped')
        }
      })

      this.proc!.on('error', (err) => {
        clearTimeout(timeout)
        this._setStatus('error')
        reject(err)
      })
    })
  }

  stop() {
    this.proc?.kill()
    this.proc = null
    this._setStatus('stopped')
  }

  private _setStatus(s: TorStatus, pct?: number) {
    this._status = s
    this.listeners.forEach(l => l(s, pct))
    this.uiWc?.send('darkroom:tor-status', { status: s, progress: pct ?? null })
  }

  onStatus(cb: (s: TorStatus, pct?: number) => void): () => void {
    this.listeners.push(cb)
    return () => { this.listeners = this.listeners.filter(l => l !== cb) }
  }
}

export const torService = new TorService()
