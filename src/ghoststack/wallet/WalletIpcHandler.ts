import { ipcMain, WebContents } from 'electron'
import { WalletEngine } from './WalletEngine'

export class WalletIpcHandler {
  private walletEngine: WalletEngine

  private uiWebContents: WebContents | null = null

  private pendingApproval: {
    resolve: (approved: boolean) => void
    reject: (err: Error) => void
  } | null = null

  constructor() {
    this.walletEngine = WalletEngine.getInstance()
    // [DEV HACK] Auto-create a test wallet so it's always unlocked for testing the UI!
    if (!this.walletEngine.hasWallet()) {
      const mnemonic = this.walletEngine.generateMnemonic()
      this.walletEngine.createWallet(mnemonic, 'testpassword123').then(() => {
        console.log('[WalletIpcHandler] Dev test wallet auto-created!')
      })
    } else {
      this.walletEngine.unlockWallet('testpassword123').then(() => {
        console.log('[WalletIpcHandler] Dev test wallet auto-unlocked!')
      })
    }
  }

  public setUIWebContents(ui: WebContents): void {
    this.uiWebContents = ui
  }

  public registerHandlers(): void {
    ipcMain.handle('wallet:respond-approval', (_event, approved: boolean) => {
      if (this.pendingApproval) {
        this.pendingApproval.resolve(approved)
        this.pendingApproval = null
      }
    })

    ipcMain.handle('wallet:status', () => {
      return {
        isUnlocked: this.walletEngine.isUnlocked(),
        hasWallet: this.walletEngine.hasWallet(),
        address: this.walletEngine.getAddress()
      }
    })

    ipcMain.handle('wallet:unlock', async (_event, password: string) => {
      return await this.walletEngine.unlockWallet(password)
    })

    ipcMain.handle('wallet:create', async (_event, mnemonic: string, password: string) => {
      return await this.walletEngine.createWallet(mnemonic, password)
    })

    ipcMain.handle('wallet:lock', () => {
      this.walletEngine.lockWallet()
      return true
    })

    // EIP-1193 standard Provider methods from dApps
    ipcMain.handle('wallet:requestAccounts', async (event) => {
      if (!this.walletEngine.isUnlocked()) {
        throw new Error('Wallet is locked or not initialized')
      }
      
      const senderUrl = event.sender.getURL()
      if (!this.uiWebContents) throw new Error('UI not connected')

      const approved = await new Promise<boolean>((resolve, reject) => {
        this.pendingApproval = { resolve, reject }
        this.uiWebContents!.send('wallet:prompt-approval', { type: 'requestAccounts', url: senderUrl })
      })

      if (!approved) {
        throw new Error('User rejected the connection request')
      }

      return [this.walletEngine.getAddress()]
    })

    ipcMain.handle('wallet:sendTransaction', async (event, txParams: any) => {
      // 1. Verify Sender (the WebContents of the dApp)
      const senderUrl = event.sender.getURL()
      console.log(`[WalletIpcHandler] Intercepted transaction request from ${senderUrl}`)

      // 2. Security Check
      if (!this.walletEngine.isUnlocked()) {
        throw new Error('Wallet is locked')
      }

      // Phase 4: Render WalletApproval.tsx popup window here before signing
      if (!this.uiWebContents) throw new Error('UI not connected')

      const approved = await new Promise<boolean>((resolve, reject) => {
        this.pendingApproval = { resolve, reject }
        this.uiWebContents!.send('wallet:prompt-approval', { type: 'transaction', url: senderUrl, txParams })
      })

      if (!approved) {
        throw new Error('User rejected the transaction')
      }
      
      const signedTx = await this.walletEngine.signTransaction(txParams)
      
      // TODO: Broadcast the transaction via GhostEngine (eth_sendRawTransaction)
      // For now we just return the signed hash
      return signedTx
    })

    ipcMain.handle('wallet:personalSign', async (_event, message: string) => {
      if (!this.walletEngine.isUnlocked()) {
        throw new Error('Wallet is locked')
      }
      return await this.walletEngine.signMessage(message)
    })
  }
}
