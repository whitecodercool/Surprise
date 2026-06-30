import { autoUpdater } from 'electron-updater'
import { WebContents, ipcMain } from 'electron'

export class AppUpdater {
  private uiWebContents: WebContents

  constructor(uiWebContents: WebContents) {
    this.uiWebContents = uiWebContents

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = console

    this.setupListeners()
  }

  private setupListeners() {
    autoUpdater.on('update-available', (info) => {
      this.sendToUI('updater:available', {
        version: info.version,
        releaseNotes: info.releaseNotes || 'Security enhancements and bug fixes.'
      })
    })

    autoUpdater.on('download-progress', (progressObj) => {
      this.sendToUI('updater:progress', {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond
      })
    })

    autoUpdater.on('update-downloaded', () => {
      this.sendToUI('updater:downloaded')
      setTimeout(() => {
        autoUpdater.quitAndInstall(false, true)
      }, 1500)
    })

    autoUpdater.on('error', (err) => {
      this.sendToUI('updater:error', err ? err.message : 'Unknown updater error')
    })

    ipcMain.on('updater:check', () => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    })
  }

  private sendToUI(channel: string, ...args: unknown[]) {
    try {
      this.uiWebContents.send(channel, ...args)
    } catch {}
  }

  public checkForUpdates() {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }
}
